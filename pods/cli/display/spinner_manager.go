package display

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// SpinnerManager manages a simple spinner without fullscreen mode
type SpinnerManager struct {
	spinner   spinner.Model
	isRunning bool
	message   string
	program   *tea.Program
	ctx       context.Context
	cancel    context.CancelFunc
}

// NewSpinnerManager creates a new spinner manager
func NewSpinnerManager() *SpinnerManager {
	s := spinner.New()
	s.Spinner = spinner.Moon
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	ctx, cancel := context.WithCancel(context.Background())

	return &SpinnerManager{
		spinner:   s,
		isRunning: false,
		message:   "Processing...",
		ctx:       ctx,
		cancel:    cancel,
	}
}

// Start starts the spinner with a given message
func (sm *SpinnerManager) Start(message string) {
	if sm.isRunning {
		return
	}

	sm.isRunning = true
	sm.message = message

	// Create a simple tea program without alt screen
	sm.program = tea.NewProgram(sm)

	// Run the spinner in a goroutine
	go func() {
		if _, err := sm.program.Run(); err != nil {
			// Silently handle errors
		}
	}()

	// Give the spinner a moment to start
	time.Sleep(10 * time.Millisecond)
}

// UpdateMessage updates the spinner message
func (sm *SpinnerManager) UpdateMessage(message string) {
	sm.message = message
	if sm.program != nil {
		sm.program.Send(updateMessageMsg{message: message})
	}
}

// Stop stops the spinner
func (sm *SpinnerManager) Stop() {
	if !sm.isRunning {
		return
	}

	sm.isRunning = false
	sm.cancel()

	if sm.program != nil {
		sm.program.Send(tea.Quit())
		sm.program.Kill()
	}

	// Clear the spinner line
	fmt.Print("\r" + strings.Repeat(" ", 50) + "\r")
}

// updateMessageMsg is a message to update the spinner text
type updateMessageMsg struct {
	message string
}

// Init implements tea.Model
func (sm *SpinnerManager) Init() tea.Cmd {
	return sm.spinner.Tick
}

// Update implements tea.Model
func (sm *SpinnerManager) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		// Allow Ctrl+C to quit
		if msg.Type == tea.KeyCtrlC {
			return sm, tea.Quit
		}

	case updateMessageMsg:
		sm.message = msg.message
		return sm, nil

	case spinner.TickMsg:
		if sm.isRunning {
			var cmd tea.Cmd
			sm.spinner, cmd = sm.spinner.Update(msg)
			return sm, cmd
		}
		return sm, nil

	case tea.QuitMsg:
		return sm, tea.Quit
	}

	// Check context cancellation
	select {
	case <-sm.ctx.Done():
		return sm, tea.Quit
	default:
	}

	return sm, nil
}

// View implements tea.Model
func (sm *SpinnerManager) View() string {
	if !sm.isRunning {
		return ""
	}

	// Create spinner line that overwrites itself
	spinnerLine := fmt.Sprintf("\r%s %s", sm.spinner.View(), sm.message)
	return spinnerLine
}
