package commands

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"pods-cli/client"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

// NewFlowImportCommand creates the flow import command
func NewFlowImportCommand(cfg *config.Config) *cobra.Command {
	var overwrite bool
	var activate bool

	cmd := &cobra.Command{
		Use:   "import <file>",
		Short: "Import flow from YAML or JSON file",
		Long: `Import a flow definition from a file.

Examples:
  pod flow import flow.yaml              # Import from YAML
  pod flow import flow.json              # Import from JSON
  pod flow import flow.yaml --overwrite  # Overwrite if exists
  pod flow import flow.yaml --json       # JSON output for LLM`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return importFlow(cfg, args[0], overwrite, activate)
		},
	}

	cmd.Flags().BoolVar(&overwrite, "overwrite", false, "Overwrite if flow exists")
	cmd.Flags().BoolVar(&activate, "activate", true, "Activate flow after import")

	return cmd
}

func importFlow(cfg *config.Config, filePath string, overwrite bool, activate bool) error {
	jsonOut := display.NewJSONOutput(cfg.JSONOutput)

	// Read file
	data, err := os.ReadFile(filePath)
	if err != nil {
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.ExitGeneralError, "Failed to read file", err.Error())
			os.Exit(display.ExitGeneralError)
		}
		fmt.Printf("❌ Failed to read file: %v\n", err)
		return err
	}

	// Parse file based on extension
	var flowData client.FlowFullData
	ext := strings.ToLower(filepath.Ext(filePath))

	if ext == ".yaml" || ext == ".yml" {
		if err := yaml.Unmarshal(data, &flowData); err != nil {
			if jsonOut.IsEnabled() {
				jsonOut.Error(display.ExitGeneralError, "Failed to parse YAML", err.Error())
				os.Exit(display.ExitGeneralError)
			}
			fmt.Printf("❌ Failed to parse YAML: %v\n", err)
			return err
		}
	} else {
		// Try JSON
		if err := parseJSON(data, &flowData); err != nil {
			if jsonOut.IsEnabled() {
				jsonOut.Error(display.ExitGeneralError, "Failed to parse file", err.Error())
				os.Exit(display.ExitGeneralError)
			}
			fmt.Printf("❌ Failed to parse file: %v\n", err)
			return err
		}
	}

	// Override is_active if specified
	if !activate {
		flowData.IsActive = false
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

	// Import flow
	result, err := apiClient.ImportFlow(&flowData, overwrite)
	if err != nil {
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.GetExitCodeForError(err.Error()), "Failed to import flow", err.Error())
			os.Exit(display.GetExitCodeForError(err.Error()))
		}
		fmt.Printf("❌ Failed to import flow: %v\n", err)
		return err
	}

	// Output result
	if jsonOut.IsEnabled() {
		jsonOut.Success(result)
	} else {
		fmt.Printf("✅ %s\n", result.Message)
		fmt.Printf("   Flow ID: %s\n", result.FlowID)
		fmt.Printf("   Action: %s\n", result.Action)
	}

	return nil
}

func parseJSON(data []byte, v interface{}) error {
	// Simple JSON parsing without importing encoding/json again
	return yaml.Unmarshal(data, v) // YAML parser can handle JSON too
}
