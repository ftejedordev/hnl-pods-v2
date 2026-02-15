package commands

import (
	"context"
	"fmt"
	"strings"
	"time"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

// Styles for chat UI
var (
	chatTitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("205")).
			Padding(0, 1)

	chatUserStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("86")).
			Bold(true)

	chatAssistantStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("212")).
				Bold(true)

	chatContentStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("252")).
				PaddingLeft(2)

	chatErrorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("196")).
			Bold(true)

	chatHelpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("241")).
			Italic(true)

	chatSpinnerStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("205"))

	chatBorderStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("62")).
			Padding(0, 1)

	// Tool call styles
	chatToolCallStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("214")).
				Bold(true)

	chatToolNameStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("39")).
				Bold(true)

	chatToolArgsStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("245")).
				PaddingLeft(4)

	chatToolResultStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("78")).
				PaddingLeft(4)

	chatToolBoxStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("214")).
				Padding(0, 1).
				MarginLeft(2)
)

// chatModel represents the chat TUI state
type chatModel struct {
	cfg            *config.Config
	chatClient     *client.ChatClient
	session        *client.ChatSession
	agent          *client.ChatAgent
	messages       []chatMessage
	textarea       textarea.Model
	viewport       viewport.Model
	spinner        spinner.Model
	ready          bool
	waiting        bool
	streaming      bool
	streamBuf      strings.Builder
	err            error
	width          int
	height         int
	ctx            context.Context
	cancel         context.CancelFunc
	activeToolCall *toolCallInfo  // Currently active tool call
	pendingTools   []toolCallInfo // Tool calls being processed
}

// chatMessage represents a displayed message
type chatMessage struct {
	role      string
	content   string
	toolCalls []toolCallInfo
}

// toolCallInfo represents a tool call with its result
type toolCallInfo struct {
	id        string
	name      string
	arguments string
	result    string
	status    string // "calling", "success", "error"
}

// Message types for Bubble Tea
type (
	streamStartMsg    struct{}
	streamContentMsg  string
	streamDoneMsg     struct{ content string }
	streamErrorMsg    error
	sessionCreatedMsg *client.ChatSession
	errMsg            error

	// Tool call messages
	toolCallStartMsg struct {
		id   string
		name string
	}
	toolCallArgsMsg struct {
		id   string
		args string
	}
	toolCallEndMsg struct {
		id string
	}
	toolCallResultMsg struct {
		id     string
		result string
	}
)

// NewChatCommand creates the chat command
func NewChatCommand(cfg *config.Config) *cobra.Command {
	var agentID string
	var agentName string
	var sessionID string
	var listAgents bool

	cmd := &cobra.Command{
		Use:   "chat",
		Short: "Start interactive chat with an agent",
		Long: `Start an interactive chat session with an AI agent.

Examples:
  pod chat                          # Select agent interactively
  pod chat --agent <agent-id>       # Chat with specific agent by ID
  pod chat --name "Agent Name"      # Chat with specific agent by name
  pod chat --session <session-id>   # Resume existing session
  pod chat --list-agents            # List available agents
  pod chat sessions                 # List your chat sessions
  pod chat history <session-id>     # View conversation history`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runChat(cfg, agentID, agentName, sessionID, listAgents)
		},
	}

	cmd.Flags().StringVarP(&agentID, "agent", "a", "", "Agent ID to chat with")
	cmd.Flags().StringVarP(&agentName, "name", "n", "", "Agent name to chat with")
	cmd.Flags().StringVarP(&sessionID, "session", "s", "", "Resume existing session by ID")
	cmd.Flags().BoolVarP(&listAgents, "list-agents", "l", false, "List available agents")

	// Add subcommands
	cmd.AddCommand(newChatSessionsCommand(cfg))
	cmd.AddCommand(newChatHistoryCommand(cfg))

	return cmd
}

