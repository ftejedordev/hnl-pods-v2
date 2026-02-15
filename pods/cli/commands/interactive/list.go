package interactive

import (
	"fmt"
	"strings"
	"time"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// InteractiveListModel represents the interactive flow list state
type InteractiveListModel struct {
	cfg          *config.Config
	viewport     viewport.Model
	flows        []client.Flow
	showAll      bool
	showInactive bool
	width        int
	height       int
	ready        bool
}

// KeyMap defines the key bindings for the list
type keyMap struct {
	Up     key.Binding
	Down   key.Binding
	Help   key.Binding
	Quit   key.Binding
	Toggle key.Binding
}

// ShortHelp returns keybindings to be shown in the mini help view
func (k keyMap) ShortHelp() []key.Binding {
	return []key.Binding{k.Help, k.Quit}
}

// FullHelp returns keybindings for the expanded help view
func (k keyMap) FullHelp() [][]key.Binding {
	return [][]key.Binding{
		{k.Up, k.Down},
		{k.Toggle, k.Help, k.Quit},
	}
}

var keys = keyMap{
	Up: key.NewBinding(
		key.WithKeys("up", "k"),
		key.WithHelp("↑/k", "up"),
	),
	Down: key.NewBinding(
		key.WithKeys("down", "j"),
		key.WithHelp("↓/j", "down"),
	),
	Help: key.NewBinding(
		key.WithKeys("?"),
		key.WithHelp("?", "toggle help"),
	),
	Quit: key.NewBinding(
		key.WithKeys("q", "ctrl+c"),
		key.WithHelp("q", "quit"),
	),
	Toggle: key.NewBinding(
		key.WithKeys("a"),
		key.WithHelp("a", "toggle all/active"),
	),
}

// NewInteractiveListModel creates a new interactive list model
func NewInteractiveListModel(cfg *config.Config, flows []client.Flow, showAll, showInactive bool) *InteractiveListModel {
	return &InteractiveListModel{
		cfg:          cfg,
		flows:        flows,
		showAll:      showAll,
		showInactive: showInactive,
		viewport:     viewport.New(80, 20), // Will be resized
	}
}

// RunInteractiveList runs the interactive list interface
func RunInteractiveList(cfg *config.Config, flows []client.Flow, showAll, showInactive bool) error {
	model := NewInteractiveListModel(cfg, flows, showAll, showInactive)
	p := tea.NewProgram(model, tea.WithAltScreen())
	_, err := p.Run()
	return err
}

// Init implements tea.Model
func (m *InteractiveListModel) Init() tea.Cmd {
	return nil
}

// Update implements tea.Model
func (m *InteractiveListModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
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
		switch {
		case key.Matches(msg, keys.Quit):
			return m, tea.Quit

		case key.Matches(msg, keys.Toggle):
			m.showAll = !m.showAll
			if m.showAll {
				m.showInactive = false
			}
			m.updateViewportContent()
			return m, nil
		}
	}

	// Handle viewport scrolling
	m.viewport, cmd = m.viewport.Update(msg)
	return m, cmd
}

// updateViewportContent updates the viewport with the flow list content
func (m *InteractiveListModel) updateViewportContent() {
	content := m.renderFlowsList()
	m.viewport.SetContent(content)
	m.viewport.GotoTop()
}

