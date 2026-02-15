package display

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"pods-cli/client"
	"pods-cli/config"
	"pods-cli/summarizer"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/log"
)

// Logger handles CLI output with styling and colors
type Logger struct {
	config                *config.Config
	agentNames            map[string]string // agent_id -> name mapping
	agentColors           map[string]string // agent_id -> color mapping
	agentRoles            map[string]string // agent_id -> role/description mapping
	summarizer            *summarizer.OpenRouterClient
	glamourRenderer       *GlamourRenderer
	spinner               spinner.Model
	spinnerActive         bool
	currentSpinnerMessage string
	spinnerMutex          sync.Mutex
}

// NewLogger creates a new logger instance
func NewLogger(cfg *config.Config) *Logger {
	// Create and style the spinner
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#00D7FF")).
		Bold(true)

	return &Logger{
		config:                cfg,
		agentNames:            make(map[string]string),
		agentColors:           make(map[string]string),
		agentRoles:            make(map[string]string),
		summarizer:            summarizer.NewOpenRouterClient(cfg),
		glamourRenderer:       NewGlamourRenderer(cfg),
		spinner:               s,
		spinnerActive:         false,
		currentSpinnerMessage: "",
	}
}

// SetAgentInfo sets agent name, color, and role mapping
func (l *Logger) SetAgentInfo(agentID, name, color, description string) {
	l.agentNames[agentID] = name
	l.agentColors[agentID] = color
	l.agentRoles[agentID] = description
}

// LogFlowStart logs the start of a flow execution
func (l *Logger) LogFlowStart(flowName string, variables map[string]interface{}) {
	var content strings.Builder

	content.WriteString(fmt.Sprintf("# 🚀 Starting Flow: %s\n\n", flowName))

	if len(variables) > 0 {
		content.WriteString("## 📋 Variables\n\n")
		content.WriteString("| Variable | Value |\n")
		content.WriteString("|----------|-------|\n")
		for k, v := range variables {
			content.WriteString(fmt.Sprintf("| `%s` | `%v` |\n", k, v))
		}
		content.WriteString("\n")
	}

	content.WriteString("---\n")

	fmt.Print(l.glamourRenderer.Render(content.String()))
}

// UpdateFlowVariables is a no-op for basic logger
func (l *Logger) UpdateFlowVariables(variables map[string]interface{}) {
	// No-op for basic logger
}

// LogEvent logs an SSE event with appropriate styling
func (l *Logger) LogEvent(event *client.SSEEvent) {
	timestamp := event.Timestamp.Format("15:04:05")
	_ = l.getEventPriority(event.EventType) // Keep method for potential future use

	switch event.EventType {
	case "execution_started":
		l.logExecutionEvent(timestamp, "🔄", "Execution started", "info")
		l.UpdateSpinnerMessage("Initializing agents...")

	case "execution_completed":
		l.StopSpinner()
		l.logExecutionEvent(timestamp, "✅", "Execution completed", "success")
		l.logFinalResults(event)

	case "execution_failed":
		l.StopSpinner()
		l.logExecutionEvent(timestamp, "❌", "Execution failed", "error")
		if event.Message != "" {
			log.Error(fmt.Sprintf("   Error: %s", event.Message))
		}

	case "step_started":
		l.logStepEvent(timestamp, event, "started")
		// Update spinner with context-aware LLM-generated messages
		agentID := l.getAgentFromData(event.Data)
		agentName := l.getAgentName(agentID)
		agentRole := l.getAgentRole(agentID)
		l.UpdateSpinnerWithContext(agentName, agentRole, event.Data)

	case "step_completed":
		l.logStepEvent(timestamp, event, "completed")
		l.UpdateSpinnerMessage("Processing next step...")

	case "step_failed":
		l.StopSpinner()
		l.logStepEvent(timestamp, event, "failed")

	case "llm_response":
		// Update spinner to show agent is actively responding
		agentID := l.getAgentFromData(event.Data)
		agentName := l.getAgentName(agentID)
		l.UpdateSpinnerMessage(fmt.Sprintf("%s is responding...", agentName))
		l.logAgentActivity(timestamp, event, "responding")

	case "tool_call_started":
		l.logToolActivity(timestamp, event, "started")
		// Update spinner for tool usage
		if toolName, exists := event.Data["tool_name"]; exists {
			if tn, ok := toolName.(string); ok {
				l.UpdateSpinnerMessage(fmt.Sprintf("Using %s...", tn))
			}
		}

	case "tool_call_completed":
		l.logToolActivity(timestamp, event, "completed")
		l.UpdateSpinnerMessage("Continuing with task...")

	case "heartbeat":
		if l.config.Verbose {
			l.logHeartbeat(timestamp)
		}

	default:
		if l.config.Verbose {
			log.Debug(fmt.Sprintf("[%s] %s: %s", timestamp, event.EventType, event.Message))
		}
	}
}

