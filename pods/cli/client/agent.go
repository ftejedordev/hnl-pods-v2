package client

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"pods-cli/config"
)

// AgentClient handles agent-related API calls
type AgentClient struct {
	baseURL    string
	token      string
	httpClient *http.Client
	config     *config.Config
}

// AgentFull represents a full agent configuration (different from the simple Agent in api.go)
type AgentFull struct {
	ID             string     `json:"id"`
	UserID         string     `json:"user_id"`
	Name           string     `json:"name"`
	Description    string     `json:"description"`
	LLMID          string     `json:"llm_id,omitempty"`
	MCPConnections []string   `json:"mcp_connections"`
	RAGDocuments   []string   `json:"rag_documents"`
	Color          string     `json:"color"`
	AvatarURL      string     `json:"avatar_url,omitempty"`
	Role           string     `json:"role,omitempty"`
	SystemPrompt   string     `json:"system_prompt,omitempty"`
	IsDefault      bool       `json:"is_default"`
	CreatedAt      CustomTime `json:"created_at"`
	UpdatedAt      CustomTime `json:"updated_at"`
}

// AgentUpdateRequest represents a request to update an agent
type AgentUpdateRequest struct {
	Name           *string   `json:"name,omitempty"`
	Description    *string   `json:"description,omitempty"`
	LLMID          *string   `json:"llm_id,omitempty"`
	MCPConnections *[]string `json:"mcp_connections,omitempty"`
	RAGDocuments   *[]string `json:"rag_documents,omitempty"`
	Color          *string   `json:"color,omitempty"`
	AvatarURL      *string   `json:"avatar_url,omitempty"`
	Role           *string   `json:"role,omitempty"`
	SystemPrompt   *string   `json:"system_prompt,omitempty"`
}

// NewAgentClient creates a new agent API client
func NewAgentClient(cfg *config.Config) *AgentClient {
	return &AgentClient{
		baseURL: cfg.APIEndpoint,
		token:   cfg.Token,
		config:  cfg,
		httpClient: &http.Client{
			Timeout: time.Duration(cfg.DefaultTimeout) * time.Second,
		},
	}
}

// makeRequest makes an HTTP request with authentication
func (c *AgentClient) makeRequest(method, endpoint string, body interface{}) (*http.Response, error) {
	var bodyReader io.Reader

	if body != nil {
		jsonData, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = NewJSONReader(jsonData)
	}

	url := c.baseURL + endpoint
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	return c.httpClient.Do(req)
}

// ListAgents retrieves all agents
func (c *AgentClient) ListAgents() ([]AgentFull, error) {
	resp, err := c.makeRequest("GET", "/api/agents/", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to list agents: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var agents []AgentFull
	if err := json.NewDecoder(resp.Body).Decode(&agents); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return agents, nil
}

// GetAgent retrieves a specific agent by ID
func (c *AgentClient) GetAgent(agentID string) (*AgentFull, error) {
	resp, err := c.makeRequest("GET", fmt.Sprintf("/api/agents/%s", agentID), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get agent: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var agent AgentFull
	if err := json.NewDecoder(resp.Body).Decode(&agent); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &agent, nil
}

// UpdateAgent updates an agent
func (c *AgentClient) UpdateAgent(agentID string, update AgentUpdateRequest) (*AgentFull, error) {
	resp, err := c.makeRequest("PUT", fmt.Sprintf("/api/agents/%s", agentID), update)
	if err != nil {
		return nil, fmt.Errorf("failed to update agent: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var agent AgentFull
	if err := json.NewDecoder(resp.Body).Decode(&agent); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &agent, nil
}

// SetAgentLLM sets the LLM for an agent
func (c *AgentClient) SetAgentLLM(agentID, llmID string) (*AgentFull, error) {
	update := AgentUpdateRequest{
		LLMID: &llmID,
	}
	return c.UpdateAgent(agentID, update)
}

// ResolveAgentID resolves a short agent ID or name to a full ID
func (c *AgentClient) ResolveAgentID(shortIDOrName string) (string, string, error) {
	agents, err := c.ListAgents()
	if err != nil {
		return "", "", err
	}

	// First try exact name match
	for _, agent := range agents {
		if agent.Name == shortIDOrName {
			return agent.ID, agent.Name, nil
		}
	}

	// Then try ID prefix match
	for _, agent := range agents {
		if len(agent.ID) >= len(shortIDOrName) && agent.ID[:len(shortIDOrName)] == shortIDOrName {
			return agent.ID, agent.Name, nil
		}
	}

	// Try case-insensitive name match
	lowerInput := stringToLower(shortIDOrName)
	for _, agent := range agents {
		if stringToLower(agent.Name) == lowerInput {
			return agent.ID, agent.Name, nil
		}
	}

	return "", "", fmt.Errorf("agent not found: %s", shortIDOrName)
}

// stringToLower converts a string to lowercase
func stringToLower(s string) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			result[i] = c + 32
		} else {
			result[i] = c
		}
	}
	return string(result)
}
