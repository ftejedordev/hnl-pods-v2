package commands

import (
	"fmt"
	"strings"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

// Styles for agent output
var (
	agentHeaderStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(lipgloss.Color("39"))

	agentNameStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("255"))

	agentDimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("245"))

	agentSuccessStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("46"))

	agentErrorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("196"))

	agentDefaultStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("226")).
				Bold(true)
)

// NewAgentCommand creates the agent command group
func NewAgentCommand(cfg *config.Config) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "agent",
		Short: "Manage agent configurations",
		Long: `Manage agent configurations.

Commands:
  pod agent list                    List all agents
  pod agent set-llm <agent> <llm>   Set the LLM for an agent
  pod agent info <agent>            Show agent details

Examples:
  pod agent list
  pod agent set-llm BUGZ 507f1f77bcf86cd799439011
  pod agent info BUGZ`,
		Aliases: []string{"agents"},
	}

	// Add subcommands
	cmd.AddCommand(newAgentListCommand(cfg))
	cmd.AddCommand(newAgentSetLLMCommand(cfg))
	cmd.AddCommand(newAgentInfoCommand(cfg))

	return cmd
}

// newAgentListCommand creates the agent list command
func newAgentListCommand(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:     "list",
		Short:   "List all agents",
		Long:    `List all available agents with their LLM assignments.`,
		Aliases: []string{"ls"},
		RunE: func(cmd *cobra.Command, args []string) error {
			return listAgents(cfg)
		},
	}
}

// newAgentSetLLMCommand creates the agent set-llm command
func newAgentSetLLMCommand(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "set-llm <agent> <llm-id>",
		Short: "Set the LLM for an agent",
		Long: `Set the LLM (Large Language Model) for an agent.

Arguments:
  agent   - Agent name or ID (e.g., "BUGZ" or "507f1f77...")
  llm-id  - LLM ID to assign (use 'pod llm list' to see available LLMs)

Examples:
  pod agent set-llm BUGZ 507f1f77bcf86cd799439011
  pod agent set-llm LEX 507f1f77bcf86cd799439011`,
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			return setAgentLLM(cfg, args[0], args[1])
		},
	}
}

// newAgentInfoCommand creates the agent info command
func newAgentInfoCommand(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "info <agent>",
		Short: "Show agent details",
		Long: `Show detailed information about an agent.

Arguments:
  agent - Agent name or ID

Examples:
  pod agent info BUGZ
  pod agent info 507f1f77bcf86cd799439011`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return showAgentInfo(cfg, args[0])
		},
	}
}

// listAgents lists all agents
func listAgents(cfg *config.Config) error {
	agentClient := client.NewAgentClient(cfg)
	llmClient := client.NewLLMClient(cfg)

	agents, err := agentClient.ListAgents()
	if err != nil {
		return fmt.Errorf("failed to list agents: %w", err)
	}

	// Get LLMs to show names
	llmResult, _ := llmClient.ListLLMs()
	llmMap := make(map[string]string)
	if llmResult != nil {
		for _, llm := range llmResult.LLMs {
			llmMap[llm.ID] = llm.Name
		}
	}

	if len(agents) == 0 {
		fmt.Println(agentDimStyle.Render("No agents found."))
		return nil
	}

	// Header
	fmt.Println()
	fmt.Println(agentHeaderStyle.Render("  Available Agents"))
	fmt.Println(agentDimStyle.Render("  " + strings.Repeat("─", 60)))
	fmt.Println()

	for _, agent := range agents {
		// Name and default indicator
		nameStr := agentNameStyle.Render(agent.Name)
		if agent.IsDefault {
			nameStr += " " + agentDefaultStyle.Render("(default)")
		}
		fmt.Printf("  %s\n", nameStr)

		// ID
		fmt.Printf("    %s %s\n", agentDimStyle.Render("ID:"), agent.ID)

		// Description
		if agent.Description != "" {
			desc := agent.Description
			if len(desc) > 60 {
				desc = desc[:57] + "..."
			}
			fmt.Printf("    %s %s\n", agentDimStyle.Render("Description:"), desc)
		}

		// LLM
		if agent.LLMID != "" {
			llmName := llmMap[agent.LLMID]
			if llmName != "" {
				fmt.Printf("    %s %s (%s)\n", agentDimStyle.Render("LLM:"), llmName, agent.LLMID[:8]+"...")
			} else {
				fmt.Printf("    %s %s\n", agentDimStyle.Render("LLM:"), agent.LLMID)
			}
		} else {
			fmt.Printf("    %s %s\n", agentDimStyle.Render("LLM:"), agentDimStyle.Render("(none)"))
		}

		// MCP Connections count
		if len(agent.MCPConnections) > 0 {
			fmt.Printf("    %s %d connection(s)\n", agentDimStyle.Render("MCP:"), len(agent.MCPConnections))
		}

		fmt.Println()
	}

	fmt.Printf("  %s\n\n", agentDimStyle.Render(fmt.Sprintf("Total: %d agent(s)", len(agents))))

	return nil
}