// newChatSessionsCommand creates the sessions subcommand
func newChatSessionsCommand(cfg *config.Config) *cobra.Command {
	var showAll bool
	var deleteID string

	cmd := &cobra.Command{
		Use:   "sessions",
		Short: "Manage chat sessions",
		Long: `List and manage your chat sessions.

Examples:
  pod chat sessions                 # List active sessions
  pod chat sessions --all           # List all sessions (including inactive)
  pod chat sessions --delete <id>   # Delete a session`,
		RunE: func(cmd *cobra.Command, args []string) error {
			chatClient := client.NewChatClient(cfg)

			if err := chatClient.WaitForConnection(5 * time.Second); err != nil {
				return fmt.Errorf("failed to connect to API: %w", err)
			}

			if deleteID != "" {
				return deleteChatSession(chatClient, deleteID)
			}

			return listChatSessions(chatClient, !showAll)
		},
	}

	cmd.Flags().BoolVarP(&showAll, "all", "A", false, "Show all sessions including inactive")
	cmd.Flags().StringVarP(&deleteID, "delete", "d", "", "Delete session by ID")

	return cmd
}

// newChatHistoryCommand creates the history subcommand
func newChatHistoryCommand(cfg *config.Config) *cobra.Command {
	var limit int

	cmd := &cobra.Command{
		Use:   "history <session-id>",
		Short: "View conversation history",
		Long: `View the conversation history of a chat session.

Examples:
  pod chat history abc123           # View history of session abc123
  pod chat history abc123 --limit 10  # Show only last 10 messages`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			chatClient := client.NewChatClient(cfg)

			if err := chatClient.WaitForConnection(5 * time.Second); err != nil {
				return fmt.Errorf("failed to connect to API: %w", err)
			}

			return showChatHistory(chatClient, args[0], limit)
		},
	}

	cmd.Flags().IntVarP(&limit, "limit", "l", 50, "Maximum number of messages to show")

	return cmd
}

// listChatSessions lists user's chat sessions
func listChatSessions(chatClient *client.ChatClient, activeOnly bool) error {
	result, err := chatClient.ListChatSessions(0, 50, activeOnly)
	if err != nil {
		return fmt.Errorf("failed to list sessions: %w", err)
	}

	if len(result.Sessions) == 0 {
		fmt.Println("\n📭 No chat sessions found.")
		fmt.Println("   Start a new chat with: pod chat")
		return nil
	}

	fmt.Println("\n💬 Your Chat Sessions:\n")

	// Table header
	headerStyle := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("212"))
	fmt.Printf("  %s\n", headerStyle.Render("ID          Agent           Messages  Created"))
	fmt.Println("  " + strings.Repeat("─", 60))

	for _, session := range result.Sessions {
		idShort := session.ID
		if len(idShort) > 8 {
			idShort = idShort[:8]
		}

		agentName := session.AgentName
		if len(agentName) > 15 {
			agentName = agentName[:12] + "..."
		}

		status := "🟢"
		if !session.IsActive {
			status = "⚫"
		}

		createdAt := session.CreatedAt.Format("2006-01-02 15:04")

		fmt.Printf("  %s %-8s  %-15s  %3d       %s\n",
			status, idShort, agentName, session.MessageCount, createdAt)
	}

	fmt.Printf("\n  Total: %d sessions\n", result.Total)
	fmt.Println("\n  Resume a session: pod chat --session <id>")
	fmt.Println("  View history: pod chat history <id>")

	return nil
}

// deleteChatSession deletes a chat session
func deleteChatSession(chatClient *client.ChatClient, sessionID string) error {
	// Resolve short ID to full ID
	fullID, err := resolveSessionID(chatClient, sessionID)
	if err != nil {
		return err
	}

	// First get session info
	session, err := chatClient.GetChatSession(fullID)
	if err != nil {
		return fmt.Errorf("session not found: %w", err)
	}

	// Confirm deletion
	fmt.Printf("\n⚠️  Delete session with %s (%d messages)?\n", session.AgentName, session.MessageCount)
	fmt.Print("Type 'yes' to confirm: ")

	var confirm string
	fmt.Scanln(&confirm)

	if confirm != "yes" {
		fmt.Println("Cancelled.")
		return nil
	}

	if err := chatClient.DeleteChatSession(fullID); err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}

	fmt.Println("✅ Session deleted successfully.")
	return nil
}

