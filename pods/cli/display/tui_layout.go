package display

import (
	"fmt"
	"sort"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// TUILayout manages the terminal user interface layout
type TUILayout struct {
	width         int
	height        int
	contentBuffer []string
	spinnerText   string
	isActive      bool
}

// NewTUILayout creates a new TUI layout manager
func NewTUILayout() *TUILayout {
	return &TUILayout{
		width:         80, // Default width
		height:        24, // Default height
		contentBuffer: make([]string, 0),
		isActive:      false,
	}
}

// Define color palette for modern look with improved visibility
var (
	primaryColor = lipgloss.Color("#00D7FF") // Bright cyan
	successColor = lipgloss.Color("#00FF87") // Bright green
	errorColor   = lipgloss.Color("#FF5F87") // Bright red
	warningColor = lipgloss.Color("#FFD700") // Bright gold
	mutedColor   = lipgloss.Color("#9CA3AF") // Lighter gray for better readability
	borderColor  = lipgloss.Color("#6B7280") // Medium gray
	bgColor      = lipgloss.Color("#1F2937") // Dark background
	textColor    = lipgloss.Color("#F9FAFB") // Light text for contrast
	accentColor  = lipgloss.Color("#8B5CF6") // Purple accent
)

// Style definitions
var (
	// Main container style
	containerStyle = lipgloss.NewStyle().
			Width(100).
			Height(30).
			Padding(1).
			Border(lipgloss.RoundedBorder()).
			BorderForeground(borderColor)

	// Content area style
	contentAreaStyle = lipgloss.NewStyle().
				Width(96).
				Height(25).
				Padding(1, 2).
				MarginBottom(1)

	// Agent step box style
	agentStepStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(primaryColor).
			Padding(0, 1).
			MarginBottom(1).
			Width(90)

	// Spinner area style
	spinnerAreaStyle = lipgloss.NewStyle().
				Width(96).
				Height(3).
				Border(lipgloss.NormalBorder()).
				BorderForeground(warningColor).
				Padding(0, 2).
				Align(lipgloss.Left)

	// Flow header style
	flowHeaderStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(primaryColor).
			Background(bgColor).
			Padding(1, 2).
			MarginBottom(1).
			Width(96).
			Align(lipgloss.Center)

	// Agent name style
	agentNameStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(primaryColor)

	// Status styles
	statusRunningStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Bold(true)

	statusCompletedStyle = lipgloss.NewStyle().
				Foreground(successColor).
				Bold(true)

	statusFailedStyle = lipgloss.NewStyle().
				Foreground(errorColor).
				Bold(true)

	// Message style with better contrast
	messageStyle = lipgloss.NewStyle().
			Foreground(textColor).
			MarginLeft(2)
)

// AgentStepInfo represents information about an agent step
type AgentStepInfo struct {
	AgentName     string
	Role          string
	Status        string
	Message       string
	AgentColor    string
	ExecutionTime string
}

// RenderFlowHeader renders the flow header
func (tui *TUILayout) RenderFlowHeader(flowName string, variables map[string]interface{}) string {
	var content strings.Builder

	// Flow title
	title := fmt.Sprintf("🚀 Flow: %s", flowName)
	content.WriteString(flowHeaderStyle.Render(title))
	content.WriteString("\n")

	// Variables section if present
	if len(variables) > 0 {
		varContent := strings.Builder{}
		varContent.WriteString("📋 Variables:\n")

		// Use sorted keys to avoid duplicate display and ensure consistent ordering
		keys := make([]string, 0, len(variables))
		for k := range variables {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		for _, k := range keys {
			v := variables[k]
			varLine := fmt.Sprintf("  • %s: %v", k, v)
			varContent.WriteString(varLine + "\n")
		}

		varBox := lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(mutedColor).
			Padding(1, 2).
			Width(90).
			Render(varContent.String())

		content.WriteString(varBox)
		content.WriteString("\n")
	}

	return content.String()
}

// RenderAgentStep renders a single agent step in a bordered box
func (tui *TUILayout) RenderAgentStep(step AgentStepInfo) string {
	var content strings.Builder

	// Agent name and role header
	agentHeader := fmt.Sprintf("%s", agentNameStyle.Render(step.AgentName))
	if step.Role != "" && step.Role != "assistant" {
		agentHeader += fmt.Sprintf(" (%s)",
			lipgloss.NewStyle().Foreground(mutedColor).Render(step.Role))
	}

	// Status with appropriate styling
	var statusText string
	switch strings.ToLower(step.Status) {
	case "completed", "success":
		statusText = statusCompletedStyle.Render("✅ " + step.Status)
	case "failed", "error":
		statusText = statusFailedStyle.Render("❌ " + step.Status)
	case "running", "started", "in_progress":
		statusText = statusRunningStyle.Render("🔄 " + step.Status)
	default:
		statusText = lipgloss.NewStyle().Foreground(mutedColor).Render("ℹ️ " + step.Status)
	}

	// Execution time if available
	timeInfo := ""
	if step.ExecutionTime != "" {
		timeInfo = lipgloss.NewStyle().
			Foreground(mutedColor).
			Render(fmt.Sprintf(" (%s)", step.ExecutionTime))
	}

	// Header line
	headerLine := lipgloss.JoinHorizontal(lipgloss.Left,
		agentHeader,
		"  ",
		statusText,
		timeInfo)
	content.WriteString(headerLine)

	// Message if present
	if step.Message != "" {
		content.WriteString("\n")
		messageText := messageStyle.Render("▶ " + step.Message)
		content.WriteString(messageText)
	}

	// Apply agent step styling with dynamic border color
	borderColor := primaryColor
	if step.AgentColor != "" {
		borderColor = lipgloss.Color(step.AgentColor)
	}

	stepBox := agentStepStyle.
		BorderForeground(borderColor).
		Render(content.String())

	return stepBox
}

// RenderSpinnerArea renders the spinner area at the bottom
func (tui *TUILayout) RenderSpinnerArea(spinnerChar, message string) string {
	if message == "" {
		return ""
	}

	spinnerContent := fmt.Sprintf("%s %s",
		lipgloss.NewStyle().Foreground(warningColor).Render(spinnerChar),
		lipgloss.NewStyle().Foreground(warningColor).Bold(true).Render(message))

	return spinnerAreaStyle.Render(spinnerContent)
}

// RenderExecutionSummary renders the final execution summary
func (tui *TUILayout) RenderExecutionSummary(executionTime string, finalResult, finalOutput string) string {
	var content strings.Builder

	// Header
	header := lipgloss.NewStyle().
		Bold(true).
		Foreground(successColor).
		Render("🎯 Execution Completed")
	content.WriteString(header)
	content.WriteString("\n\n")

	// Execution time
	if executionTime != "" {
		timeText := fmt.Sprintf("⏱️  Execution Time: %s", executionTime)
		content.WriteString(timeText)
		content.WriteString("\n\n")
	}

	// Final output
	if finalOutput != "" {
		content.WriteString("📋 Final Output:\n")
		outputBox := lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(successColor).
			Padding(1, 2).
			Width(90).
			Render(finalOutput)
		content.WriteString(outputBox)
		content.WriteString("\n")
	}

	// Final result data if different
	if finalResult != "" && finalResult != finalOutput {
		content.WriteString("\n📊 Result Data:\n")
		resultBox := lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(mutedColor).
			Padding(1, 2).
			Width(90).
			Render(finalResult)
		content.WriteString(resultBox)
	}

	return content.String()
}

// RenderFullLayout renders the complete TUI layout
func (tui *TUILayout) RenderFullLayout(header, content, spinner string) string {
	// Content area
	contentArea := contentAreaStyle.Render(header + "\n" + content)

	// Spinner area (if active)
	var spinnerArea string
	if spinner != "" {
		spinnerArea = tui.RenderSpinnerArea("⣾", spinner)
	}

	// Combine all areas
	var fullContent string
	if spinnerArea != "" {
		fullContent = lipgloss.JoinVertical(lipgloss.Left, contentArea, spinnerArea)
	} else {
		fullContent = contentArea
	}

	// Apply container styling
	return containerStyle.Render(fullContent)
}

// UpdateDimensions updates the layout dimensions
func (tui *TUILayout) UpdateDimensions(width, height int) {
	tui.width = width
	tui.height = height

	// Update styles with new dimensions
	containerStyle = containerStyle.Width(width - 4).Height(height - 4)
	contentAreaStyle = contentAreaStyle.Width(width - 8).Height(height - 8)
	spinnerAreaStyle = spinnerAreaStyle.Width(width - 8)
}

// formatAgentName formats agent name for display - shows full name if meaningful
func formatAgentName(agentName string) string {
	if agentName == "Assistant" || agentName == "" {
		return "ASS"
	}

	// For meaningful names, show more characters
	if len(agentName) > 15 {
		return agentName[:12] + "..."
	}

	return agentName
}

// GetStatusEmoji returns appropriate emoji for status
func GetStatusEmoji(status string) string {
	switch strings.ToLower(status) {
	case "completed", "success":
		return "✅"
	case "failed", "error":
		return "❌"
	case "running", "started", "in_progress":
		return "🔄"
	case "pending", "waiting":
		return "⏳"
	case "cancelled", "stopped":
		return "🛑"
	case "output":
		return "📄"
	case "summary":
		return "💭"
	default:
		return "ℹ️"
	}
}

// RenderCompactFlowHeader renders a compact flow header
func (tui *TUILayout) RenderCompactFlowHeader(flowName string, variables map[string]interface{}) string {
	header := lipgloss.NewStyle().
		Bold(true).
		Foreground(primaryColor).
		Render(fmt.Sprintf("🚀 %s", flowName))

	// Clean up variables display - avoid nested maps and duplicates
	cleanVars := tui.cleanVariables(variables)
	if len(cleanVars) > 0 {
		varStr := ""
		for k, v := range cleanVars {
			if varStr != "" {
				varStr += ", "
			}
			varStr += fmt.Sprintf("%s: %v", k, v)
		}
		header += " " + lipgloss.NewStyle().Foreground(mutedColor).Render(fmt.Sprintf("(%s)", varStr))
	}

	return header
}

// cleanVariables removes nested maps and duplicates from variables
func (tui *TUILayout) cleanVariables(variables map[string]interface{}) map[string]interface{} {
	clean := make(map[string]interface{})

	for k, v := range variables {
		// Skip nested variable maps
		if k == "variables" {
			// If this is a nested variables map, extract its contents
			if nestedMap, ok := v.(map[string]interface{}); ok {
				for nk, nv := range nestedMap {
					clean[nk] = nv
				}
			}
			continue
		}

		// Only include if not already present (avoid duplicates)
		if _, exists := clean[k]; !exists {
			clean[k] = v
		}
	}

	return clean
}

// RenderCompactAgentStep renders a single-line agent step
func (tui *TUILayout) RenderCompactAgentStep(step AgentStepInfo) string {
	// Handle special step types
	switch step.Status {
	case "output":
		return tui.renderAgentOutput(step)
	case "summary":
		return tui.renderAgentSummary(step)
	case "final":
		return tui.renderFinalResult(step)
	case "tool_started":
		return tui.renderToolStep(step, "🔧")
	case "tool_completed":
		return tui.renderToolStep(step, "✅")
	case "tool_failed":
		return tui.renderToolStep(step, "❌")
	default:
		return tui.renderRegularStep(step)
	}
}

// renderRegularStep renders a regular step
func (tui *TUILayout) renderRegularStep(step AgentStepInfo) string {
	// Status emoji
	statusEmoji := GetStatusEmoji(step.Status)

	// Agent name (formatted for readability)
	agentDisplay := formatAgentName(step.AgentName)

	// Build the line
	line := fmt.Sprintf("%s %s %s",
		statusEmoji,
		lipgloss.NewStyle().Bold(true).Foreground(primaryColor).Render(agentDisplay),
		lipgloss.NewStyle().Foreground(mutedColor).Render(step.Message))

	// Add execution time if available
	if step.ExecutionTime != "" {
		line += " " + lipgloss.NewStyle().Foreground(mutedColor).Render(fmt.Sprintf("(%s)", step.ExecutionTime))
	}

	return line
}

// renderAgentOutput renders agent output with special formatting
func (tui *TUILayout) renderAgentOutput(step AgentStepInfo) string {
	agentDisplay := formatAgentName(step.AgentName)

	// Multi-line output with indentation
	lines := strings.Split(step.Message, "\n")
	if len(lines) == 1 {
		// Single line output
		return fmt.Sprintf("📄 %s %s",
			lipgloss.NewStyle().Bold(true).Foreground(successColor).Render(agentDisplay),
			lipgloss.NewStyle().Foreground(mutedColor).Render(step.Message))
	}

	// Multi-line output
	var result strings.Builder
	header := fmt.Sprintf("📄 %s Output:",
		lipgloss.NewStyle().Bold(true).Foreground(successColor).Render(agentDisplay))
	result.WriteString(header + "\n")

	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			result.WriteString("   " + lipgloss.NewStyle().Foreground(mutedColor).Render(line) + "\n")
		}
	}

	return strings.TrimSuffix(result.String(), "\n")
}

