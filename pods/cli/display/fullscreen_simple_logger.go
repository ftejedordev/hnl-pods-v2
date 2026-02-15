package display

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// FullscreenSimpleLogger implements fullscreen real-time streaming
type FullscreenSimpleLogger struct {
	cfg         *config.Config
	sseClient   *client.SSEClient
	apiClient   *client.APIClient
	flowName    string
	variables   map[string]interface{}
	executionID string
	timeout     int

	// UI state
	width      int
	height     int
	spinner    spinner.Model
	events     []string
	eventsMux  sync.RWMutex // Protect events slice
	agents     map[string]*client.AgentDetails
	isComplete bool
	error      error

	// Streaming state
	ctx           context.Context
	cancel        context.CancelFunc
	streamStarted bool
	program       *tea.Program // Reference to BubbleTea program for sending messages

	// Content cleaner
	contentCleaner *ContentCleaner
}

// TickMsg is used to keep the UI responsive
type TickMsg struct{}

// SSEEventReceivedMsg represents receiving a new SSE event
type SSEEventReceivedMsg struct {
	Event *client.SSEEvent
}

// NewFullscreenRealTimeLogger creates a new fullscreen simple logger
func NewFullscreenRealTimeLogger(cfg *config.Config, sseClient *client.SSEClient, apiClient *client.APIClient, flowName string, variables map[string]interface{}, executionID string, timeout int) *FullscreenSimpleLogger {
	s := spinner.New()
	s.Spinner = spinner.Moon
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)

	return &FullscreenSimpleLogger{
		cfg:            cfg,
		sseClient:      sseClient,
		apiClient:      apiClient,
		flowName:       flowName,
		variables:      variables,
		executionID:    executionID,
		timeout:        timeout,
		spinner:        s,
		events:         []string{"⚡ Starting flow execution..."},
		agents:         make(map[string]*client.AgentDetails),
		ctx:            ctx,
		cancel:         cancel,
		streamStarted:  false,
		program:        nil, // Will be set when program starts
		contentCleaner: NewContentCleaner(),
	}
}

// Start starts the fullscreen logger
func (l *FullscreenSimpleLogger) Start() error {
	// Load agent details first
	if err := l.loadAgentDetails(); err != nil {
		// Continue without agent details if this fails (don't print during fullscreen)
	}

	p := tea.NewProgram(l, tea.WithAltScreen())

	// Store program reference for sending SSE events
	l.program = p

	_, err := p.Run()

	// Clean up
	l.cancel()

	return err
}

// loadAgentDetails loads agent details from the API
func (l *FullscreenSimpleLogger) loadAgentDetails() error {
	if l.apiClient == nil {
		return fmt.Errorf("API client not available")
	}

	// Test API connection first
	if err := l.apiClient.TestConnection(); err != nil {
		return fmt.Errorf("failed to connect to API: %w", err)
	}

	flowHelp, err := l.apiClient.GetFlowHelp(l.flowName)
	if err != nil {
		return fmt.Errorf("failed to get flow help: %w", err)
	}

	// Store agents by name for matching
	for _, agent := range flowHelp.Agents {
		l.agents[agent.Name] = &agent
		// Also store by LLMID if available for better matching
		if agent.LLMID != "" {
			l.agents[agent.LLMID] = &agent
		}
	}

	if l.cfg.Verbose {
		// Log agent cache info (only for debugging, not during fullscreen)
		fmt.Printf("Loaded %d agents into cache\n", len(l.agents))
	}

	return nil
}

// startStreamingBackground starts SSE streaming in a single goroutine
func (l *FullscreenSimpleLogger) startStreamingBackground() {
	if l.streamStarted {
		return // Already started
	}
	l.streamStarted = true

	go func() {
		// Send initial connection event via BubbleTea
		connectionEvent := &client.SSEEvent{
			EventType: "connection_started",
			Message:   "Connecting to stream...",
			Timestamp: client.FlexibleTime{Time: time.Now()},
			Data:      map[string]interface{}{"agent_name": "System"},
		}

		if l.program != nil {
			l.program.Send(SSEEventReceivedMsg{Event: connectionEvent})
		}

		// Start actual SSE streaming
		err := l.sseClient.StreamExecutionWithRetry(l.ctx, l.executionID, func(event *client.SSEEvent) error {
			if event.EventType == "heartbeat" {
				return nil
			}

			// Send event to BubbleTea for processing (non-blocking)
			if l.program != nil {
				l.program.Send(SSEEventReceivedMsg{Event: event})
			}

			// Check if this event indicates completion
			eventTypeLower := strings.ToLower(event.EventType)
			if eventTypeLower == "execution_completed" ||
				(eventTypeLower == "info" && strings.Contains(strings.ToLower(event.Message), "completed execution of flow")) ||
				strings.Contains(strings.ToLower(event.Message), "flow execution completed") {
				return fmt.Errorf("execution_complete")
			}

			return nil
		})

		// Send completion event
		completionEvent := &client.SSEEvent{
			EventType: "execution_completed",
			Message:   "Stream completed",
			Timestamp: client.FlexibleTime{Time: time.Now()},
			Data:      map[string]interface{}{"error": err},
		}

		if l.program != nil {
			l.program.Send(SSEEventReceivedMsg{Event: completionEvent})
		}
	}()
}

