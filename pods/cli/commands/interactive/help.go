package interactive

import (
	"fmt"
	"strings"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// InteractiveHelpModel represents the interactive help state
type InteractiveHelpModel struct {
	cfg        *config.Config
	viewport   viewport.Model
	sections   []HelpSection
	currentSec int
	width      int
	height     int
	ready      bool
	flowName   string
	flowHelp   *client.FlowHelp
	apiClient  *client.APIClient
}

// HelpSection represents a section of help content
type HelpSection struct {
	Title   string
	Content string
}

// NewInteractiveHelpModel creates a new interactive help model
func NewInteractiveHelpModel(cfg *config.Config, flowName string) *InteractiveHelpModel {
	m := &InteractiveHelpModel{
		cfg:        cfg,
		currentSec: 0,
		viewport:   viewport.New(80, 20), // Will be resized
		flowName:   flowName,
		apiClient:  client.NewAPIClient(cfg),
	}

	// If we have a flow name, try to load flow details
	if flowName != "" {
		m.loadFlowHelp()
	}

	sections := m.buildHelpSections()
	m.sections = sections

	return m
}

// RunInteractiveHelp runs the interactive help interface
func RunInteractiveHelp(cfg *config.Config, flowName string) error {
	model := NewInteractiveHelpModel(cfg, flowName)
	p := tea.NewProgram(model, tea.WithAltScreen())
	_, err := p.Run()
	return err
}

// loadFlowHelp loads flow help information from the API
func (m *InteractiveHelpModel) loadFlowHelp() {
	if m.apiClient == nil {
		return
	}

	// Test API connection first
	if err := m.apiClient.TestConnection(); err != nil {
		return // Silently fail, will show generic help
	}

	// Get flow help information
	flowHelp, err := m.apiClient.GetFlowHelp(m.flowName)
	if err != nil {
		return // Silently fail, will show generic help
	}

	m.flowHelp = flowHelp
}

// buildHelpSections creates the help sections
func (m *InteractiveHelpModel) buildHelpSections() []HelpSection {
	if m.flowName != "" {
		if m.flowHelp != nil {
			// Build comprehensive flow help from API data
			return m.buildFlowHelpSections()
		}

		// Fallback to generic help if API call failed
		return []HelpSection{
			{
				Title: "Flow-Specific Help",
				Content: fmt.Sprintf(`# Flow Help: %s

This feature requires API connection to fetch flow details.
Make sure you're authenticated and connected to the API.

Use 'pod login' to authenticate if needed.

## Quick Commands:
- pod run %s key1 value1 key2 value2
- pod help %s
- pod list

Press 'q' or Ctrl+C to exit.`, m.flowName, m.flowName, m.flowName),
			},
		}
	}

	return m.buildGeneralHelpSections()
}

// buildFlowHelpSections builds detailed help sections from flow data
func (m *InteractiveHelpModel) buildFlowHelpSections() []HelpSection {
	if m.flowHelp == nil {
		return []HelpSection{}
	}

	var sections []HelpSection

	// Overview section
	overviewContent := fmt.Sprintf(`# Flow: %s

%s

## Usage
%s

**Example:**
%s`, m.flowHelp.Name, m.flowHelp.Description, m.flowHelp.Usage.Command, m.flowHelp.Usage.Example)

	sections = append(sections, HelpSection{
		Title:   "Overview",
		Content: overviewContent,
	})

	// Variables section
	if len(m.flowHelp.Variables) > 0 {
		var variablesContent strings.Builder
		variablesContent.WriteString("# Variables\n\n")

		for key, defaultValue := range m.flowHelp.Variables {
			if defaultValue != nil {
				variablesContent.WriteString(fmt.Sprintf("**%s** (default: %v)\n", key, defaultValue))
			} else {
				variablesContent.WriteString(fmt.Sprintf("**%s** (required)\n", key))
			}
		}

		sections = append(sections, HelpSection{
			Title:   "Variables",
			Content: variablesContent.String(),
		})
	}

	// Agents section
	if len(m.flowHelp.Agents) > 0 {
		var agentsContent strings.Builder
		agentsContent.WriteString("# Agents\n\n")

		for _, agent := range m.flowHelp.Agents {
			agentsContent.WriteString(fmt.Sprintf("## %s\n", agent.Name))
			if agent.Description != "" {
				agentsContent.WriteString(fmt.Sprintf("%s\n\n", agent.Description))
			}

			if len(agent.MCPConnections) > 0 {
				agentsContent.WriteString(fmt.Sprintf("**Tools:** %s\n\n", strings.Join(agent.MCPConnections, ", ")))
			}
		}

		sections = append(sections, HelpSection{
			Title:   "Agents",
			Content: agentsContent.String(),
		})
	}

	// Flow Structure section
	if len(m.flowHelp.Steps) > 0 {
		var structureContent strings.Builder
		structureContent.WriteString("# Flow Structure\n\n")

		if m.flowHelp.StartStep != "" {
			structureContent.WriteString(fmt.Sprintf("**Start:** %s\n\n", m.flowHelp.StartStep))
		}

		for i, step := range m.flowHelp.Steps {
			structureContent.WriteString(fmt.Sprintf("## %d. %s\n", i+1, step.Name))
			if step.Description != "" {
				structureContent.WriteString(fmt.Sprintf("%s\n", step.Description))
			}

			// Find agent name
			if agent, exists := m.flowHelp.Agents[step.Agent]; exists {
				structureContent.WriteString(fmt.Sprintf("**Agent:** %s\n", agent.Name))
			} else {
				structureContent.WriteString(fmt.Sprintf("**Agent:** %s\n", step.Agent))
			}

			if len(step.NextSteps) > 0 {
				structureContent.WriteString(fmt.Sprintf("**Next:** %s\n", strings.Join(step.NextSteps, ", ")))
			}
			structureContent.WriteString("\n")
		}

		sections = append(sections, HelpSection{
			Title:   "Structure",
			Content: structureContent.String(),
		})
	}

	return sections
}

// buildGeneralHelpSections builds the general help sections
func (m *InteractiveHelpModel) buildGeneralHelpSections() []HelpSection {
	return []HelpSection{
		{
			Title: "Overview",
			Content: `# 🚀 HNL Pods CLI

Execute and monitor agent flows with real-time streaming output.

The HNL Pods CLI is a powerful command-line interface that allows you to:
- Execute agent flows with real-time monitoring
- Manage your API configuration
- Authenticate with the HNL Pods API
- View detailed flow information and help

## Key Features:
✨ Real-time streaming execution with colored output
🎯 Agent-specific status tracking with proper names
🔄 Automatic retry with exponential backoff
📊 Predictive summaries (with OpenRouter integration)
🎨 Beautiful fullscreen interface`,
		},
		{
			Title: "Main Commands",
			Content: `# 📋 Main Commands

## pod run <flow> [key value ...]
Execute a flow with variables

**Examples:**
• pod run myflow issue "#123" task "Fix bug"
• pod run myflow --timeout 600 key1 value1
• pod run myflow --no-stream key1 value1
• pod run myflow --no-fullscreen key1 value1

**Options:**
- --timeout, -t    Execution timeout in seconds (default: 300)
- --no-stream      Execute without real-time streaming
- --no-fullscreen  Disable fullscreen mode

## pod list
List available flows

**Examples:**
• pod list
• pod list --all

## pod help [flow]
Show general help or flow-specific help

**Examples:**
• pod help
• pod help myflow
• pod help --no-interactive

## pod config
Manage CLI configuration

**Examples:**
• pod config                    # Interactive config editor
• pod config set api <endpoint> # Set API endpoint
• pod config set token <token>  # Set auth token
• pod config show              # Show current config

## pod login
Authenticate with the API

**Examples:**
• pod login                              # Interactive login
• pod login -u myuser -p --no-interactive # Non-interactive`,
		},
		{
			Title: "Quick Start",
			Content: `# 🏃 Quick Start Guide

## 1. Configure the CLI
First, set up your API connection:

pod config set api http://localhost:8000
pod config set token your-jwt-token

Or use the interactive configuration:
pod config

## 2. Authenticate (if needed)
If you don't have a token, log in:

pod login

## 3. List Available Flows
See what flows are available:

pod list

## 4. Get Help for a Specific Flow
Learn about a flow's parameters and agents:

pod help myflow

## 5. Execute a Flow
Run a flow with variables:

pod run myflow issue "#123" task "Fix authentication bug"

## 6. Monitor Execution
Watch real-time progress with:
- Colored agent names
- Live event streaming
- Spinner animations
- Completion status`,
		},
		{
			Title: "Configuration",
			Content: `# ⚙️ Configuration

## Required Settings:
- **api**: API server endpoint (e.g., http://localhost:8000)
- **token**: JWT authentication token

## Optional Settings:
- **openrouter-key**: For enhanced predictive summaries
- **timeout**: Default execution timeout in seconds (default: 300)
- **verbose**: Enable detailed logging (default: false)

## Configuration Methods:

### Interactive Configuration:
pod config

### Command Line:
pod config set api http://localhost:8000
pod config set token your-jwt-token
pod config set openrouter-key sk-or-v1-...
pod config set timeout 600
pod config set verbose true

### View Current Config:
pod config show

### Reset to Defaults:
pod config reset

## Configuration File Location:
The configuration is stored in your home directory:
~/.config/pods-cli/config.json

## Color Scheme:
The CLI supports customizable colors for different elements:
- success: Green tones for success messages
- error: Red tones for error messages  
- info: Blue tones for informational messages
- agent: Default color for agent names`,
		},
		{
			Title: "OpenRouter Integration",
			Content: `# 🤖 OpenRouter Integration

For better predictive summaries, configure OpenRouter:

pod config set openrouter-key sk-or-v1-...

## Benefits:
- **Enhanced Predictions**: Uses GPT-4o Mini for intelligent summaries
- **Fast Response**: ~530ms average response time
- **Cost Effective**: ~$0.00015 per 1K tokens
- **Smart Fallback**: Falls back to templates if not configured

## Setup:
1. Get an API key from OpenRouter (https://openrouter.ai)
2. Configure it in the CLI:
   pod config set openrouter-key sk-or-v1-your-key-here

## Features:
- Predictive flow summaries
- Intelligent agent behavior descriptions
- Context-aware help text
- Enhanced error messages

## Privacy:
- Only metadata is sent to OpenRouter
- No sensitive flow data is transmitted
- Configurable and optional`,
		},
		{
			Title: "Advanced Usage",
			Content: `# 🚀 Advanced Usage

## Execution Modes:

### Fullscreen Mode (Default):
- Beautiful centered interface
- Real-time event streaming
- Colored agent names
- Spinner animations
- Keyboard navigation

### Simple Mode:
pod run myflow --no-fullscreen key value

### Non-Streaming Mode:
pod run myflow --no-stream key value

## Keyboard Shortcuts:

### During Execution:
- **Ctrl+C** or **q**: Exit execution
- **Arrow Keys**: Navigate help sections

### In Forms:
- **Tab/Shift+Tab**: Navigate between fields
- **Enter**: Submit form
- **Ctrl+C** or **q**: Cancel

## Environment Variables:
- **PODS_CLI_CONFIG**: Custom config file path  
- **PODS_CLI_API**: Default API endpoint
- **PODS_CLI_TOKEN**: Default JWT token

## Debugging:
Enable verbose mode for detailed logging:
pod config set verbose true

Or use the verbose flag:
pod -v run myflow key value

## Agent Colors:
Agents are displayed with their configured colors:
- Each agent has a unique color
- Colors are cached for consistency
- Fallback colors for unknown agents`,
		},
		{
			Title: "Troubleshooting",
			Content: `# 🔧 Troubleshooting

## Connection Issues:

### "Failed to connect to API"
1. Check your API endpoint: pod config show
2. Verify the server is running
3. Test with curl: curl <your-api-endpoint>/health

### "Authentication failed"
1. Check your token: pod config show
2. Login again: pod login
3. Verify token validity

## Execution Issues:

### "Flow not found"
1. List available flows: pod list
2. Check flow name spelling
3. Verify you have access to the flow

### "Timeout"
1. Increase timeout: pod run myflow --timeout 600
2. Check flow complexity
3. Verify network connection

## Display Issues:

### "Terminal too small"
- Resize terminal window
- Use --no-fullscreen flag
- Try simple mode

### "Colors not showing"
- Check terminal color support
- Update terminal software
- Use standard terminal colors

## Configuration Issues:

### "Config file not found"
- Run: pod config
- Check permissions in ~/.config/
- Reset config: pod config reset

### "Invalid configuration"
- Validate JSON format
- Reset config: pod config reset
- Reconfigure: pod config

## Getting Help:
- General help: pod help
- Flow help: pod help <flow-name>
- Configuration: pod config show
- Verbose logging: pod -v <command>

## Support:
For additional support, check:
- API server logs
- Network connectivity
- Authentication status
- Flow configuration`,
		},
	}
}

// Init implements tea.Model
func (m *InteractiveHelpModel) Init() tea.Cmd {
	return nil
}

// Update implements tea.Model
func (m *InteractiveHelpModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

		if !m.ready {
			// Initialize viewport with proper size
			m.viewport = viewport.New(msg.Width-4, msg.Height-8)
			m.viewport.HighPerformanceRendering = false
			m.updateViewportContent()
			m.ready = true
		} else {
			m.viewport.Width = msg.Width - 4
			m.viewport.Height = msg.Height - 8
		}

		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit

		case "left", "h":
			if m.currentSec > 0 {
				m.currentSec--
				m.updateViewportContent()
			}
			return m, nil

		case "right", "l":
			if m.currentSec < len(m.sections)-1 {
				m.currentSec++
				m.updateViewportContent()
			}
			return m, nil

		case "home":
			m.currentSec = 0
			m.updateViewportContent()
			return m, nil

		case "end":
			m.currentSec = len(m.sections) - 1
			m.updateViewportContent()
			return m, nil
		}
	}

	// Handle viewport scrolling
	m.viewport, cmd = m.viewport.Update(msg)
	return m, cmd
}