// renderAgentSummary renders agent summary with special formatting
func (tui *TUILayout) renderAgentSummary(step AgentStepInfo) string {
	agentDisplay := formatAgentName(step.AgentName)

	return fmt.Sprintf("💭 %s %s",
		lipgloss.NewStyle().Bold(true).Foreground(warningColor).Render(agentDisplay),
		lipgloss.NewStyle().Foreground(mutedColor).Italic(true).Render(step.Message))
}

// renderFinalResult renders the final result with special prominence
func (tui *TUILayout) renderFinalResult(step AgentStepInfo) string {
	// Create a very prominent final result display
	header := lipgloss.NewStyle().
		Bold(true).
		Foreground(successColor).
		Background(lipgloss.Color("#1a1a1a")).
		Padding(0, 2).
		Render("🎯 FINAL RESULT 🎯")

	// Show execution time if available
	timeInfo := ""
	if step.ExecutionTime != "" {
		timeInfo = lipgloss.NewStyle().
			Foreground(mutedColor).
			Render(fmt.Sprintf(" (completed in %s)", step.ExecutionTime))
	}

	// Format the message with proper line breaks
	message := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(successColor).
		Padding(1, 2).
		Foreground(lipgloss.Color("#FFFFFF")).
		Width(70).
		Render(step.Message)

	return "\n" + header + timeInfo + "\n" + message + "\n"
}