// No longer need waitForEvents since SSE events will drive updates

// Init implements tea.Model
func (l *FullscreenSimpleLogger) Init() tea.Cmd {
	// Start streaming in background
	l.startStreamingBackground()

	return l.spinner.Tick // Only need spinner tick
}

// Update implements tea.Model
func (l *FullscreenSimpleLogger) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		l.width = msg.Width
		l.height = msg.Height
		return l, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			l.cancel()
			return l, tea.Quit
		}

	case SSEEventReceivedMsg:
		// Process SSE event and add to display
		eventText := l.createEventText(msg.Event)
		l.eventsMux.Lock()
		l.events = append(l.events, eventText)

		// Limit events to prevent memory issues
		if len(l.events) > 50 {
			l.events = l.events[1:]
		}
		l.eventsMux.Unlock()

		// Check if this indicates completion
		if strings.ToLower(msg.Event.EventType) == "execution_completed" {
			l.isComplete = true
			if errorData, exists := msg.Event.Data["error"]; exists {
				if err, ok := errorData.(error); ok && err != nil && !strings.Contains(err.Error(), "execution_complete") {
					l.error = err
				}
			}
		}

		return l, nil // UI will re-render automatically

	case spinner.TickMsg:
		if !l.isComplete {
			var cmd tea.Cmd
			l.spinner, cmd = l.spinner.Update(msg)
			return l, cmd
		}
		// Don't process spinner updates when complete
		return l, nil

	}

	return l, nil
}

// createEventText creates display text from SSE event
func (l *FullscreenSimpleLogger) createEventText(event *client.SSEEvent) string {
	timestamp := event.Timestamp.Time.Format("15:04:05")
	agentInfo := l.getAgentInfo(event.Data)
	message := l.contentCleaner.CleanEventMessage(event.Message)
	icon := l.getEventIcon(event.EventType)

	// Style agent name with color
	agentStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(agentInfo.Color)).
		Bold(true)

	agentName := agentStyle.Render(fmt.Sprintf("[%s]", agentInfo.Name))

	// Create event line
	eventText := fmt.Sprintf("%s %s %s %s", timestamp, icon, agentName, message)

	// Add content based on event type
	switch event.EventType {
	case "llm_response":
		if event.Data != nil {
			if contentData, exists := event.Data["content"]; exists {
				if contentStr, ok := contentData.(string); ok {
					cleanContent := l.contentCleaner.CleanAgentOutput(contentStr)
					if cleanContent != "" {
						// Don't truncate the last event, only truncate previous ones
						shouldTruncate := len(l.events) > 0 // If there are already events, truncate
						if shouldTruncate && len(cleanContent) > 200 {
							cleanContent = cleanContent[:197] + "..."
						}
						contentStyle := lipgloss.NewStyle().
							Foreground(lipgloss.Color("244")).
							Italic(true)
						contentLine := fmt.Sprintf("   💬 %s", contentStyle.Render(cleanContent))
						eventText += "\n" + contentLine
					}
				}
			}
		}

	case "tool_call_started":
		if event.Data != nil {
			if toolName, exists := event.Data["tool_name"]; exists {
				if toolNameStr, ok := toolName.(string); ok {
					// Display tool arguments if available
					var argsText string
					if args, exists := event.Data["arguments"]; exists {
						if argsMap, ok := args.(map[string]interface{}); ok && len(argsMap) > 0 {
							// Format key arguments (truncate for display)
							var argPairs []string
							for k, v := range argsMap {
								vStr := fmt.Sprintf("%v", v)
								if len(vStr) > 50 {
									vStr = vStr[:47] + "..."
								}
								argPairs = append(argPairs, fmt.Sprintf("%s: %s", k, vStr))
								if len(argPairs) >= 3 { // Limit to 3 args for display
									break
								}
							}
							if len(argPairs) > 0 {
								if len(argsMap) > len(argPairs) {
									argPairs = append(argPairs, "...")
								}
								argsText = fmt.Sprintf(" {%s}", strings.Join(argPairs, ", "))
							}
						}
					}
					toolStyle := lipgloss.NewStyle().
						Foreground(lipgloss.Color("208")).
						Bold(true)
					toolLine := fmt.Sprintf("   🔧 %s%s", toolStyle.Render(toolNameStr), argsText)
					eventText += "\n" + toolLine
				}
			}
		}

	case "tool_call_completed":
		if event.Data != nil {
			if toolName, exists := event.Data["tool_name"]; exists {
				if toolNameStr, ok := toolName.(string); ok {
					// Check if tool succeeded
					success := false
					if successData, exists := event.Data["success"]; exists {
						if successBool, ok := successData.(bool); ok {
							success = successBool
						}
					}

					var statusIcon, statusText string
					var statusColor lipgloss.Color
					if success {
						statusIcon = "✅"
						statusText = "completed"
						statusColor = lipgloss.Color("2")
					} else {
						statusIcon = "❌"
						statusText = "failed"
						statusColor = lipgloss.Color("9")
					}

					toolStyle := lipgloss.NewStyle().
						Foreground(statusColor).
						Bold(true)
					toolLine := fmt.Sprintf("   %s %s %s", statusIcon, toolStyle.Render(toolNameStr), statusText)
					eventText += "\n" + toolLine
				}
			}
		}
	}

	return eventText
}

