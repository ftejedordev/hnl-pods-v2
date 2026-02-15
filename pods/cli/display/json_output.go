package display

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// Exit codes for CLI
const (
	ExitSuccess          = 0
	ExitGeneralError     = 1
	ExitAuthError        = 2
	ExitFlowNotFound     = 3
	ExitMissingVariables = 4
	ExitTimeout          = 5
	ExitCancelled        = 6
	ExitConnectionError  = 7
)

// JSONResponse is the standard response structure for JSON output
type JSONResponse struct {
	Success   bool        `json:"success"`
	Data      interface{} `json:"data,omitempty"`
	Error     *JSONError  `json:"error,omitempty"`
	Timestamp string      `json:"timestamp"`
}

// JSONError represents an error in JSON format
type JSONError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// FlowsListData represents the data for list command
type FlowsListData struct {
	Flows []FlowInfo `json:"flows"`
	Total int        `json:"total"`
}

// FlowInfo represents a flow in JSON format
type FlowInfo struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	IsActive    bool     `json:"is_active"`
	Variables   []string `json:"variables,omitempty"`
	AgentCount  int      `json:"agent_count,omitempty"`
}

// FlowHelpData represents the data for help command
type FlowHelpData struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	IsActive    bool           `json:"is_active"`
	Variables   []VariableInfo `json:"variables"`
	Agents      []AgentInfo    `json:"agents"`
	Steps       []StepInfo     `json:"steps"`
}

// VariableInfo represents a variable in JSON format
type VariableInfo struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Required    bool   `json:"required"`
}

// StepInfo represents a step in JSON format
type StepInfo struct {
	Name  string `json:"name"`
	Agent string `json:"agent"`
}

// ExecutionData represents execution response
type ExecutionData struct {
	ExecutionID string            `json:"execution_id"`
	FlowName    string            `json:"flow_name"`
	Status      string            `json:"status"`
	StartedAt   string            `json:"started_at,omitempty"`
	CompletedAt string            `json:"completed_at,omitempty"`
	Events      []ExecutionEvent  `json:"events,omitempty"`
	Result      string            `json:"result,omitempty"`
}

// ExecutionEvent represents an event during execution
type ExecutionEvent struct {
	Type      string `json:"type"`
	Agent     string `json:"agent,omitempty"`
	Message   string `json:"message,omitempty"`
	Content   string `json:"content,omitempty"`
	Tool      string `json:"tool,omitempty"`
	Timestamp string `json:"timestamp"`
}

// LoginData represents login response
type LoginData struct {
	Username string `json:"username"`
	Message  string `json:"message"`
}

// ConfigData represents config response
type ConfigData struct {
	APIEndpoint    string `json:"api_endpoint"`
	HasToken       bool   `json:"has_token"`
	DefaultTimeout int    `json:"default_timeout"`
	Verbose        bool   `json:"verbose"`
}

// JSONOutput handles JSON output for CLI
type JSONOutput struct {
	enabled bool
}

// NewJSONOutput creates a new JSON output handler
func NewJSONOutput(enabled bool) *JSONOutput {
	return &JSONOutput{enabled: enabled}
}

// IsEnabled returns whether JSON output is enabled
func (j *JSONOutput) IsEnabled() bool {
	return j.enabled
}

// Success outputs a successful JSON response
func (j *JSONOutput) Success(data interface{}) {
	response := JSONResponse{
		Success:   true,
		Data:      data,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	j.output(response)
}

// Error outputs an error JSON response
func (j *JSONOutput) Error(code int, message string, details string) {
	response := JSONResponse{
		Success: false,
		Error: &JSONError{
			Code:    code,
			Message: message,
			Details: details,
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	j.output(response)
}

// output prints JSON to stdout
func (j *JSONOutput) output(response JSONResponse) {
	data, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		// Fallback to simple error output
		fmt.Fprintf(os.Stderr, `{"success":false,"error":{"message":"JSON marshal error"}}`)
		return
	}
	fmt.Println(string(data))
}

// PrintEvent outputs a single event in JSON lines format (for streaming)
func (j *JSONOutput) PrintEvent(event ExecutionEvent) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}
	fmt.Println(string(data))
}

// ExitWithCode exits the program with the given code
func ExitWithCode(code int) {
	os.Exit(code)
}

// GetExitCodeForError returns the appropriate exit code for an error message
func GetExitCodeForError(errMsg string) int {
	switch {
	case contains(errMsg, "401", "authentication", "unauthorized"):
		return ExitAuthError
	case contains(errMsg, "404", "not found", "flow not found"):
		return ExitFlowNotFound
	case contains(errMsg, "missing", "required variable"):
		return ExitMissingVariables
	case contains(errMsg, "timeout"):
		return ExitTimeout
	case contains(errMsg, "cancelled", "canceled", "interrupted"):
		return ExitCancelled
	case contains(errMsg, "connection", "connect", "refused"):
		return ExitConnectionError
	default:
		return ExitGeneralError
	}
}

// contains checks if any of the substrings are in the string (case insensitive)
func contains(s string, substrs ...string) bool {
	sLower := toLower(s)
	for _, substr := range substrs {
		if containsStr(sLower, toLower(substr)) {
			return true
		}
	}
	return false
}

func toLower(s string) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 32
		}
		result[i] = c
	}
	return string(result)
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
