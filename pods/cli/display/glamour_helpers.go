package display

import (
	"fmt"
	"strings"
	"time"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
)

// GlamourRenderer provides consistent markdown rendering across the CLI
type GlamourRenderer struct {
	renderer *glamour.TermRenderer
	config   *config.Config
}

// NewGlamourRenderer creates a new Glamour renderer with CLI styling
func NewGlamourRenderer(cfg *config.Config) *GlamourRenderer {
	renderer, err := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),  // Auto-detect dark/light terminal
		glamour.WithWordWrap(80), // Wrap at 80 characters
	)
	if err != nil {
		// Fallback renderer if main one fails
		renderer, _ = glamour.NewTermRenderer()
	}

	return &GlamourRenderer{
		renderer: renderer,
		config:   cfg,
	}
}

// Render renders markdown content with fallback to plain text
func (g *GlamourRenderer) Render(markdown string) string {
	if g.renderer == nil {
		return markdown // Fallback to plain text
	}

	out, err := g.renderer.Render(markdown)
	if err != nil {
		return markdown // Fallback to plain text
	}

	return out
}

// RenderFlowsList creates a markdown representation of flows
func (g *GlamourRenderer) RenderFlowsList(flows []client.Flow, showAll, showInactive bool) string {
	var sb strings.Builder

	// Header
	sb.WriteString("# 📋 Available Flows\n\n")

	if len(flows) == 0 {
		sb.WriteString("No flows found matching the criteria.\n\n")
		sb.WriteString("**💡 Tip:** Try using `pod list --all` to see all flows including inactive ones.\n")
		return g.Render(sb.String())
	}

	// Summary
	activeCount := 0
	inactiveCount := 0
	for _, flow := range flows {
		if flow.IsActive {
			activeCount++
		} else {
			inactiveCount++
		}
	}

	sb.WriteString(fmt.Sprintf("**Total:** %d flows (%d active, %d inactive)\n\n",
		len(flows), activeCount, inactiveCount))

	// Flow list
	for i, flow := range flows {
		g.writeFlowMarkdown(&sb, flow, i == len(flows)-1)
	}

	// Usage hints
	sb.WriteString("## 💡 Usage Hints\n\n")
	sb.WriteString("- **Execute a flow:** `pod run <flow-name> <key> <value>...`\n")
	sb.WriteString("- **Get flow help:** `pod help <flow-name>`\n")
	sb.WriteString("- **Show all flows:** `pod list --all`\n")
	sb.WriteString("- **Show only inactive:** `pod list --inactive`\n")

	return g.Render(sb.String())
}

// writeFlowMarkdown writes a single flow as markdown
func (g *GlamourRenderer) writeFlowMarkdown(sb *strings.Builder, flow client.Flow, isLast bool) {
	// Flow name with status
	statusEmoji := "🟢"
	statusText := "Active"
	if !flow.IsActive {
		statusEmoji = "🔴"
		statusText = "Inactive"
	}

	sb.WriteString(fmt.Sprintf("## %s %s\n", statusEmoji, flow.Name))
	sb.WriteString(fmt.Sprintf("**Status:** %s\n\n", statusText))

	// Description
	if flow.Description != "" {
		sb.WriteString(fmt.Sprintf("**Description:** %s\n\n", flow.Description))
	}

	// Details table
	sb.WriteString("| Property | Value |\n")
	sb.WriteString("|----------|-------|\n")

	// Agents
	if len(flow.Agents) > 0 {
		var agentNames []string
		for _, agent := range flow.Agents {
			agentNames = append(agentNames, fmt.Sprintf("`%s`", agent.Name))
		}
		sb.WriteString(fmt.Sprintf("| **Agents** | %s |\n", strings.Join(agentNames, ", ")))
	}

	// Variables
	if len(flow.Variables) > 0 {
		var varNames []string
		for varName := range flow.Variables {
			varNames = append(varNames, fmt.Sprintf("`%s`", varName))
		}
		sb.WriteString(fmt.Sprintf("| **Variables** | %s |\n", strings.Join(varNames, ", ")))
	}

	// Steps count
	sb.WriteString(fmt.Sprintf("| **Steps** | %d |\n", flow.StepsCount))

	// Tags
	if len(flow.Tags) > 0 {
		tagStr := strings.Join(flow.Tags, ", ")
		sb.WriteString(fmt.Sprintf("| **Tags** | %s |\n", tagStr))
	}

	// Created date
	if !flow.CreatedAt.IsZero() {
		sb.WriteString(fmt.Sprintf("| **Created** | %s |\n", formatTimeRelative(flow.CreatedAt.Time)))
	}

	// Usage example
	sb.WriteString("\n**Usage Example:**\n")
	sb.WriteString("```bash\n")
	sb.WriteString(fmt.Sprintf("pod run %s", flow.Name))
	if len(flow.Variables) > 0 {
		sb.WriteString(" <variables...>")
	}
	sb.WriteString("\n```\n")

	if !isLast {
		sb.WriteString("\n---\n\n")
	}
}

