package summarizer

import (
	"bytes"
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

// OpenRouterClient handles LLM summarization via OpenRouter
type OpenRouterClient struct {
	apiKey     string
	httpClient *http.Client
	config     *config.Config
}

// SummarizationRequest represents a request for predictive summarization
type SummarizationRequest struct {
	AgentName string                 `json:"agent_name"`
	AgentRole string                 `json:"agent_role"`
	Context   string                 `json:"context"`
	Task      string                 `json:"task"`
	StepName  string                 `json:"step_name"`
	Variables map[string]interface{} `json:"variables"`
	Language  string                 `json:"language"` // "en" or "es" for Spanish like the examples
}

// OpenRouterRequest represents the API request structure
type OpenRouterRequest struct {
	Model       string              `json:"model"`
	Messages    []OpenRouterMessage `json:"messages"`
	MaxTokens   int                 `json:"max_tokens"`
	Temperature float64             `json:"temperature"`
	Stream      bool                `json:"stream"`
}

// OpenRouterMessage represents a message in the conversation
type OpenRouterMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// OpenRouterResponse represents the API response
type OpenRouterResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

// NewOpenRouterClient creates a new OpenRouter client
func NewOpenRouterClient(cfg *config.Config) *OpenRouterClient {
	return &OpenRouterClient{
		apiKey: cfg.OpenRouterKey,
		config: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second, // Fast timeout for summarization
		},
	}
}

// GeneratePredictiveSummary generates a predictive summary of what an agent is about to do
func (c *OpenRouterClient) GeneratePredictiveSummary(ctx context.Context, req *SummarizationRequest) (string, error) {
	// If no API key, fall back to template-based summarization
	if c.apiKey == "" {
		return c.generateTemplateSummary(req), nil
	}

	// Create the prompt for predictive summarization
	prompt := c.buildPredictivePrompt(req)

	// Make API request
	response, err := c.makeAPIRequest(ctx, prompt)
	if err != nil {
		log.Debug("OpenRouter API failed, falling back to template", "error", err)
		return c.generateTemplateSummary(req), nil // Graceful fallback
	}

	return response, nil
}

// buildPredictivePrompt creates a prompt for predictive summarization
func (c *OpenRouterClient) buildPredictivePrompt(req *SummarizationRequest) string {
	// Build context information
	contextInfo := ""
	if req.Context != "" {
		contextInfo = fmt.Sprintf("Context: %s\n", req.Context)
	}
	if req.Task != "" {
		contextInfo += fmt.Sprintf("Task: %s\n", req.Task)
	}
	if len(req.Variables) > 0 {
		contextInfo += "Variables: "
		var varPairs []string
		for k, v := range req.Variables {
			varPairs = append(varPairs, fmt.Sprintf("%s=%v", k, v))
		}
		contextInfo += strings.Join(varPairs, ", ") + "\n"
	}

	language := req.Language
	if language == "" {
		language = "es" // Default to Spanish like the examples
	}

	// Create the prompt based on language
	var prompt string
	if language == "es" {
		prompt = fmt.Sprintf(`Eres un asistente que crea mensajes predictivos cortos para una CLI.

Agente: %s
Rol: %s
Paso: %s
%s

Crea un mensaje corto (máximo 50 caracteres) que describa lo que este agente está a punto de hacer, usando gerundio (-ando, -iendo).

Ejemplos:
- "analizando estructura del proyecto..."
- "generando implementación OAuth..."
- "verificando código creado..."
- "documentando nueva API..."
- "revisando aspectos técnicos..."

Solo devuelve el mensaje, sin explicaciones adicionales:`,
			req.AgentName, req.AgentRole, req.StepName, contextInfo)
	} else {
		prompt = fmt.Sprintf(`You are an assistant that creates short predictive messages for a CLI.

Agent: %s
Role: %s
Step: %s
%s

Create a short message (max 50 chars) describing what this agent is about to do, using present progressive tense.

Examples:
- "analyzing project structure..."
- "generating OAuth implementation..."
- "verifying created code..."
- "documenting new API..."
- "reviewing technical aspects..."

Only return the message, no additional explanations:`,
			req.AgentName, req.AgentRole, req.StepName, contextInfo)
	}

	return prompt
}

