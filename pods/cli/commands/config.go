package commands

import (
	"fmt"
	"strings"

	"pods-cli/commands/interactive"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

// NewConfigCommand creates the config management command
func NewConfigCommand(cfg *config.Config) *cobra.Command {
	var nonInteractive bool

	cmd := &cobra.Command{
		Use:   "config",
		Short: "Manage CLI configuration",
		Long: `Manage CLI configuration settings including API endpoint, authentication, and preferences.

Examples:
  pod config                           # Interactive configuration manager
  pod config --no-interactive         # Show current configuration (non-interactive)
  pod config set api http://localhost:8000  # Set API endpoint
  pod config set token mytoken         # Set authentication token
  pod config set openrouter-key mykey  # Set OpenRouter API key`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if nonInteractive {
				return showConfig(cfg)
			}
			return runFullscreenConfig(cfg)
		},
	}

	// Add flag for non-interactive mode
	cmd.Flags().BoolVar(&nonInteractive, "no-interactive", false, "Use non-interactive mode")

	// Subcommands
	cmd.AddCommand(newConfigShowCommand(cfg))
	cmd.AddCommand(newConfigSetCommand(cfg))
	cmd.AddCommand(newConfigResetCommand(cfg))

	return cmd
}

// runInteractiveConfig runs the interactive config interface
func runInteractiveConfig(cfg *config.Config) error {
	return interactive.RunInteractiveConfig(cfg)
}

// runFullscreenConfig runs the config in fullscreen mode
func runFullscreenConfig(cfg *config.Config) error {
	return interactive.RunInteractiveConfig(cfg)
}

// newConfigShowCommand creates the config show subcommand
func newConfigShowCommand(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "show",
		Short: "Show current configuration",
		RunE: func(cmd *cobra.Command, args []string) error {
			return showConfig(cfg)
		},
	}
}

// newConfigSetCommand creates the config set subcommand
func newConfigSetCommand(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "set <key> <value>",
		Short: "Set a configuration value",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			return setConfigValue(cfg, args[0], args[1])
		},
	}
}

// newConfigResetCommand creates the config reset subcommand
func newConfigResetCommand(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "reset",
		Short: "Reset configuration to defaults",
		RunE: func(cmd *cobra.Command, args []string) error {
			return resetConfig(cfg)
		},
	}
}

// buildConfigContent builds the configuration display content
func buildConfigContent(cfg *config.Config) string {
	var content strings.Builder

	// API Settings
	content.WriteString("🌐 API Settings\n")
	content.WriteString(fmt.Sprintf("  Endpoint: %s\n", cfg.APIEndpoint))

	// Show token status (masked)
	tokenStatus := "not set"
	if cfg.Token != "" {
		tokenStatus = "set (hidden)"
	}
	content.WriteString(fmt.Sprintf("  Token: %s\n\n", tokenStatus))

	// OpenRouter Settings
	content.WriteString("🤖 OpenRouter Settings\n")
	openrouterStatus := "not set"
	if cfg.OpenRouterKey != "" {
		openrouterStatus = "set (hidden)"
	}
	content.WriteString(fmt.Sprintf("  API Key: %s\n\n", openrouterStatus))

	// General Settings
	content.WriteString("🔧 General Settings\n")
	content.WriteString(fmt.Sprintf("  Verbose: %t\n", cfg.Verbose))
	content.WriteString(fmt.Sprintf("  Default Timeout: %d seconds\n\n", cfg.DefaultTimeout))

	// Color Scheme
	content.WriteString("🎨 Color Scheme\n")
	for colorName, colorValue := range cfg.ColorScheme {
		content.WriteString(fmt.Sprintf("  %s: %s\n", colorName, colorValue))
	}

	// Configuration file location
	configPath, err := config.ConfigPath()
	if err == nil {
		content.WriteString("\n📄 Configuration File\n")
		content.WriteString(fmt.Sprintf("  %s\n", configPath))
	}

	// Usage hints
	content.WriteString("\n💡 Configuration Commands\n")
	content.WriteString("  pod config set api <endpoint>     # Set API endpoint\n")
	content.WriteString("  pod config set token <token>       # Set auth token\n")
	content.WriteString("  pod config set openrouter-key <key> # Set OpenRouter key\n")
	content.WriteString("  pod config reset                   # Reset to defaults\n")

	return content.String()
}

