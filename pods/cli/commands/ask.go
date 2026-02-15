package commands

import (
	"context"
	"fmt"
	"strings"
	"time"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

// Styles for ask output
var (
	askAgentStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("212")).
			Bold(true)

	askContentStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("252"))

	askErrorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("196")).
			Bold(true)

	askInfoStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("241")).
			Italic(true)

	askSpinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
)

// NewAskCommand creates the ask command for quick questions
func NewAskCommand(cfg *config.Config) *cobra.Command {
	var agentID string
	var agentName string
	var noStream bool
	var timeout int

	cmd := &cobra.Command{
		Use:   "ask <question>",
		Short: "Ask a quick question to an agent",
		Long: `Ask a quick question to an AI agent and get a response.

This is a simpler alternative to 'pod chat' for one-off questions.
The question is sent to the agent, and the response is printed directly.

Examples:
  pod ask "What is the capital of France?"
  pod ask --agent abc123 "How do I fix this error?"
  pod ask --name "DevAgent" "Explain this code"
  pod ask --no-stream "Quick question"`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			question := strings.Join(args, " ")
			return runAsk(cfg, question, agentID, agentName, noStream, timeout)
		},
	}

	cmd.Flags().StringVarP(&agentID, "agent", "a", "", "Agent ID to ask")
	cmd.Flags().StringVarP(&agentName, "name", "n", "", "Agent name to ask")
	cmd.Flags().BoolVar(&noStream, "no-stream", false, "Wait for complete response instead of streaming")
	cmd.Flags().IntVarP(&timeout, "timeout", "t", 120, "Timeout in seconds")

	return cmd
}

// runAsk executes the ask command
func runAsk(cfg *config.Config, question, agentID, agentName string, noStream bool, timeout int) error {
	chatClient := client.NewChatClient(cfg)

	// Connect to API
	if err := chatClient.WaitForConnection(5 * time.Second); err != nil {
		return fmt.Errorf("failed to connect to API: %w", err)
	}

	// Get agents
	agents, err := chatClient.GetChatAgents()
	if err != nil {
		return fmt.Errorf("failed to get agents: %w", err)
	}

	if len(agents) == 0 {
		return fmt.Errorf("no agents available")
	}

	// Find agent
	var selectedAgent *client.ChatAgent
	if agentID != "" {
		for i, a := range agents {
			if a.ID == agentID {
				selectedAgent = &agents[i]
				break
			}
		}
		if selectedAgent == nil {
			return fmt.Errorf("agent with ID '%s' not found", agentID)
		}
	} else if agentName != "" {
		for i, a := range agents {
			if strings.EqualFold(a.Name, agentName) {
				selectedAgent = &agents[i]
				break
			}
		}
		if selectedAgent == nil {
			return fmt.Errorf("agent with name '%s' not found", agentName)
		}
	} else {
		// Use first agent with LLM
		for i, a := range agents {
			if a.HasLLM {
				selectedAgent = &agents[i]
				break
			}
		}
		if selectedAgent == nil {
			return fmt.Errorf("no agents with LLM configured")
		}
	}

	if !selectedAgent.HasLLM {
		return fmt.Errorf("agent '%s' does not have an LLM configured", selectedAgent.Name)
	}

	// Create temporary session
	session, err := chatClient.CreateChatSession(selectedAgent.ID, "Quick Ask: "+truncate(question, 30))
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}

	// Show what we're doing
	fmt.Printf("%s %s\n", askInfoStyle.Render("Asking"), askAgentStyle.Render(selectedAgent.Name+"..."))
	fmt.Println()

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	if noStream {
		return runAskNonStreaming(ctx, chatClient, session.ID, question, selectedAgent.Name)
	}

	return runAskStreaming(ctx, chatClient, session.ID, question, selectedAgent.Name)
}

// runAskStreaming handles streaming response
func runAskStreaming(ctx context.Context, chatClient *client.ChatClient, sessionID, question, agentName string) error {
	var responseBuilder strings.Builder
	spinnerIdx := 0
	lastPrint := time.Now()
	started := false

	// Start spinner in background
	spinnerDone := make(chan bool)
	go func() {
		for {
			select {
			case <-spinnerDone:
				return
			case <-time.After(100 * time.Millisecond):
				if !started {
					fmt.Printf("\r%s Thinking...", askSpinnerFrames[spinnerIdx%len(askSpinnerFrames)])
					spinnerIdx++
				}
			}
		}
	}()

	err := chatClient.SendMessageStream(ctx, sessionID, question, func(event *client.ChatStreamEvent) error {
		switch event.EventType {
		case "message_start":
			started = true
			spinnerDone <- true
			fmt.Printf("\r%s\n", askAgentStyle.Render(agentName+":"))

		case "content_delta":
			if data, ok := event.Data["content"].(string); ok {
				responseBuilder.WriteString(data)
				fmt.Print(data)
				lastPrint = time.Now()
			}

		case "error":
			if errStr, ok := event.Data["error"].(string); ok {
				return fmt.Errorf(errStr)
			}

		case "done":
			return fmt.Errorf("chat_complete")
		}
		return nil
	})

	// Clean up spinner if still running
	select {
	case spinnerDone <- true:
	default:
	}

	if err != nil && err.Error() != "chat_complete" {
		fmt.Println()
		return fmt.Errorf("error: %w", err)
	}

	// Ensure newline at end
	if responseBuilder.Len() > 0 && !strings.HasSuffix(responseBuilder.String(), "\n") {
		fmt.Println()
	}

	_ = lastPrint // Avoid unused variable warning

	return nil
}

// runAskNonStreaming waits for complete response
func runAskNonStreaming(ctx context.Context, chatClient *client.ChatClient, sessionID, question, agentName string) error {
	var responseBuilder strings.Builder

	// Show spinner
	spinnerIdx := 0
	spinnerDone := make(chan bool)

	go func() {
		for {
			select {
			case <-spinnerDone:
				return
			case <-time.After(100 * time.Millisecond):
				fmt.Printf("\r%s Waiting for response...", askSpinnerFrames[spinnerIdx%len(askSpinnerFrames)])
				spinnerIdx++
			}
		}
	}()

	err := chatClient.SendMessageStream(ctx, sessionID, question, func(event *client.ChatStreamEvent) error {
		switch event.EventType {
		case "content_delta":
			if data, ok := event.Data["content"].(string); ok {
				responseBuilder.WriteString(data)
			}

		case "error":
			if errStr, ok := event.Data["error"].(string); ok {
				return fmt.Errorf(errStr)
			}

		case "done":
			return fmt.Errorf("chat_complete")
		}
		return nil
	})

	// Stop spinner
	spinnerDone <- true
	fmt.Printf("\r") // Clear spinner line

	if err != nil && err.Error() != "chat_complete" {
		return fmt.Errorf("error: %w", err)
	}

	// Print complete response
	if responseBuilder.Len() > 0 {
		fmt.Printf("%s\n", askAgentStyle.Render(agentName+":"))
		fmt.Println(askContentStyle.Render(responseBuilder.String()))
	}

	return nil
}

// truncate truncates a string to maxLen characters
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
