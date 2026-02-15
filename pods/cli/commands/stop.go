package commands

import (
	"fmt"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/spf13/cobra"
)

// NewStopCommand creates the stop command
func NewStopCommand(cfg *config.Config) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "stop <execution_id>",
		Short: "Stop a running flow execution",
		Long: `Stop a running flow execution by its execution ID.

The execution ID is displayed when you start a flow execution, or you can find it in the 
web UI. This will gracefully cancel the execution and stop all running steps.

Examples:
  pod stop abc123def
  pod stop 6bb2d5a2f8e4f1b3c9d7e2a1`,
		Args:    cobra.ExactArgs(1),
		Aliases: []string{"cancel"},
		RunE: func(cmd *cobra.Command, args []string) error {
			executionID := args[0]
			return stopExecution(cfg, executionID)
		},
	}

	return cmd
}

// stopExecution handles the execution cancellation logic
func stopExecution(cfg *config.Config, executionID string) error {
	// Initialize API client
	apiClient := client.NewAPIClient(cfg)

	// Test API connection
	if cfg.Verbose {
		fmt.Printf("🌐 Testing API connection to %s...\n", cfg.APIEndpoint)
	}
	if err := apiClient.TestConnection(); err != nil {
		fmt.Printf("❌ Failed to connect to API: %v\n", err)
		return err
	}
	if cfg.Verbose {
		fmt.Printf("✅ API connection successful\n")
	}

	// Cancel the execution
	if cfg.Verbose {
		fmt.Printf("⏹️ Stopping execution: %s\n", executionID)
	}

	fmt.Printf("🛑 Stopping execution %s...\n", executionID[:8])

	if err := apiClient.CancelExecution(executionID); err != nil {
		fmt.Printf("❌ Failed to stop execution: %v\n", err)
		return err
	}

	fmt.Printf("✅ Execution %s has been stopped successfully\n", executionID[:8])
	return nil
}
