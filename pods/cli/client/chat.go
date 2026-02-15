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
)

// ChatAgent represents an agent available for chat
type ChatAgent struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	Color             string `json:"color"`
	AvatarURL         string `json:"avatar_url,omitempty"`
	HasLLM            bool   `json:"has_llm"`
	HasMCPConnections bool   `json:"has_mcp_connections"`
	LLMProvider       string `json:"llm_provider,omitempty"`
}

// ChatAgentListResponse represents the response from listing agents
type ChatAgentListResponse struct {
	Agents []ChatAgent `json:"agents"`
	Total  int         `json:"total"`
}

// ChatSession represents a chat session
type ChatSession struct {
	ID           string     `json:"id"`
	UserID       string     `json:"user_id"`
	AgentID      string     `json:"agent_id"`
	AgentName    string     `json:"agent_name"`
	Title        string     `json:"title,omitempty"`
	CreatedAt    CustomTime `json:"created_at"`
	UpdatedAt    CustomTime `json:"updated_at"`
	MessageCount int        `json:"message_count"`
	IsActive     bool       `json:"is_active"`
}

// ChatSessionListResponse represents the response from listing sessions
type ChatSessionListResponse struct {
	Sessions []ChatSession `json:"sessions"`
	Total    int           `json:"total"`
}

// ChatMessage represents a chat message
type ChatMessage struct {
	ID          string           `json:"id"`
	Role        string           `json:"role"`
	Content     string           `json:"content"`
	Timestamp   CustomTime       `json:"timestamp"`
	ToolCalls   []map[string]any `json:"tool_calls,omitempty"`
	ToolResults []map[string]any `json:"tool_results,omitempty"`
}

// ChatMessagesResponse represents the response from getting messages
type ChatMessagesResponse struct {
	Messages []ChatMessage `json:"messages"`
	Total    int           `json:"total"`
	Skip     int           `json:"skip"`
	Limit    int           `json:"limit"`
}

// ChatStreamEvent represents an SSE event from the chat stream
type ChatStreamEvent struct {
	EventType string         `json:"event_type"`
	Data      map[string]any `json:"data"`
	Timestamp string         `json:"timestamp"`
}

// ChatEventHandler is called for each chat SSE event
type ChatEventHandler func(event *ChatStreamEvent) error

// ChatClient handles chat-related API calls
type ChatClient struct {
	apiClient *APIClient
	config    *config.Config
}

// NewChatClient creates a new chat client
func NewChatClient(cfg *config.Config) *ChatClient {
	return &ChatClient{
		apiClient: NewAPIClient(cfg),
		config:    cfg,
	}
}

// GetChatAgents retrieves available agents for chat
func (c *ChatClient) GetChatAgents() ([]ChatAgent, error) {
	resp, err := c.apiClient.makeRequest("GET", "/api/cli/chat/agents", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get chat agents: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result ChatAgentListResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Agents, nil
}

// CreateChatSession creates a new chat session
func (c *ChatClient) CreateChatSession(agentID string, title string) (*ChatSession, error) {
	requestBody := map[string]string{
		"agent_id": agentID,
	}
	if title != "" {
		requestBody["title"] = title
	}

	resp, err := c.apiClient.makeRequest("POST", "/api/cli/chat/sessions", requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create chat session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var session ChatSession
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &session, nil
}

// GetChatSession retrieves a chat session by ID
func (c *ChatClient) GetChatSession(sessionID string) (*ChatSession, error) {
	endpoint := fmt.Sprintf("/api/cli/chat/sessions/%s", sessionID)
	resp, err := c.apiClient.makeRequest("GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get chat session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var session ChatSession
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &session, nil
}

// ListChatSessions lists chat sessions for the current user
func (c *ChatClient) ListChatSessions(skip, limit int, activeOnly bool) (*ChatSessionListResponse, error) {
	endpoint := fmt.Sprintf("/api/cli/chat/sessions?skip=%d&limit=%d&active_only=%t", skip, limit, activeOnly)
	resp, err := c.apiClient.makeRequest("GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to list chat sessions: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result ChatSessionListResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// DeleteChatSession deletes (deactivates) a chat session
func (c *ChatClient) DeleteChatSession(sessionID string) error {
	endpoint := fmt.Sprintf("/api/cli/chat/sessions/%s", sessionID)
	resp, err := c.apiClient.makeRequest("DELETE", endpoint, nil)
	if err != nil {
		return fmt.Errorf("failed to delete chat session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// GetChatMessages retrieves messages from a chat session
func (c *ChatClient) GetChatMessages(sessionID string, skip, limit int) (*ChatMessagesResponse, error) {
	endpoint := fmt.Sprintf("/api/cli/chat/sessions/%s/messages?skip=%d&limit=%d", sessionID, skip, limit)
	resp, err := c.apiClient.makeRequest("GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get chat messages: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result ChatMessagesResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// SendMessageStream sends a message and streams the response via SSE
func (c *ChatClient) SendMessageStream(ctx context.Context, sessionID string, content string, handler ChatEventHandler) error {
	// Build URL for streaming endpoint
	streamURL := fmt.Sprintf("%s/api/cli/chat/sessions/%s/messages", c.config.APIEndpoint, sessionID)

	// Create request body
	requestBody := map[string]string{
		"content": content,
	}
	jsonBody, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", streamURL, strings.NewReader(string(jsonBody)))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Connection", "keep-alive")
	if c.config.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.config.Token)
	}

	// Create HTTP client with no timeout for streaming
	client := &http.Client{
		Timeout: 0,
	}

	// Make request
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	// Read SSE stream
	return c.readChatSSEStream(ctx, resp.Body, handler)
}

// readChatSSEStream reads SSE events from the chat response
func (c *ChatClient) readChatSSEStream(ctx context.Context, body io.Reader, handler ChatEventHandler) error {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)

	var dataLines []string

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line := scanner.Text()

		// Empty line indicates end of event
		if line == "" {
			if len(dataLines) > 0 {
				dataStr := strings.Join(dataLines, "\n")

				// Skip heartbeats
				if strings.TrimSpace(dataStr) == "" || strings.HasPrefix(strings.TrimSpace(dataStr), ":") {
					dataLines = nil
					continue
				}

				// Parse JSON event
				var event ChatStreamEvent
				if err := json.Unmarshal([]byte(dataStr), &event); err != nil {
					// Try to extract just the data field
					dataLines = nil
					continue
				}

				// Call handler
				if err := handler(&event); err != nil {
					if err.Error() == "chat_complete" {
						return nil
					}
					return err
				}

				dataLines = nil
			}
			continue
		}

		// Parse SSE field
		if strings.HasPrefix(line, "data: ") {
			dataLines = append(dataLines, line[6:])
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scanner error: %w", err)
	}

	return nil
}

// IsChatComplete checks if the chat event indicates completion
func IsChatComplete(event *ChatStreamEvent) bool {
	switch event.EventType {
	case "done", "error", "message_end":
		return event.EventType == "done"
	default:
		return false
	}
}

// WaitForConnection waits for the API to be available
func (c *ChatClient) WaitForConnection(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		if err := c.apiClient.TestConnection(); err == nil {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}

	return fmt.Errorf("connection timeout after %v", timeout)
}
