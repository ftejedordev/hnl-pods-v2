package commands

import (
	"fmt"
	"os"

	"pods-cli/client"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/spf13/cobra"
)

// NewFlowEditCommand creates the flow edit command
func NewFlowEditCommand(cfg *config.Config) *cobra.Command {
	var description string
	var activate bool
	var deactivate bool

	cmd := &cobra.Command{
		Use:   "edit <flow-name>",
		Short: "Edit an existing flow",
		Long: `Edit an existing flow's properties.

Examples:
  pod flow edit dev01 --description "New description"
  pod flow edit dev01 --activate
  pod flow edit dev01 --deactivate
  pod flow edit dev01 --json`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return editFlow(cfg, args[0], description, activate, deactivate)
		},
	}

	cmd.Flags().StringVar(&description, "description", "", "Update description")
	cmd.Flags().BoolVar(&activate, "activate", false, "Activate flow")
	cmd.Flags().BoolVar(&deactivate, "deactivate", false, "Deactivate flow")

	return cmd
}

func editFlow(cfg *config.Config, flowName, description string, activate, deactivate bool) error {
	jsonOut := display.NewJSONOutput(cfg.JSONOutput)

	// Validate flags
	if activate && deactivate {
		err := fmt.Errorf("cannot use --activate and --deactivate together")
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.ExitGeneralError, "Invalid flags", err.Error())
			os.Exit(display.ExitGeneralError)
		}
		fmt.Printf("❌ %v\n", err)
		return err
	}

	// Check if any updates provided
	if description == "" && !activate && !deactivate {
		err := fmt.Errorf("no updates provided. Use --description, --activate, or --deactivate")
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.ExitGeneralError, "No updates", err.Error())
			os.Exit(display.ExitGeneralError)
		}
		fmt.Printf("❌ %v\n", err)
		return err
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

	// Build update params
	var descPtr *string
	var activePtr *bool

	if description != "" {
		descPtr = &description
	}
	if activate {
		t := true
		activePtr = &t
	} else if deactivate {
		f := false
		activePtr = &f
	}

	// Update flow
	result, err := apiClient.UpdateFlow(flowName, descPtr, activePtr)
	if err != nil {
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.GetExitCodeForError(err.Error()), "Failed to update flow", err.Error())
			os.Exit(display.GetExitCodeForError(err.Error()))
		}
		fmt.Printf("❌ Failed to update flow: %v\n", err)
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
