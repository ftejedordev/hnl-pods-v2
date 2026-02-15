package commands

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"pods-cli/client"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/spf13/cobra"
)

// ExecutionCompleteError is a special error type to signal successful completion
type ExecutionCompleteError struct{}

func (e ExecutionCompleteError) Error() string {
	return "execution_complete"
}

// NewExecuteCommand creates the execute command
func NewExecuteCommand(cfg *config.Config) *cobra.Command {
	var timeout int
	var noStream bool
	var fullscreen bool
	var jsonStream bool

	cmd := &cobra.Command{
		Use:   "run <flow> [key value ...]",
		Short: "Execute a flow with variables",
		Long: `Execute a flow by name with key-value variables.

Examples:
  pod run myflow key1 value1 key2 value2
  pod run myflow --timeout 600 key1 value1
  pod run myflow --no-stream key1 value1
  pod run myflow --fullscreen key1 value1
  pod run myflow --json key1 value1             # JSON output
  pod run myflow --json-stream key1 value1      # JSON lines streaming`,
		Args:    cobra.MinimumNArgs(1),
		Aliases: []string{"execute", "exec"},
		RunE: func(cmd *cobra.Command, args []string) error {
			flowName := args[0]
			variables := args[1:]
			return executeFlow(cfg, flowName, variables, timeout, noStream, fullscreen, jsonStream)
		},
	}

	// Flags
	cmd.Flags().IntVarP(&timeout, "timeout", "t", cfg.DefaultTimeout, "Execution timeout in seconds")
	cmd.Flags().BoolVar(&noStream, "no-stream", false, "Execute without real-time streaming")
	cmd.Flags().BoolVar(&fullscreen, "fullscreen", false, "Enable fullscreen mode (default is simple terminal output)")
	cmd.Flags().BoolVar(&jsonStream, "json-stream", false, "Output events as JSON lines (for LLM/scripts)")

	return cmd
}

// executeFlow handles the flow execution logic
func executeFlow(cfg *config.Config, flowName string, args []string, timeout int, noStream bool, useFullscreen bool, jsonStream bool) error {
	jsonOut := display.NewJSONOutput(cfg.JSONOutput || jsonStream)

	// Parse key-value arguments
	variables, err := parseKeyValueArgs(args)
	if err != nil {
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.ExitMissingVariables, "Failed to parse arguments", err.Error())
			os.Exit(display.ExitMissingVariables)
		}
		return fmt.Errorf("failed to parse arguments: %w", err)
	}

	// Initialize clients
	if cfg.Verbose && !jsonOut.IsEnabled() {
		fmt.Printf("🔧 Initializing API and SSE clients...\n")
	}
	apiClient := client.NewAPIClient(cfg)
	sseClient := client.NewSSEClient(cfg)

	// Test API connection
	if cfg.Verbose && !jsonOut.IsEnabled() {
		fmt.Printf("🌐 Testing API connection to %s...\n", cfg.APIEndpoint)
	}
	if err := apiClient.TestConnection(); err != nil {
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.ExitConnectionError, "Failed to connect to API", err.Error())
			os.Exit(display.ExitConnectionError)
		}
		fmt.Printf("❌ Failed to connect to API: %v\n", err)
		return err
	}
	if cfg.Verbose && !jsonOut.IsEnabled() {
		fmt.Printf("✅ API connection successful\n")
	}

	// Start flow execution
	if cfg.Verbose && !jsonOut.IsEnabled() {
		fmt.Printf("🚀 Starting flow execution: %s\n", flowName)
		fmt.Printf("📝 Variables: %v\n", variables)
	}
	execution, err := apiClient.ExecuteFlow(flowName, variables)
	if err != nil {
		if jsonOut.IsEnabled() {
			jsonOut.Error(display.GetExitCodeForError(err.Error()), "Failed to start flow execution", err.Error())
			os.Exit(display.GetExitCodeForError(err.Error()))
		}
		fmt.Printf("❌ Failed to start flow execution: %v\n", err)
		return err
	}
	if cfg.Verbose && !jsonOut.IsEnabled() {
		fmt.Printf("✅ Flow execution started with ID: %s\n", execution.ExecutionID)
	}

	// JSON output mode (non-streaming - wait for completion)
	if cfg.JSONOutput && !jsonStream {
		return handleJSONExecution(cfg, apiClient, flowName, execution.ExecutionID, timeout)
	}

	// JSON streaming mode
	if jsonStream {
		return handleJSONStreamingExecution(cfg, sseClient, flowName, variables, execution.ExecutionID, timeout)
	}

	// Handle streaming vs non-streaming execution
	if noStream {
		if cfg.Verbose {
			fmt.Printf("📊 Using non-streaming (polling) mode\n")
		}
		return handleNonStreamingExecution(cfg, apiClient, execution.ExecutionID, timeout)
	} else {
		if useFullscreen {
			if cfg.Verbose {
				fmt.Printf("🖥️ Using fullscreen streaming mode\n")
			}
			return handleFullscreenStreamingExecution(cfg, sseClient, apiClient, flowName, variables, execution.ExecutionID, timeout)
		} else {
			if cfg.Verbose {
				fmt.Printf("📡 Using simple terminal streaming mode with spinner\n")
			}
			return handleStreamingExecution(cfg, sseClient, flowName, variables, execution.ExecutionID, timeout)
		}
	}
}