// getAgentInfo extracts agent information from event data
func (l *FullscreenSimpleLogger) getAgentInfo(data map[string]interface{}) AgentInfo {
	if data == nil {
		return AgentInfo{Name: "Assistant", Color: l.cfg.GetSystemColor("agent")}
	}

	possibleKeys := []string{"agent_name", "agent_id", "agentId", "agent", "step_agent_id", "step_agent_name"}

	// First try to find agent_name directly from event data
	if agentName, exists := data["agent_name"]; exists {
		if name, ok := agentName.(string); ok && name != "" {
			// Check if we have this agent in our cache
			if agent, exists := l.agents[name]; exists {
				return AgentInfo{
					Name:  agent.Name,
					Color: l.cfg.GetAgentColor(agent.Color),
				}
			}
			// Use the name directly if not in cache
			return AgentInfo{Name: name, Color: l.cfg.GetSystemColor("agent")}
		}
	}

	// Try step_agent_name as well
	if stepAgentName, exists := data["step_agent_name"]; exists {
		if name, ok := stepAgentName.(string); ok && name != "" {
			if agent, exists := l.agents[name]; exists {
				return AgentInfo{
					Name:  agent.Name,
					Color: l.cfg.GetAgentColor(agent.Color),
				}
			}
			return AgentInfo{Name: name, Color: l.cfg.GetSystemColor("agent")}
		}
	}

	// Fallback to agent_id and try to resolve
	for _, key := range possibleKeys {
		if agentID, exists := data[key]; exists {
			if aid, ok := agentID.(string); ok && aid != "" {
				// Try exact match first
				if agent, exists := l.agents[aid]; exists {
					return AgentInfo{
						Name:  agent.Name,
						Color: l.cfg.GetAgentColor(agent.Color),
					}
				}

				// Try to find by agent LLMID or name
				for _, agent := range l.agents {
					if agent.LLMID == aid || agent.Name == aid {
						return AgentInfo{
							Name:  agent.Name,
							Color: l.cfg.GetAgentColor(agent.Color),
						}
					}
				}

				// Handle MongoDB ObjectID matching - the key insight is that the event
				// likely contains the full ObjectID, but we're showing a shortened version
				if len(aid) == 24 && isHexString(aid) {
					// This is a full ObjectID, try to match it to agent names
					// Since we don't have ObjectID mapping, try partial matching approaches
					prefix := aid[:8]

					// Check if the LLMID matches
					for _, agent := range l.agents {
						if agent.LLMID == aid {
							return AgentInfo{
								Name:  agent.Name,
								Color: l.cfg.GetAgentColor(agent.Color),
							}
						}
					}

					// If no match found, show a cleaner name
					return AgentInfo{
						Name:  fmt.Sprintf("Agent-%s", prefix),
						Color: l.cfg.GetSystemColor("agent"),
					}
				}

				// Try partial match for agent names
				for _, agent := range l.agents {
					if strings.Contains(strings.ToLower(agent.Name), strings.ToLower(aid)) ||
						strings.Contains(strings.ToLower(aid), strings.ToLower(agent.Name)) {
						return AgentInfo{
							Name:  agent.Name,
							Color: l.cfg.GetAgentColor(agent.Color),
						}
					}
				}

				// Use the ID directly as the name
				return AgentInfo{
					Name:  aid,
					Color: l.cfg.GetSystemColor("agent"),
				}
			}
		}
	}

	return AgentInfo{Name: "Assistant", Color: l.cfg.GetSystemColor("agent")}
}

