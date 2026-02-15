package display

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/charmbracelet/lipgloss"
)

// ExecutionCompleteError signals that execution has finished (success or failure)
type ExecutionCompleteError struct{}

func (e *ExecutionCompleteError) Error() string {
	return "execution_complete"
}

// SimpleRealTimeLogger implements simple real-time streaming using printf
type SimpleRealTimeLogger struct {
	cfg         *config.Config
	sseClient   *client.SSEClient
	flowName    string
	variables   map[string]interface{}
	executionID string
	timeout     int
	agents      map[string]*client.AgentDetails // Cache for agent details

	// Spinner management
	spinnerFrames []string
	spinnerIndex  int
	isComplete    bool
	completeMux   sync.RWMutex
	spinnerStop   chan bool

	// File logging
	logFile   *os.File
	logWriter io.Writer
}

func NewSimpleRealTimeLogger(cfg *config.Config, sseClient *client.SSEClient, flowName string, variables map[string]interface{}, executionID string, timeout int) *SimpleRealTimeLogger {
	// Moon spinner frames (styled with color)
	moonFrames := []string{
		"🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘",
	}

	return &SimpleRealTimeLogger{
		cfg:           cfg,
		sseClient:     sseClient,
		flowName:      flowName,
		variables:     variables,
		executionID:   executionID,
		timeout:       timeout,
		agents:        make(map[string]*client.AgentDetails),
		spinnerFrames: moonFrames,
		spinnerIndex:  0,
		isComplete:    false,
		spinnerStop:   make(chan bool, 1),
	}
}

func (l *SimpleRealTimeLogger) Start() error {
	// Setup logging to file
	if err := l.setupLogFile(); err != nil {
		if l.cfg.Verbose {
			fmt.Printf("⚠️ Failed to setup log file: %v\n", err)
		}
		// Continue without file logging
		l.logWriter = io.Discard
	}
	defer l.closeLogFile()

	// Load agent details if possible (best effort)
	l.loadAgentDetails()

	// Show header
	l.printAndLog("🚀 %s\n\n", l.flowName)

	// Simple progress indicator
	l.printAndLog("🔗 Connecting to stream...\n")

	// Show initial status in verbose mode
	if l.cfg.Verbose {
		l.printAndLog("🔗 Establishing SSE connection...\n")
		l.printAndLog("📝 Variables: %v\n", l.variables)
		l.printAndLog("⏱️ Timeout: %d seconds\n\n", l.timeout)
	}

	// Set up context
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(l.timeout)*time.Second)
	defer cancel()

	// Handle Ctrl+C gracefully
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Printf("\n⚠️ Execution interrupted by user\n")
		cancel()
		os.Exit(0)
	}()

	// Create content cleaner
	contentCleaner := NewContentCleaner()

	// Add connection established message
	timestamp := time.Now().Format("15:04:05")

	l.printAndLog("%s ℹ️ [Assistant] SSE connection established\n", timestamp)
	l.printAndLog("%s ℹ️ [Assistant] Started execution of flow '%s'\n", timestamp, l.flowName)

	if l.cfg.Verbose {
		fmt.Printf("[DEBUG] Starting SSE stream for execution ID: %s\n", l.executionID)
	}

	// Start spinner
	l.startSpinner()
	defer l.stopSpinner()

	// Stream events
	err := l.sseClient.StreamExecutionWithRetry(ctx, l.executionID, func(event *client.SSEEvent) error {
		// Debug: Log ALL events (including heartbeats) if verbose
		if l.cfg.Verbose {
			fmt.Printf("[DEBUG] Received SSE event: %s - %s\n", event.EventType, event.Message)
		}

		// Skip heartbeat events
		if event.EventType == "heartbeat" {
			return nil
		}

		// Get event details
		timestamp := event.Timestamp.Time.Format("15:04:05")
		agentInfo := l.getAgentInfo(event.Data)
		message := contentCleaner.CleanEventMessage(event.Message)
		icon := l.getEventIcon(event.EventType)

		// Style agent name with color
		agentStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color(agentInfo.Color)).
			Bold(true)
		agentName := agentStyle.Render(fmt.Sprintf("[%s]", agentInfo.Name))

		// Clear spinner line before printing event
		fmt.Print("\r" + strings.Repeat(" ", 50) + "\r")

		// Handle different event types
		switch event.EventType {
		case "step_started":
			l.printAndLog("%s %s %s %s\n", timestamp, icon, agentName, message)

		case "step_completed", "step_failed":
			l.printAndLog("%s %s %s %s\n", timestamp, icon, agentName, message)

		case "llm_response":
			l.printAndLog("%s %s %s %s\n", timestamp, icon, agentName, message)

			// Show cleaned LLM content
			if event.Data != nil {
				if contentData, exists := event.Data["content"]; exists {
					if content, ok := contentData.(string); ok {
						cleanContent := contentCleaner.CleanAgentOutput(content)
						if cleanContent != "" {
							// Show full LLM content without truncation
							l.printAndLog("   💬 %s\n", cleanContent)
						}
					}
				}
			}

		case "tool_call_started":
			l.printAndLog("%s %s %s %s\n", timestamp, icon, agentName, message)
			// Show tool details if available
			if event.Data != nil {
				if toolName, exists := event.Data["tool_name"]; exists {
					if toolNameStr, ok := toolName.(string); ok {
						l.printAndLog("   🔧 Tool: %s\n", toolNameStr)
					}
				}
			}

		case "tool_call_completed":
			l.printAndLog("%s %s %s %s\n", timestamp, icon, agentName, message)

		case "execution_completed":
			l.printAndLog("%s 🎉 %s Flow completed successfully\n", timestamp, agentName)
			return &ExecutionCompleteError{}

		case "execution_failed":
			l.printAndLog("%s ❌ %s Flow execution failed: %s\n", timestamp, agentName, message)
			return &ExecutionCompleteError{}

		case "execution_cancelled":
			l.printAndLog("%s ⚠️ %s Flow execution cancelled\n", timestamp, agentName)
			return &ExecutionCompleteError{}

		case "llm_streaming_chunk", "heartbeat":
			// Skip high-frequency events - the final llm_response event will contain the complete content

		default:
			l.printAndLog("%s %s %s %s\n", timestamp, icon, agentName, message)
		}

		return nil
	})

	// Handle completion or error
	if err != nil {
		completionTime := time.Now().Format("15:04:05")
		l.printAndLog("%s ❌ [Assistant] Streaming error: %v\n", completionTime, err)
		return err
	}

	// Don't add extra completion message - the SSE events handle this
	return nil
}