// RenderAgentStatus creates a polished agent status display with lipgloss styling
func (g *GlamourRenderer) RenderAgentStatus(agentName, role, status, message, agentColor string) string {
	statusEmoji := g.getStatusEmoji(status)

	// Define styles for different elements
	agentColorCode := "#00D7FF" // Default cyan
	if agentColor != "" {
		agentColorCode = agentColor
	}

	agentNameStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(agentColorCode)).
		Bold(true)

	roleStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#666666")).
		Italic(true)

	statusStyle := lipgloss.NewStyle().
		Foreground(g.getStatusColor(status)).
		Bold(true)

	messageStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#888888")).
		Italic(true).
		MarginLeft(2)

	// Create the main status line
	var statusParts []string

	// Agent name (colored and bold)
	statusParts = append(statusParts, agentNameStyle.Render(agentName))

	// Role (if available and not generic)
	if role != "" && role != "assistant" && role != "Assistant" {
		statusParts = append(statusParts, roleStyle.Render(fmt.Sprintf("Role: %s", role)))
	}

	// Status with emoji
	statusParts = append(statusParts, statusStyle.Render(fmt.Sprintf("Status: %s %s", statusEmoji, status)))

	// Join with styled separators
	separator := lipgloss.NewStyle().Foreground(lipgloss.Color("#444444")).Render(" │ ")
	statusLine := strings.Join(statusParts, separator)

	var result strings.Builder
	result.WriteString(statusLine)
	result.WriteString("\n")

	// Message on a separate line if present
	if message != "" {
		result.WriteString(messageStyle.Render(fmt.Sprintf("▶ %s", message)))
		result.WriteString("\n")
	}

	result.WriteString("\n") // Add spacing

	return result.String()
}

// getStatusColor returns the appropriate color for a status
func (g *GlamourRenderer) getStatusColor(status string) lipgloss.Color {
	switch strings.ToLower(status) {
	case "completed", "success":
		return lipgloss.Color("#00FF87") // Bright green
	case "failed", "error":
		return lipgloss.Color("#FF5F87") // Bright red
	case "running", "in_progress", "started":
		return lipgloss.Color("#00D7FF") // Bright cyan
	case "responding":
		return lipgloss.Color("#FFD700") // Gold
	case "pending", "waiting":
		return lipgloss.Color("#FFAF00") // Orange
	case "cancelled", "stopped":
		return lipgloss.Color("#FF8700") // Dark orange
	default:
		return lipgloss.Color("#87CEEB") // Light blue
	}
}

// RenderExecutionSummary creates a markdown representation of execution summary
func (g *GlamourRenderer) RenderExecutionSummary(executionID, status string, progress map[string]interface{}, message string) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("# 🚀 Execution: %s\n\n", executionID))

	// Status
	statusEmoji := g.getStatusEmoji(status)
	sb.WriteString(fmt.Sprintf("**Status:** %s %s\n\n", statusEmoji, status))

	// Progress if available
	if progress != nil {
		if completedSteps, ok := progress["completed_steps"].(int); ok {
			if totalSteps, ok := progress["total_steps"].(int); ok {
				percentage := float64(completedSteps) / float64(totalSteps) * 100
				sb.WriteString(fmt.Sprintf("**Progress:** %d/%d steps (%.1f%%)\n\n",
					completedSteps, totalSteps, percentage))
			}
		}
	}

	// Message
	if message != "" {
		sb.WriteString(fmt.Sprintf("**Update:** %s\n", message))
	}

	return g.Render(sb.String())
}