// renderToolStep renders a tool call step
func (tui *TUILayout) renderToolStep(step AgentStepInfo, emoji string) string {
	// Agent name (formatted for readability)
	agentDisplay := formatAgentName(step.AgentName)

	// Build the tool step line
	line := fmt.Sprintf("%s %s %s",
		emoji,
		lipgloss.NewStyle().Bold(true).Foreground(warningColor).Render(agentDisplay),
		lipgloss.NewStyle().Foreground(mutedColor).Render(step.Message))

	return line
}

// RenderToolCall renders a single-line tool call (simplified version)
func (tui *TUILayout) RenderToolCall(agentName, toolName, status, result string) string {
	statusEmoji := "🔧"
	if status == "completed" {
		statusEmoji = "✅"
	} else if status == "failed" {
		statusEmoji = "❌"
	}

	// Agent name (formatted for readability)
	agentDisplay := formatAgentName(agentName)

	line := fmt.Sprintf("%s %s using %s",
		statusEmoji,
		lipgloss.NewStyle().Bold(true).Foreground(warningColor).Render(agentDisplay),
		lipgloss.NewStyle().Foreground(mutedColor).Render(toolName))

	// Show result with better handling of longer results
	if result != "" {
		// Truncate very long results but show more useful info
		if len(result) > 100 {
			lines := strings.Split(result, "\n")
			if len(lines) > 1 {
				result = lines[0] + "... (" + fmt.Sprintf("%d lines", len(lines)) + ")"
			} else {
				result = result[:97] + "..."
			}
		}
		line += " → " + lipgloss.NewStyle().Foreground(mutedColor).Render(result)
	}

	return line
}

// RenderFinalOutput renders the final output section
func (tui *TUILayout) RenderFinalOutput(output string) string {
	// Create a prominent final output display
	header := lipgloss.NewStyle().
		Bold(true).
		Foreground(successColor).
		Align(lipgloss.Center).
		Width(80).
		Render("🎯 FINAL RESULT 🎯")

	// Add separator line
	separator := lipgloss.NewStyle().
		Foreground(successColor).
		Render(strings.Repeat("─", 80))

	// Format output content
	content := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(successColor).
		Padding(1, 2).
		Width(76).
		Foreground(lipgloss.Color("#FFFFFF")).
		Render(output)

	// Add closing separator
	closingSeparator := lipgloss.NewStyle().
		Foreground(successColor).
		Render(strings.Repeat("─", 80))

	return "\n" + header + "\n" + separator + "\n" + content + "\n" + closingSeparator + "\n"
}

// RenderExecutionTime renders execution time
func (tui *TUILayout) RenderExecutionTime(executionTime string) string {
	return lipgloss.NewStyle().
		Foreground(mutedColor).
		Render(fmt.Sprintf("⏱️ Completed in %s", executionTime))
}