// logExecutionEvent logs execution-level events
func (l *Logger) logExecutionEvent(timestamp, icon, message, level string) {
	color := l.config.GetSystemColor(level)
	style := lipgloss.NewStyle().
		Foreground(lipgloss.Color(color)).
		Bold(true)

	logMessage := fmt.Sprintf("[%s] %s %s", timestamp, icon, message)

	switch level {
	case "error":
		log.Error(style.Render(logMessage))
	case "success":
		log.Info(style.Render(logMessage))
	default:
		log.Info(style.Render(logMessage))
	}
}

// logStepEvent logs step-level events
func (l *Logger) logStepEvent(timestamp string, event *client.SSEEvent, status string) {
	agentID := l.getAgentFromData(event.Data)
	agentName := l.getAgentName(agentID)
	agentRole := l.getAgentRole(agentID)
	agentColor := l.getAgentColor(agentID)

	var statusText string
	switch status {
	case "started":
		statusText = "started"
	case "completed":
		statusText = "completed"
	case "failed":
		statusText = "failed"
	default:
		statusText = "in_progress"
	}

	// Use Glamour to render agent status
	output := l.glamourRenderer.RenderAgentStatus(agentName, agentRole, statusText, event.Message, agentColor)
	fmt.Print(output)
}

// logAgentActivity logs agent LLM activity with predictive messages
func (l *Logger) logAgentActivity(timestamp string, event *client.SSEEvent, activity string) {
	agentID := l.getAgentFromData(event.Data)
	agentName := l.getAgentName(agentID)
	agentRole := l.getAgentRole(agentID)
	agentColor := l.getAgentColor(agentID)

	// Create predictive message based on agent activity
	message := l.generatePredictiveMessage(agentName, event.Data)

	// Use Glamour to render agent status
	output := l.glamourRenderer.RenderAgentStatus(agentName, agentRole, "responding", message, agentColor)
	fmt.Print(output)
}

// logToolActivity logs tool execution activity
func (l *Logger) logToolActivity(timestamp string, event *client.SSEEvent, status string) {
	agentID := l.getAgentFromData(event.Data)
	agentName := l.getAgentName(agentID)
	color := l.getAgentColor(agentID)

	toolName := ""
	if toolNameData, exists := event.Data["tool_name"]; exists {
		if tn, ok := toolNameData.(string); ok {
			toolName = tn
		}
	}

	var icon string
	switch status {
	case "started":
		icon = "🔧"
	case "completed":
		icon = "✅"
	default:
		icon = "⚙️"
	}

	// Style agent name with their color
	agentStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(color)).
		Bold(true)

	var message string
	if toolName != "" {
		message = fmt.Sprintf("using %s", toolName)
	} else {
		message = "using tools"
	}

	logMessage := fmt.Sprintf("[%s] %s %s %s",
		timestamp,
		icon,
		agentStyle.Render(agentName),
		message)

	log.Info(logMessage)
}

// logHeartbeat logs heartbeat events (only in verbose mode)
func (l *Logger) logHeartbeat(timestamp string) {
	style := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#6B7280")).
		Faint(true)

	log.Debug(style.Render(fmt.Sprintf("[%s] 💓 heartbeat", timestamp)))
}

// generatePredictiveMessage creates a predictive summary using OpenRouter or templates
func (l *Logger) generatePredictiveMessage(agentName string, data map[string]interface{}) string {
	// Extract context from the event data
	agentID := l.getAgentFromData(data)
	agentRole := l.getAgentRole(agentID)

	// Extract any context from the data
	contextStr := ""
	task := ""
	stepName := ""

	if contentData, exists := data["content"]; exists {
		if c, ok := contentData.(string); ok {
			contextStr = c
		}
	}

	if taskData, exists := data["task"]; exists {
		if t, ok := taskData.(string); ok {
			task = t
		}
	}

	if stepData, exists := data["step_name"]; exists {
		if s, ok := stepData.(string); ok {
			stepName = s
		}
	}

	// Create summarization request
	req := &summarizer.SummarizationRequest{
		AgentName: agentName,
		AgentRole: agentRole,
		Context:   contextStr,
		Task:      task,
		StepName:  stepName,
		Variables: nil,  // Could extract from data if needed
		Language:  "es", // Spanish as per examples
	}

	// Use OpenRouter for summarization with quick timeout
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if summary, err := l.summarizer.GeneratePredictiveSummary(ctx, req); err == nil && summary != "" {
		return summary
	}

	// Fallback to simple template (this is now handled by the summarizer's fallback)
	return "procesando solicitud..."
}