// makeAPIRequest makes the actual API request to OpenRouter
func (c *OpenRouterClient) makeAPIRequest(ctx context.Context, prompt string) (string, error) {
	// Use a fast, cheap model for summarization
	model := "openai/gpt-4o-mini" // Fast and cheap as per research

	request := OpenRouterRequest{
		Model: model,
		Messages: []OpenRouterMessage{
			{
				Role:    "user",
				Content: prompt,
			},
		},
		MaxTokens:   50,  // Short responses only
		Temperature: 0.3, // Low creativity for consistent results
		Stream:      false,
	}

	jsonData, err := json.Marshal(request)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewReader(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("HTTP-Referer", "https://github.com/hypernovalabs/hnl-pods")
	req.Header.Set("X-Title", "HNL Pods CLI")

	// Make request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var response OpenRouterResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if response.Error != nil {
		return "", fmt.Errorf("API error: %s", response.Error.Message)
	}

	if len(response.Choices) == 0 {
		return "", fmt.Errorf("no response choices")
	}

	content := strings.TrimSpace(response.Choices[0].Message.Content)

	// Clean up the response (remove quotes, etc.)
	content = strings.Trim(content, "\"'")

	return content, nil
}

// generateTemplateSummary provides template-based fallback summarization
func (c *OpenRouterClient) generateTemplateSummary(req *SummarizationRequest) string {
	agentLower := strings.ToLower(req.AgentName)
	roleLower := strings.ToLower(req.AgentRole)
	stepLower := strings.ToLower(req.StepName)
	contextLower := strings.ToLower(req.Context)
	taskLower := strings.ToLower(req.Task)

	// Combined text for pattern matching
	combined := agentLower + " " + roleLower + " " + stepLower + " " + contextLower + " " + taskLower

	// Language detection (simple heuristic)
	language := req.Language
	if language == "" {
		language = "es" // Default to Spanish like examples
	}

	// Generate predictive message based on patterns
	if language == "es" {
		return c.getSpanishTemplate(combined)
	} else {
		return c.getEnglishTemplate(combined)
	}
}

// getSpanishTemplate returns Spanish template messages
func (c *OpenRouterClient) getSpanishTemplate(combined string) string {
	switch {
	case strings.Contains(combined, "research") || strings.Contains(combined, "analyz") || strings.Contains(combined, "investigar"):
		return "analizando información disponible..."
	case strings.Contains(combined, "creative") || strings.Contains(combined, "generat") || strings.Contains(combined, "crear"):
		return "generando contenido creativo..."
	case strings.Contains(combined, "technical") || strings.Contains(combined, "code") || strings.Contains(combined, "técnico"):
		return "revisando aspectos técnicos..."
	case strings.Contains(combined, "fact") || strings.Contains(combined, "verify") || strings.Contains(combined, "verificar"):
		return "verificando información..."
	case strings.Contains(combined, "summary") || strings.Contains(combined, "resumen"):
		return "creando resumen ejecutivo..."
	case strings.Contains(combined, "document") || strings.Contains(combined, "doc"):
		return "documentando resultados..."
	case strings.Contains(combined, "test") || strings.Contains(combined, "qa") || strings.Contains(combined, "quality"):
		return "verificando calidad..."
	case strings.Contains(combined, "security") || strings.Contains(combined, "seguridad"):
		return "analizando seguridad..."
	case strings.Contains(combined, "oauth") || strings.Contains(combined, "auth"):
		return "implementando autenticación..."
	case strings.Contains(combined, "api"):
		return "desarrollando API..."
	case strings.Contains(combined, "database") || strings.Contains(combined, "data"):
		return "procesando datos..."
	default:
		return "procesando solicitud..."
	}
}

// getEnglishTemplate returns English template messages
func (c *OpenRouterClient) getEnglishTemplate(combined string) string {
	switch {
	case strings.Contains(combined, "research") || strings.Contains(combined, "analyz"):
		return "analyzing available information..."
	case strings.Contains(combined, "creative") || strings.Contains(combined, "generat"):
		return "generating creative content..."
	case strings.Contains(combined, "technical") || strings.Contains(combined, "code"):
		return "reviewing technical aspects..."
	case strings.Contains(combined, "fact") || strings.Contains(combined, "verify"):
		return "verifying information..."
	case strings.Contains(combined, "summary"):
		return "creating executive summary..."
	case strings.Contains(combined, "document") || strings.Contains(combined, "doc"):
		return "documenting results..."
	case strings.Contains(combined, "test") || strings.Contains(combined, "qa") || strings.Contains(combined, "quality"):
		return "verifying quality..."
	case strings.Contains(combined, "security"):
		return "analyzing security..."
	case strings.Contains(combined, "oauth") || strings.Contains(combined, "auth"):
		return "implementing authentication..."
	case strings.Contains(combined, "api"):
		return "developing API..."
	case strings.Contains(combined, "database") || strings.Contains(combined, "data"):
		return "processing data..."
	default:
		return "processing request..."
	}
}

// IsAvailable checks if the OpenRouter client is properly configured
func (c *OpenRouterClient) IsAvailable() bool {
	return c.apiKey != ""
}

// GetModel returns the model being used for summarization
func (c *OpenRouterClient) GetModel() string {
	if c.apiKey != "" {
		return "openai/gpt-4o-mini"
	}
	return "template-based"
}
