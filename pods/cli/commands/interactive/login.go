package interactive

import (
	"fmt"
	"strings"

	"pods-cli/client"
	"pods-cli/config"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"
)

// InteractiveLoginModel represents the interactive login state
type InteractiveLoginModel struct {
	cfg       *config.Config
	form      *huh.Form
	spinner   spinner.Model
	state     loginState
	error     error
	apiClient *client.APIClient
	width     int
	height    int
	username  string
	password  string
}

type loginState int

const (
	stateForm loginState = iota
	stateLoading
	stateSuccess
	stateError
)

// NewInteractiveLoginModel creates a new interactive login model
func NewInteractiveLoginModel(cfg *config.Config) *InteractiveLoginModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	m := &InteractiveLoginModel{
		cfg:       cfg,
		spinner:   s,
		state:     stateForm,
		apiClient: client.NewAPIClient(cfg),
		width:     80,
		height:    24,
	}

	// Create Huh form with proper configuration and centering
	m.form = huh.NewForm(
		huh.NewGroup(
			huh.NewInput().
				Title("Username").
				Prompt("🔑 ").
				Value(&m.username).
				Validate(func(str string) error {
					if str == "" {
						return fmt.Errorf("username cannot be empty")
					}
					return nil
				}),

			huh.NewInput().
				Title("Password").
				Prompt("🔒 ").
				Password(true).
				Value(&m.password).
				Validate(func(str string) error {
					if str == "" {
						return fmt.Errorf("password cannot be empty")
					}
					return nil
				}),
		),
	).WithWidth(60).WithHeight(10)

	return m
}

// RunInteractiveLogin runs the interactive login interface
func RunInteractiveLogin(cfg *config.Config) error {
	model := NewInteractiveLoginModel(cfg)
	p := tea.NewProgram(model, tea.WithAltScreen())
	_, err := p.Run()
	return err
}

// LoginResultMsg represents the result of a login attempt
type LoginResultMsg struct {
	Success bool
	Error   error
	Token   string
}

// Init implements tea.Model
func (m *InteractiveLoginModel) Init() tea.Cmd {
	return tea.Batch(
		m.form.Init(),
		m.spinner.Tick,
	)
}

// Update implements tea.Model
func (m *InteractiveLoginModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			if m.state == stateForm {
				return m, tea.Quit
			}
		}

	case LoginResultMsg:
		if msg.Success {
			m.state = stateSuccess
			// Save token to config
			if err := m.cfg.SaveToken(msg.Token); err != nil {
				m.error = fmt.Errorf("failed to save token: %w", err)
				m.state = stateError
			}
		} else {
			m.state = stateError
			m.error = msg.Error
		}
		return m, nil

	case spinner.TickMsg:
		if m.state == stateLoading {
			var cmd tea.Cmd
			m.spinner, cmd = m.spinner.Update(msg)
			return m, cmd
		}
	}

	switch m.state {
	case stateForm:
		form, cmd := m.form.Update(msg)
		if f, ok := form.(*huh.Form); ok {
			m.form = f
		}

		// Check if form is completed
		if m.form.State == huh.StateCompleted {
			m.state = stateLoading
			return m, m.performLogin()
		}

		return m, cmd

	case stateSuccess, stateError:
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

// performLogin performs the actual login
func (m *InteractiveLoginModel) performLogin() tea.Cmd {
	return func() tea.Msg {
		loginResp, err := m.apiClient.Login(m.username, m.password)
		if err != nil {
			if strings.Contains(err.Error(), "401") {
				return LoginResultMsg{
					Success: false,
					Error:   fmt.Errorf("incorrect username or password"),
				}
			}
			return LoginResultMsg{
				Success: false,
				Error:   fmt.Errorf("login failed: %w", err),
			}
		}

		return LoginResultMsg{
			Success: true,
			Token:   loginResp.AccessToken,
		}
	}
}

// View implements tea.Model
func (m *InteractiveLoginModel) View() string {
	if m.width == 0 || m.height == 0 {
		return "Loading..."
	}

	// Create title
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#FAFAFA")).
		Background(lipgloss.Color("#874BFD")).
		Padding(0, 1).
		Render("🔐 HNL Pods Login")

	var content string

	switch m.state {
	case stateForm:
		content = m.form.View()

	case stateLoading:
		content = lipgloss.NewStyle().
			Foreground(lipgloss.Color("14")).
			Render(fmt.Sprintf("%s Authenticating...", m.spinner.View()))

	case stateSuccess:
		content = lipgloss.NewStyle().
			Foreground(lipgloss.Color("2")).
			Render("✅ Successfully authenticated!\n\nJWT token saved to configuration.\nPress Enter or 'q' to exit.")

	case stateError:
		errorStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("9"))
		content = errorStyle.Render(fmt.Sprintf("❌ Authentication failed:\n%v\n\nPress Enter or 'q' to exit.", m.error))
	}

	// Footer
	var footer string
	switch m.state {
	case stateForm:
		footer = "Press Ctrl+C or 'q' to exit"
	case stateLoading:
		footer = "Please wait..."
	default:
		footer = "Press Enter or 'q' to exit"
	}

	footerStyled := lipgloss.NewStyle().
		Foreground(lipgloss.Color("244")).
		Render(footer)

	// Create content container without border
	container := lipgloss.NewStyle().
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
