package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/lipgloss"
)

// Component interfaces for reusable UI elements

// TextInput creates a styled text input component
func NewTextInput(placeholder string) textinput.Model {
	ti := textinput.New()
	ti.Placeholder = placeholder
	ti.PlaceholderStyle = MutedStyle
	ti.TextStyle = BodyStyle
	ti.Cursor.Style = lipgloss.NewStyle().Foreground(CurrentTheme.Primary)
	ti.CompletionStyle = lipgloss.NewStyle().Foreground(CurrentTheme.Secondary)
	return ti
}

// PasswordInput creates a styled password input component
func NewPasswordInput(placeholder string) textinput.Model {
	ti := NewTextInput(placeholder)
	ti.EchoMode = textinput.EchoPassword
	ti.EchoCharacter = '•'
	return ti
}

// Spinner creates a themed spinner
func NewSpinner() spinner.Model {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = SpinnerStyle
	return s
}

// ProgressBar represents a progress bar component
type ProgressBar struct {
	Width    int
	Progress float64 // 0.0 to 1.0
	ShowText bool
	Text     string
}

// NewProgressBar creates a new progress bar
func NewProgressBar(width int) *ProgressBar {
	return &ProgressBar{
		Width:    width,
		Progress: 0.0,
		ShowText: true,
	}
}

// Render renders the progress bar
func (p *ProgressBar) Render() string {
	if p.Width <= 0 {
		return ""
	}

	filled := int(float64(p.Width) * p.Progress)
	if filled > p.Width {
		filled = p.Width
	}

	fillStr := strings.Repeat("█", filled)
	emptyStr := strings.Repeat("░", p.Width-filled)
	bar := ProgressFillStyle.Render(fillStr) + ProgressBarStyle.Render(emptyStr)

	if p.ShowText {
		percentage := fmt.Sprintf("%.0f%%", p.Progress*100)
		if p.Text != "" {
			text := fmt.Sprintf("%s %s", p.Text, percentage)
			return JoinVertical("", bar, CenterHorizontal(p.Width, text))
		}
		return JoinVertical("", bar, CenterHorizontal(p.Width, percentage))
	}

	return bar
}

// SetProgress updates the progress (0.0 to 1.0)
func (p *ProgressBar) SetProgress(progress float64) {
	if progress < 0 {
		progress = 0
	}
	if progress > 1 {
		progress = 1
	}
	p.Progress = progress
}

// List represents a selectable list component
type List struct {
	Items    []ListItem
	Selected int
	Height   int
	Offset   int
	Title    string
	ShowHelp bool
}

// ListItem represents an item in a list
type ListItem struct {
	Title       string
	Description string
	Value       interface{}
	Icon        string
	Status      string
}

// NewList creates a new list
func NewList(title string, items []ListItem) *List {
	return &List{
		Items:    items,
		Selected: 0,
		Height:   10,
		Offset:   0,
		Title:    title,
		ShowHelp: true,
	}
}

// Render renders the list
func (l *List) Render() string {
	if len(l.Items) == 0 {
		return MutedStyle.Render("No items to display")
	}

	var content []string

	// Add title if present
	if l.Title != "" {
		content = append(content, TitleStyle.Render(l.Title))
		content = append(content, "")
	}

	// Calculate visible range
	start := l.Offset
	end := start + l.Height
	if end > len(l.Items) {
		end = len(l.Items)
	}

	// Render visible items
	for i := start; i < end; i++ {
		item := l.Items[i]
		var style lipgloss.Style
		var prefix string

		if i == l.Selected {
			style = ListItemSelectedStyle
			prefix = "▶ "
		} else {
			style = ListItemStyle
			prefix = "  "
		}

		icon := item.Icon
		if icon == "" && item.Status != "" {
			icon = StatusIcon(item.Status)
		}
		if icon != "" {
			icon += " "
		}

		title := fmt.Sprintf("%s%s%s", prefix, icon, item.Title)
		line := style.Render(title)

		if item.Description != "" && i == l.Selected {
			desc := MutedStyle.Render("  " + item.Description)
			line = JoinVertical("", line, desc)
		}

		content = append(content, line)
	}

	// Add help text
	if l.ShowHelp {
		content = append(content, "")
		help := HelpStyle.Render("↑/↓ navigate • enter select • q quit")
		content = append(content, help)
	}

	return JoinVertical("", content...)
}

// MoveUp moves selection up
func (l *List) MoveUp() {
	if l.Selected > 0 {
		l.Selected--
		if l.Selected < l.Offset {
			l.Offset = l.Selected
		}
	}
}

// MoveDown moves selection down
func (l *List) MoveDown() {
	if l.Selected < len(l.Items)-1 {
		l.Selected++
		if l.Selected >= l.Offset+l.Height {
			l.Offset = l.Selected - l.Height + 1
		}
	}
}

// GetSelected returns the currently selected item
func (l *List) GetSelected() *ListItem {
	if l.Selected < 0 || l.Selected >= len(l.Items) {
		return nil
	}
	return &l.Items[l.Selected]
}

// Form represents a form component
type Form struct {
	Title    string
	Fields   []FormField
	Selected int
	ShowHelp bool
	Width    int // Add width for centering
}

// FormField represents a field in a form
type FormField struct {
	Label      string
	Input      textinput.Model
	Required   bool
	Validation func(string) error
	Help       string
}

