package main

import (
	"fmt"
	"os"

	"pods-cli/commands"
	"pods-cli/config"

	"github.com/spf13/cobra"
)

var (
	version = "1.0.0"
	commit  = "dev"
)

func main() {
	// Initialize configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("❌ Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Create root command
	rootCmd := &cobra.Command{
		Use:   "pod",
		Short: "HNL Pods CLI - Execute and monitor agent flows",
		Long: `HNL Pods CLI - Execute and monitor agent flows with real-time streaming

Execute flows with colored, real-time output and predictive agent summaries.

Basic Commands:
  pod login                       Authenticate with the API
  pod run <flow> [key value ...]  Execute a flow with variables
  pod list                        List available flows
  pod help [flow]                 Show help (general or flow-specific)
  pod config                      Manage configuration
  pod logout                      Clear stored authentication

Chat & AI:
  pod chat                        Interactive chat with an agent
  pod ask <question>              Quick one-off question to an agent

Management:
  pod llm list                    List configured LLMs
  pod llm providers               Show available LLM providers
  pod agent list                  List configured agents
  pod agent set-llm <agent> <llm> Assign LLM to agent

Examples:
  pod login
  pod run dev01 issue "#123" task "Fix OAuth bug"
  pod chat --name JAX
  pod ask "How do I fix this bug?" --name BUGZ
  pod help dev01
  pod config set api http://localhost:8000`,
		Version: version,
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			// Set up logging based on verbosity
			if cfg.Verbose {
				// Debug level logging removed
			} else {
				// Info level logging removed
			}
		},
	}

	// Add global flags
	rootCmd.PersistentFlags().BoolVarP(&cfg.Verbose, "verbose", "v", false, "Enable verbose output")
	rootCmd.PersistentFlags().StringVar(&cfg.APIEndpoint, "api", cfg.APIEndpoint, "API endpoint URL")
	rootCmd.PersistentFlags().StringVar(&cfg.Token, "token", cfg.Token, "Authentication token")
	rootCmd.PersistentFlags().BoolVar(&cfg.JSONOutput, "json", false, "Output in JSON format (for LLM/script usage)")
	rootCmd.PersistentFlags().BoolVar(&cfg.NoColor, "no-color", false, "Disable colored output")

	// Add subcommands
	rootCmd.AddCommand(commands.NewExecuteCommand(cfg))     // pod run
	rootCmd.AddCommand(commands.NewGeneralHelpCommand(cfg)) // pod help
	rootCmd.AddCommand(commands.NewConfigCommand(cfg))      // pod config
	rootCmd.AddCommand(commands.NewListCommand(cfg))        // pod list
	rootCmd.AddCommand(commands.NewLoginCommand(cfg))       // pod login
	rootCmd.AddCommand(commands.NewLogoutCommand(cfg))      // pod logout
	rootCmd.AddCommand(commands.NewFlowHelpCommand(cfg))    // legacy: pod flow-help
	rootCmd.AddCommand(commands.NewFlowCommand(cfg))        // pod flow (manage flows)
	rootCmd.AddCommand(commands.NewChatCommand(cfg))        // pod chat
	rootCmd.AddCommand(commands.NewAskCommand(cfg))         // pod ask
	rootCmd.AddCommand(commands.NewLLMCommand(cfg))         // pod llm
	rootCmd.AddCommand(commands.NewAgentCommand(cfg))       // pod agent

	// Execute
	if err := rootCmd.Execute(); err != nil {
		fmt.Printf("❌ Command execution failed: %v\n", err)
		os.Exit(1)
	}
}

// init sets up the root command with version info
func init() {
	// Custom version template
	cobra.MousetrapHelpText = ""

	// Logging configuration removed - using CharmLogger
}
