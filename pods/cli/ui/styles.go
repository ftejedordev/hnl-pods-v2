package ui

import (
	"github.com/charmbracelet/lipgloss"
)

// Common style definitions using the adaptive theme
var (
	// Base styles
	BaseStyle lipgloss.Style

	// Header styles
	HeaderStyle    lipgloss.Style
	SubHeaderStyle lipgloss.Style

	// Text styles
	TitleStyle lipgloss.Style
	BodyStyle  lipgloss.Style
	MutedStyle lipgloss.Style

	// Interactive styles
	FocusedStyle  lipgloss.Style
	SelectedStyle lipgloss.Style
	BlurredStyle  lipgloss.Style

	// Input styles
	InputStyle        lipgloss.Style
	InputFocusedStyle lipgloss.Style

	// Button styles
	ButtonStyle         lipgloss.Style
	ButtonFocusedStyle  lipgloss.Style
	ButtonDisabledStyle lipgloss.Style

	// Status styles
	SuccessStyle lipgloss.Style
	ErrorStyle   lipgloss.Style
	WarningStyle lipgloss.Style
	InfoStyle    lipgloss.Style

	// List styles
	ListItemStyle         lipgloss.Style
	ListItemSelectedStyle lipgloss.Style
	ListItemFocusedStyle  lipgloss.Style

	// Container styles
	ContainerStyle lipgloss.Style
	PanelStyle     lipgloss.Style

	// Help styles
	HelpStyle lipgloss.Style
	KeyStyle  lipgloss.Style

	// Progress styles
	ProgressBarStyle  lipgloss.Style
	ProgressFillStyle lipgloss.Style

	// Spinner style
	SpinnerStyle lipgloss.Style
)

// InitStyles initializes all styles with the current theme
func InitStyles() {
	// Base styles
	BaseStyle = lipgloss.NewStyle()

	// Header styles
	HeaderStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Primary).
		Padding(1, 2).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Border)

	SubHeaderStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.PrimaryLight).
		Padding(0, 1)

	// Text styles
	TitleStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Primary).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Border).
		Padding(1, 2).
		Align(lipgloss.Center)

	BodyStyle = lipgloss.NewStyle().
		Foreground(CurrentTheme.Foreground)

	MutedStyle = lipgloss.NewStyle().
		Foreground(CurrentTheme.Muted).
		Italic(true)

	// Interactive styles
	FocusedStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Focus).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Focus).
		Padding(0, 1)

	SelectedStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Primary).
		Reverse(true). // Use reverse instead of background
		Padding(0, 1)

	BlurredStyle = lipgloss.NewStyle().
		Foreground(CurrentTheme.Muted).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Border).
		Padding(0, 1)

	// Input styles
	InputStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Border).
		Padding(0, 1).
		Width(30)

	InputFocusedStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Focus).
		Padding(0, 1).
		Width(30)

	// Button styles
	ButtonStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Background).
		Background(CurrentTheme.Primary).
		Padding(0, 3).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Primary)

	ButtonFocusedStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Background).
		Background(CurrentTheme.PrimaryLight).
		Padding(0, 3).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.PrimaryLight)

	ButtonDisabledStyle = lipgloss.NewStyle().
		Foreground(CurrentTheme.Disabled).
		Background(CurrentTheme.MutedDark).
		Padding(0, 3).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Disabled)

	// Status styles
	SuccessStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Success)

	ErrorStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Error)

	WarningStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Warning)

	InfoStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Info)

	// List styles
	ListItemStyle = lipgloss.NewStyle().
		Padding(0, 2)

	ListItemSelectedStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Primary).
		Reverse(true). // Use reverse instead of background
		Padding(0, 2)

	ListItemFocusedStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Focus).
		Border(lipgloss.NormalBorder(), false, false, false, true).
		BorderForeground(CurrentTheme.Focus).
		Padding(0, 1)

	// Container styles
	ContainerStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Border).
		Padding(1, 2)

	PanelStyle = lipgloss.NewStyle().
		Background(CurrentTheme.Background).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Border).
		Padding(1, 2).
		Margin(1)

	// Help styles
	HelpStyle = lipgloss.NewStyle().
		Foreground(CurrentTheme.Muted).
		Italic(true)

	KeyStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(CurrentTheme.Primary).
		Background(CurrentTheme.SecondaryLight).
		Padding(0, 1).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(CurrentTheme.Primary)

	// Progress styles
	ProgressBarStyle = lipgloss.NewStyle().
		Background(CurrentTheme.Border).
		Height(1)

	ProgressFillStyle = lipgloss.NewStyle().
		Background(CurrentTheme.Primary).
		Height(1)

	// Spinner style
	SpinnerStyle = lipgloss.NewStyle().
		Foreground(CurrentTheme.Primary)
}

// Dynamic style functions that adapt to content

// StatusIcon returns an appropriate icon for the given status
func StatusIcon(status string) string {
	switch status {
	case "success", "completed":
		return "✅"
	case "error", "failed":
		return "❌"
	case "warning":
		return "⚠️"
	case "info":
		return "ℹ️"
	case "loading", "running":
		return "🔄"
	case "pending":
		return "⏳"
	default:
		return "•"
	}
}

// AdaptWidth returns a style with adapted width
func AdaptWidth(base lipgloss.Style, width int) lipgloss.Style {
	return base.Width(width)
}

// AdaptHeight returns a style with adapted height
func AdaptHeight(base lipgloss.Style, height int) lipgloss.Style {
	return base.Height(height)
}

// JoinHorizontal joins strings horizontally with proper spacing
func JoinHorizontal(sep string, strs ...string) string {
	return lipgloss.JoinHorizontal(lipgloss.Left, strs...)
}

// JoinVertical joins strings vertically with proper spacing
func JoinVertical(sep string, strs ...string) string {
	return lipgloss.JoinVertical(lipgloss.Left, strs...)
}

// CenterHorizontal centers text horizontally within given width
func CenterHorizontal(width int, str string) string {
	return lipgloss.NewStyle().Width(width).Align(lipgloss.Center).Render(str)
}

// PadHorizontal adds horizontal padding
func PadHorizontal(padding int, str string) string {
	return lipgloss.NewStyle().PaddingLeft(padding).PaddingRight(padding).Render(str)
}

// Border creates a bordered container with the theme border color
func Border(content string) string {
	return ContainerStyle.Render(content)
}

// Section creates a titled section
func Section(title, content string) string {
	titleStr := SubHeaderStyle.Render(title)
	return JoinVertical("", titleStr, content)
}