// showConfig displays the current configuration
func showConfig(cfg *config.Config) error {
	_ = display.NewLogger(cfg) // Keep for potential future use

	// Styles
	headerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(cfg.GetSystemColor("info"))).
		Bold(true).
		Underline(true)

	keyStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#F59E0B")). // Amber
		Bold(true)

	valueStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#6B7280")) // Gray

	secretStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#6B7280")). // Gray
		Italic(true)

	// Header
	fmt.Printf("\n%s\n\n", headerStyle.Render("⚙️  CLI Configuration"))

	// API Settings
	fmt.Printf("%s\n", keyStyle.Render("🌐 API Settings"))
	fmt.Printf("  %s %s\n",
		keyStyle.Render("Endpoint:"),
		valueStyle.Render(cfg.APIEndpoint))

	// Show token status (masked)
	tokenStatus := "not set"
	if cfg.Token != "" {
		tokenStatus = secretStyle.Render("set (hidden)")
	}
	fmt.Printf("  %s %s\n",
		keyStyle.Render("Token:"),
		tokenStatus)

	// OpenRouter Settings
	fmt.Printf("\n%s\n", keyStyle.Render("🤖 OpenRouter Settings"))
	openrouterStatus := "not set"
	if cfg.OpenRouterKey != "" {
		openrouterStatus = secretStyle.Render("set (hidden)")
	}
	fmt.Printf("  %s %s\n",
		keyStyle.Render("API Key:"),
		openrouterStatus)

	// General Settings
	fmt.Printf("\n%s\n", keyStyle.Render("🔧 General Settings"))
	fmt.Printf("  %s %v\n",
		keyStyle.Render("Verbose:"),
		valueStyle.Render(fmt.Sprintf("%t", cfg.Verbose)))
	fmt.Printf("  %s %s\n",
		keyStyle.Render("Default Timeout:"),
		valueStyle.Render(fmt.Sprintf("%d seconds", cfg.DefaultTimeout)))

	// Color Scheme
	fmt.Printf("\n%s\n", keyStyle.Render("🎨 Color Scheme"))
	for colorName, colorValue := range cfg.ColorScheme {
		colorStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color(colorValue)).
			Bold(true)

		fmt.Printf("  %s %s %s\n",
			keyStyle.Render(fmt.Sprintf("%s:", colorName)),
			colorStyle.Render("●"),
			valueStyle.Render(colorValue))
	}

	// Configuration file location
	configPath, err := config.ConfigPath()
	if err == nil {
		fmt.Printf("\n%s\n", keyStyle.Render("📄 Configuration File"))
		fmt.Printf("  %s\n", valueStyle.Render(configPath))
	}

	// Usage hints
	fmt.Printf("\n%s\n", keyStyle.Render("💡 Configuration Commands"))
	fmt.Printf("  %s\n", valueStyle.Render("pod config set api <endpoint>     # Set API endpoint"))
	fmt.Printf("  %s\n", valueStyle.Render("pod config set token <token>       # Set auth token"))
	fmt.Printf("  %s\n", valueStyle.Render("pod config set openrouter-key <key> # Set OpenRouter key"))
	fmt.Printf("  %s\n", valueStyle.Render("pod config reset                   # Reset to defaults"))

	fmt.Println() // Add final spacing
	return nil
}

// setConfigValue sets a configuration value
func setConfigValue(cfg *config.Config, key, value string) error {
	logger := display.NewLogger(cfg)

	switch key {
	case "api", "endpoint":
		cfg.APIEndpoint = value
		logger.LogSuccess(fmt.Sprintf("API endpoint set to: %s", value))

	case "token":
		cfg.Token = value
		logger.LogSuccess("Authentication token has been set")

	case "openrouter-key", "openrouter":
		cfg.OpenRouterKey = value
		logger.LogSuccess("OpenRouter API key has been set")

	case "timeout":
		// Parse timeout value
		var timeout int
		if _, err := fmt.Sscanf(value, "%d", &timeout); err != nil {
			logger.LogError("Invalid timeout value", err)
			return fmt.Errorf("timeout must be a number")
		}
		if timeout < 1 || timeout > 3600 {
			return fmt.Errorf("timeout must be between 1 and 3600 seconds")
		}
		cfg.DefaultTimeout = timeout
		logger.LogSuccess(fmt.Sprintf("Default timeout set to: %d seconds", timeout))

	case "verbose":
		switch value {
		case "true", "1", "yes", "on":
			cfg.Verbose = true
			logger.LogSuccess("Verbose mode enabled")
		case "false", "0", "no", "off":
			cfg.Verbose = false
			logger.LogSuccess("Verbose mode disabled")
		default:
			return fmt.Errorf("verbose must be true or false")
		}

	default:
		// Check if it's a color scheme setting
		if colorName := strings.TrimPrefix(key, "color-"); colorName != key {
			if cfg.ColorScheme == nil {
				cfg.ColorScheme = make(map[string]string)
			}
			cfg.ColorScheme[colorName] = value
			logger.LogSuccess(fmt.Sprintf("Color '%s' set to: %s", colorName, value))
		} else {
			return fmt.Errorf("unknown configuration key: %s", key)
		}
	}

	// Save configuration
	if err := cfg.Save(); err != nil {
		logger.LogError("Failed to save configuration", err)
		return err
	}

	return nil
}

// resetConfig resets configuration to defaults
func resetConfig(cfg *config.Config) error {
	logger := display.NewLogger(cfg)

	// Get default config
	defaultCfg := config.DefaultConfig()

	// Reset all values
	cfg.APIEndpoint = defaultCfg.APIEndpoint
	cfg.Token = ""
	cfg.OpenRouterKey = ""
	cfg.Verbose = defaultCfg.Verbose
	cfg.DefaultTimeout = defaultCfg.DefaultTimeout
	cfg.ColorScheme = defaultCfg.ColorScheme

	// Save configuration
	if err := cfg.Save(); err != nil {
		logger.LogError("Failed to save configuration", err)
		return err
	}

	logger.LogSuccess("Configuration reset to defaults")
	return nil
}