// getEventIcon returns appropriate icon for event type
func (l *FullscreenSimpleLogger) getEventIcon(eventType string) string {
	switch eventType {
	case "step_started":
		return "🔄"
	case "step_completed":
		return "✅"
	case "step_failed":
		return "❌"
	case "llm_response":
		return "🧠"
	case "tool_call_started":
		return "🔧"
	case "tool_call_completed":
		return "✅"
	default:
		return "ℹ️"
	}
}

// View implements tea.Model
func (l *FullscreenSimpleLogger) View() string {
	if l.width == 0 || l.height == 0 {
		return "Loading..."
	}

	// Create title
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#FAFAFA")).
		Background(lipgloss.Color("#874BFD")).
		Padding(0, 1).
		Render(fmt.Sprintf("🚀 %s", l.flowName))

	// Create events display first
	var eventLines []string

	// Show recent events (limit to screen height) - thread-safe read
	l.eventsMux.RLock()
	maxEvents := l.height - 8 // Reserve space for title, status, footer
	if maxEvents < 5 {
		maxEvents = 5
	}

	startIdx := len(l.events) - maxEvents
	if startIdx < 0 {
		startIdx = 0
	}

	for i := startIdx; i < len(l.events); i++ {
		eventLines = append(eventLines, l.events[i])
	}
	l.eventsMux.RUnlock()

	// If no events yet, show loading message
	if len(eventLines) == 0 {
		eventLines = append(eventLines,
			lipgloss.NewStyle().
				Foreground(lipgloss.Color("244")).
				Render("Waiting for events..."))
	}

	events := strings.Join(eventLines, "\n")

	// Create status line below events (spinner or completion status)
	var statusLine string
	if l.isComplete {
		if l.error != nil {
			statusLine = lipgloss.NewStyle().
				Foreground(lipgloss.Color("9")).
				Render(fmt.Sprintf("❌ Error: %v", l.error))
		} else {
			statusLine = lipgloss.NewStyle().
				Foreground(lipgloss.Color("2")).
				Render("✅ Flow execution completed!")
		}
	} else {
		statusLine = lipgloss.NewStyle().
			Foreground(lipgloss.Color("14")).
			Render(fmt.Sprintf("%s Executing flow...", l.spinner.View()))
	}

	// Create footer
	var footer string
	if l.isComplete {
		footer = "Press 'q' to exit"
	} else {
		footer = "Press 'ctrl+c' or 'q' to exit"
	}

	footerStyled := lipgloss.NewStyle().
		Foreground(lipgloss.Color("244")).
		Render(footer)

	// Layout components with status line below events
	content := lipgloss.JoinVertical(lipgloss.Left,
		"",
		events,
		"",
		statusLine,
		"",
	)

	// Create content container without border
	container := lipgloss.NewStyle().
		Padding(1, 2).
		Width(l.width - 4).
		Height(l.height - 6).
		Render(content)

	// Center everything
	centeredTitle := lipgloss.Place(l.width, 1, lipgloss.Center, lipgloss.Top, title)
	centeredContainer := lipgloss.Place(l.width, l.height-3, lipgloss.Center, lipgloss.Center, container)
	centeredFooter := lipgloss.Place(l.width, 2, lipgloss.Center, lipgloss.Bottom, footerStyled)

	return lipgloss.JoinVertical(lipgloss.Left, centeredTitle, centeredContainer, centeredFooter)
}

// isExecutionCompleteError checks if the error indicates successful completion
func isExecutionCompleteError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "execution_complete")
}
