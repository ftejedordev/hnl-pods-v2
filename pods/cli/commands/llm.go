package commands

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

// Styles for LLM output
var (
	llmHeaderStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("39"))

	llmNameStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("255"))

	llmProviderStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("214"))

	llmStatusActiveStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("46"))

	llmStatusInactiveStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("245"))

	llmStatusErrorStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("196"))

	llmStatusTestingStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("226"))

	llmDefaultStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("226")).
			Bold(true)

	llmDimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("245"))

	llmSuccessStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("46"))

	llmErrorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("196"))
)

// NewLLMCommand creates the llm command group
func NewLLMCommand(cfg *config.Config) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "llm",
		Short: "Manage LLM configurations",
		Long: `Manage LLM (Large Language Model) configurations.

Commands:
  pod llm list        List all configured LLMs
  pod llm providers   List supported LLM providers
  pod llm test <id>   Test connectivity to an LLM
  pod llm create      Create a new LLM configuration (interactive)
  pod llm delete <id> Delete an LLM configuration

Examples:
  pod llm list
  pod llm providers
  pod llm test 507f1f77bcf86cd799439011`,
		Aliases: []string{"llms"},
	}

	// Add subcommands
	cmd.AddCommand(newLLMListCommand(cfg))
	cmd.AddCommand(newLLMProvidersCommand(cfg))
	cmd.AddCommand(newLLMTestCommand(cfg))
	cmd.AddCommand(newLLMDeleteCommand(cfg))
	cmd.AddCommand(newLLMCreateCommand(cfg))

	return cmd
}

// newLLMListCommand creates the llm list command
func newLLMListCommand(cfg *config.Config) *cobra.Command {
	var showJSON bool

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List all configured LLMs",
		Long: `List all LLM configurations for the current user.

Shows: ID, name, provider, status, model, and usage statistics.`,
		Aliases: []string{"ls"},
		RunE: func(cmd *cobra.Command, args []string) error {
			return listLLMs(cfg, showJSON)
		},
	}

	cmd.Flags().BoolVar(&showJSON, "json", false, "Output as JSON")

	return cmd
}

