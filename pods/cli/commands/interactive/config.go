package interactive

import (
	"fmt"
	"strconv"

	"pods-cli/config"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"
)

// InteractiveConfigModel represents the interactive config state
type InteractiveConfigModel struct {
	cfg     *config.Config
	form    *huh.Form
	spinner spinner.Model
	state   configState
	error   error
	width   int
	height  int

	// Form values
	apiEndpoint   string
	token         string
	openRouterKey string
	verbose       bool
	timeout       string
}

type configState int

const (
	configStateForm configState = iota
	configStateSaving
	configStateSuccess
	configStateError
)

// NewInteractiveConfigModel creates a new interactive config model
func NewInteractiveConfigModel(cfg *config.Config) *InteractiveConfigModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	m := &InteractiveConfigModel{
		cfg:     cfg,
		spinner: s,
		state:   configStateForm,
		width:   80,
		height:  24,
		// Initialize with current values
		apiEndpoint:   cfg.APIEndpoint,
		token:         cfg.Token,
		openRouterKey: cfg.OpenRouterKey,
		verbose:       cfg.Verbose,
		timeout:       fmt.Sprintf("%d", cfg.DefaultTimeout),
	}

	// Create Huh form with current configuration values
	m.form = huh.NewForm(
		huh.NewGroup(
			huh.NewInput().
				Title("API Endpoint").
				Prompt("🌐 ").
				Value(&m.apiEndpoint).
				Validate(func(str string) error {
					if str == "" {
						return fmt.Errorf("API endpoint cannot be empty")
					}
					return nil
				}),

			huh.NewInput().
				Title("JWT Token").
				Prompt("🔑 ").
				Value(&m.token).
				Description("Leave empty to keep current token"),

			huh.NewInput().
				Title("OpenRouter API Key").
				Prompt("🤖 ").
				Value(&m.openRouterKey).
				Description("Optional - for enhanced predictive summaries"),

			huh.NewInput().
				Title("Default Timeout (seconds)").
				Prompt("⏱️  ").
				Value(&m.timeout).
				Validate(func(str string) error {
					if str == "" {
						return fmt.Errorf("timeout cannot be empty")
					}
					if timeout, err := strconv.Atoi(str); err != nil {
						return fmt.Errorf("timeout must be a number")
					} else if timeout < 1 || timeout > 3600 {
						return fmt.Errorf("timeout must be between 1 and 3600 seconds")
					}
					return nil
				}),

			huh.NewConfirm().
				Title("Verbose Mode").
				Value(&m.verbose).
				Description("Enable detailed logging"),
		),
	)

	return m
}

// RunInteractiveConfig runs the interactive config interface
func RunInteractiveConfig(cfg *config.Config) error {
	model := NewInteractiveConfigModel(cfg)
	p := tea.NewProgram(model, tea.WithAltScreen())
	_, err := p.Run()
	return err
}

// ConfigSaveResultMsg represents the result of a config save attempt
type ConfigSaveResultMsg struct {
	Success bool
	Error   error
}

// Init implements tea.Model
func (m *InteractiveConfigModel) Init() tea.Cmd {
	return tea.Batch(
		m.form.Init(),
		m.spinner.Tick,
	)
}

// Update implements tea.Model
func (m *InteractiveConfigModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			if m.state == configStateForm {
				return m, tea.Quit
			}
		}

	case ConfigSaveResultMsg:
		if msg.Success {
			m.state = configStateSuccess
		} else {
			m.state = configStateError
			m.error = msg.Error
		}
		return m, nil

	case spinner.TickMsg:
		if m.state == configStateSaving {
			var cmd tea.Cmd
			m.spinner, cmd = m.spinner.Update(msg)
			return m, cmd
		}
	}

	switch m.state {
	case configStateForm:
		form, cmd := m.form.Update(msg)
		if f, ok := form.(*huh.Form); ok {
			m.form = f
		}

		// Check if form is completed
		if m.form.State == huh.StateCompleted {
			m.state = configStateSaving
			return m, m.saveConfig()
		}

		return m, cmd

	case configStateSuccess, configStateError:
		// Allow exit after showing result
		if key, ok := msg.(tea.KeyMsg); ok {
			switch key.String() {
			case "enter", "q", "ctrl+c":
				return m, tea.Quit
			}
		}
	}

	return m, nil
}

// saveConfig saves the configuration
func (m *InteractiveConfigModel) saveConfig() tea.Cmd {
	return func() tea.Msg {
		// Update config values
		m.cfg.APIEndpoint = m.apiEndpoint

		// Update token (allow clearing if empty)
		m.cfg.Token = m.token

		// Update OpenRouter key (allow clearing if empty)
		m.cfg.OpenRouterKey = m.openRouterKey

		// Update verbose setting (this is a boolean, so always set it)
		m.cfg.Verbose = m.verbose

		// Parse and update timeout
		if timeout, err := strconv.Atoi(m.timeout); err == nil {
			m.cfg.DefaultTimeout = timeout
		}

		// Save to file
		if err := m.cfg.Save(); err != nil {
			return ConfigSaveResultMsg{
				Success: false,
				Error:   fmt.Errorf("failed to save configuration: %w", err),
			}
		}

		return ConfigSaveResultMsg{Success: true}
	}
}

// View implements tea.Model
func (m *InteractiveConfigModel) View() string {
	if m.width == 0 || m.height == 0 {
		return "Loading..."
	}

	// Create title
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#FAFAFA")).
		Background(lipgloss.Color("#874BFD")).
		Padding(0, 1).
		Render("⚙️ CLI Configuration")

	var content string

	switch m.state {
	case configStateForm:
		content = m.form.View()

	case configStateSaving:
		content = lipgloss.NewStyle().
			Foreground(lipgloss.Color("14")).
			Render(fmt.Sprintf("%s Saving configuration...", m.spinner.View()))

	case configStateSuccess:
		content = lipgloss.NewStyle().
			Foreground(lipgloss.Color("2")).
			Render("✅ Configuration saved successfully!\n\nPress Enter or 'q' to exit.")

	case configStateError:
		errorStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("9"))
		content = errorStyle.Render(fmt.Sprintf("❌ Failed to save configuration:\n%v\n\nPress Enter or 'q' to exit.", m.error))
	}

	// Footer
	var footer string
	switch m.state {
	case configStateForm:
		footer = "Press Ctrl+C or 'q' to exit • Use Tab/Shift+Tab to navigate"
	case configStateSaving:
		footer = "Please wait..."
	default:
		footer = "Press Enter or 'q' to exit"
	}

	footerStyled := lipgloss.NewStyle().
		Foreground(lipgloss.Color("244")).
		Render(footer)

	// Create main container
	container := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#874BFD")).
		Padding(1, 2).
		Width(m.width - 4).
		Height(m.height - 6).
		Render(content)

	// Center everything
	centeredTitle := lipgloss.Place(m.width, 1, lipgloss.Center, lipgloss.Top, title)
	centeredContainer := lipgloss.Place(m.width, m.height-3, lipgloss.Center, lipgloss.Center, container)
	centeredFooter := lipgloss.Place(m.width, 2, lipgloss.Center, lipgloss.Bottom, footerStyled)

	return lipgloss.JoinVertical(lipgloss.Left, centeredTitle, centeredContainer, centeredFooter)
}