// resolveSessionID resolves a short session ID to a full ID
func resolveSessionID(chatClient *client.ChatClient, shortID string) (string, error) {
	// If it's already a full ID (24 chars for MongoDB ObjectID), return as-is
	if len(shortID) >= 24 {
		return shortID, nil
	}

	// Fetch all sessions and find matching prefix
	result, err := chatClient.ListChatSessions(0, 100, false)
	if err != nil {
		return "", fmt.Errorf("failed to list sessions: %w", err)
	}

	var matches []string
	for _, session := range result.Sessions {
		if strings.HasPrefix(session.ID, shortID) {
			matches = append(matches, session.ID)
		}
	}

	if len(matches) == 0 {
		return "", fmt.Errorf("no session found matching '%s'", shortID)
	}

	if len(matches) > 1 {
		return "", fmt.Errorf("ambiguous session ID '%s' - matches %d sessions", shortID, len(matches))
	}

	return matches[0], nil
}

// showChatHistory displays the conversation history
func showChatHistory(chatClient *client.ChatClient, sessionID string, limit int) error {
	// Resolve short ID to full ID
	fullID, err := resolveSessionID(chatClient, sessionID)
	if err != nil {
		return err
	}

	// Get session info
	session, err := chatClient.GetChatSession(fullID)
	if err != nil {
		return fmt.Errorf("session not found: %w", err)
	}

	// Get messages
	result, err := chatClient.GetChatMessages(fullID, 0, limit)
	if err != nil {
		return fmt.Errorf("failed to get messages: %w", err)
	}

	if len(result.Messages) == 0 {
		fmt.Printf("\n📭 No messages in session with %s\n", session.AgentName)
		return nil
	}

	// Header
	fmt.Printf("\n💬 Chat History: %s\n", session.AgentName)
	fmt.Printf("   Session: %s | Messages: %d | Created: %s\n",
		session.ID[:8], session.MessageCount, session.CreatedAt.Format("2006-01-02 15:04"))
	fmt.Println(strings.Repeat("─", 70))

	// Display messages
	for _, msg := range result.Messages {
		var roleStyle lipgloss.Style
		var roleName string

		switch msg.Role {
		case "user":
			roleStyle = chatUserStyle
			roleName = "You"
		case "assistant":
			roleStyle = chatAssistantStyle
			roleName = session.AgentName
		case "system":
			roleStyle = chatHelpStyle
			roleName = "System"
		default:
			roleStyle = chatHelpStyle
			roleName = msg.Role
		}

		timestamp := msg.Timestamp.Format("15:04:05")
		fmt.Printf("\n%s %s\n", roleStyle.Render(roleName+":"), chatHelpStyle.Render("["+timestamp+"]"))

		// Wrap content for readability
		content := msg.Content
		if len(content) > 500 {
			// Show truncated content with option to see full
			content = content[:500] + "...\n[Message truncated - " + fmt.Sprintf("%d", len(msg.Content)) + " chars total]"
		}
		fmt.Printf("%s\n", chatContentStyle.Render(content))
	}

	fmt.Println(strings.Repeat("─", 70))
	fmt.Printf("Showing %d of %d messages\n", len(result.Messages), result.Total)

	if result.Total > len(result.Messages) {
		fmt.Printf("Use --limit %d to see more messages\n", result.Total)
	}

	fmt.Println("\nResume this session: pod chat --session " + fullID)

	return nil
}

// runChat starts the chat interface
func runChat(cfg *config.Config, agentID, agentName, sessionID string, listAgents bool) error {
	chatClient := client.NewChatClient(cfg)

	// Test connection
	if err := chatClient.WaitForConnection(5 * time.Second); err != nil {
		return fmt.Errorf("failed to connect to API: %w", err)
	}

	// List agents mode
	if listAgents {
		return listChatAgents(chatClient)
	}

	// Get agents
	agents, err := chatClient.GetChatAgents()
	if err != nil {
		return fmt.Errorf("failed to get agents: %w", err)
	}

	if len(agents) == 0 {
		return fmt.Errorf("no agents available for chat")
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
	} else if sessionID != "" {
		// Resume session
		session, err := chatClient.GetChatSession(sessionID)
		if err != nil {
			return fmt.Errorf("failed to get session: %w", err)
		}
		// Find agent for session
		for i, a := range agents {
			if a.ID == session.AgentID {
				selectedAgent = &agents[i]
				break
			}
		}
		return startChatUI(cfg, chatClient, selectedAgent, session)
	} else {
		// Interactive agent selection
		selectedAgent, err = selectAgent(agents)
		if err != nil {
			return err
		}
	}

	if !selectedAgent.HasLLM {
		return fmt.Errorf("agent '%s' does not have an LLM configured", selectedAgent.Name)
	}

	// Create new session
	return startChatUI(cfg, chatClient, selectedAgent, nil)
}