// NewForm creates a new form
func NewForm(title string) *Form {
	return &Form{
		Title:    title,
		Fields:   []FormField{},
		Selected: 0,
		ShowHelp: true,
		Width:    80, // Default width
	}
}

// AddField adds a field to the form
func (f *Form) AddField(label, placeholder string, required bool) {
	input := NewTextInput(placeholder)
	field := FormField{
		Label:    label,
		Input:    input,
		Required: required,
	}
	f.Fields = append(f.Fields, field)
}

// AddPasswordField adds a password field to the form
func (f *Form) AddPasswordField(label, placeholder string, required bool) {
	input := NewPasswordInput(placeholder)
	field := FormField{
		Label:    label,
		Input:    input,
		Required: required,
	}
	f.Fields = append(f.Fields, field)
}

// Render renders the form
func (f *Form) Render() string {
	var content []string

	// Add title using Lipgloss centering
	if f.Title != "" {
		titleStr := TitleStyle.Render(f.Title)
		// Use Lipgloss PlaceHorizontal for proper centering
		centeredTitle := lipgloss.PlaceHorizontal(f.Width, lipgloss.Center, titleStr)
		content = append(content, centeredTitle)
		content = append(content, "")
	}

	// Render fields
	for i, field := range f.Fields {
		var labelStyle lipgloss.Style
		var inputStyle lipgloss.Style

		if i == f.Selected {
			labelStyle = SuccessStyle
			inputStyle = InputFocusedStyle
		} else {
			labelStyle = BodyStyle
			inputStyle = InputStyle
		}

		// Add required indicator
		label := field.Label
		if field.Required {
			label += " *"
		}

		labelStr := labelStyle.Render(label)
		inputStr := inputStyle.Render(field.Input.View())

		// Create field content with proper spacing
		fieldContent := lipgloss.JoinVertical(lipgloss.Left, labelStr, inputStr)

		// Add help text if focused
		if i == f.Selected && field.Help != "" {
			help := HelpStyle.Render(field.Help)
			fieldContent = lipgloss.JoinVertical(lipgloss.Left, fieldContent, help)
		}

		// Center the entire field using Lipgloss
		centeredField := lipgloss.PlaceHorizontal(f.Width, lipgloss.Center, fieldContent)
		content = append(content, centeredField)
		content = append(content, "")
	}

	// Add help using Lipgloss centering
	if f.ShowHelp {
		help := HelpStyle.Render("tab/shift+tab navigate • enter submit • esc cancel")
		centeredHelp := lipgloss.PlaceHorizontal(f.Width, lipgloss.Center, help)
		content = append(content, centeredHelp)
	}

	// Join all content with proper alignment
	return lipgloss.JoinVertical(lipgloss.Left, content...)
}

// MoveNext moves to next field
func (f *Form) MoveNext() {
	if f.Selected < len(f.Fields)-1 {
		f.Fields[f.Selected].Input.Blur()
		f.Selected++
		f.Fields[f.Selected].Input.Focus()
	}
}

// MovePrev moves to previous field
func (f *Form) MovePrev() {
	if f.Selected > 0 {
		f.Fields[f.Selected].Input.Blur()
		f.Selected--
		f.Fields[f.Selected].Input.Focus()
	}
}

// Focus focuses the current field
func (f *Form) Focus() {
	if len(f.Fields) > 0 && f.Selected >= 0 && f.Selected < len(f.Fields) {
		f.Fields[f.Selected].Input.Focus()
	}
}

// Blur blurs all fields
func (f *Form) Blur() {
	for i := range f.Fields {
		f.Fields[i].Input.Blur()
	}
}

// GetValues returns all field values
func (f *Form) GetValues() map[string]string {
	values := make(map[string]string)
	for _, field := range f.Fields {
		values[field.Label] = field.Input.Value()
	}
	return values
}

// Validate validates all fields
func (f *Form) Validate() []error {
	var errors []error
	for _, field := range f.Fields {
		value := field.Input.Value()

		// Check required
		if field.Required && strings.TrimSpace(value) == "" {
			errors = append(errors, fmt.Errorf("%s is required", field.Label))
		}

		// Custom validation
		if field.Validation != nil {
			if err := field.Validation(value); err != nil {
				errors = append(errors, err)
			}
		}
	}
	return errors
}

// Notification represents a temporary notification
type Notification struct {
	Message   string
	Type      string // success, error, warning, info
	Duration  time.Duration
	StartTime time.Time
}

// NewNotification creates a new notification
func NewNotification(message, notificationType string, duration time.Duration) *Notification {
	return &Notification{
		Message:   message,
		Type:      notificationType,
		Duration:  duration,
		StartTime: time.Now(),
	}
}

// IsExpired checks if notification has expired
func (n *Notification) IsExpired() bool {
	return time.Since(n.StartTime) > n.Duration
}

// Render renders the notification
func (n *Notification) Render() string {
	var style lipgloss.Style
	var icon string

	switch n.Type {
	case "success":
		style = SuccessStyle
		icon = "✅"
	case "error":
		style = ErrorStyle
		icon = "❌"
	case "warning":
		style = WarningStyle
		icon = "⚠️"
	default:
		style = InfoStyle
		icon = "ℹ️"
	}

	content := fmt.Sprintf("%s %s", icon, n.Message)
	return style.Render(content)
}