// handleStreamingExecution handles real-time streaming execution using simple real-time pattern
func handleStreamingExecution(cfg *config.Config, sseClient *client.SSEClient, flowName string, variables map[string]interface{}, executionID string, timeout int) error {
	// Create simple real-time streaming logger
	logger := display.NewSimpleRealTimeLogger(cfg, sseClient, flowName, variables, executionID, timeout)

	// Start streaming execution
	return logger.Start()
}

// handleFullscreenStreamingExecution handles real-time streaming execution using fullscreen UI
func handleFullscreenStreamingExecution(cfg *config.Config, sseClient *client.SSEClient, apiClient *client.APIClient, flowName string, variables map[string]interface{}, executionID string, timeout int) error {
	// Create fullscreen simple streaming logger
	logger := display.NewFullscreenRealTimeLogger(cfg, sseClient, apiClient, flowName, variables, executionID, timeout)

	// Start streaming execution
	return logger.Start()
}

// handleNonStreamingExecution handles polling-based execution monitoring
func handleNonStreamingExecution(cfg *config.Config, apiClient *client.APIClient, executionID string, timeout int) error {
	startTime := time.Now()
	timeoutDuration := time.Duration(timeout) * time.Second
	pollInterval := 2 * time.Second

	fmt.Printf("📊 Monitoring execution (polling mode)\n")

	for {
		// Check timeout
		if time.Since(startTime) > timeoutDuration {
			fmt.Printf("⚠️ Execution monitoring timed out\n")
			return fmt.Errorf("monitoring timeout after %d seconds", timeout)
		}

		// Get execution summary
		summary, err := apiClient.GetExecutionSummary(executionID)
		if err != nil {
			fmt.Printf("❌ Failed to get execution summary: %v\n", err)
			time.Sleep(pollInterval)
			continue
		}

		// Log progress
		progressMsg := fmt.Sprintf("Progress: %d/%d steps",
			summary.Progress.CompletedSteps,
			summary.Progress.TotalSteps)

		fmt.Printf("%s\n", progressMsg)

		if summary.SummaryText != "" {
			fmt.Printf("%s\n", summary.SummaryText)
		}

		// Check if complete
		switch summary.Status {
		case "completed":
			fmt.Printf("✅ Flow execution completed successfully\n")
			if summary.NextAction != "" {
				fmt.Printf("💡 %s\n", summary.NextAction)
			}
			return nil

		case "failed":
			fmt.Printf("❌ Flow execution failed\n")
			if summary.NextAction != "" {
				fmt.Printf("💡 %s\n", summary.NextAction)
			}
			return fmt.Errorf("flow execution failed")

		case "cancelled":
			fmt.Printf("⚠️ Flow execution was cancelled\n")
			return fmt.Errorf("flow execution cancelled")

		case "running":
			// Continue polling
			time.Sleep(pollInterval)

		default:
			// Unknown status, continue polling
			time.Sleep(pollInterval)
		}
	}
}

