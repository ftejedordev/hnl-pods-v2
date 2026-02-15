package commands

import (
	"fmt"
	"os"

	"pods-cli/client"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/spf13/cobra"
)

// NewFlowCloneCommand creates the flow clone command
func NewFlowCloneCommand(cfg *config.Config) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "clone <source-flow> <new-name>",
		Short: "Clone an existing flow",
		Long: `Clone an existing flow with a new name.

Examples:
  pod flow clone dev01 dev02
  pod flow clone dev01 dev02 --json`,
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			return cloneFlow(cfg, args[0], args[1])
		},
	}

	return cmd
}

func cloneFlow(cfg *config.Config, sourceName, newName string) error {
	jsonOut := display.NewJSONOutput(cfg.JSONOutput)

	// Initialize API client
	apiClient := client.NewAPIClient(cfg)

	// Test connection
	if err := apiClient.TestConnection(); err != nil {
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.ExitConnectionError, "Failed to connect to API", err.Error())
			os.Exit(display.ExitConnectionError)
		}
		fmt.Printf("❌ Failed to connect to API: %v\n", err)
		return err
	}

	// Clone flow
	result, err := apiClient.CloneFlow(sourceName, newName)
	if err != nil {
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.GetExitCodeForError(err.Error()), "Failed to clone flow", err.Error())
			os.Exit(display.GetExitCodeForError(err.Error()))
		}
		fmt.Printf("❌ Failed to clone flow: %v\n", err)
		return err
	}

	// Output result
	if jsonOut.IsEnabled() {
		jsonOut.Success(result)
	} else {
		fmt.Printf("✅ %s\n", result.Message)
		fmt.Printf("   Flow ID: %s\n", result.FlowID)
	}

	return nil
}
