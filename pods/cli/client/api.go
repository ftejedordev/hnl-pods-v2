package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"pods-cli/config"
)

// CustomTime handles timestamp parsing from the API
type CustomTime struct {
	time.Time
}

// UnmarshalJSON implements json.Unmarshaler for CustomTime
func (ct *CustomTime) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), "\"")

	// Try to parse with timezone first (RFC3339)
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		ct.Time = t
		return nil
	}

	// If that fails, try without timezone and assume UTC
	if t, err := time.Parse("2006-01-02T15:04:05.000000", s); err == nil {
		ct.Time = t.UTC()
		return nil
	}

	// Fallback to RFC3339Nano
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		ct.Time = t
		return nil
	}

	return fmt.Errorf("cannot parse time: %s", s)
}

// APIClient handles communication with the HNL Pods API
type APIClient struct {
	baseURL    string
	token      string
	httpClient *http.Client
	config     *config.Config
}

// Flow represents a flow from the CLI API
type Flow struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Variables   map[string]interface{} `json:"variables"`
	Agents      map[string]Agent       `json:"agents"`
	StepsCount  int                    `json:"steps_count"`
	IsActive    bool                   `json:"is_active"`
	CreatedAt   CustomTime             `json:"created_at"`
	Tags        []string               `json:"tags"`
}

// Agent represents an agent with color information
type Agent struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// FlowHelp represents detailed flow information for help
type FlowHelp struct {
	Name           string                  `json:"name"`
	Description    string                  `json:"description"`
	Variables      map[string]interface{}  `json:"variables"`
	Agents         map[string]AgentDetails `json:"agents"`
	MCPConnections map[string]MCPDetails   `json:"mcp_connections"`
	Steps          []StepDetails           `json:"steps"`
	StartStep      string                  `json:"start_step"`
	Metadata       map[string]interface{}  `json:"metadata"`
	Usage          UsageInfo               `json:"usage"`
}

// AgentDetails represents detailed agent information
type AgentDetails struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Color          string   `json:"color"`
	LLMID          string   `json:"llm_id"`
	MCPConnections []string `json:"mcp_connections"`
}

// MCPDetails represents MCP connection information
type MCPDetails struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	ServerType  string `json:"server_type"`
}

// StepDetails represents flow step information
type StepDetails struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Agent       string   `json:"agent"`
	Type        string   `json:"type"`
	NextSteps   []string `json:"next_steps"`
}

// UsageInfo provides CLI usage information
type UsageInfo struct {
	Command   string   `json:"command"`
	Variables []string `json:"variables"`
	Example   string   `json:"example"`
}

// ExecutionResponse represents the response from flow execution
type ExecutionResponse struct {
	ExecutionID string                 `json:"execution_id"`
	FlowName    string                 `json:"flow_name"`
	Status      string                 `json:"status"`
	Variables   map[string]interface{} `json:"variables"`
	StreamURL   string                 `json:"stream_url"`
}

// ExecutionSummary represents execution status summary
type ExecutionSummary struct {
	ExecutionID string `json:"execution_id"`
	FlowName    string `json:"flow_name"`
	Status      string `json:"status"`
	Progress    struct {
		CompletedSteps int    `json:"completed_steps"`
		TotalSteps     int    `json:"total_steps"`
		CurrentStep    string `json:"current_step"`
	} `json:"progress"`
	Timing struct {
		StartTime  *CustomTime `json:"start_time"`
		EndTime    *CustomTime `json:"end_time"`
		DurationMS *int        `json:"duration_ms"`
	} `json:"timing"`
	SummaryText string `json:"summary_text"`
	NextAction  string `json:"next_action"`
}

// LoginRequest represents login credentials
type LoginRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	ExpireDays int    `json:"expire_days,omitempty"`
}

// LoginResponse represents login response
type LoginResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
}

// NewAPIClient creates a new API client
func NewAPIClient(cfg *config.Config) *APIClient {
	return &APIClient{
		baseURL: cfg.APIEndpoint,
		token:   cfg.Token,
		config:  cfg,
		httpClient: &http.Client{
			Timeout: time.Duration(cfg.DefaultTimeout) * time.Second,
		},
	}
}

// makeRequest makes an HTTP request with authentication
func (c *APIClient) makeRequest(method, endpoint string, body interface{}) (*http.Response, error) {
	var bodyReader io.Reader

	if body != nil {
		jsonData, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(jsonData)
	}

	url := c.baseURL + endpoint
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	return c.httpClient.Do(req)
}

