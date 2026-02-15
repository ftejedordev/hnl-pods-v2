package commands

import (
	"fmt"
	"os"

	"pods-cli/client"
	"pods-cli/commands/interactive"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

// NewGeneralHelpCommand creates the general help command
func NewGeneralHelpCommand(cfg *config.Config) *cobra.Command {
	var nonInteractive bool

	cmd := &cobra.Command{
		Use:   "help [flow-name]",
		Short: "Show help information",
		Long: `Show general CLI help or detailed help for a specific flow.

Examples:
  pod help                      # Interactive help browser
  pod help myflow               # Interactive flow-specific help
  pod help --no-interactive     # Non-interactive general help
  pod help myflow --json        # JSON output for LLM/scripts`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			// JSON output mode
			if cfg.JSONOutput {
				if len(args) == 1 {
					return showFlowHelpJSON(cfg, args[0])
				}
				return showGeneralHelpJSON(cfg)
			}
			if nonInteractive {
				if len(args) == 1 {
					return showStaticFlowHelp(cfg, args[0])
				}
				return showGeneralHelp(cfg)
			}
			if len(args) == 1 {
				return runFullscreenFlowHelp(cfg, args[0])
			}
			return runFullscreenGeneralHelp(cfg)
		},
	}

	// Add flag for non-interactive mode
	cmd.Flags().BoolVar(&nonInteractive, "no-interactive", false, "Use non-interactive mode")

	return cmd
}

// runInteractiveHelp runs the interactive help interface
func runInteractiveHelp(cfg *config.Config, flowName string) error {
	return interactive.RunInteractiveHelp(cfg, flowName)
}

// runFullscreenGeneralHelp runs general help in fullscreen mode
func runFullscreenGeneralHelp(cfg *config.Config) error {
	return interactive.RunInteractiveHelp(cfg, "")
}

// runFullscreenFlowHelp runs flow help in fullscreen mode
func runFullscreenFlowHelp(cfg *config.Config, flowName string) error {
	return interactive.RunInteractiveHelp(cfg, flowName)
}

// buildGeneralHelpContent builds the general help content
func buildGeneralHelpContent() string {
	return `🚀 HNL Pods CLI

Execute and monitor agent flows with real-time streaming output.

📋 Main Commands

• pod run <flow> [key value ...] - Execute a flow with variables
• pod list - List available flows
• pod help [flow] - Show general help or flow-specific help
• pod config - Manage CLI configuration
• pod login - Authenticate with the API

🏃 Quick Start

1. Configure the CLI:
   pod config set api http://localhost:8000
   pod config set token your-jwt-token

2. List available flows:
   pod list

3. Get help for a specific flow:
   pod help myflow

4. Execute a flow:
   pod run myflow key1 value1 key2 value2

⚙️ Configuration

Required Settings:
• api: API server endpoint
• token: JWT authentication token

Optional Settings:
• openrouter-key: For enhanced predictive summaries
• timeout: Default execution timeout (300 seconds)
• verbose: Enable detailed logging

💡 Examples

Execute OAuth implementation flow:
pod run dev01 issue "#121" task "Implementa autenticación con OAuth"

Execute with custom timeout:
pod run myflow --timeout 600 key value

Execute without streaming:
pod run myflow --no-stream key value

❓ Getting Help

• pod help - General CLI help
• pod help <flow-name> - Flow-specific help
• pod list - List all flows
• pod config show - Show configuration
• pod -v <command> - Enable verbose output`
}

// buildFlowHelpContent builds flow-specific help content
func buildFlowHelpContent(cfg *config.Config, flowName string) string {
	return fmt.Sprintf(`Flow Help: %s

This feature requires API connection to fetch flow details.
Make sure you're authenticated and connected to the API.

Use 'pod login' to authenticate if needed.
For interactive flow help, use: pod help %s`, flowName, flowName)
}

