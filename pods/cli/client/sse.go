package client

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"pods-cli/config"

	"github.com/charmbracelet/log"
)

// FlexibleTime handles multiple timestamp formats
type FlexibleTime struct {
	time.Time
}

// UnmarshalJSON implements custom JSON unmarshaling for timestamps
func (ft *FlexibleTime) UnmarshalJSON(data []byte) error {
	// Remove quotes from JSON string
	s := strings.Trim(string(data), `"`)

	// Try different timestamp formats
	formats := []string{
		time.RFC3339,                 // 2006-01-02T15:04:05Z07:00
		time.RFC3339Nano,             // 2006-01-02T15:04:05.999999999Z07:00
		"2006-01-02T15:04:05.999999", // Without timezone
		"2006-01-02T15:04:05",        // Without microseconds and timezone
	}

	for _, format := range formats {
		if t, err := time.Parse(format, s); err == nil {
			ft.Time = t
			return nil
		}
	}

	return fmt.Errorf("unable to parse timestamp: %s", s)
}

// SSEEvent represents a server-sent event
type SSEEvent struct {
	ID          string                 `json:"id"`
	ExecutionID string                 `json:"execution_id"`
	EventType   string                 `json:"event_type"`
	StepID      string                 `json:"step_id"`
	Message     string                 `json:"message"`
	Data        map[string]interface{} `json:"data"`
	Timestamp   FlexibleTime           `json:"timestamp"`
}

// EventHandler is called for each SSE event
type EventHandler func(event *SSEEvent) error

// SSEClient handles server-sent events streaming
type SSEClient struct {
	apiClient *APIClient
	config    *config.Config
}

// NewSSEClient creates a new SSE client
func NewSSEClient(cfg *config.Config) *SSEClient {
	return &SSEClient{
		apiClient: NewAPIClient(cfg),
		config:    cfg,
	}
}

// StreamExecution streams execution events via SSE using custom implementation (TRULY NON-BLOCKING)
func (s *SSEClient) StreamExecution(ctx context.Context, executionID string, handler EventHandler) error {
	streamURL := fmt.Sprintf("%s/api/executions/%s/stream", s.config.APIEndpoint, executionID)

	// Add token as query parameter if available
	if s.config.Token != "" {
		streamURL += "?token=" + s.config.Token
	}

	log.Debug("Creating custom SSE client", "url", streamURL, "execution_id", executionID)

	// Start streaming in a dedicated goroutine
	go func() {
		log.Debug("SSE goroutine started - establishing connection")

		for {
			select {
			case <-ctx.Done():
				log.Debug("SSE context cancelled, stopping stream")
				return
			default:
				// Continue with connection attempt
			}

			// Create HTTP request with proper headers
			req, err := http.NewRequestWithContext(ctx, "GET", streamURL, nil)
			if err != nil {
				log.Error("Failed to create SSE request", "error", err)
				return
			}

			// Set SSE headers for real-time streaming
			req.Header.Set("Accept", "text/event-stream")
			req.Header.Set("Cache-Control", "no-cache")
			req.Header.Set("Connection", "keep-alive")

			// Create HTTP client with no timeouts for streaming
			client := &http.Client{
				Timeout: 0, // No timeout for streaming connections
			}

			// Make request
			resp, err := client.Do(req)
			if err != nil {
				log.Error("SSE connection failed", "error", err)
				// Retry after delay
				select {
				case <-ctx.Done():
					return
				case <-time.After(time.Second):
					continue
				}
			}

			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				log.Error("SSE bad status code", "status", resp.StatusCode)
				return
			}

			log.Debug("SSE connection established, starting to read events")

			// Read SSE events line by line
			if err := s.readSSEStream(ctx, resp.Body, handler); err != nil {
				if ctx.Err() != nil {
					return // Context cancelled, exit gracefully
				}
				log.Error("SSE stream error", "error", err)
				// Retry connection
				select {
				case <-ctx.Done():
					return
				case <-time.After(time.Second):
					continue
				}
			}

			break // Exit retry loop on successful completion
		}

		log.Debug("SSE goroutine exiting")
	}()

	// Return immediately - completely non-blocking
	log.Debug("StreamExecution returning immediately - processing in background goroutine")
	return nil
}

// readSSEStream reads SSE events from the response body
func (s *SSEClient) readSSEStream(ctx context.Context, body io.Reader, handler EventHandler) error {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024) // 64KB buffer, 1MB max line

	var event SSEEvent
	var dataLines []string

	for scanner.Scan() {
		// Check context cancellation
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line := strings.TrimSpace(scanner.Text())

		// Empty line indicates end of event
		if line == "" {
			if len(dataLines) > 0 {
				// Join all data lines and parse as JSON
				dataStr := strings.Join(dataLines, "\n")

				// Handle keep-alive pings
				if strings.TrimSpace(dataStr) == "ping" {
					if s.config.Verbose {
						log.Debug("Received SSE ping")
					}
					dataLines = nil
					continue
				}

				// Parse JSON event data
				var sseEvent SSEEvent
				if err := json.Unmarshal([]byte(dataStr), &sseEvent); err != nil {
					log.Error("Failed to parse SSE event", "error", err, "data", dataStr)
					dataLines = nil
					continue
				}

				// Log event reception for debugging
				if s.config.Verbose {
					log.Debug("SSE event parsed", "type", sseEvent.EventType, "timestamp", sseEvent.Timestamp)
				}

				// Process event in separate goroutine to avoid blocking scanner
				go func(evt SSEEvent) {
					if err := handler(&evt); err != nil {
						if err.Error() != "execution_complete" {
							log.Error("Event handler error", "error", err)
						}
					}
				}(sseEvent)

				dataLines = nil
			}
			continue
		}

		// Parse SSE field
		if strings.HasPrefix(line, "data: ") {
			dataLines = append(dataLines, line[6:]) // Remove "data: " prefix
		} else if strings.HasPrefix(line, "event: ") {
			event.EventType = line[7:] // Remove "event: " prefix
		} else if strings.HasPrefix(line, "id: ") {
			event.ID = line[4:] // Remove "id: " prefix
		}
		// Ignore other SSE fields like "retry:"
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scanner error: %w", err)
	}

	return nil
}

