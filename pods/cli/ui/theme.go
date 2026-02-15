package ui

import (
	"os"
	"strconv"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Theme represents the CLI color theme
type Theme struct {
	// Primary purple colors (matching web UI)
	Primary      lipgloss.Color
	PrimaryLight lipgloss.Color
	PrimaryDark  lipgloss.Color

	// Secondary purple variations
	Secondary      lipgloss.Color
	SecondaryLight lipgloss.Color
	SecondaryDark  lipgloss.Color

	// Functional colors
	Success lipgloss.Color
	Warning lipgloss.Color
	Error   lipgloss.Color
	Info    lipgloss.Color

	// Grayscale with purple tint
	Foreground lipgloss.Color
	Background lipgloss.Color
	Muted      lipgloss.Color
	MutedDark  lipgloss.Color
	Border     lipgloss.Color

	// UI element colors
	Focus    lipgloss.Color
	Selected lipgloss.Color
	Disabled lipgloss.Color

	// Terminal capabilities
	HasTrueColor bool
	Has256Color  bool
	IsLightTheme bool
}

// NewTheme creates a new adaptive theme based on terminal capabilities
func NewTheme() *Theme {
	theme := &Theme{
		HasTrueColor: detectTrueColor(),
		Has256Color:  detect256Color(),
		IsLightTheme: detectLightTheme(),
	}

	theme.initColors()
	return theme
}

// initColors initializes all colors based on terminal capabilities
func (t *Theme) initColors() {
	if t.HasTrueColor {
		t.initTrueColors()
	} else if t.Has256Color {
		t.init256Colors()
	} else {
		t.initBasicColors()
	}
}

// initTrueColors sets up terminal-compatible theme using default colors
func (t *Theme) initTrueColors() {
	// Monochromatic purple theme
	t.Primary = "#8B5CF6"      // Purple
	t.PrimaryLight = "#A78BFA" // Light purple
	t.PrimaryDark = "#7C3AED"  // Dark purple

	// Secondary variations using purple shades
	t.Secondary = "#6366F1"      // Indigo purple
	t.SecondaryLight = "#818CF8" // Light indigo purple
	t.SecondaryDark = "#4F46E5"  // Dark indigo purple

	// Functional colors - minimal color palette
	t.Success = "#10B981" // Green (keep for success)
	t.Warning = "#A855F7" // Light purple for warnings
	t.Error = "#EF4444"   // Red (keep for errors)
	t.Info = "#6366F1"    // Purple-blue for info

	// Grayscale with purple tint
	t.Foreground = ""       // Terminal default foreground
	t.Background = ""       // Terminal default background
	t.Muted = "#6B7280"     // Gray
	t.MutedDark = "#4B5563" // Dark gray
	t.Border = "#6366F1"    // Purple border

	// Interactive states with purple theme
	t.Focus = "#8B5CF6"    // Purple focus
	t.Selected = ""        // Use reverse attribute
	t.Disabled = "#6B7280" // Gray for disabled
}

// init256Colors sets up 256-color theme using terminal-compatible colors
func (t *Theme) init256Colors() {
	// Purple theme using 256-color palette
	t.Primary = "141"      // Purple (256-color)
	t.PrimaryLight = "177" // Light purple
	t.PrimaryDark = "135"  // Dark purple

	t.Secondary = "105"      // Blue-purple
	t.SecondaryLight = "141" // Light blue-purple
	t.SecondaryDark = "99"   // Dark blue-purple

	// Functional colors - minimal palette
	t.Success = "2"   // Green
	t.Warning = "141" // Purple for warnings
	t.Error = "1"     // Red
	t.Info = "105"    // Blue-purple

	// Grayscale
	t.Foreground = "" // Terminal default
	t.Background = "" // Terminal default
	t.Muted = "8"     // Bright black (gray)
	t.MutedDark = "0" // Black
	t.Border = "105"  // Blue-purple border

	// Interactive states
	t.Focus = "141"  // Purple
	t.Selected = ""  // Use reverse
	t.Disabled = "8" // Bright black (gray)
}

// initBasicColors sets up basic 16-color theme using terminal defaults
func (t *Theme) initBasicColors() {
	// Use basic ANSI colors - purple theme with magenta
	t.Primary = "5"       // Magenta (closest to purple)
	t.PrimaryLight = "13" // Bright magenta
	t.PrimaryDark = "5"   // Magenta

	t.Secondary = "4"       // Blue (complementary)
	t.SecondaryLight = "12" // Bright blue
	t.SecondaryDark = "4"   // Blue

	// Functional colors - minimal palette
	t.Success = "2"  // Green
	t.Warning = "13" // Bright magenta for warnings
	t.Error = "1"    // Red
	t.Info = "4"     // Blue

	// Grayscale
	t.Foreground = "" // Terminal default foreground
	t.Background = "" // Terminal default background
	t.Muted = "8"     // Bright black (gray)
	t.MutedDark = "0" // Black
	t.Border = "5"    // Magenta border

	// Interactive states
	t.Focus = "5"    // Magenta
	t.Selected = ""  // Use reverse
	t.Disabled = "8" // Bright black (gray)
}

// detectTrueColor checks if terminal supports 24-bit color
func detectTrueColor() bool {
	colorTerm := os.Getenv("COLORTERM")
	return strings.Contains(colorTerm, "truecolor") || strings.Contains(colorTerm, "24bit")
}

// detect256Color checks if terminal supports 256 colors
func detect256Color() bool {
	term := os.Getenv("TERM")
	colors := os.Getenv("COLORS")

	// Check COLORS environment variable
	if colors != "" {
		if colorCount, err := strconv.Atoi(colors); err == nil && colorCount >= 256 {
			return true
		}
	}

	// Check TERM environment variable
	return strings.Contains(term, "256") ||
		strings.Contains(term, "color") ||
		term == "xterm" ||
		term == "screen"
}

// detectLightTheme attempts to detect if terminal has light background
func detectLightTheme() bool {
	// This is tricky - we'll use some heuristics
	_ = os.Getenv("TERM") // Reserved for future use
	background := os.Getenv("COLORFGBG")

	// Parse COLORFGBG (foreground;background)
	if background != "" {
		parts := strings.Split(background, ";")
		if len(parts) >= 2 {
			if bg, err := strconv.Atoi(parts[1]); err == nil {
				// Light background colors are typically 7, 15, or high numbers
				return bg == 7 || bg == 15 || bg > 230
			}
		}
	}

	// Default to dark theme (most terminals are dark)
	// In a real implementation, we could query the terminal for background color
	return false
}

// Global theme instance
var CurrentTheme *Theme

// init initializes the global theme
func init() {
	CurrentTheme = NewTheme()
	InitStyles()
}