// renderFlowsList renders the flows list with styling
func (m *InteractiveListModel) renderFlowsList() string {
	var sb strings.Builder

	// Filter flows based on current settings
	filteredFlows := m.filterFlows()

	// Header
	headerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.AdaptiveColor{Light: "#FFFFFF", Dark: "#FAFAFA"}).
		Background(lipgloss.Color("#874BFD")).
		Bold(true).
		Padding(0, 1)

	sb.WriteString(headerStyle.Render("📋 Available Flows"))
	sb.WriteString("\n\n")

	if len(filteredFlows) == 0 {
		noFlowsStyle := lipgloss.NewStyle().
			Foreground(lipgloss.AdaptiveColor{Light: "#6B7280", Dark: "#9CA3AF"}).
			Italic(true)
		sb.WriteString(noFlowsStyle.Render("No flows found matching the criteria."))
		sb.WriteString("\n\n")
		sb.WriteString(noFlowsStyle.Render("💡 Tip: Press 'a' to toggle between showing all flows and active flows only."))
		return sb.String()
	}

	// Summary
	activeCount := 0
	inactiveCount := 0
	for _, flow := range filteredFlows {
		if flow.IsActive {
			activeCount++
		} else {
			inactiveCount++
		}
	}

	summaryStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("14")).
		Bold(true)

	var summaryText string
	if m.showAll {
		summaryText = fmt.Sprintf("Total: %d flows (%d active, %d inactive)",
			len(filteredFlows), activeCount, inactiveCount)
	} else if m.showInactive {
		summaryText = fmt.Sprintf("Inactive flows: %d", inactiveCount)
	} else {
		summaryText = fmt.Sprintf("Active flows: %d", activeCount)
	}

	sb.WriteString(summaryStyle.Render(summaryText))
	sb.WriteString("\n\n")

	// Flow list
	for i, flow := range filteredFlows {
		m.writeFlowContent(&sb, flow, i == len(filteredFlows)-1)
	}

	// Usage hints
	hintStyle := lipgloss.NewStyle().
		Foreground(lipgloss.AdaptiveColor{Light: "#6B7280", Dark: "#9CA3AF"}).
		Italic(true)

	sb.WriteString("\n")
	sb.WriteString(headerStyle.Render("💡 Usage Hints"))
	sb.WriteString("\n\n")
	sb.WriteString(hintStyle.Render("• Execute a flow: pod run <flow-name> <key> <value>..."))
	sb.WriteString("\n")
	sb.WriteString(hintStyle.Render("• Get flow help: pod help <flow-name>"))
	sb.WriteString("\n")
	sb.WriteString(hintStyle.Render("• Press 'a' to toggle showing all flows"))
	sb.WriteString("\n")

	return sb.String()
}

// writeFlowContent writes a single flow with styling
func (m *InteractiveListModel) writeFlowContent(sb *strings.Builder, flow client.Flow, isLast bool) {
	// Flow header
	nameStyle := lipgloss.NewStyle().
		Foreground(lipgloss.AdaptiveColor{Light: "#1F2937", Dark: "#FAFAFA"}).
		Bold(true).
		MarginBottom(1)

	statusStyle := lipgloss.NewStyle().
		Bold(true)

	var statusEmoji, statusText string
	if flow.IsActive {
		statusEmoji = "🟢"
		statusText = "Active"
		statusStyle = statusStyle.Foreground(lipgloss.Color("2")) // Green
	} else {
		statusEmoji = "🔴"
		statusText = "Inactive"
		statusStyle = statusStyle.Foreground(lipgloss.Color("9")) // Red
	}

	sb.WriteString(nameStyle.Render(fmt.Sprintf("%s %s", statusEmoji, flow.Name)))
	sb.WriteString("\n")
	sb.WriteString(statusStyle.Render(statusText))
	sb.WriteString("\n\n")

	// Description
	if flow.Description != "" {
		descStyle := lipgloss.NewStyle().
			Foreground(lipgloss.AdaptiveColor{Light: "#4B5563", Dark: "#E5E7EB"}).
			MarginBottom(1)
		sb.WriteString(descStyle.Render(flow.Description))
		sb.WriteString("\n\n")
	}

	// Details
	detailStyle := lipgloss.NewStyle().
		Foreground(lipgloss.AdaptiveColor{Light: "#6B7280", Dark: "#9CA3AF"})

	labelStyle := lipgloss.NewStyle().
		Foreground(lipgloss.AdaptiveColor{Light: "#D97706", Dark: "#F59E0B"}).
		Bold(true)

	// Agents
	if len(flow.Agents) > 0 {
		var agentNames []string
		for _, agent := range flow.Agents {
			agentNames = append(agentNames, agent.Name)
		}
		sb.WriteString(labelStyle.Render("Agents: "))
		sb.WriteString(detailStyle.Render(strings.Join(agentNames, ", ")))
		sb.WriteString("\n")
	}

	// Variables
	if len(flow.Variables) > 0 {
		var varNames []string
		for varName := range flow.Variables {
			varNames = append(varNames, varName)
		}
		sb.WriteString(labelStyle.Render("Variables: "))
		sb.WriteString(detailStyle.Render(strings.Join(varNames, ", ")))
		sb.WriteString("\n")
	}

	// Steps count
	sb.WriteString(labelStyle.Render("Steps: "))
	sb.WriteString(detailStyle.Render(fmt.Sprintf("%d", flow.StepsCount)))
	sb.WriteString("\n")

	// Tags
	if len(flow.Tags) > 0 {
		sb.WriteString(labelStyle.Render("Tags: "))
		sb.WriteString(detailStyle.Render(strings.Join(flow.Tags, ", ")))
		sb.WriteString("\n")
	}

	// Created date
	if !flow.CreatedAt.IsZero() {
		sb.WriteString(labelStyle.Render("Created: "))
		sb.WriteString(detailStyle.Render(formatTimeRelative(flow.CreatedAt.Time)))
		sb.WriteString("\n")
	}

	// Usage example
	exampleStyle := lipgloss.NewStyle().
		Foreground(lipgloss.AdaptiveColor{Light: "#374151", Dark: "#6B7280"}).
		Background(lipgloss.AdaptiveColor{Light: "#F3F4F6", Dark: "#1F2937"}).
		Padding(0, 1).
		MarginTop(1)

	usageCmd := fmt.Sprintf("pod run %s", flow.Name)
	if len(flow.Variables) > 0 {
		usageCmd += " <variables...>"
	}

	sb.WriteString("\n")
	sb.WriteString(labelStyle.Render("Usage: "))
	sb.WriteString(exampleStyle.Render(usageCmd))
	sb.WriteString("\n")

	if !isLast {
		// Separator
		separatorStyle := lipgloss.NewStyle().
			Foreground(lipgloss.AdaptiveColor{Light: "#D1D5DB", Dark: "#374151"})
		sb.WriteString("\n")
		sb.WriteString(separatorStyle.Render(strings.Repeat("─", 60)))
		sb.WriteString("\n\n")
	}
}