// updateViewportContent updates the viewport with current section content
func (m *InteractiveHelpModel) updateViewportContent() {
	if m.currentSec >= 0 && m.currentSec < len(m.sections) {
		content := m.renderContent(m.sections[m.currentSec].Content)
		m.viewport.SetContent(content)
		m.viewport.GotoTop()
	}
}

// renderContent renders the markdown-like content with styling
func (m *InteractiveHelpModel) renderContent(content string) string {
	lines := strings.Split(content, "\n")
	var rendered []string

	for _, line := range lines {
		switch {
		case strings.HasPrefix(line, "# "):
			// Main headers
			header := lipgloss.NewStyle().
				Foreground(lipgloss.AdaptiveColor{Light: "#FFFFFF", Dark: "#FAFAFA"}).
				Background(lipgloss.Color("#874BFD")).
				Bold(true).
				Padding(0, 1).
				Render(line[2:])
			rendered = append(rendered, header)

		case strings.HasPrefix(line, "## "):
			// Sub headers
			header := lipgloss.NewStyle().
				Foreground(lipgloss.AdaptiveColor{Light: "#7C3AED", Dark: "#874BFD"}).
				Bold(true).
				Render(line[3:])
			rendered = append(rendered, header)

		case strings.HasPrefix(line, "**") && strings.HasSuffix(line, "**"):
			// Bold text
			bold := lipgloss.NewStyle().
				Foreground(lipgloss.AdaptiveColor{Light: "#1F2937", Dark: "#F9FAFB"}).
				Bold(true).
				Render(line[2 : len(line)-2])
			rendered = append(rendered, bold)

		case strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "• "):
			// List items with different color for bullet and text
			bulletStyle := lipgloss.NewStyle().
				Foreground(lipgloss.AdaptiveColor{Light: "#7C3AED", Dark: "#A78BFA"}).
				Bold(true)
			textStyle := lipgloss.NewStyle().
				Foreground(lipgloss.AdaptiveColor{Light: "#374151", Dark: "#FAFAFA"})

			// Split bullet from text
			parts := strings.SplitN(line, " ", 2)
			if len(parts) == 2 {
				styledLine := bulletStyle.Render(parts[0]) + " " + textStyle.Render(parts[1])
				rendered = append(rendered, styledLine)
			} else {
				item := textStyle.Render(line)
				rendered = append(rendered, item)
			}

		case strings.Contains(line, "pod ") && (strings.Contains(line, "run") || strings.Contains(line, "list") || strings.Contains(line, "help") || strings.Contains(line, "config") || strings.Contains(line, "login")):
			// Command examples - highlight commands
			commandStyle := lipgloss.NewStyle().
				Foreground(lipgloss.AdaptiveColor{Light: "#059669", Dark: "#10B981"}).
				Background(lipgloss.AdaptiveColor{Light: "#F0FDF4", Dark: "#064E3B"}).
				Padding(0, 1).
				Bold(true)
			rendered = append(rendered, commandStyle.Render(line))

		default:
			// Regular text with special handling for certain patterns
			if strings.TrimSpace(line) == "" {
				rendered = append(rendered, "")
			} else if strings.Contains(line, ":") && !strings.HasPrefix(line, " ") {
				// Key-value pairs or labels (like "Usage:", "Example:")
				keyValueStyle := lipgloss.NewStyle().
					Foreground(lipgloss.AdaptiveColor{Light: "#D97706", Dark: "#F59E0B"}).
					Bold(true)
				rendered = append(rendered, keyValueStyle.Render(line))
			} else if strings.HasPrefix(line, "    ") || strings.HasPrefix(line, "\t") {
				// Indented text (likely code or examples)
				codeStyle := lipgloss.NewStyle().
					Foreground(lipgloss.AdaptiveColor{Light: "#059669", Dark: "#10B981"}).
					Background(lipgloss.AdaptiveColor{Light: "#F9FAFB", Dark: "#1F2937"}).
					Padding(0, 1)
				rendered = append(rendered, codeStyle.Render(strings.TrimLeft(line, " \t")))
			} else {
				// Regular text
				text := lipgloss.NewStyle().
					Foreground(lipgloss.AdaptiveColor{Light: "#4B5563", Dark: "#E5E7EB"}).
					Render(line)
				rendered = append(rendered, text)
			}
		}
	}

	return strings.Join(rendered, "\n")
}