// showGeneralHelp displays general CLI usage information using Glamour
func showGeneralHelp(cfg *config.Config) error {
	// Create markdown content for beautiful rendering
	helpContent := `# 🚀 HNL Pods CLI

Execute and monitor agent flows with real-time streaming output.

## 📋 Main Commands

### pod run <flow> [key value ...]
Execute a flow with variables

**Example:**
` + "```bash" + `
pod run myflow issue "#123" task "Fix bug"
` + "```" + `

### pod list
List available flows

**Example:**
` + "```bash" + `
pod list --all
` + "```" + `

### pod help [flow]
Show general help or flow-specific help

**Example:**
` + "```bash" + `
pod help myflow
` + "```" + `

### pod config
Manage CLI configuration

**Example:**
` + "```bash" + `
pod config set api http://localhost:8000
` + "```" + `

## 🏃 Quick Start

1. **Configure the CLI:**
   ` + "```bash" + `
   pod config set api http://localhost:8000
   pod config set token your-jwt-token
   ` + "```" + `

2. **List available flows:**
   ` + "```bash" + `
   pod list
   ` + "```" + `

3. **Get help for a specific flow:**
   ` + "```bash" + `
   pod help myflow
   ` + "```" + `

4. **Execute a flow:**
   ` + "```bash" + `
   pod run myflow key1 value1 key2 value2
   ` + "```" + `

## ⚙️ Configuration

### Required Settings:
- **api:** API server endpoint (http://localhost:8000)
- **token:** JWT authentication token

### Optional Settings:
- **openrouter-key:** For enhanced predictive summaries  
- **timeout:** Default execution timeout (300 seconds)
- **verbose:** Enable detailed logging (false)

## 🤖 OpenRouter Integration

For better predictive summaries, configure OpenRouter:

` + "```bash" + `
pod config set openrouter-key sk-or-v1-...
` + "```" + `

- Uses GPT-4o Mini (~530ms response time)
- Cost: ~$0.00015 per 1K tokens
- Falls back to templates if not configured

## 📡 Real-time Features

- **Server-Sent Events (SSE) streaming**
- **Agent-specific colored output**
- **Predictive summaries** (what agents will do)
- **Automatic retry** with exponential backoff

## 💡 Examples

### Execute OAuth implementation flow:
` + "```bash" + `
pod run dev01 issue "#121" task "Implementa autenticación con OAuth"
` + "```" + `

### Execute with custom timeout:
` + "```bash" + `
pod run myflow --timeout 600 key value
` + "```" + `

### Execute without streaming:
` + "```bash" + `
pod run myflow --no-stream key value
` + "```" + `

## ❓ Getting Help

- ` + "`pod help`" + ` - General CLI help
- ` + "`pod help <flow-name>`" + ` - Flow-specific help  
- ` + "`pod list`" + ` - List all flows
- ` + "`pod config show`" + ` - Show configuration
- ` + "`pod -v <command>`" + ` - Enable verbose output

---

For more information, visit: [hypernovalabs/hnl-pods](https://github.com/hypernovalabs/hnl-pods)
`

	// Render with Glamour
	renderer, err := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),  // Automatically detect dark/light terminal
		glamour.WithWordWrap(80), // Wrap at 80 characters
	)
	if err != nil {
		// Fallback to plain text if glamour fails
		fmt.Print(helpContent)
		return nil
	}

	out, err := renderer.Render(helpContent)
	if err != nil {
		// Fallback to plain text if rendering fails
		fmt.Print(helpContent)
		return nil
	}

	fmt.Print(out)
	return nil
}