// filterFlows applies filtering based on current settings
func (m *InteractiveListModel) filterFlows() []client.Flow {
	if m.showAll {
		return m.flows
	}

	var filtered []client.Flow
	for _, flow := range m.flows {
		if m.showInactive {
			if !flow.IsActive {
				filtered = append(filtered, flow)
			}
		} else {
			if flow.IsActive {
				filtered = append(filtered, flow)
			}
		}
	}
	return filtered
}

// View implements tea.Model
func (m *InteractiveListModel) View() string {
	if !m.ready {
		return "Loading..."
	}

	// Create title
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.AdaptiveColor{Light: "#FFFFFF", Dark: "#FAFAFA"}).
		Background(lipgloss.Color("#874BFD")).
		Padding(0, 1)

	var titleText string
	if m.showAll {
		titleText = "📋 All Flows"
	} else if m.showInactive {
		titleText = "📋 Inactive Flows"
	} else {
		titleText = "📋 Active Flows"
	}

	title := titleStyle.Render(titleText)

	// Create content area
	content := m.viewport.View()

	// Create footer with instructions
	footerText := "↑ ↓: Scroll • a: Toggle all/active • q: Exit"
	footerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.AdaptiveColor{Light: "#6B7280", Dark: "#9CA3AF"})
	footer := footerStyle.Render(footerText)

	// Create content container without border
	containerStyle := lipgloss.NewStyle().
		Padding(1, 2).
		Width(m.width - 4).
		Height(m.height - 6)

	main := lipgloss.JoinVertical(lipgloss.Left, content)
	container := containerStyle.Render(main)

	// Center everything
	centeredTitle := lipgloss.Place(m.width, 1, lipgloss.Center, lipgloss.Top, title)
	centeredContainer := lipgloss.Place(m.width, m.height-3, lipgloss.Center, lipgloss.Center, container)
	centeredFooter := lipgloss.Place(m.width, 2, lipgloss.Center, lipgloss.Bottom, footer)

	return lipgloss.JoinVertical(lipgloss.Left, centeredTitle, centeredContainer, centeredFooter)
}

// formatTimeRelative formats a time relative to now
func formatTimeRelative(t time.Time) string {
	now := time.Now()
	diff := now.Sub(t)

	switch {
	case diff < time.Minute:
		return "just now"
	case diff < time.Hour:
		minutes := int(diff.Minutes())
		if minutes == 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", minutes)
	case diff < 24*time.Hour:
		hours := int(diff.Hours())
		if hours == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)
	case diff < 7*24*time.Hour:
		days := int(diff.Hours() / 24)
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	default:
		return t.Format("Jan 2, 2006")
	}
}