// listChatAgents lists available agents
func listChatAgents(chatClient *client.ChatClient) error {
	agents, err := chatClient.GetChatAgents()
	if err != nil {
		return err
	}

	fmt.Println("\n📋 Available Chat Agents:\n")

	for _, agent := range agents {
		status := "⚠️  No LLM"
		if agent.HasLLM {
			status = "✅ Ready"
		}

		mcpStatus := ""
		if agent.HasMCPConnections {
			mcpStatus = " 🔧 MCP"
		}

		// Show LLM provider with icon
		providerInfo := ""
		if agent.LLMProvider != "" {
			switch agent.LLMProvider {
			case "claude_cli":
				providerInfo = " 🖥️  Claude CLI"
			case "anthropic":
				providerInfo = " 🤖 Anthropic API"
			case "openai":
				providerInfo = " 🧠 OpenAI"
			case "openrouter":
				providerInfo = " 🔀 OpenRouter"
			default:
				providerInfo = " 📡 " + agent.LLMProvider
			}
		}

		fmt.Printf("  %s %s%s%s\n", status, agent.Name, mcpStatus, providerInfo)
		fmt.Printf("     ID: %s\n", agent.ID)
		if agent.Description != "" {
			fmt.Printf("     %s\n", agent.Description)
		}
		fmt.Println()
	}

	return nil
}

// selectAgent prompts user to select an agent
func selectAgent(agents []client.ChatAgent) (*client.ChatAgent, error) {
	fmt.Println("\n📋 Select an agent to chat with:\n")

	readyAgents := []client.ChatAgent{}
	for _, agent := range agents {
		if agent.HasLLM {
			readyAgents = append(readyAgents, agent)
		}
	}

	if len(readyAgents) == 0 {
		return nil, fmt.Errorf("no agents with LLM configured")
	}

	for i, agent := range readyAgents {
		mcpStatus := ""
		if agent.HasMCPConnections {
			mcpStatus = " 🔧"
		}
		fmt.Printf("  [%d] %s%s\n", i+1, agent.Name, mcpStatus)
		if agent.Description != "" {
			fmt.Printf("      %s\n", agent.Description)
		}
	}

	fmt.Print("\nEnter number (or 'q' to quit): ")

	var input string
	fmt.Scanln(&input)

	if input == "q" || input == "Q" {
		return nil, fmt.Errorf("cancelled by user")
	}

	var idx int
	if _, err := fmt.Sscanf(input, "%d", &idx); err != nil || idx < 1 || idx > len(readyAgents) {
		return nil, fmt.Errorf("invalid selection")
	}

	return &readyAgents[idx-1], nil
}

// startChatUI starts the interactive chat UI
func startChatUI(cfg *config.Config, chatClient *client.ChatClient, agent *client.ChatAgent, existingSession *client.ChatSession) error {
	ctx, cancel := context.WithCancel(context.Background())

	// Create textarea for input
	ta := textarea.New()
	ta.Placeholder = "Type your message... (Ctrl+D to send, Ctrl+C to quit)"
	ta.Focus()
	ta.CharLimit = 4000
	ta.SetWidth(80)
	ta.SetHeight(3)
	ta.ShowLineNumbers = false

	// Create spinner
	sp := spinner.New()
	sp.Spinner = spinner.Dot
	sp.Style = chatSpinnerStyle

	// Create viewport for messages
	vp := viewport.New(80, 20)
	vp.SetContent("")

	// Load existing messages if resuming session
	var existingMessages []chatMessage
	if existingSession != nil {
		result, err := chatClient.GetChatMessages(existingSession.ID, 0, 100)
		if err == nil {
			for _, msg := range result.Messages {
				existingMessages = append(existingMessages, chatMessage{
					role:    msg.Role,
					content: msg.Content,
				})
			}
		}
	}

	model := chatModel{
		cfg:        cfg,
		chatClient: chatClient,
		agent:      agent,
		session:    existingSession,
		messages:   existingMessages,
		textarea:   ta,
		viewport:   vp,
		spinner:    sp,
		ctx:        ctx,
		cancel:     cancel,
	}

	// Run the Bubble Tea program
	p := tea.NewProgram(model, tea.WithAltScreen())

	if _, err := p.Run(); err != nil {
		cancel()
		return fmt.Errorf("chat UI error: %w", err)
	}

	cancel()
	return nil
}