// showStaticFlowHelp shows help for a specific flow (non-interactive fallback)
func showStaticFlowHelp(cfg *config.Config, flowName string) error {
	// Styles
	headerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(cfg.GetSystemColor("info"))).
		Bold(true).
		Underline(true)

	descStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#6B7280")) // Gray

	// Header
	fmt.Printf("\n%s\n\n", headerStyle.Render(fmt.Sprintf("📋 Flow Help: %s", flowName)))
	fmt.Printf("%s\n", descStyle.Render("This feature requires API connection to fetch flow details."))
	fmt.Printf("%s\n", descStyle.Render("Make sure you're authenticated and connected to the API."))
	fmt.Printf("%s\n\n", descStyle.Render("Use 'pod login' to authenticate if needed."))
	fmt.Printf("%s\n", descStyle.Render("For interactive flow help, use: pod help "+flowName))

	fmt.Println() // Add final spacing
	return nil
}

// showGeneralHelpJSON outputs general CLI help in JSON format
func showGeneralHelpJSON(cfg *config.Config) error {
	jsonOut := display.NewJSONOutput(true)

	// General CLI info
	helpData := map[string]interface{}{
		"cli_name":    "pod",
		"description": "HNL Pods CLI - Execute and monitor agent flows with real-time streaming",
		"version":     "1.0.0",
		"commands": []map[string]string{
			{"name": "run", "usage": "pod run <flow> [key value ...]", "description": "Execute a flow with variables"},
			{"name": "list", "usage": "pod list [--all] [--inactive]", "description": "List available flows"},
			{"name": "help", "usage": "pod help [flow-name]", "description": "Show help information"},
			{"name": "config", "usage": "pod config <subcommand>", "description": "Manage CLI configuration"},
			{"name": "login", "usage": "pod login", "description": "Authenticate with the API"},
			{"name": "logout", "usage": "pod logout", "description": "Clear stored authentication"},
		},
		"global_flags": []map[string]string{
			{"name": "--json", "description": "Output in JSON format for LLM/script usage"},
			{"name": "--no-color", "description": "Disable colored output"},
			{"name": "--verbose, -v", "description": "Enable verbose output"},
			{"name": "--api", "description": "Override API endpoint URL"},
			{"name": "--token", "description": "Override authentication token"},
		},
		"examples": []string{
			"pod list --json",
			"pod help myflow --json",
			"pod run dev01 issue \"#123\" task \"Fix bug\"",
		},
	}

	jsonOut.Success(helpData)
	return nil
}

// showFlowHelpJSON outputs flow help in JSON format
func showFlowHelpJSON(cfg *config.Config, flowName string) error {
	jsonOut := display.NewJSONOutput(true)

	// Initialize API client
	apiClient := client.NewAPIClient(cfg)

	// Test API connection
	if err := apiClient.TestConnection(); err != nil {
		jsonOut.Error(display.ExitConnectionError, "Failed to connect to API", err.Error())
		os.Exit(display.ExitConnectionError)
		return err
	}

	// Get flow help information
	flowHelp, err := apiClient.GetFlowHelp(flowName)
	if err != nil {
		jsonOut.Error(display.ExitFlowNotFound, "Failed to get flow help", err.Error())
		os.Exit(display.ExitFlowNotFound)
		return err
	}

	// Build variables info
	variables := make([]display.VariableInfo, 0)
	for name, defaultValue := range flowHelp.Variables {
		variables = append(variables, display.VariableInfo{
			Name:     name,
			Required: defaultValue == nil,
		})
	}

	// Build agents info
	agents := make([]display.AgentInfo, 0)
	for _, agent := range flowHelp.Agents {
		agents = append(agents, display.AgentInfo{
			Name:  agent.Name,
			Color: agent.Color,
		})
	}

	// Build steps info
	steps := make([]display.StepInfo, 0)
	for _, step := range flowHelp.Steps {
		steps = append(steps, display.StepInfo{
			Name:  step.Name,
			Agent: step.Agent,
		})
	}

	// Output JSON
	helpData := display.FlowHelpData{
		Name:        flowHelp.Name,
		Description: flowHelp.Description,
		IsActive:    true, // Assume active if we got here
		Variables:   variables,
		Agents:      agents,
		Steps:       steps,
	}

	jsonOut.Success(helpData)
	return nil
}
