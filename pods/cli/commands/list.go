package commands

import (
	"fmt"
	"os"

	"pods-cli/client"
	"pods-cli/commands/interactive"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/spf13/cobra"
)

// NewListCommand creates the list flows command
func NewListCommand(cfg *config.Config) *cobra.Command {
	var showAll bool
	var showInactive bool
	var nonInteractive bool

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List available flows",
		Long: `List all flows available for execution.

Examples:
  pod list                              # Interactive flow list (active flows)
  pod list --all                        # Interactive flow list (all flows)
  pod list --inactive                   # Interactive flow list (inactive flows)
  pod list --no-interactive             # Non-interactive markdown list
  pod list --json                       # JSON output for LLM/scripts`,
		Aliases: []string{"ls", "flows"},
		RunE: func(cmd *cobra.Command, args []string) error {
			// JSON output mode
			if cfg.JSONOutput {
				return listFlowsJSON(cfg, showAll, showInactive)
			}
			if nonInteractive {
				return listFlowsNonInteractive(cfg, showAll, showInactive)
			}
			return listFlowsInteractive(cfg, showAll, showInactive)
		},
	}

	// Flags
	cmd.Flags().BoolVarP(&showAll, "all", "a", false, "Show all flows (including inactive)")
	cmd.Flags().BoolVar(&showInactive, "inactive", false, "Show only inactive flows")
	cmd.Flags().BoolVar(&nonInteractive, "no-interactive", false, "Use non-interactive mode")

	return cmd
}

// listFlowsInteractive displays available flows using interactive interface
func listFlowsInteractive(cfg *config.Config, showAll, showInactive bool) error {
	// Get flows from API
	flows, err := getFlowsFromAPI(cfg)
	if err != nil {
		return err
	}

	// Filter flows
	filteredFlows := filterFlows(flows, showAll, showInactive)

	if len(filteredFlows) == 0 {
		fmt.Println("No flows found matching the criteria.")
		return nil
	}

	// Run interactive list
	return interactive.RunInteractiveList(cfg, filteredFlows, showAll, showInactive)
}

// listFlowsNonInteractive displays available flows using markdown rendering
func listFlowsNonInteractive(cfg *config.Config, showAll, showInactive bool) error {
	// Get flows from API
	flows, err := getFlowsFromAPI(cfg)
	if err != nil {
		return err
	}

	// Filter flows
	filteredFlows := filterFlows(flows, showAll, showInactive)

	if len(filteredFlows) == 0 {
		fmt.Println("No flows found matching the criteria.")
		return nil
	}

	// Display flows using Glamour
	glamourRenderer := display.NewGlamourRenderer(cfg)
	output := glamourRenderer.RenderFlowsList(filteredFlows, showAll, showInactive)
	fmt.Print(output)
	return nil
}

// getFlowsFromAPI retrieves flows from the API
func getFlowsFromAPI(cfg *config.Config) ([]client.Flow, error) {
	// Initialize clients
	apiClient := client.NewAPIClient(cfg)
	logger := display.NewLogger(cfg)

	// Test API connection
	if err := apiClient.TestConnection(); err != nil {
		logger.LogError("Failed to connect to API", err)
		return nil, err
	}

	// Get flows
	flows, err := apiClient.GetFlows()
	if err != nil {
		logger.LogError("Failed to get flows", err)
		return nil, err
	}

	return flows, nil
}

// filterFlows applies filtering based on command flags
func filterFlows(flows []client.Flow, showAll, showInactive bool) []client.Flow {
	if showAll {
		return flows // Return all flows
	}

	var filtered []client.Flow
	for _, flow := range flows {
		if showInactive {
			// Show only inactive flows
			if !flow.IsActive {
				filtered = append(filtered, flow)
			}
		} else {
			// Show only active flows (default)
			if flow.IsActive {
				filtered = append(filtered, flow)
			}
		}
	}
	return filtered
}

// listFlowsJSON outputs flows in JSON format for LLM/script usage
func listFlowsJSON(cfg *config.Config, showAll, showInactive bool) error {
	jsonOut := display.NewJSONOutput(true)

	// Get flows from API
	flows, err := getFlowsFromAPI(cfg)
	if err != nil {
		jsonOut.Error(display.GetExitCodeForError(err.Error()), "Failed to get flows", err.Error())
		os.Exit(display.GetExitCodeForError(err.Error()))
		return err
	}

	// Filter flows
	filteredFlows := filterFlows(flows, showAll, showInactive)

	// Convert to JSON-friendly format
	flowInfos := make([]display.FlowInfo, 0, len(filteredFlows))
	for _, flow := range filteredFlows {
		// Extract variable names
		varNames := make([]string, 0, len(flow.Variables))
		for name := range flow.Variables {
			varNames = append(varNames, name)
		}

		flowInfos = append(flowInfos, display.FlowInfo{
			Name:        flow.Name,
			Description: flow.Description,
			IsActive:    flow.IsActive,
			Variables:   varNames,
			AgentCount:  len(flow.Agents),
		})
	}

	// Output JSON
	jsonOut.Success(display.FlowsListData{
		Flows: flowInfos,
		Total: len(flowInfos),
	})

	return nil
}
