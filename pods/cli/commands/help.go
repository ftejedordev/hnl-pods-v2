package commands

import (
	"fmt"
	"strings"

	"pods-cli/client"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

// NewFlowHelpCommand creates the legacy flow help command (deprecated)
func NewFlowHelpCommand(cfg *config.Config) *cobra.Command {
	cmd := &cobra.Command{
		Use:    "flow-help <flow>",
		Short:  "Show detailed help for a flow (deprecated - use 'pod help <flow>')",
		Args:   cobra.ExactArgs(1),
		Hidden: true, // Hide from main help
		RunE: func(cmd *cobra.Command, args []string) error {
			return showFlowHelp(cfg, args[0])
		},
	}

	return cmd
}

// showFlowHelp displays detailed help information for a flow
func showFlowHelp(cfg *config.Config, flowName string) error {
	// Initialize clients
	apiClient := client.NewAPIClient(cfg)
	logger := display.NewLogger(cfg)

	// Test API connection
	if err := apiClient.TestConnection(); err != nil {
		logger.LogError("Failed to connect to API", err)
		return err
	}

	// Get flow help information
	flowHelp, err := apiClient.GetFlowHelp(flowName)
	if err != nil {
		logger.LogError(fmt.Sprintf("Failed to get help for flow '%s'", flowName), err)
		return err
	}

	// Display flow help
	displayFlowHelp(cfg, flowHelp)
	return nil
}

// displayFlowHelp renders the flow help information with styling
func displayFlowHelp(cfg *config.Config, flowHelp *client.FlowHelp) {
	// Header style
	headerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(cfg.GetSystemColor("info"))).
		Bold(true).
		Underline(true)

	// Section style
	sectionStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(cfg.GetSystemColor("success"))).
		Bold(true)

	// Key style
	keyStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#F59E0B")). // Amber
		Bold(true)

	// Value style
	valueStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#6B7280")) // Gray

	// Flow header
	fmt.Printf("\n%s\n", headerStyle.Render(fmt.Sprintf("📋 Flow: %s", flowHelp.Name)))

	if flowHelp.Description != "" {
		fmt.Printf("%s\n", valueStyle.Render(flowHelp.Description))
	}

	// Usage section
	fmt.Printf("\n%s\n", sectionStyle.Render("🚀 Usage"))
	fmt.Printf("  %s\n", keyStyle.Render(flowHelp.Usage.Command))

	if flowHelp.Usage.Example != "" {
		fmt.Printf("\n%s\n", keyStyle.Render("Example:"))
		fmt.Printf("  %s\n", valueStyle.Render(flowHelp.Usage.Example))
	}

	// Variables section
	if len(flowHelp.Variables) > 0 {
		fmt.Printf("\n%s\n", sectionStyle.Render("📝 Variables"))
		for key, defaultValue := range flowHelp.Variables {
			if defaultValue != nil {
				fmt.Printf("  %s %s %s\n",
					keyStyle.Render(fmt.Sprintf("• %s:", key)),
					valueStyle.Render(fmt.Sprintf("(default: %v)", defaultValue)),
					"")
			} else {
				fmt.Printf("  %s %s\n",
					keyStyle.Render(fmt.Sprintf("• %s:", key)),
					valueStyle.Render("(required)"))
			}
		}
	}

	// Agents section
	if len(flowHelp.Agents) > 0 {
		fmt.Printf("\n%s\n", sectionStyle.Render("🤖 Agents"))
		for _, agent := range flowHelp.Agents {
			// Style agent name with their color
			agentStyle := lipgloss.NewStyle().
				Foreground(lipgloss.Color(cfg.GetAgentColor(agent.Color))).
				Bold(true)

			fmt.Printf("  %s\n", agentStyle.Render(fmt.Sprintf("• %s", agent.Name)))

			if agent.Description != "" {
				fmt.Printf("    %s\n", valueStyle.Render(agent.Description))
			}

			// Show MCP connections if any
			if len(agent.MCPConnections) > 0 {
				fmt.Printf("    %s %s\n",
					keyStyle.Render("Tools:"),
					valueStyle.Render(strings.Join(agent.MCPConnections, ", ")))
			}
		}
	}

	// MCP Connections section
	if len(flowHelp.MCPConnections) > 0 {
		fmt.Printf("\n%s\n", sectionStyle.Render("🔧 Tools & Integrations"))
		for _, conn := range flowHelp.MCPConnections {
			fmt.Printf("  %s %s\n",
				keyStyle.Render(fmt.Sprintf("• %s:", conn.Name)),
				valueStyle.Render(fmt.Sprintf("(%s)", conn.ServerType)))

			if conn.Description != "" {
				fmt.Printf("    %s\n", valueStyle.Render(conn.Description))
			}
		}
	}

	// Flow structure section
	if len(flowHelp.Steps) > 0 {
		fmt.Printf("\n%s\n", sectionStyle.Render("🔀 Flow Structure"))

		// Build a visual representation
		displayFlowStructure(cfg, flowHelp)
	}

	// Metadata section
	if len(flowHelp.Metadata) > 0 {
		fmt.Printf("\n%s\n", sectionStyle.Render("ℹ️  Metadata"))

		// Show tags if available
		if tags, exists := flowHelp.Metadata["tags"]; exists {
			if tagSlice, ok := tags.([]interface{}); ok {
				var tagStrings []string
				for _, tag := range tagSlice {
					if tagStr, ok := tag.(string); ok {
						tagStrings = append(tagStrings, tagStr)
					}
				}
				if len(tagStrings) > 0 {
					fmt.Printf("  %s %s\n",
						keyStyle.Render("Tags:"),
						valueStyle.Render(strings.Join(tagStrings, ", ")))
				}
			}
		}

		// Show category if available
		if category, exists := flowHelp.Metadata["category"]; exists {
			fmt.Printf("  %s %s\n",
				keyStyle.Render("Category:"),
				valueStyle.Render(fmt.Sprintf("%v", category)))
		}

		// Show version if available
		if version, exists := flowHelp.Metadata["version"]; exists {
			fmt.Printf("  %s %s\n",
				keyStyle.Render("Version:"),
				valueStyle.Render(fmt.Sprintf("%v", version)))
		}
	}

	fmt.Println() // Add spacing at the end
}

