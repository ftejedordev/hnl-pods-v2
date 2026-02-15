package client

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"pods-cli/config"
)

// LLMClient handles LLM-related API calls
type LLMClient struct {
	baseURL    string
	token      string
	httpClient *http.Client
	config     *config.Config
}

// LLMProvider represents supported LLM providers
type LLMProvider string

const (
	ProviderAnthropic  LLMProvider = "anthropic"
	ProviderOpenAI     LLMProvider = "openai"
	ProviderOpenRouter LLMProvider = "openrouter"
	ProviderCustom     LLMProvider = "custom"
	ProviderClaudeCLI  LLMProvider = "claude_cli"
)

// LLMStatus represents the status of an LLM
type LLMStatus string

const (
	StatusActive   LLMStatus = "active"
	StatusInactive LLMStatus = "inactive"
	StatusError    LLMStatus = "error"
	StatusTesting  LLMStatus = "testing"
)

// LLMConfig represents provider-specific configuration
type LLMConfig struct {
	ModelName        string            `json:"model_name,omitempty"`
	MaxTokens        int               `json:"max_tokens,omitempty"`
	Temperature      float64           `json:"temperature,omitempty"`
	AnthropicVersion string            `json:"anthropic_version,omitempty"`
	OrganizationID   string            `json:"organization_id,omitempty"`
	SiteURL          string            `json:"site_url,omitempty"`
	AppName          string            `json:"app_name,omitempty"`
	BaseURL          string            `json:"base_url,omitempty"`
	Headers          map[string]string `json:"headers,omitempty"`
	VerifySSL        bool              `json:"verify_ssl,omitempty"`
	AvailableModels  []string          `json:"available_models,omitempty"`
	WorkingDirectory string            `json:"working_directory,omitempty"`
	ClaudeModel      string            `json:"claude_model,omitempty"`
	AllowPermissions bool              `json:"allow_permissions,omitempty"`
}

// LLMUsageStats represents usage statistics
type LLMUsageStats struct {
	TotalRequests     int         `json:"total_requests"`
	TotalTokens       int         `json:"total_tokens"`
	TotalCost         float64     `json:"total_cost"`
	LastUsed          *CustomTime `json:"last_used,omitempty"`
	RequestsThisMonth int         `json:"requests_this_month"`
	TokensThisMonth   int         `json:"tokens_this_month"`
	CostThisMonth     float64     `json:"cost_this_month"`
}

// LLM represents an LLM configuration
type LLM struct {
	ID          string        `json:"id"`
	UserID      string        `json:"user_id"`
	Name        string        `json:"name"`
	Description string        `json:"description,omitempty"`
	Provider    LLMProvider   `json:"provider"`
	Config      LLMConfig     `json:"config"`
	Status      LLMStatus     `json:"status"`
	UsageStats  LLMUsageStats `json:"usage_stats"`
	IsDefault   bool          `json:"is_default"`
	CreatedAt   CustomTime    `json:"created_at"`
	UpdatedAt   CustomTime    `json:"updated_at"`
	LastTested  *CustomTime   `json:"last_tested,omitempty"`
	TestError   string        `json:"test_error,omitempty"`
}

// LLMListResponse represents the response from listing LLMs
type LLMListResponse struct {
	LLMs  []LLM `json:"llms"`
	Total int   `json:"total"`
}

// LLMProviderInfo represents information about a provider
type LLMProviderInfo struct {
	Provider         LLMProvider `json:"provider"`
	Name             string      `json:"name"`
	Description      string      `json:"description"`
	DocumentationURL string      `json:"documentation_url"`
	APIKeyURL        string      `json:"api_key_url"`
	RequiredFields   []string    `json:"required_fields"`
	OptionalFields   []string    `json:"optional_fields"`
	SupportedModels  []string    `json:"supported_models,omitempty"`
}

// LLMProvidersResponse represents the response from getting providers
type LLMProvidersResponse struct {
	Providers []LLMProviderInfo `json:"providers"`
}