// setAgentLLM sets the LLM for an agent
func setAgentLLM(cfg *config.Config, agentIDOrName, llmID string) error {
	agentClient := client.NewAgentClient(cfg)
	llmClient := client.NewLLMClient(cfg)

	// Resolve agent ID
	agentID, agentName, err := agentClient.ResolveAgentID(agentIDOrName)
	if err != nil {
		return fmt.Errorf("failed to find agent: %w", err)
	}

	// Verify LLM exists
	llm, err := llmClient.GetLLM(llmID)
	if err != nil {
		return fmt.Errorf("failed to find LLM: %w", err)
	}

	fmt.Printf("\n  Setting LLM for agent %s\n", agentNameStyle.Render(agentName))
	fmt.Printf("  %s %s (%s)\n", agentDimStyle.Render("LLM:"), llm.Name, string(llm.Provider))
	fmt.Println(agentDimStyle.Render("  " + strings.Repeat("─", 40)))

	// Update the agent
	_, err = agentClient.SetAgentLLM(agentID, llmID)
	if err != nil {
		fmt.Printf("\n  %s\n\n", agentErrorStyle.Render("✗ Failed to update agent"))
		return fmt.Errorf("failed to set LLM: %w", err)
	}

	fmt.Printf("\n  %s Agent '%s' now uses LLM '%s'\n\n", agentSuccessStyle.Render("✓"), agentName, llm.Name)
	return nil
}

// showAgentInfo shows detailed agent information
func showAgentInfo(cfg *config.Config, agentIDOrName string) error {
	agentClient := client.NewAgentClient(cfg)
	llmClient := client.NewLLMClient(cfg)

	// Resolve agent ID
	agentID, _, err := agentClient.ResolveAgentID(agentIDOrName)
	if err != nil {
		return fmt.Errorf("failed to find agent: %w", err)
	}

	// Get agent details
	agent, err := agentClient.GetAgent(agentID)
	if err != nil {
		return fmt.Errorf("failed to get agent: %w", err)
	}

	// Header
	fmt.Println()
	nameStr := agentNameStyle.Render(agent.Name)
	if agent.IsDefault {
		nameStr += " " + agentDefaultStyle.Render("(default)")
	}
	fmt.Printf("  %s\n", nameStr)
	fmt.Println(agentDimStyle.Render("  " + strings.Repeat("─", 60)))
	fmt.Println()

	// ID
	fmt.Printf("  %s %s\n", agentDimStyle.Render("ID:"), agent.ID)

	// Description
	if agent.Description != "" {
		fmt.Printf("  %s %s\n", agentDimStyle.Render("Description:"), agent.Description)
	}

	// Color
	fmt.Printf("  %s %s\n", agentDimStyle.Render("Color:"), agent.Color)

	// LLM
	if agent.LLMID != "" {
		llm, llmErr := llmClient.GetLLM(agent.LLMID)
		if llmErr == nil {
			fmt.Printf("  %s %s (%s)\n", agentDimStyle.Render("LLM:"), llm.Name, string(llm.Provider))
			if llm.Config.ModelName != "" {
				fmt.Printf("  %s %s\n", agentDimStyle.Render("Model:"), llm.Config.ModelName)
			}
		} else {
			fmt.Printf("  %s %s\n", agentDimStyle.Render("LLM ID:"), agent.LLMID)
		}
	} else {
		fmt.Printf("  %s %s\n", agentDimStyle.Render("LLM:"), agentDimStyle.Render("(none assigned)"))
	}

	// MCP Connections
	if len(agent.MCPConnections) > 0 {
		fmt.Printf("  %s\n", agentDimStyle.Render("MCP Connections:"))
		for _, conn := range agent.MCPConnections {
			fmt.Printf("    - %s\n", conn)
		}
	}

	// Role
	if agent.Role != "" {
		fmt.Printf("  %s %s\n", agentDimStyle.Render("Role:"), agent.Role)
	}

	// Timestamps
	fmt.Printf("  %s %s\n", agentDimStyle.Render("Created:"), agent.CreatedAt.Time.Format("2006-01-02 15:04"))
	fmt.Printf("  %s %s\n", agentDimStyle.Render("Updated:"), agent.UpdatedAt.Time.Format("2006-01-02 15:04"))

	fmt.Println()
	return nil
}
