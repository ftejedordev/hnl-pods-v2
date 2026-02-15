package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"pods-cli/client"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

// FlowExportData represents the flow structure for export
type FlowExportData struct {
	Name         string                            `json:"name" yaml:"name"`
	Description  string                            `json:"description" yaml:"description"`
	IsActive     bool                              `json:"is_active" yaml:"is_active"`
	Variables    map[string]interface{}            `json:"variables" yaml:"variables"`
	Agents       map[string]FlowExportAgent        `json:"agents" yaml:"agents"`
	Steps        []FlowExportStep                  `json:"steps" yaml:"steps"`
	StartStep    string                            `json:"start_step" yaml:"start_step"`
	Metadata     map[string]interface{}            `json:"metadata,omitempty" yaml:"metadata,omitempty"`
	EdgeMetadata map[string]interface{}            `json:"edge_metadata,omitempty" yaml:"edge_metadata,omitempty"`
}

// FlowExportAgent represents an agent in the export
type FlowExportAgent struct {
	ID             string   `json:"id" yaml:"id"`
	Name           string   `json:"name" yaml:"name"`
	Description    string   `json:"description,omitempty" yaml:"description,omitempty"`
	Color          string   `json:"color" yaml:"color"`
	LLMID          string   `json:"llm_id,omitempty" yaml:"llm_id,omitempty"`
	MCPConnections []string `json:"mcp_connections,omitempty" yaml:"mcp_connections,omitempty"`
}

// FlowExportStep represents a step in the export
type FlowExportStep struct {
	ID             string                 `json:"id" yaml:"id"`
	Name           string                 `json:"name" yaml:"name"`
	AgentID        string                 `json:"agent_id" yaml:"agent_id"`
	Description    string                 `json:"description,omitempty" yaml:"description,omitempty"`
	Type           string                 `json:"type" yaml:"type"`
	Parameters     map[string]interface{} `json:"parameters,omitempty" yaml:"parameters,omitempty"`
	NextSteps      []string               `json:"next_steps" yaml:"next_steps"`
	TimeoutSeconds int                    `json:"timeout_seconds" yaml:"timeout_seconds"`
	RetryCount     int                    `json:"retry_count,omitempty" yaml:"retry_count,omitempty"`
	Condition      string                 `json:"condition,omitempty" yaml:"condition,omitempty"`
	AgentOverrides map[string]interface{} `json:"agent_overrides,omitempty" yaml:"agent_overrides,omitempty"`
}

// NewFlowExportCommand creates the flow export command
func NewFlowExportCommand(cfg *config.Config) *cobra.Command {
	var outputFile string
	var format string

	cmd := &cobra.Command{
		Use:   "export <flow-name>",
		Short: "Export flow to YAML or JSON file",
		Long: `Export a flow definition to a file.

Examples:
  pod flow export dev01                      # Print to stdout as YAML
  pod flow export dev01 --output dev01.yaml  # Save to file
  pod flow export dev01 --format json        # Export as JSON
  pod flow export dev01 --json               # JSON output for LLM`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return exportFlow(cfg, args[0], outputFile, format)
		},
	}

	cmd.Flags().StringVarP(&outputFile, "output", "o", "", "Output file path")
	cmd.Flags().StringVarP(&format, "format", "f", "yaml", "Output format (yaml, json)")

	return cmd
}

func exportFlow(cfg *config.Config, flowName string, outputFile string, format string) error {
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

	// Get full flow data
	flowData, err := apiClient.GetFlowFull(flowName)
	if err != nil {
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.ExitFlowNotFound, "Failed to get flow", err.Error())
			os.Exit(display.ExitFlowNotFound)
		}
		fmt.Printf("❌ Failed to get flow '%s': %v\n", flowName, err)
		return err
	}

	// If JSON output mode, output JSON response
	if jsonOut.IsEnabled() {
		jsonOut.Success(flowData)
		return nil
	}

	// Format output
	var output []byte
	format = strings.ToLower(format)

	if format == "json" {
		output, err = json.MarshalIndent(flowData, "", "  ")
		if err != nil {
			fmt.Printf("❌ Failed to marshal JSON: %v\n", err)
			return err
		}
	} else {
		// Default to YAML
		output, err = yaml.Marshal(flowData)
		if err != nil {
			fmt.Printf("❌ Failed to marshal YAML: %v\n", err)
			return err
		}
	}

	// Output to file or stdout
	if outputFile != "" {
		err = os.WriteFile(outputFile, output, 0644)
		if err != nil {
			fmt.Printf("❌ Failed to write file: %v\n", err)
			return err
		}
		fmt.Printf("✅ Flow '%s' exported to %s\n", flowName, outputFile)
	} else {
		fmt.Println(string(output))
	}

	return nil
}