// handleJSONExecution handles execution with JSON output (polling mode)
func handleJSONExecution(cfg *config.Config, apiClient *client.APIClient, flowName string, executionID string, timeout int) error {
	jsonOut := display.NewJSONOutput(true)
	startTime := time.Now()
	timeoutDuration := time.Duration(timeout) * time.Second
	pollInterval := 2 * time.Second

	for {
		// Check timeout
		if time.Since(startTime) > timeoutDuration {
			jsonOut.Error(display.ExitTimeout, "Execution timeout", fmt.Sprintf("Timeout after %d seconds", timeout))
			os.Exit(display.ExitTimeout)
			return fmt.Errorf("timeout after %d seconds", timeout)
		}

		// Get execution summary
		summary, err := apiClient.GetExecutionSummary(executionID)
		if err != nil {
			time.Sleep(pollInterval)
			continue
		}

		// Check if complete
		switch summary.Status {
		case "completed":
			jsonOut.Success(display.ExecutionData{
				ExecutionID: executionID,
				FlowName:    flowName,
				Status:      "completed",
				StartedAt:   startTime.Format(time.RFC3339),
				CompletedAt: time.Now().Format(time.RFC3339),
				Result:      summary.SummaryText,
			})
			return nil

		case "failed":
			jsonOut.Error(display.ExitGeneralError, "Execution failed", summary.SummaryText)
			os.Exit(display.ExitGeneralError)
			return fmt.Errorf("execution failed")

		case "cancelled":
			jsonOut.Error(display.ExitCancelled, "Execution cancelled", "Flow execution was cancelled")
			os.Exit(display.ExitCancelled)
			return fmt.Errorf("execution cancelled")

		default:
			time.Sleep(pollInterval)
		}
	}
}

// handleJSONStreamingExecution handles execution with JSON lines streaming output
func handleJSONStreamingExecution(cfg *config.Config, sseClient *client.SSEClient, flowName string, variables map[string]interface{}, executionID string, timeout int) error {
	jsonOut := display.NewJSONOutput(true)

	// Print initial event
	jsonOut.PrintEvent(display.ExecutionEvent{
		Type:      "started",
		Message:   fmt.Sprintf("Started execution of flow '%s'", flowName),
		Timestamp: time.Now().Format(time.RFC3339),
	})

	// Create JSON streaming logger
	logger := display.NewJSONStreamLogger(cfg, sseClient, flowName, variables, executionID, timeout)

	// Start streaming
	return logger.Start()
}

// parseKeyValueArgs parses command line arguments into key-value pairs
func parseKeyValueArgs(args []string) (map[string]interface{}, error) {
	if len(args)%2 != 0 {
		return nil, fmt.Errorf("arguments must be provided in key-value pairs")
	}

	variables := make(map[string]interface{})

	for i := 0; i < len(args); i += 2 {
		key := args[i]
		value := args[i+1]

		// Try to parse as different types
		if parsedValue := parseValue(value); parsedValue != nil {
			variables[key] = parsedValue
		} else {
			variables[key] = value // Fallback to string
		}
	}

	return variables, nil
}

// parseValue attempts to parse a value as different types
func parseValue(value string) interface{} {
	// Try boolean
	if value == "true" {
		return true
	}
	if value == "false" {
		return false
	}

	// Try integer
	if intVal, err := strconv.Atoi(value); err == nil {
		return intVal
	}

	// Try float
	if floatVal, err := strconv.ParseFloat(value, 64); err == nil {
		return floatVal
	}

	// Try to detect JSON-like structures
	if strings.HasPrefix(value, "{") || strings.HasPrefix(value, "[") {
		// For now, return as string - could add JSON parsing later
		return value
	}

	// Return as string
	return value
}
