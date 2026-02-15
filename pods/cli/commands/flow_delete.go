package commands

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"pods-cli/client"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/spf13/cobra"
)

// NewFlowDeleteCommand creates the flow delete command
func NewFlowDeleteCommand(cfg *config.Config) *cobra.Command {
	var force bool

	cmd := &cobra.Command{
		Use:   "delete <flow-name>",
		Short: "Delete a flow",
		Long: `Delete a flow permanently.

Examples:
  pod flow delete dev02              # Asks for confirmation
  pod flow delete dev02 --force      # No confirmation
  pod flow delete dev02 --json       # JSON output`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return deleteFlow(cfg, args[0], force)
		},
	}

	cmd.Flags().BoolVar(&force, "force", false, "Skip confirmation")

	return cmd
}

func deleteFlow(cfg *config.Config, flowName string, force bool) error {
	jsonOut := display.NewJSONOutput(cfg.JSONOutput)

	// Confirm deletion unless --force or --json
	if !force && !jsonOut.IsEnabled() {
		fmt.Printf("⚠️  Are you sure you want to delete flow '%s'? This cannot be undone.\n", flowName)
		fmt.Print("   Type 'yes' to confirm: ")

		reader := bufio.NewReader(os.Stdin)
		response, _ := reader.ReadString('\n')
		response = strings.TrimSpace(strings.ToLower(response))

		if response != "yes" {
			fmt.Println("❌ Deletion cancelled")
			return nil
		}
	}

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

	// Delete flow
	result, err := apiClient.DeleteFlow(flowName)
	if err != nil {
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.GetExitCodeForError(err.Error()), "Failed to delete flow", err.Error())
			os.Exit(display.GetExitCodeForError(err.Error()))
		}
		fmt.Printf("❌ Failed to delete flow: %v\n", err)
		return err
	}

	// Output result
	if jsonOut.IsEnabled() {
		jsonOut.Success(result)
	} else {
		fmt.Printf("✅ %s\n", result.Message)
	}

	return nil
}