// GetFlows retrieves available flows for CLI
func (c *APIClient) GetFlows() ([]Flow, error) {
	resp, err := c.makeRequest("GET", "/api/cli/flows", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get flows: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Flows []Flow `json:"flows"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Flows, nil
}

// GetFlowHelp retrieves detailed flow information
func (c *APIClient) GetFlowHelp(flowName string) (*FlowHelp, error) {
	endpoint := fmt.Sprintf("/api/cli/flows/%s/help", url.PathEscape(flowName))
	resp, err := c.makeRequest("GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get flow help: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var flowHelp FlowHelp
	if err := json.NewDecoder(resp.Body).Decode(&flowHelp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &flowHelp, nil
}

// ExecuteFlow executes a flow with variables
func (c *APIClient) ExecuteFlow(flowName string, variables map[string]interface{}) (*ExecutionResponse, error) {
	endpoint := fmt.Sprintf("/api/cli/flows/%s/execute", url.PathEscape(flowName))

	// Mark variables as CLI overrides to ensure they take precedence over flow defaults
	requestBody := map[string]interface{}{
		"variables":     variables,
		"cli_overrides": true, // Indicate these variables came from CLI and should override flow defaults
	}

	resp, err := c.makeRequest("POST", endpoint, requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to execute flow: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var execution ExecutionResponse
	if err := json.NewDecoder(resp.Body).Decode(&execution); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &execution, nil
}

// GetExecutionSummary retrieves execution status summary
func (c *APIClient) GetExecutionSummary(executionID string) (*ExecutionSummary, error) {
	endpoint := fmt.Sprintf("/api/cli/executions/%s/summary", executionID)
	resp, err := c.makeRequest("GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get execution summary: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var summary ExecutionSummary
	if err := json.NewDecoder(resp.Body).Decode(&summary); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &summary, nil
}

// Login authenticates a user and returns a JWT token
func (c *APIClient) Login(username, password string) (*LoginResponse, error) {
	loginReq := LoginRequest{
		Username:   username,
		Password:   password,
		ExpireDays: 7, // Set token to expire in 7 days
	}

	resp, err := c.makeRequest("POST", "/auth/login", loginReq)
	if err != nil {
		return nil, fmt.Errorf("failed to login: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("login failed with status %d: %s", resp.StatusCode, string(body))
	}

	var loginResp LoginResponse
	if err := json.NewDecoder(resp.Body).Decode(&loginResp); err != nil {
		return nil, fmt.Errorf("failed to decode login response: %w", err)
	}

	return &loginResp, nil
}

// CancelExecution cancels a running flow execution
func (c *APIClient) CancelExecution(executionID string) error {
	endpoint := fmt.Sprintf("/api/cli/executions/%s/cancel", executionID)
	resp, err := c.makeRequest("POST", endpoint, nil)
	if err != nil {
		return fmt.Errorf("failed to cancel execution: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// TestConnection tests the API connection
func (c *APIClient) TestConnection() error {
	resp, err := c.makeRequest("GET", "/health", nil)
	if err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API health check failed with status %d", resp.StatusCode)
	}

	return nil
}

// FlowFullData represents the complete flow structure for export/import
type FlowFullData struct {
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	IsActive     bool                   `json:"is_active"`
	Variables    map[string]interface{} `json:"variables"`
	Agents       map[string]AgentExport `json:"agents"`
	Steps        []StepFull             `json:"steps"`
	StartStep    string                 `json:"start_step"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
	EdgeMetadata map[string]interface{} `json:"edge_metadata,omitempty"`
}

// AgentExport represents agent info for flow export
type AgentExport struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Description    string   `json:"description,omitempty"`
	Color          string   `json:"color"`
	LLMID          string   `json:"llm_id,omitempty"`
	MCPConnections []string `json:"mcp_connections,omitempty"`
}

// StepFull represents complete step info for export
type StepFull struct {
	ID             string                 `json:"id"`
	Name           string                 `json:"name"`
	AgentID        string                 `json:"agent_id"`
	Description    string                 `json:"description,omitempty"`
	Type           string                 `json:"type"`
	Parameters     map[string]interface{} `json:"parameters,omitempty"`
	NextSteps      []string               `json:"next_steps"`
	TimeoutSeconds int                    `json:"timeout_seconds"`
	RetryCount     int                    `json:"retry_count,omitempty"`
	Condition      string                 `json:"condition,omitempty"`
	AgentOverrides map[string]interface{} `json:"agent_overrides,omitempty"`
}

// GetFlowFull retrieves complete flow data for export
func (c *APIClient) GetFlowFull(flowName string) (*FlowFullData, error) {
	endpoint := fmt.Sprintf("/api/cli/flows/%s/full", url.PathEscape(flowName))
	resp, err := c.makeRequest("GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get flow: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var flowData FlowFullData
	if err := json.NewDecoder(resp.Body).Decode(&flowData); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &flowData, nil
}

// FlowImportResult represents the result of a flow import
type FlowImportResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	FlowID  string `json:"flow_id"`
	Action  string `json:"action"`
}

// ImportFlow imports/creates a flow from data
func (c *APIClient) ImportFlow(flowData *FlowFullData, overwrite bool) (*FlowImportResult, error) {
	endpoint := "/api/cli/flows"
	if overwrite {
		endpoint += "?overwrite=true"
	}

	resp, err := c.makeRequest("POST", endpoint, flowData)
	if err != nil {
		return nil, fmt.Errorf("failed to import flow: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result FlowImportResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// CloneFlow clones an existing flow
func (c *APIClient) CloneFlow(sourceName, newName string) (*FlowImportResult, error) {
	endpoint := fmt.Sprintf("/api/cli/flows/%s/clone?new_name=%s", url.PathEscape(sourceName), url.PathEscape(newName))
	resp, err := c.makeRequest("POST", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to clone flow: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result FlowImportResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// UpdateFlow updates flow properties
func (c *APIClient) UpdateFlow(flowName string, description *string, isActive *bool) (*FlowImportResult, error) {
	endpoint := fmt.Sprintf("/api/cli/flows/%s?", url.PathEscape(flowName))
	params := []string{}
	if description != nil {
		params = append(params, fmt.Sprintf("description=%s", url.QueryEscape(*description)))
	}
	if isActive != nil {
		params = append(params, fmt.Sprintf("is_active=%t", *isActive))
	}
	endpoint += strings.Join(params, "&")

	resp, err := c.makeRequest("PUT", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to update flow: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result FlowImportResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// DeleteFlow deletes a flow
func (c *APIClient) DeleteFlow(flowName string) (*FlowImportResult, error) {
	endpoint := fmt.Sprintf("/api/cli/flows/%s", url.PathEscape(flowName))
	resp, err := c.makeRequest("DELETE", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to delete flow: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result FlowImportResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}
