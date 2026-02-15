package display

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pods-cli/client"
	"pods-cli/config"
)

// JSONStreamLogger implements JSON lines streaming for LLM/script usage
type JSONStreamLogger struct {
	cfg         *config.Config
	sseClient   *client.SSEClient
	flowName    string
	variables   map[string]interface{}
	executionID string
	timeout     int
}

// NewJSONStreamLogger creates a new JSON streaming logger
func NewJSONStreamLogger(cfg *config.Config, sseClient *client.SSEClient, flowName string, variables map[string]interface{}, executionID string, timeout int) *JSONStreamLogger {
	return &JSONStreamLogger{
		cfg:         cfg,
		sseClient:   sseClient,
		flowName:    flowName,
		variables:   variables,
		executionID: executionID,
		timeout:     timeout,
	}
}

// Start begins streaming events as JSON lines
func (l *JSONStreamLogger) Start() error {
	// Set up context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(l.timeout)*time.Second)
	defer cancel()

	// Handle Ctrl+C gracefully
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		l.printEvent(ExecutionEvent{
			Type:      "cancelled",
			Message:   "Execution interrupted by user",
			Timestamp: time.Now().Format(time.RFC3339),
		})
		cancel()
		os.Exit(ExitCancelled)
	}()

	// Stream events
	err := l.sseClient.StreamExecutionWithRetry(ctx, l.executionID, func(event *client.SSEEvent) error {
		// Skip heartbeat events
		if event.EventType == "heartbeat" {
			return nil
		}

		// Convert to JSON event
		jsonEvent := l.convertEvent(event)
		l.printEvent(jsonEvent)

		return nil
	})

	if err != nil {
		l.printEvent(ExecutionEvent{
			Type:      "error",
			Message:   err.Error(),
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return err
	}

	return nil
}

// convertEvent converts an SSE event to a JSON event
func (l *JSONStreamLogger) convertEvent(event *client.SSEEvent) ExecutionEvent {
	jsonEvent := ExecutionEvent{
		Type:      event.EventType,
		Message:   event.Message,
		Timestamp: event.Timestamp.Time.Format(time.RFC3339),
	}

	// Extract agent name if available
	if event.Data != nil {
		if agentName, exists := event.Data["agent_name"]; exists {
			if name, ok := agentName.(string); ok {
				jsonEvent.Agent = name
			}
		}

		// Extract content for LLM responses
		if event.EventType == "llm_response" {
			if content, exists := event.Data["content"]; exists {
				if contentStr, ok := content.(string); ok {
					jsonEvent.Content = contentStr
				}
			}
		}

		// Extract tool name for tool calls
		if event.EventType == "tool_call_started" || event.EventType == "tool_call_completed" {
			if toolName, exists := event.Data["tool_name"]; exists {
				if name, ok := toolName.(string); ok {
					jsonEvent.Tool = name
				}
			}
		}
	}

	return jsonEvent
}

// printEvent outputs an event as a JSON line
func (l *JSONStreamLogger) printEvent(event ExecutionEvent) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}
	fmt.Println(string(data))
}
