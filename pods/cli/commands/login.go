package commands

import (
	"fmt"
	"strings"
	"syscall"

	"pods-cli/client"
	"pods-cli/commands/interactive"
	"pods-cli/config"
	"pods-cli/display"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

// NewLoginCommand creates the login command
func NewLoginCommand(cfg *config.Config) *cobra.Command {
	var username string
	var promptPassword bool
	var nonInteractive bool

	cmd := &cobra.Command{
		Use:   "login",
		Short: "Authenticate with the HNL Pods API",
		Long: `Authenticate with the HNL Pods API and store the JWT token for future use.

Examples:
  pod login                      # Interactive login interface
  pod login -u myuser            # Interactive with pre-filled username
  pod login -u myuser -p --no-interactive  # Non-interactive login`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if nonInteractive {
				return performLogin(cfg, username, promptPassword)
			}
			return runFullscreenLogin(cfg, username)
		},
	}

	// Flags
	cmd.Flags().StringVarP(&username, "username", "u", "", "Username for authentication")
	cmd.Flags().BoolVarP(&promptPassword, "password", "p", false, "Prompt for password (non-interactive mode)")
	cmd.Flags().BoolVar(&nonInteractive, "no-interactive", false, "Use non-interactive mode")

	return cmd
}

// runInteractiveLogin runs the interactive login interface
func runInteractiveLogin(cfg *config.Config, username string) error {
	return interactive.RunInteractiveLogin(cfg)
}

// runFullscreenLogin runs login in fullscreen mode
func runFullscreenLogin(cfg *config.Config, username string) error {
	return interactive.RunInteractiveLogin(cfg)
}

// performLogin handles the login process
func performLogin(cfg *config.Config, username string, promptPassword bool) error {
	logger := display.NewLogger(cfg)

	// Styling
	promptStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(cfg.GetSystemColor("info"))).
		Bold(true)

	// Get username if not provided
	if username == "" {
		fmt.Print(promptStyle.Render("Username: "))
		if _, err := fmt.Scanln(&username); err != nil {
			return fmt.Errorf("failed to read username: %w", err)
		}
		username = strings.TrimSpace(username)
	}

	if username == "" {
		return fmt.Errorf("username cannot be empty")
	}

	// Get password securely
	fmt.Print(promptStyle.Render("Password: "))
	passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
	if err != nil {
		return fmt.Errorf("failed to read password: %w", err)
	}
	fmt.Println() // Add newline after hidden password input

	password := strings.TrimSpace(string(passwordBytes))
	if password == "" {
		return fmt.Errorf("password cannot be empty")
	}

	// Initialize API client
	apiClient := client.NewAPIClient(cfg)

	logger.LogInfo("🔐 Authenticating...")

	// Attempt login
	loginResp, err := apiClient.Login(username, password)
	if err != nil {
		if strings.Contains(err.Error(), "401") {
			logger.LogError("Authentication failed", fmt.Errorf("incorrect username or password"))
		} else {
			logger.LogError("Login failed", err)
		}
		return err
	}

	// Store token in configuration
	if err := cfg.SaveToken(loginResp.AccessToken); err != nil {
		logger.LogWarning("Authentication successful, but failed to save token to config file")
		logger.LogWarning(fmt.Sprintf("Please manually set token: pod config set token %s", loginResp.AccessToken))
		return nil
	}

	logger.LogSuccess(fmt.Sprintf("Successfully authenticated as %s", username))
	logger.LogInfo("JWT token saved to configuration")

	// Test the new token
	apiClient = client.NewAPIClient(cfg) // Recreate with new token
	if err := apiClient.TestConnection(); err != nil {
		logger.LogWarning("Token saved but API connection test failed")
		return nil
	}

	logger.LogInfo("✅ API connection verified")
	return nil
}

// NewLogoutCommand creates the logout command
func NewLogoutCommand(cfg *config.Config) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "logout",
		Short: "Clear stored authentication token",
		Long:  `Clear the stored JWT token from the configuration.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return performLogout(cfg)
		},
	}

	return cmd
}

// performLogout handles the logout process
func performLogout(cfg *config.Config) error {
	logger := display.NewLogger(cfg)

	if !cfg.HasValidToken() {
		logger.LogInfo("No authentication token stored")
		return nil
	}

	// Clear token
	if err := cfg.ClearToken(); err != nil {
		logger.LogError("Failed to save configuration", err)
		return err
	}

	logger.LogSuccess("Successfully logged out")
	logger.LogInfo("Authentication token cleared from configuration")
	return nil
}