// Init initializes the chat model
func (m chatModel) Init() tea.Cmd {
	cmds := []tea.Cmd{
		textarea.Blink,
		m.spinner.Tick,
	}

	// Create session if needed
	if m.session == nil {
		cmds = append(cmds, m.createSessionCmd())
	}

	return tea.Batch(cmds...)
}

// createSessionCmd creates a new chat session
func (m chatModel) createSessionCmd() tea.Cmd {
	return func() tea.Msg {
		session, err := m.chatClient.CreateChatSession(m.agent.ID, "")
		if err != nil {
			return errMsg(err)
		}
		return sessionCreatedMsg(session)
	}
}

// Update handles messages and updates the model
func (m chatModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC:
			m.cancel()
			return m, tea.Quit

		case tea.KeyCtrlD:
			// Send message
			if !m.waiting && !m.streaming && m.session != nil {
				content := strings.TrimSpace(m.textarea.Value())
				if content != "" {
					m.textarea.Reset()
					m.messages = append(m.messages, chatMessage{role: "user", content: content})
					m.waiting = true
					m.updateViewport()
					return m, m.sendMessageCmd(content)
				}
			}
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

		headerHeight := 3
		inputHeight := 5
		helpHeight := 2
		viewportHeight := msg.Height - headerHeight - inputHeight - helpHeight

		if viewportHeight < 5 {
			viewportHeight = 5
		}

		m.viewport.Width = msg.Width - 4
		m.viewport.Height = viewportHeight
		m.textarea.SetWidth(msg.Width - 4)
		m.ready = true
		m.updateViewport()

	case sessionCreatedMsg:
		m.session = msg
		m.updateViewport()

	case streamStartMsg:
		m.streaming = true
		m.waiting = false
		m.streamBuf.Reset()

	case streamContentMsg:
		m.streamBuf.WriteString(string(msg))
		m.updateViewportWithStreaming()

	case streamDoneMsg:
		m.streaming = false
		m.waiting = false
		if msg.content != "" {
			m.messages = append(m.messages, chatMessage{role: "assistant", content: msg.content})
		} else if m.streamBuf.Len() > 0 {
			m.messages = append(m.messages, chatMessage{role: "assistant", content: m.streamBuf.String()})
		}
		m.streamBuf.Reset()
		m.updateViewport()

	case streamErrorMsg:
		m.streaming = false
		m.waiting = false
		m.err = msg
		m.updateViewport()

	case errMsg:
		m.err = msg
		m.waiting = false
		m.streaming = false

	case toolCallStartMsg:
		// Start a new tool call
		m.activeToolCall = &toolCallInfo{
			id:     msg.id,
			name:   msg.name,
			status: "calling",
		}
		m.updateViewportWithStreaming()

	case toolCallArgsMsg:
		// Add arguments to active tool call
		if m.activeToolCall != nil && m.activeToolCall.id == msg.id {
			m.activeToolCall.arguments += msg.args
			m.updateViewportWithStreaming()
		}

	case toolCallEndMsg:
		// Tool call arguments complete, waiting for result
		if m.activeToolCall != nil && m.activeToolCall.id == msg.id {
			m.pendingTools = append(m.pendingTools, *m.activeToolCall)
			m.activeToolCall = nil
			m.updateViewportWithStreaming()
		}

	case toolCallResultMsg:
		// Tool call result received
		for i := range m.pendingTools {
			if m.pendingTools[i].id == msg.id {
				m.pendingTools[i].result = msg.result
				m.pendingTools[i].status = "success"
				break
			}
		}
		m.updateViewportWithStreaming()

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		cmds = append(cmds, cmd)
	}

	// Update textarea
	if !m.waiting && !m.streaming {
		var cmd tea.Cmd
		m.textarea, cmd = m.textarea.Update(msg)
		cmds = append(cmds, cmd)
	}

	// Update viewport
	var cmd tea.Cmd
	m.viewport, cmd = m.viewport.Update(msg)
	cmds = append(cmds, cmd)

	return m, tea.Batch(cmds...)
}