// View implements tea.Model
func (m *InteractiveHelpModel) View() string {
	if !m.ready {
		return "Loading..."
	}

	// Create title
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#FAFAFA")).
		Background(lipgloss.Color("#874BFD")).
		Padding(0, 1).
		Render("📚 HNL Pods CLI Help")

	// Create section navigation with better spacing and adaptive colors
	var navItems []string
	for i, section := range m.sections {
		// Use adaptive colors that work in both light and dark modes
		inactiveStyle := lipgloss.NewStyle().
			Foreground(lipgloss.AdaptiveColor{Light: "#6B7280", Dark: "#9CA3AF"}).
			Padding(0, 2) // Add horizontal padding for better spacing

		activeStyle := lipgloss.NewStyle().
			Foreground(lipgloss.AdaptiveColor{Light: "#FFFFFF", Dark: "#FAFAFA"}).
			Background(lipgloss.AdaptiveColor{Light: "#4B5563", Dark: "#374151"}).
			Bold(true).
			Padding(0, 2) // Add horizontal padding for better spacing

		if i == m.currentSec {
			navItems = append(navItems, activeStyle.Render(fmt.Sprintf("%d. %s", i+1, section.Title)))
		} else {
			navItems = append(navItems, inactiveStyle.Render(fmt.Sprintf("%d. %s", i+1, section.Title)))
		}
	}

	// Add spacing between navigation items
	navigation := lipgloss.JoinHorizontal(lipgloss.Left, navItems...)

	// Create content area
	content := m.viewport.View()

	// Create footer with instructions
	footerText := fmt.Sprintf("Section %d/%d • ← → or h/l: Navigate sections • ↑ ↓: Scroll • q: Exit",
		m.currentSec+1, len(m.sections))
	footer := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#6B7280")).
		Render(footerText)

	// Layout
	main := lipgloss.JoinVertical(lipgloss.Left,
		navigation,
		"",
		content,
	)

	// Create content container without border
	container := lipgloss.NewStyle().
		Padding(1, 2).
		Width(m.width - 4).
		Height(m.height - 6).
		Render(main)

	// Center everything
	centeredTitle := lipgloss.Place(m.width, 1, lipgloss.Center, lipgloss.Top, title)
	centeredContainer := lipgloss.Place(m.width, m.height-3, lipgloss.Center, lipgloss.Center, container)
	centeredFooter := lipgloss.Place(m.width, 2, lipgloss.Center, lipgloss.Bottom, footer)

	return lipgloss.JoinVertical(lipgloss.Left, centeredTitle, centeredContainer, centeredFooter)
}