// getAgentInfo extracts agent information from event data
func (l *SimpleRealTimeLogger) getAgentInfo(data map[string]interface{}) AgentInfo {
	if data == nil {
		return AgentInfo{Name: "Assistant", Color: l.cfg.GetSystemColor("agent")}
	}

	// First try agent_name directly
	if agentName, exists := data["agent_name"]; exists {
		if name, ok := agentName.(string); ok && name != "" {
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
	possibleKeys := []string{"agent_id", "agentId", "agent", "step_agent_id"}
	for _, key := range possibleKeys {
		if agentID, exists := data[key]; exists {
			if aid, ok := agentID.(string); ok && aid != "" {
				// Try exact match first by ID
				for _, agent := range l.agents {
					if agent.Name == aid {
						return AgentInfo{
							Name:  agent.Name,
							Color: l.cfg.GetAgentColor(agent.Color),
						}
					}
				}

				// Try to find agent by partial name match
				for _, agent := range l.agents {
					if strings.Contains(strings.ToLower(agent.Name), strings.ToLower(aid)) {
						return AgentInfo{
							Name:  agent.Name,
							Color: l.cfg.GetAgentColor(agent.Color),
						}
					}
				}

				// If the ID looks like a MongoDB ObjectID (24 hex chars), show a cleaner name
				if len(aid) == 24 && isHexString(aid) {
					return AgentInfo{
						Name:  fmt.Sprintf("Agent-%s", aid[:8]), // Show first 8 chars
						Color: l.cfg.GetSystemColor("agent"),
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

// setupLogFile creates the log file in pod_runs directory
func (l *SimpleRealTimeLogger) setupLogFile() error {
	// Create pod_runs directory if it doesn't exist
	if err := os.MkdirAll("pod_runs", 0755); err != nil {
		return fmt.Errorf("failed to create pod_runs directory: %w", err)
	}

	// Create filename with timestamp and execution ID
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	filename := fmt.Sprintf("%s_%s_%s.log",
		strings.ReplaceAll(l.flowName, " ", "_"),
		timestamp,
		l.executionID[:8]) // Use first 8 chars of execution ID

	filepath := filepath.Join("pod_runs", filename)

	// Create log file
	var err error
	l.logFile, err = os.Create(filepath)
	if err != nil {
		return fmt.Errorf("failed to create log file: %w", err)
	}

	// Create multi-writer for both stdout and file (but strip ANSI codes from file)
	l.logWriter = l.logFile

	// Write header to log file
	fmt.Fprintf(l.logFile, "=== HNL Pods CLI Execution Log ===\n")
	fmt.Fprintf(l.logFile, "Flow: %s\n", l.flowName)
	fmt.Fprintf(l.logFile, "Execution ID: %s\n", l.executionID)
	fmt.Fprintf(l.logFile, "Started: %s\n", time.Now().Format("2006-01-02 15:04:05"))
	fmt.Fprintf(l.logFile, "Variables: %v\n", l.variables)
	fmt.Fprintf(l.logFile, "=====================================\n\n")

	if l.cfg.Verbose {
		fmt.Printf("📝 Logging output to: %s\n", filepath)
	}

	return nil
}

// closeLogFile closes the log file
func (l *SimpleRealTimeLogger) closeLogFile() {
	if l.logFile != nil {
		fmt.Fprintf(l.logFile, "\n=== Execution completed at %s ===\n", time.Now().Format("2006-01-02 15:04:05"))
		l.logFile.Close()
	}
}

// printAndLog prints to stdout and logs to file (strips ANSI codes from file)
func (l *SimpleRealTimeLogger) printAndLog(format string, args ...interface{}) {
	// Print to stdout with colors
	fmt.Printf(format, args...)

	// Log to file without ANSI colors if logWriter is available
	if l.logWriter != nil && l.logWriter != io.Discard {
		// Strip ANSI codes for clean file output
		cleanText := l.stripANSICodes(fmt.Sprintf(format, args...))
		fmt.Fprint(l.logWriter, cleanText)
	}
}

// stripANSICodes removes ANSI color codes from text
func (l *SimpleRealTimeLogger) stripANSICodes(text string) string {
	// Simple regex replacement for ANSI escape sequences
	// This is a basic implementation - could be enhanced with a proper regex
	result := text

	// Remove common ANSI escape sequences
	ansiPrefixes := []string{
		"\x1b[", "\033[",
	}

	for _, prefix := range ansiPrefixes {
		for {
			start := strings.Index(result, prefix)
			if start == -1 {
				break
			}

			// Find the end of the ANSI sequence (usually ends with 'm')
			end := start + len(prefix)
			for end < len(result) && result[end] != 'm' {
				end++
			}
			if end < len(result) {
				end++ // Include the 'm'
			}

			// Remove the ANSI sequence
			result = result[:start] + result[end:]
		}
	}

	return result
}

// startSpinner starts the simple manual spinner
func (l *SimpleRealTimeLogger) startSpinner() {
	go func() {
		ticker := time.NewTicker(100 * time.Millisecond) // Update every 100ms for smooth animation
		defer ticker.Stop()

		for {
			select {
			case <-l.spinnerStop:
				return
			case <-ticker.C:
				l.completeMux.RLock()
				isComplete := l.isComplete
				l.completeMux.RUnlock()

				if isComplete {
					return
				}

				// Get current frame and style it
				frame := l.spinnerFrames[l.spinnerIndex]
				styledFrame := lipgloss.NewStyle().
					Foreground(lipgloss.Color("205")).
					Render(frame)

				// Clear line and print spinner at bottom
				fmt.Printf("\r%s Executing flow...", styledFrame)

				// Advance to next frame
				l.spinnerIndex = (l.spinnerIndex + 1) % len(l.spinnerFrames)
			}
		}
	}()
}

// stopSpinner stops the spinner
func (l *SimpleRealTimeLogger) stopSpinner() {
	l.completeMux.Lock()
	l.isComplete = true
	l.completeMux.Unlock()

	// Signal spinner to stop
	select {
	case l.spinnerStop <- true:
	default:
	}

	// Clear spinner line
	fmt.Print("\r" + strings.Repeat(" ", 50) + "\r")
}

// getAgentName extracts agent name from event data (legacy method)
func (l *SimpleRealTimeLogger) getAgentName(data map[string]interface{}) string {
	agentInfo := l.getAgentInfo(data)
	return agentInfo.Name
}

// getEventIcon returns appropriate icon for event type
func (l *SimpleRealTimeLogger) getEventIcon(eventType string) string {
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
		return "🔧"
	case "flow_started":
		return "🚀"
	case "flow_completed":
		return "🎉"
	case "flow_failed":
		return "💥"
	case "agent_started":
		return "🤖"
	case "agent_completed":
		return "✨"
	case "connection_started":
		return "🔗"
	default:
		return "ℹ️"
	}
}

// loadAgentDetails attempts to load agent details from the flow (best effort)
func (l *SimpleRealTimeLogger) loadAgentDetails() {
	// This is a simple logger, so we don't have access to API client
	// Agent details loading is handled by the fullscreen logger
	// For simple logger, we'll rely on the event data directly
}