// LLMTestRequest represents a test request
type LLMTestRequest struct {
	TestPrompt string `json:"test_prompt,omitempty"`
}

// LLMTestResponse represents the response from testing an LLM
type LLMTestResponse struct {
	Success      bool   `json:"success"`
	ResponseText string `json:"response_text,omitempty"`
	Error        string `json:"error,omitempty"`
	LatencyMS    int    `json:"latency_ms,omitempty"`
	ModelUsed    string `json:"model_used,omitempty"`
}

// LLMCreateRequest represents a request to create an LLM
type LLMCreateRequest struct {
	Name        string      `json:"name"`
	Description string      `json:"description,omitempty"`
	Provider    LLMProvider `json:"provider"`
	APIKey      string      `json:"api_key,omitempty"`
	Config      *LLMConfig  `json:"config,omitempty"`
	IsDefault   bool        `json:"is_default"`
}

// NewLLMClient creates a new LLM API client
func NewLLMClient(cfg *config.Config) *LLMClient {
	return &LLMClient{
		baseURL: cfg.APIEndpoint,
		token:   cfg.Token,
		config:  cfg,
		httpClient: &http.Client{
			Timeout: time.Duration(cfg.DefaultTimeout) * time.Second,
		},
	}
}

// makeRequest makes an HTTP request with authentication
func (c *LLMClient) makeRequest(method, endpoint string, body interface{}) (*http.Response, error) {
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

// ListLLMs retrieves all LLMs for the current user
func (c *LLMClient) ListLLMs() (*LLMListResponse, error) {
	resp, err := c.makeRequest("GET", "/api/llms/", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to list LLMs: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result LLMListResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// GetLLM retrieves a specific LLM by ID
func (c *LLMClient) GetLLM(llmID string) (*LLM, error) {
	resp, err := c.makeRequest("GET", fmt.Sprintf("/api/llms/%s", llmID), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get LLM: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var llm LLM
	if err := json.NewDecoder(resp.Body).Decode(&llm); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &llm, nil
}

// GetProviders retrieves supported LLM providers
func (c *LLMClient) GetProviders() (*LLMProvidersResponse, error) {
	resp, err := c.makeRequest("GET", "/api/llms/providers", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get providers: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result LLMProvidersResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// TestLLM tests connectivity to an LLM
func (c *LLMClient) TestLLM(llmID string, testPrompt string) (*LLMTestResponse, error) {
	reqBody := LLMTestRequest{TestPrompt: testPrompt}
	if testPrompt == "" {
		reqBody.TestPrompt = "Hello, this is a test."
	}

	resp, err := c.makeRequest("POST", fmt.Sprintf("/api/llms/%s/test", llmID), reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to test LLM: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var result LLMTestResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// CreateLLM creates a new LLM configuration
func (c *LLMClient) CreateLLM(req LLMCreateRequest) (*LLM, error) {
	resp, err := c.makeRequest("POST", "/api/llms/", req)
	if err != nil {
		return nil, fmt.Errorf("failed to create LLM: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var llm LLM
	if err := json.NewDecoder(resp.Body).Decode(&llm); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &llm, nil
}

// DeleteLLM deletes an LLM configuration
func (c *LLMClient) DeleteLLM(llmID string) error {
	resp, err := c.makeRequest("DELETE", fmt.Sprintf("/api/llms/%s", llmID), nil)
	if err != nil {
		return fmt.Errorf("failed to delete LLM: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// JSONReader helper for request body
type JSONReader struct {
	data   []byte
	offset int
}

func NewJSONReader(data []byte) *JSONReader {
	return &JSONReader{data: data}
}

func (r *JSONReader) Read(p []byte) (n int, err error) {
	if r.offset >= len(r.data) {
		return 0, io.EOF
	}
	n = copy(p, r.data[r.offset:])
	r.offset += n
	return n, nil
}