// Helper methods

func (l *Logger) getEventPriority(eventType string) string {
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

func (l *Logger) getAgentFromData(data map[string]interface{}) string {
	// Try multiple possible keys for agent identification
	possibleKeys := []string{"agent_id", "agentId", "agent", "step_agent_id"}

	for _, key := range possibleKeys {
		if agentID, exists := data[key]; exists {
			if aid, ok := agentID.(string); ok && aid != "" {
				return aid
			}
		}
	}

	// Debug log to understand missing agent data
	if l.config.Verbose {
		log.Debug("No agent_id found in event data", "data", data)
	}

	return "assistant" // More user-friendly fallback
}

func (l *Logger) getAgentName(agentID string) string {
	if name, exists := l.agentNames[agentID]; exists {
		return name
	}
	// Return agent ID if it looks like a valid ID, otherwise use a friendly name
	if agentID != "" && agentID != "assistant" && agentID != "unknown" {
		return agentID
	}
	return "Assistant" // More user-friendly fallback
}

func (l *Logger) getAgentColor(agentID string) string {
	if color, exists := l.agentColors[agentID]; exists {
		return l.config.GetAgentColor(color)
	}
	return l.config.GetAgentColor("") // Fallback to default agent color
}

func (l *Logger) getAgentRole(agentID string) string {
	if role, exists := l.agentRoles[agentID]; exists {
		return role
	}
	return "assistant" // Fallback role
}

// LogError logs an error message
func (l *Logger) LogError(message string, err error) {
	var errorMsg string
	if err != nil {
		errorMsg = fmt.Sprintf("%s: %s", message, err.Error())
	} else {
		errorMsg = message
	}

	output := l.glamourRenderer.RenderErrorMessage("Error", errorMsg)
	fmt.Print(output)
}

// LogSuccess logs a success message
func (l *Logger) LogSuccess(message string) {
	output := l.glamourRenderer.RenderSuccessMessage("Success", message)
	fmt.Print(output)
}

// LogInfo logs an info message
func (l *Logger) LogInfo(message string) {
	// For info messages, just print directly with some formatting
	fmt.Printf("ℹ️  %s\n", message)
}

// LogWarning logs a warning message
func (l *Logger) LogWarning(message string) {
	output := l.glamourRenderer.RenderWarningMessage("Warning", message)
	fmt.Print(output)
}

// StartSpinner starts the loading spinner with a message
func (l *Logger) StartSpinner(message string) {
	l.startSpinnerWithContext(message, "", "", nil)
}

// StartSpinnerWithContext starts the loading spinner with context for dynamic messages
func (l *Logger) StartSpinnerWithContext(agentName, agentRole string, data map[string]interface{}) {
	// Generate dynamic message using the summarizer
	dynamicMessage := l.generatePredictiveMessage(agentName, data)
	if dynamicMessage == "" {
		dynamicMessage = "Agent is processing..."
	}
	l.startSpinnerWithContext(dynamicMessage, agentName, agentRole, data)
}

// startSpinnerWithContext is the internal implementation
func (l *Logger) startSpinnerWithContext(message, agentName, agentRole string, data map[string]interface{}) {
	l.spinnerMutex.Lock()
	defer l.spinnerMutex.Unlock()

	// Stop any existing spinner first
	if l.spinnerActive {
		l.spinnerActive = false
		time.Sleep(50 * time.Millisecond) // Quick cleanup
	}

	l.spinnerActive = true
	l.currentSpinnerMessage = message

	// Start spinner in a goroutine
	go func() {
		// Wait for initial output to settle
		time.Sleep(500 * time.Millisecond)

		l.spinnerMutex.Lock()
		if !l.spinnerActive {
			l.spinnerMutex.Unlock()
			return
		}
		l.spinnerMutex.Unlock()

		ticker := time.NewTicker(120 * time.Millisecond) // Slower updates to reduce conflicts
		defer ticker.Stop()

		// Style the message
		messageStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFD700")). // Gold color for visibility
			Bold(true)

		for {
			l.spinnerMutex.Lock()
			if !l.spinnerActive {
				l.spinnerMutex.Unlock()
				break
			}

			// Use the current dynamic message
			currentMessage := l.currentSpinnerMessage
			l.spinnerMutex.Unlock()

			// Show styled spinner with current message
			styledMessage := messageStyle.Render(currentMessage)
			fmt.Printf("\r  %s %s", l.spinner.View(), styledMessage)
			l.spinner, _ = l.spinner.Update(spinner.Tick())

			<-ticker.C
		}

		// Clear the spinner line and add newline to prevent overlap
		fmt.Print("\r\033[K\n")
	}()
}

// UpdateSpinnerMessage updates the spinner message without restarting it
func (l *Logger) UpdateSpinnerMessage(newMessage string) {
	l.spinnerMutex.Lock()
	defer l.spinnerMutex.Unlock()

	if l.spinnerActive {
		// Update the message in the current spinner context
		// The spinner goroutine will pick up the new message on next iteration
		l.currentSpinnerMessage = newMessage
	}
}

// UpdateSpinnerWithContext updates spinner with dynamic LLM-generated message
func (l *Logger) UpdateSpinnerWithContext(agentName, agentRole string, data map[string]interface{}) {
	// Generate dynamic message using the summarizer with fallback behavior
	var dynamicMessage string

	// Try to generate LLM summary
	if l.summarizer != nil {
		dynamicMessage = l.generatePredictiveMessage(agentName, data)
	}

	// Fallback to context-based messages if LLM fails
	if dynamicMessage == "" {
		if agentRole != "" && agentRole != "assistant" {
			// Use agent role for context
			switch {
			case strings.Contains(strings.ToLower(agentRole), "github"):
				dynamicMessage = "Analyzing GitHub repository..."
			case strings.Contains(strings.ToLower(agentRole), "software architect"):
				dynamicMessage = "Creating architectural plan..."
			case strings.Contains(strings.ToLower(agentRole), "random"):
				dynamicMessage = "Selecting random value..."
			case strings.Contains(strings.ToLower(agentRole), "retriev"):
				dynamicMessage = "Retrieving information..."
			default:
				dynamicMessage = fmt.Sprintf("%s is working...", agentName)
			}
		} else {
			// Final fallback
			dynamicMessage = fmt.Sprintf("%s is processing...", agentName)
		}
	}

	l.UpdateSpinnerMessage(dynamicMessage)
}

// StopSpinner stops the loading spinner
func (l *Logger) StopSpinner() {
	l.spinnerMutex.Lock()
	defer l.spinnerMutex.Unlock()

	if l.spinnerActive {
		l.spinnerActive = false
		// Give the goroutine time to clean up properly
		time.Sleep(200 * time.Millisecond)
	}
}

// logFinalResults displays the final execution results
func (l *Logger) logFinalResults(event *client.SSEEvent) {
	if event.Data == nil {
		if l.config.Verbose {
			log.Debug("No event data for final results")
		}
		return
	}

	// Debug: Log all event data keys
	if l.config.Verbose {
		log.Debug("Final results event data keys", "keys", getMapKeys(event.Data))
	}

	// Extract final results from event data
	finalResult, hasResult := event.Data["final_result"]
	finalAgentOutput, hasAgentOutput := event.Data["final_agent_output"]
	totalSteps, _ := event.Data["total_steps"]
	completedSteps, _ := event.Data["completed_steps"]

	var content strings.Builder

	content.WriteString("## 🎯 Final Results\n\n")

	// Show execution summary
	if totalSteps != nil && completedSteps != nil {
		content.WriteString(fmt.Sprintf("**Execution Summary:** %v/%v steps completed\n\n", completedSteps, totalSteps))
	}

	// Show final agent output if available
	if hasAgentOutput && finalAgentOutput != nil {
		if output, ok := finalAgentOutput.(string); ok && output != "" {
			content.WriteString("**Final Output:**\n")
			content.WriteString(fmt.Sprintf("%s\n\n", output))
		}
	}

	// Show final result if available and different from agent output
	if hasResult && finalResult != nil {
		if result, ok := finalResult.(string); ok && result != "" {
			// Only show result if it's different from agent output or if there's no agent output
			if !hasAgentOutput || finalResult != finalAgentOutput {
				content.WriteString("**Result Data:**\n")
				content.WriteString(fmt.Sprintf("```\n%s\n```\n\n", result))
			}
		}
	}

	// If we have content to show, render it
	if content.Len() > len("## 🎯 Final Results\n\n") {
		fmt.Print(l.glamourRenderer.Render(content.String()))
	} else if l.config.Verbose {
		log.Debug("No final results content to display")
	}
}

// Helper function to get map keys for debugging
func getMapKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