// sendMessageCmd sends a message and handles streaming response
func (m chatModel) sendMessageCmd(content string) tea.Cmd {
	return func() tea.Msg {
		// We'll use a channel to communicate between the SSE handler and the command
		type result struct {
			content   string
			toolCalls []toolCallInfo
			err       error
		}

		resultCh := make(chan result, 1)
		var fullContent strings.Builder
		var toolCalls []toolCallInfo
		var currentToolCall *toolCallInfo

		go func() {
			err := m.chatClient.SendMessageStream(m.ctx, m.session.ID, content, func(event *client.ChatStreamEvent) error {
				switch event.EventType {
				case "content_delta", "content":
					// Handle both content_delta (streaming) and content (full response)
					if data, ok := event.Data["content"].(string); ok {
						fullContent.WriteString(data)
					}

				case "tool_call_start":
					// Start a new tool call
					toolID := ""
					toolName := ""
					if id, ok := event.Data["tool_call_id"].(string); ok {
						toolID = id
					}
					if name, ok := event.Data["tool_name"].(string); ok {
						toolName = name
					}
					currentToolCall = &toolCallInfo{
						id:     toolID,
						name:   toolName,
						status: "calling",
					}

				case "tool_call_delta":
					// Add arguments to current tool call
					if currentToolCall != nil {
						if args, ok := event.Data["arguments_delta"].(string); ok {
							currentToolCall.arguments += args
						}
					}

				case "tool_call_end":
					// Tool call complete, add to list
					if currentToolCall != nil {
						toolCalls = append(toolCalls, *currentToolCall)
						currentToolCall = nil
					}

				case "tool_result":
					// Tool result received
					toolID := ""
					if id, ok := event.Data["tool_call_id"].(string); ok {
						toolID = id
					}
					resultStr := ""
					if r, ok := event.Data["result"].(string); ok {
						resultStr = r
					} else if r, ok := event.Data["result"].(map[string]interface{}); ok {
						// If result is a map, convert to JSON-like string
						resultStr = fmt.Sprintf("%v", r)
					}
					// Find and update the tool call
					for i := range toolCalls {
						if toolCalls[i].id == toolID {
							toolCalls[i].result = resultStr
							toolCalls[i].status = "success"
							break
						}
					}

				case "error":
					if errStr, ok := event.Data["error"].(string); ok {
						resultCh <- result{err: fmt.Errorf(errStr)}
						return fmt.Errorf("chat_complete")
					}

				case "done":
					resultCh <- result{
						content:   fullContent.String(),
						toolCalls: toolCalls,
					}
					return fmt.Errorf("chat_complete")
				}
				return nil
			})

			if err != nil && err.Error() != "chat_complete" {
				resultCh <- result{err: err}
			}
		}()

		// Wait for result
		res := <-resultCh
		if res.err != nil {
			return streamErrorMsg(res.err)
		}
		return streamDoneMsg{content: res.content}
	}
}

// updateViewport updates the viewport content with messages
func (m *chatModel) updateViewport() {
	var content strings.Builder

	for _, msg := range m.messages {
		switch msg.role {
		case "user":
			content.WriteString(chatUserStyle.Render("You: "))
			content.WriteString("\n")
			content.WriteString(chatContentStyle.Render(msg.content))
			content.WriteString("\n\n")
		case "assistant":
			content.WriteString(chatAssistantStyle.Render(m.agent.Name + ": "))
			content.WriteString("\n")
			// Show tool calls if any
			if len(msg.toolCalls) > 0 {
				content.WriteString(m.renderToolCalls(msg.toolCalls))
			}
			content.WriteString(chatContentStyle.Render(msg.content))
			content.WriteString("\n\n")
		}
	}

	if m.waiting {
		content.WriteString(chatSpinnerStyle.Render(m.spinner.View()))
		content.WriteString(" Thinking...")
	}

	if m.err != nil {
		content.WriteString(chatErrorStyle.Render("Error: " + m.err.Error()))
		content.WriteString("\n")
	}

	m.viewport.SetContent(content.String())
	m.viewport.GotoBottom()
}