// displayFlowStructure shows a visual representation of the flow structure
func displayFlowStructure(cfg *config.Config, flowHelp *client.FlowHelp) {
	// Simple linear representation for now
	// In a full implementation, this could be a more sophisticated graph

	keyStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#F59E0B")). // Amber
		Bold(true)

	valueStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#6B7280")) // Gray

	// Start step
	if flowHelp.StartStep != "" {
		fmt.Printf("  %s %s\n",
			keyStyle.Render("Start:"),
			valueStyle.Render(flowHelp.StartStep))
	}

	// Show steps in order
	for i, step := range flowHelp.Steps {
		// Get agent info
		var agentName string
		var agentColor string
		if agent, exists := flowHelp.Agents[step.Agent]; exists {
			agentName = agent.Name
			agentColor = agent.Color
		} else {
			agentName = step.Agent
			agentColor = cfg.GetSystemColor("agent")
		}

		// Style agent name
		agentStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color(cfg.GetAgentColor(agentColor))).
			Bold(true)

		// Step indicator
		stepNum := fmt.Sprintf("%d.", i+1)

		fmt.Printf("  %s %s %s\n",
			keyStyle.Render(stepNum),
			agentStyle.Render(agentName),
			valueStyle.Render(step.Name))

		if step.Description != "" {
			fmt.Printf("     %s\n", valueStyle.Render(step.Description))
		}

		// Show next steps if any
		if len(step.NextSteps) > 0 {
			if len(step.NextSteps) == 1 {
				fmt.Printf("     %s %s\n",
					keyStyle.Render("→"),
					valueStyle.Render(step.NextSteps[0]))
			} else {
				fmt.Printf("     %s %s\n",
					keyStyle.Render("→"),
					valueStyle.Render(fmt.Sprintf("branches to: %s", strings.Join(step.NextSteps, ", "))))
			}
		}
	}
}
