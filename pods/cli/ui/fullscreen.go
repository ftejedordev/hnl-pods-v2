package ui

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// FullscreenModel wraps content to provide fullscreen centered display
type FullscreenModel struct {
	content     string
	width       int
	height      int
	title       string
	borderStyle lipgloss.Style
	titleStyle  lipgloss.Style
}

// NewFullscreenModel creates a new fullscreen model
func NewFullscreenModel(title, content string) *FullscreenModel {
	return &FullscreenModel{
		title:   title,
		content: content,
		borderStyle: lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#874BFD")).
			Padding(1, 2),
		titleStyle: lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#FAFAFA")).
			Background(lipgloss.Color("#874BFD")).
			Padding(0, 1),
	}
}

// Init implements tea.Model
func (m *FullscreenModel) Init() tea.Cmd {
	return tea.EnterAltScreen
}

// Update implements tea.Model
func (m *FullscreenModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			return m, tea.Sequence(tea.ExitAltScreen, tea.Quit)
		}
	}
	return m, nil
}

// View implements tea.Model
func (m *FullscreenModel) View() string {
	if m.width == 0 || m.height == 0 {
		return "Loading..."
	}

	// Create title bar
	title := m.titleStyle.Render(m.title)

	// Create content with border
	contentWithBorder := m.borderStyle.
		Width(m.width - 4).
		Height(m.height - 6).
		Render(m.content)

	// Center the content
	centeredTitle := lipgloss.Place(m.width, 1, lipgloss.Center, lipgloss.Top, title)
	centeredContent := lipgloss.Place(m.width, m.height-3, lipgloss.Center, lipgloss.Center, contentWithBorder)

	// Help text
	help := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#626262")).
		Render("Press 'q', 'esc', or 'ctrl+c' to exit")
	centeredHelp := lipgloss.Place(m.width, 2, lipgloss.Center, lipgloss.Bottom, help)

	return lipgloss.JoinVertical(lipgloss.Left, centeredTitle, centeredContent, centeredHelp)
}

// RunFullscreen runs content in fullscreen mode
func RunFullscreen(title, content string) error {
	model := NewFullscreenModel(title, content)
	p := tea.NewProgram(model, tea.WithAltScreen())
	_, err := p.Run()
	return err
}

// FullscreenRenderer provides utilities for fullscreen display
type FullscreenRenderer struct {
	width  int
	height int
}

// NewFullscreenRenderer creates a new fullscreen renderer
func NewFullscreenRenderer() *FullscreenRenderer {
	return &FullscreenRenderer{}
}

// SetSize sets the terminal size
func (r *FullscreenRenderer) SetSize(width, height int) {
	r.width = width
	r.height = height
}

// CenterContent centers content both horizontally and vertically
func (r *FullscreenRenderer) CenterContent(content string) string {
	if r.width == 0 || r.height == 0 {
		return content
	}

	lines := strings.Split(content, "\n")

	// Calculate vertical padding
	contentHeight := len(lines)
	verticalPadding := (r.height - contentHeight) / 2
	if verticalPadding < 0 {
		verticalPadding = 0
	}

	// Add vertical padding
	var result []string
	for i := 0; i < verticalPadding; i++ {
		result = append(result, "")
	}

	// Center each line horizontally
	for _, line := range lines {
		centered := lipgloss.Place(r.width, 1, lipgloss.Center, lipgloss.Center, line)
		result = append(result, centered)
	}

	// Add remaining vertical padding
	for len(result) < r.height {
		result = append(result, "")
	}

	return strings.Join(result, "\n")
}