// updateViewportWithStreaming updates viewport during streaming
func (m *chatModel) updateViewportWithStreaming() {
	var content strings.Builder

	for _, msg := range m.messages {
		switch msg.role {
		case "user":
			content.WriteString(chatUserStyle.Render("You: "))
			content.WriteString("\n")
			content.WriteString(chatContentStyle.Render(msg.content))
			content.WriteString("\n\n")
		case "assistant":
			content.WriteString(chatAssistantStyle.Render(m.agent.Name + ": "))
			content.WriteString("\n")
			// Show tool calls if any
			if len(msg.toolCalls) > 0 {
				content.WriteString(m.renderToolCalls(msg.toolCalls))
			}
			content.WriteString(chatContentStyle.Render(msg.content))
			content.WriteString("\n\n")
		}
	}

	// Show active and pending tool calls during streaming
	if len(m.pendingTools) > 0 || m.activeToolCall != nil {
		content.WriteString(chatAssistantStyle.Render(m.agent.Name + ": "))
		content.WriteString("\n")

		// Show pending tool calls
		if len(m.pendingTools) > 0 {
			content.WriteString(m.renderToolCalls(m.pendingTools))
		}

		// Show active tool call being processed
		if m.activeToolCall != nil {
			content.WriteString(m.renderActiveToolCall(m.activeToolCall))
		}
	}

	// Show streaming content
	if m.streaming && m.streamBuf.Len() > 0 {
		if len(m.pendingTools) == 0 && m.activeToolCall == nil {
			content.WriteString(chatAssistantStyle.Render(m.agent.Name + ": "))
			content.WriteString("\n")
		}
		content.WriteString(chatContentStyle.Render(m.streamBuf.String()))
		content.WriteString("▌") // Cursor indicator
	}

	m.viewport.SetContent(content.String())
	m.viewport.GotoBottom()
}

// renderToolCalls renders a list of tool calls
func (m *chatModel) renderToolCalls(tools []toolCallInfo) string {
	var b strings.Builder

	for _, tool := range tools {
		b.WriteString(chatToolCallStyle.Render("  🔧 Tool: "))
		b.WriteString(chatToolNameStyle.Render(tool.name))
		b.WriteString("\n")

		// Show arguments (truncated if too long)
		if tool.arguments != "" {
			args := tool.arguments
			if len(args) > 200 {
				args = args[:200] + "..."
			}
			b.WriteString(chatToolArgsStyle.Render("  Args: " + args))
			b.WriteString("\n")
		}

		// Show result
		if tool.result != "" {
			result := tool.result
			if len(result) > 300 {
				result = result[:300] + "..."
			}
			statusIcon := "✅"
			if tool.status == "error" {
				statusIcon = "❌"
			}
			b.WriteString(chatToolResultStyle.Render(fmt.Sprintf("  %s Result: %s", statusIcon, result)))
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}

	return b.String()
}

// renderActiveToolCall renders a tool call that is currently being processed
func (m *chatModel) renderActiveToolCall(tool *toolCallInfo) string {
	var b strings.Builder

	b.WriteString(chatToolCallStyle.Render("  🔧 Tool: "))
	b.WriteString(chatToolNameStyle.Render(tool.name))
	b.WriteString(" ")
	b.WriteString(chatSpinnerStyle.Render(m.spinner.View()))
	b.WriteString("\n")

	// Show arguments being streamed
	if tool.arguments != "" {
		args := tool.arguments
		if len(args) > 200 {
			args = args[:200] + "..."
		}
		b.WriteString(chatToolArgsStyle.Render("  Args: " + args))
		b.WriteString("▌")
		b.WriteString("\n")
	}

	return b.String()
}

// View renders the chat UI
func (m chatModel) View() string {
	if !m.ready {
		return "\n  Initializing chat..."
	}

	var b strings.Builder

	// Header
	agentName := "Unknown Agent"
	if m.agent != nil {
		agentName = m.agent.Name
	}
	header := chatTitleStyle.Render(fmt.Sprintf("💬 Chat with %s", agentName))
	if m.session != nil {
		header += chatHelpStyle.Render(fmt.Sprintf(" (Session: %s)", m.session.ID[:8]))
	}
	b.WriteString(header)
	b.WriteString("\n")
	b.WriteString(strings.Repeat("─", m.width-2))
	b.WriteString("\n")

	// Messages viewport
	b.WriteString(m.viewport.View())
	b.WriteString("\n")

	// Input area
	b.WriteString(strings.Repeat("─", m.width-2))
	b.WriteString("\n")
	b.WriteString(m.textarea.View())
	b.WriteString("\n")

	// Help
	help := chatHelpStyle.Render("Ctrl+D: Send • Ctrl+C: Quit • ↑↓: Scroll")
	b.WriteString(help)

	return b.String()
}