// StreamExecutionWithRetry streams execution events with automatic retry - BLOCKING VERSION
func (s *SSEClient) StreamExecutionWithRetry(ctx context.Context, executionID string, handler EventHandler) error {
	streamURL := fmt.Sprintf("%s/api/executions/%s/stream", s.config.APIEndpoint, executionID)

	// Add token as query parameter if available
	if s.config.Token != "" {
		streamURL += "?token=" + s.config.Token
	}

	log.Debug("Creating blocking SSE client", "url", streamURL, "execution_id", executionID)

	for {
		select {
		case <-ctx.Done():
			log.Debug("SSE context cancelled, stopping stream")
			return ctx.Err()
		default:
			// Continue with connection attempt
		}

		// Create HTTP request with proper headers
		req, err := http.NewRequestWithContext(ctx, "GET", streamURL, nil)
		if err != nil {
			log.Error("Failed to create SSE request", "error", err)
			return err
		}

		// Set SSE headers for real-time streaming
		req.Header.Set("Accept", "text/event-stream")
		req.Header.Set("Cache-Control", "no-cache")
		req.Header.Set("Connection", "keep-alive")

		// Create HTTP client with no timeouts for streaming
		client := &http.Client{
			Timeout: 0, // No timeout for streaming connections
		}

		// Make request
		resp, err := client.Do(req)
		if err != nil {
			log.Error("SSE connection failed", "error", err)
			// Retry after delay
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Second):
				continue
			}
		}

		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			log.Error("SSE bad status code", "status", resp.StatusCode)
			return fmt.Errorf("SSE connection failed with status: %d", resp.StatusCode)
		}

		log.Debug("SSE connection established, starting to read events")

		// Read SSE events line by line - this will block until stream ends
		if err := s.readSSEStreamBlocking(ctx, resp.Body, handler); err != nil {
			if ctx.Err() != nil {
				return ctx.Err() // Context cancelled, exit gracefully
			}
			log.Error("SSE stream error", "error", err)
			// Retry connection
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Second):
				continue
			}
		}

		break // Exit retry loop on successful completion
	}

	log.Debug("SSE blocking stream completed")
	return nil
}

// readSSEStreamBlocking reads SSE events from the response body - BLOCKING version for simple logger
func (s *SSEClient) readSSEStreamBlocking(ctx context.Context, body io.Reader, handler EventHandler) error {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024) // 64KB buffer, 1MB max line

	var event SSEEvent
	var dataLines []string

	for scanner.Scan() {
		// Check context cancellation
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line := strings.TrimSpace(scanner.Text())

		// Empty line indicates end of event
		if line == "" {
			if len(dataLines) > 0 {
				// Join all data lines and parse as JSON
				dataStr := strings.Join(dataLines, "\n")

				// Handle keep-alive pings
				if strings.TrimSpace(dataStr) == "ping" {
					if s.config.Verbose {
						log.Debug("Received SSE ping")
					}
					dataLines = nil
					continue
				}

				// Parse JSON event data
				var sseEvent SSEEvent
				if err := json.Unmarshal([]byte(dataStr), &sseEvent); err != nil {
					log.Error("Failed to parse SSE event", "error", err, "data", dataStr)
					dataLines = nil
					continue
				}

				// Log event reception for debugging
				if s.config.Verbose {
					log.Debug("SSE event parsed (blocking)", "type", sseEvent.EventType, "timestamp", sseEvent.Timestamp)
				}

				// Process event synchronously (blocking)
				if err := handler(&sseEvent); err != nil {
					if err.Error() == "execution_complete" {
						// This is expected completion signal
						return nil
					}
					log.Error("Event handler error", "error", err)
					return err
				}

				dataLines = nil
			}
			continue
		}

		// Parse SSE field
		if strings.HasPrefix(line, "data: ") {
			dataLines = append(dataLines, line[6:]) // Remove "data: " prefix
		} else if strings.HasPrefix(line, "event: ") {
			event.EventType = line[7:] // Remove "event: " prefix
		} else if strings.HasPrefix(line, "id: ") {
			event.ID = line[4:] // Remove "id: " prefix
		}
		// Ignore other SSE fields like "retry:"
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scanner error: %w", err)
	}

	return nil
}

// IsExecutionComplete checks if the execution is complete based on event type
func (s *SSEClient) IsExecutionComplete(event *SSEEvent) bool {
	switch event.EventType {
	case "execution_completed", "execution_failed", "execution_cancelled":
		return true
	default:
		return false
	}
}

// GetEventPriority returns the priority level for different event types
func (s *SSEClient) GetEventPriority(eventType string) string {
	switch eventType {
	case "execution_failed", "step_failed":
		return "error"
	case "execution_completed", "step_completed":
		return "success"
	case "execution_started", "step_started":
		return "info"
	case "llm_response", "tool_call_started", "tool_call_completed":
		return "info"
	case "heartbeat":
		return "debug"
	default:
		return "info"
	}
}