// newLLMProvidersCommand creates the llm providers command
func newLLMProvidersCommand(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "providers",
		Short: "List supported LLM providers",
		Long:  `List all supported LLM providers with their required fields and supported models.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return listProviders(cfg)
		},
	}
}

// newLLMTestCommand creates the llm test command
func newLLMTestCommand(cfg *config.Config) *cobra.Command {
	var testPrompt string

	cmd := &cobra.Command{
		Use:   "test <llm-id>",
		Short: "Test connectivity to an LLM",
		Long: `Test connectivity to an LLM configuration by sending a test prompt.

Examples:
  pod llm test 507f1f77bcf86cd799439011
  pod llm test 507f1f77bcf86cd799439011 --prompt "Say hello"`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return testLLM(cfg, args[0], testPrompt)
		},
	}

	cmd.Flags().StringVarP(&testPrompt, "prompt", "p", "", "Custom test prompt")

	return cmd
}

// newLLMDeleteCommand creates the llm delete command
func newLLMDeleteCommand(cfg *config.Config) *cobra.Command {
	var force bool

	cmd := &cobra.Command{
		Use:   "delete <llm-id>",
		Short: "Delete an LLM configuration",
		Long: `Delete an LLM configuration by ID.

Examples:
  pod llm delete 507f1f77bcf86cd799439011
  pod llm delete 507f1f77bcf86cd799439011 --force`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return deleteLLM(cfg, args[0], force)
		},
	}

	cmd.Flags().BoolVarP(&force, "force", "f", false, "Skip confirmation")

	return cmd
}

// listLLMs lists all LLMs for the current user
func listLLMs(cfg *config.Config, showJSON bool) error {
	llmClient := client.NewLLMClient(cfg)

	result, err := llmClient.ListLLMs()
	if err != nil {
		return fmt.Errorf("failed to list LLMs: %w", err)
	}

	if len(result.LLMs) == 0 {
		fmt.Println(llmDimStyle.Render("No LLMs configured. Use 'pod llm create' to add one."))
		return nil
	}

	// Header
	fmt.Println()
	fmt.Println(llmHeaderStyle.Render("  LLM Configurations"))
	fmt.Println(llmDimStyle.Render("  " + strings.Repeat("─", 60)))
	fmt.Println()

	for _, llm := range result.LLMs {
		// Name and default indicator
		nameStr := llmNameStyle.Render(llm.Name)
		if llm.IsDefault {
			nameStr += " " + llmDefaultStyle.Render("★ default")
		}
		fmt.Printf("  %s\n", nameStr)

		// ID
		fmt.Printf("    %s %s\n", llmDimStyle.Render("ID:"), llm.ID)

		// Provider with icon
		providerIcon := getProviderIcon(string(llm.Provider))
		fmt.Printf("    %s %s %s\n", llmDimStyle.Render("Provider:"), providerIcon, llmProviderStyle.Render(string(llm.Provider)))

		// Model
		model := llm.Config.ModelName
		if model == "" && llm.Provider == client.ProviderClaudeCLI {
			model = llm.Config.ClaudeModel
		}
		if model != "" {
			fmt.Printf("    %s %s\n", llmDimStyle.Render("Model:"), model)
		}

		// Status
		statusStr := formatStatus(llm.Status)
		fmt.Printf("    %s %s\n", llmDimStyle.Render("Status:"), statusStr)

		// Usage stats
		if llm.UsageStats.TotalRequests > 0 {
			fmt.Printf("    %s %d requests, %d tokens\n",
				llmDimStyle.Render("Usage:"),
				llm.UsageStats.TotalRequests,
				llm.UsageStats.TotalTokens)
		}

		// Last tested
		if llm.LastTested != nil {
			fmt.Printf("    %s %s\n", llmDimStyle.Render("Last tested:"), llm.LastTested.Time.Format("2006-01-02 15:04"))
		}

		// Test error if any
		if llm.TestError != "" {
			fmt.Printf("    %s %s\n", llmErrorStyle.Render("Error:"), llm.TestError)
		}

		fmt.Println()
	}

	fmt.Printf("  %s\n\n", llmDimStyle.Render(fmt.Sprintf("Total: %d LLM(s)", result.Total)))

	return nil
}

// listProviders lists all supported LLM providers
func listProviders(cfg *config.Config) error {
	llmClient := client.NewLLMClient(cfg)

	result, err := llmClient.GetProviders()
	if err != nil {
		return fmt.Errorf("failed to get providers: %w", err)
	}

	// Header
	fmt.Println()
	fmt.Println(llmHeaderStyle.Render("  Supported LLM Providers"))
	fmt.Println(llmDimStyle.Render("  " + strings.Repeat("─", 60)))
	fmt.Println()

	for _, provider := range result.Providers {
		// Provider name with icon
		icon := getProviderIcon(string(provider.Provider))
		fmt.Printf("  %s %s\n", icon, llmNameStyle.Render(provider.Name))
		fmt.Printf("    %s\n", llmDimStyle.Render(provider.Description))

		// Required fields
		if len(provider.RequiredFields) > 0 {
			fmt.Printf("    %s %s\n", llmDimStyle.Render("Required:"), strings.Join(provider.RequiredFields, ", "))
		} else {
			fmt.Printf("    %s %s\n", llmDimStyle.Render("Required:"), llmDimStyle.Render("(none)"))
		}

		// Optional fields
		if len(provider.OptionalFields) > 0 {
			fmt.Printf("    %s %s\n", llmDimStyle.Render("Optional:"), strings.Join(provider.OptionalFields, ", "))
		}

		// Supported models
		if len(provider.SupportedModels) > 0 {
			fmt.Printf("    %s %s\n", llmDimStyle.Render("Models:"), strings.Join(provider.SupportedModels, ", "))
		}

		// Documentation URL
		if provider.DocumentationURL != "" {
			fmt.Printf("    %s %s\n", llmDimStyle.Render("Docs:"), provider.DocumentationURL)
		}

		fmt.Println()
	}

	return nil
}

// testLLM tests connectivity to an LLM
func testLLM(cfg *config.Config, llmID string, testPrompt string) error {
	llmClient := client.NewLLMClient(cfg)

	// First get the LLM to show its name
	llm, err := llmClient.GetLLM(llmID)
	if err != nil {
		return fmt.Errorf("failed to get LLM: %w", err)
	}

	fmt.Printf("\n  Testing LLM: %s\n", llmNameStyle.Render(llm.Name))
	fmt.Printf("  %s %s\n", llmDimStyle.Render("Provider:"), string(llm.Provider))
	fmt.Println(llmDimStyle.Render("  " + strings.Repeat("─", 40)))

	// Perform the test
	fmt.Print("  Testing connectivity...")

	result, err := llmClient.TestLLM(llmID, testPrompt)
	if err != nil {
		fmt.Println()
		return fmt.Errorf("test failed: %w", err)
	}

	fmt.Println()
	fmt.Println()

	if result.Success {
		fmt.Printf("  %s\n", llmSuccessStyle.Render("✓ Connection successful!"))
		if result.LatencyMS > 0 {
			fmt.Printf("  %s %dms\n", llmDimStyle.Render("Latency:"), result.LatencyMS)
		}
		if result.ModelUsed != "" {
			fmt.Printf("  %s %s\n", llmDimStyle.Render("Model:"), result.ModelUsed)
		}
		if result.ResponseText != "" {
			fmt.Printf("  %s %s\n", llmDimStyle.Render("Response:"), result.ResponseText)
		}
	} else {
		fmt.Printf("  %s\n", llmErrorStyle.Render("✗ Connection failed!"))
		if result.Error != "" {
			fmt.Printf("  %s %s\n", llmDimStyle.Render("Error:"), result.Error)
		}
	}

	fmt.Println()
	return nil
}

// deleteLLM deletes an LLM configuration
func deleteLLM(cfg *config.Config, llmID string, force bool) error {
	llmClient := client.NewLLMClient(cfg)

	// Get the LLM first to confirm
	llm, err := llmClient.GetLLM(llmID)
	if err != nil {
		return fmt.Errorf("failed to get LLM: %w", err)
	}

	if !force {
		fmt.Printf("\nAre you sure you want to delete LLM '%s'? (y/N): ", llm.Name)
		var response string
		fmt.Scanln(&response)
		if strings.ToLower(response) != "y" && strings.ToLower(response) != "yes" {
			fmt.Println("Cancelled.")
			return nil
		}
	}

	if err := llmClient.DeleteLLM(llmID); err != nil {
		return fmt.Errorf("failed to delete LLM: %w", err)
	}

	fmt.Printf("\n%s LLM '%s' deleted successfully.\n\n", llmSuccessStyle.Render("✓"), llm.Name)
	return nil
}

// getProviderIcon returns an icon for a provider
func getProviderIcon(provider string) string {
	switch provider {
	case "anthropic":
		return "🤖"
	case "openai":
		return "🧠"
	case "openrouter":
		return "🔀"
	case "claude_cli":
		return "🖥️ "
	case "custom":
		return "⚙️ "
	default:
		return "📦"
	}
}

// formatStatus formats the LLM status with colors
func formatStatus(status client.LLMStatus) string {
	switch status {
	case client.StatusActive:
		return llmStatusActiveStyle.Render("● active")
	case client.StatusInactive:
		return llmStatusInactiveStyle.Render("○ inactive")
	case client.StatusError:
		return llmStatusErrorStyle.Render("● error")
	case client.StatusTesting:
		return llmStatusTestingStyle.Render("◐ testing")
	default:
		return llmDimStyle.Render(string(status))
	}
}

// newLLMCreateCommand creates the llm create command
func newLLMCreateCommand(cfg *config.Config) *cobra.Command {
	return &cobra.Command{
		Use:   "create",
		Short: "Create a new LLM configuration (interactive)",
		Long: `Create a new LLM configuration interactively.

This command will guide you through:
1. Selecting a provider (Anthropic, OpenAI, OpenRouter, Claude CLI, Custom)
2. Entering the required configuration (API key, model, etc.)
3. Optionally testing the connection

Examples:
  pod llm create`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return createLLM(cfg)
		},
	}
}

// createLLM creates a new LLM interactively
func createLLM(cfg *config.Config) error {
	llmClient := client.NewLLMClient(cfg)
	reader := bufio.NewReader(os.Stdin)

	// Get providers
	providersResp, err := llmClient.GetProviders()
	if err != nil {
		return fmt.Errorf("failed to get providers: %w", err)
	}

	// Header
	fmt.Println()
	fmt.Println(llmHeaderStyle.Render("  Create New LLM Configuration"))
	fmt.Println(llmDimStyle.Render("  " + strings.Repeat("─", 60)))
	fmt.Println()

	// 1. Select provider
	fmt.Println("  Select a provider:")
	fmt.Println()
	for i, p := range providersResp.Providers {
		icon := getProviderIcon(string(p.Provider))
		fmt.Printf("    %d) %s %s\n", i+1, icon, p.Name)
		fmt.Printf("       %s\n", llmDimStyle.Render(p.Description))
	}
	fmt.Println()

	providerIndex := promptForInt(reader, "  Enter provider number", 1, len(providersResp.Providers))
	selectedProvider := providersResp.Providers[providerIndex-1]
	fmt.Println()

	// 2. Get LLM name
	name := promptForString(reader, "  LLM name", "")
	if name == "" {
		return fmt.Errorf("name is required")
	}

	// 3. Get description (optional)
	description := promptForString(reader, "  Description (optional)", "")

	// 4. Get API key if required
	var apiKey string
	if contains(selectedProvider.RequiredFields, "api_key") {
		apiKey = promptForPassword("  API key")
		if apiKey == "" {
			return fmt.Errorf("API key is required for this provider")
		}
	}

	// 5. Get model name
	var modelName string
	if len(selectedProvider.SupportedModels) > 0 {
		fmt.Println()
		fmt.Println("  Supported models:")
		for i, m := range selectedProvider.SupportedModels {
			fmt.Printf("    %d) %s\n", i+1, m)
		}
		fmt.Println()

		modelIndex := promptForInt(reader, "  Select model number (or 0 for custom)", 0, len(selectedProvider.SupportedModels))
		if modelIndex > 0 {
			modelName = selectedProvider.SupportedModels[modelIndex-1]
		} else {
			modelName = promptForString(reader, "  Custom model name", "")
		}
	} else if contains(selectedProvider.RequiredFields, "model_name") || contains(selectedProvider.OptionalFields, "model_name") {
		modelName = promptForString(reader, "  Model name", "")
	}

	// 6. Additional config for specific providers
	llmConfig := &client.LLMConfig{
		ModelName:   modelName,
		MaxTokens:   4096,
		Temperature: 0.7,
	}

	// Provider-specific fields
	if selectedProvider.Provider == client.ProviderCustom {
		baseURL := promptForString(reader, "  Base URL (e.g., http://localhost:11434/v1)", "")
		if baseURL == "" {
			return fmt.Errorf("base URL is required for custom provider")
		}
		llmConfig.BaseURL = baseURL
	}

	if selectedProvider.Provider == client.ProviderClaudeCLI {
		fmt.Println()
		fmt.Println("  Claude CLI models: sonnet, opus, haiku")
		claudeModel := promptForString(reader, "  Claude model (default: sonnet)", "sonnet")
		llmConfig.ClaudeModel = claudeModel
		llmConfig.AllowPermissions = true
	}

	// 7. Set as default?
	isDefault := promptForYesNo(reader, "  Set as default LLM?", false)

	// Create the LLM
	fmt.Println()
	fmt.Print("  Creating LLM...")

	createReq := client.LLMCreateRequest{
		Name:        name,
		Description: description,
		Provider:    selectedProvider.Provider,
		APIKey:      apiKey,
		Config:      llmConfig,
		IsDefault:   isDefault,
	}

	llm, err := llmClient.CreateLLM(createReq)
	if err != nil {
		fmt.Println()
		return fmt.Errorf("failed to create LLM: %w", err)
	}

	fmt.Println()
	fmt.Printf("\n  %s LLM '%s' created successfully!\n", llmSuccessStyle.Render("✓"), llm.Name)
	fmt.Printf("  %s %s\n\n", llmDimStyle.Render("ID:"), llm.ID)

	// 8. Test connection?
	if promptForYesNo(reader, "  Test connection now?", true) {
		fmt.Print("\n  Testing connectivity...")
		testResult, err := llmClient.TestLLM(llm.ID, "")
		fmt.Println()
		if err != nil {
			fmt.Printf("  %s Test failed: %v\n\n", llmErrorStyle.Render("✗"), err)
		} else if testResult.Success {
			fmt.Printf("  %s Connection successful! (latency: %dms)\n\n", llmSuccessStyle.Render("✓"), testResult.LatencyMS)
		} else {
			fmt.Printf("  %s Connection failed: %s\n\n", llmErrorStyle.Render("✗"), testResult.Error)
		}
	}

	return nil
}

// promptForString prompts for a string input
func promptForString(reader *bufio.Reader, prompt, defaultVal string) string {
	if defaultVal != "" {
		fmt.Printf("%s [%s]: ", prompt, defaultVal)
	} else {
		fmt.Printf("%s: ", prompt)
	}
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(input)
	if input == "" {
		return defaultVal
	}
	return input
}

// promptForInt prompts for an integer input
func promptForInt(reader *bufio.Reader, prompt string, min, max int) int {
	for {
		fmt.Printf("%s (%d-%d): ", prompt, min, max)
		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)
		val, err := strconv.Atoi(input)
		if err != nil || val < min || val > max {
			fmt.Printf("  Please enter a number between %d and %d\n", min, max)
			continue
		}
		return val
	}
}

// promptForPassword prompts for a password (hidden input)
func promptForPassword(prompt string) string {
	fmt.Printf("%s: ", prompt)
	// Try to read password without echo
	if term.IsTerminal(int(os.Stdin.Fd())) {
		password, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Println()
		if err != nil {
			return ""
		}
		return strings.TrimSpace(string(password))
	}
	// Fallback to regular input if not a terminal
	reader := bufio.NewReader(os.Stdin)
	input, _ := reader.ReadString('\n')
	return strings.TrimSpace(input)
}

// promptForYesNo prompts for a yes/no response
func promptForYesNo(reader *bufio.Reader, prompt string, defaultYes bool) bool {
	defaultStr := "y/N"
	if defaultYes {
		defaultStr = "Y/n"
	}
	fmt.Printf("%s (%s): ", prompt, defaultStr)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(strings.ToLower(input))
	if input == "" {
		return defaultYes
	}
	return input == "y" || input == "yes"
}

// contains checks if a slice contains a string
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