// RenderConfigurationStatus creates a markdown representation of configuration
func (g *GlamourRenderer) RenderConfigurationStatus(cfg *config.Config) string {
	var sb strings.Builder

	sb.WriteString("# ⚙️ HNL Pods CLI Configuration\n\n")

	// API Settings
	sb.WriteString("## 🌐 API Settings\n\n")
	sb.WriteString("| Setting | Value |\n")
	sb.WriteString("|---------|-------|\n")
	sb.WriteString(fmt.Sprintf("| **Endpoint** | `%s` |\n", cfg.APIEndpoint))

	tokenStatus := "❌ Not set"
	if cfg.HasValidToken() {
		tokenStatus = "✅ Set (hidden for security)"
	}
	sb.WriteString(fmt.Sprintf("| **Token** | %s |\n", tokenStatus))

	// OpenRouter Settings
	sb.WriteString("\n## 🤖 OpenRouter Settings\n\n")
	sb.WriteString("| Setting | Value |\n")
	sb.WriteString("|---------|-------|\n")

	openRouterStatus := "❌ Not set"
	if cfg.OpenRouterKey != "" {
		openRouterStatus = "✅ Set (hidden for security)"
	}
	sb.WriteString(fmt.Sprintf("| **API Key** | %s |\n", openRouterStatus))

	// General Settings
	sb.WriteString("\n## 🔧 General Settings\n\n")
	sb.WriteString("| Setting | Value |\n")
	sb.WriteString("|---------|-------|\n")
	sb.WriteString(fmt.Sprintf("| **Verbose** | `%t` |\n", cfg.Verbose))
	sb.WriteString(fmt.Sprintf("| **Timeout** | `%d seconds` |\n", cfg.DefaultTimeout))

	// Configuration commands
	sb.WriteString("\n## 💡 Configuration Commands\n\n")
	sb.WriteString("```bash\n")
	sb.WriteString("pod config set api <endpoint>     # Set API endpoint\n")
	sb.WriteString("pod config set token <token>      # Set auth token\n")
	sb.WriteString("pod config set openrouter-key <key> # Set OpenRouter key\n")
	sb.WriteString("pod config reset                  # Reset to defaults\n")
	sb.WriteString("```\n")

	return g.Render(sb.String())
}

// RenderSuccessMessage creates a markdown success message
func (g *GlamourRenderer) RenderSuccessMessage(title, message string) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("## ✅ %s\n\n", title))
	if message != "" {
		sb.WriteString(fmt.Sprintf("%s\n", message))
	}

	return g.Render(sb.String())
}

// RenderErrorMessage creates a markdown error message
func (g *GlamourRenderer) RenderErrorMessage(title, message string) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("## ❌ %s\n\n", title))
	if message != "" {
		sb.WriteString(fmt.Sprintf("**Error:** %s\n", message))
	}

	return g.Render(sb.String())
}

// RenderWarningMessage creates a markdown warning message
func (g *GlamourRenderer) RenderWarningMessage(title, message string) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("## ⚠️ %s\n\n", title))
	if message != "" {
		sb.WriteString(fmt.Sprintf("**Warning:** %s\n", message))
	}

	return g.Render(sb.String())
}

// Helper functions

func (g *GlamourRenderer) getStatusEmoji(status string) string {
	switch strings.ToLower(status) {
	case "completed", "success", "active":
		return "✅"
	case "failed", "error":
		return "❌"
	case "running", "in_progress", "started":
		return "🔄"
	case "pending", "waiting":
		return "⏳"
	case "cancelled", "stopped":
		return "🛑"
	case "warning":
		return "⚠️"
	default:
		return "ℹ️"
	}
}

func formatTimeRelative(t time.Time) string {
	now := time.Now()
	diff := now.Sub(t)

	switch {
	case diff < time.Minute:
		return "just now"
	case diff < time.Hour:
		minutes := int(diff.Minutes())
		if minutes == 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", minutes)
	case diff < 24*time.Hour:
		hours := int(diff.Hours())
		if hours == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)
	case diff < 7*24*time.Hour:
		days := int(diff.Hours() / 24)
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	default:
		return t.Format("Jan 2, 2006")
	}
}
