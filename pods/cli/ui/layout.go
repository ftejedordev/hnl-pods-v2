package ui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// CenteredView centers content both horizontally and vertically
func CenteredView(width, height int, content string) string {
	if width <= 0 || height <= 0 {
		return content
	}

	// Calculate content dimensions
	lines := strings.Split(content, "\n")
	contentHeight := len(lines)
	contentWidth := 0
	for _, line := range lines {
		lineWidth := lipgloss.Width(line)
		if lineWidth > contentWidth {
			contentWidth = lineWidth
		}
	}

	// Calculate padding for centering
	horizontalPadding := (width - contentWidth) / 2
	if horizontalPadding < 0 {
		horizontalPadding = 0
	}

	verticalPadding := (height - contentHeight) / 2
	if verticalPadding < 0 {
		verticalPadding = 0
	}

	// Apply horizontal centering to each line
	centeredLines := make([]string, len(lines))
	for i, line := range lines {
		centeredLines[i] = strings.Repeat(" ", horizontalPadding) + line
	}

	// Apply vertical centering
	centeredContent := strings.Join(centeredLines, "\n")
	if verticalPadding > 0 {
		topPadding := strings.Repeat("\n", verticalPadding)
		centeredContent = topPadding + centeredContent
	}

	return centeredContent
}

// CenteredHorizontal centers content horizontally within given width
func CenteredHorizontal(width int, content string) string {
	if width <= 0 {
		return content
	}

	lines := strings.Split(content, "\n")
	centeredLines := make([]string, len(lines))

	for i, line := range lines {
		lineWidth := lipgloss.Width(line)
		padding := (width - lineWidth) / 2
		if padding < 0 {
			padding = 0
		}
		centeredLines[i] = strings.Repeat(" ", padding) + line
	}

	return strings.Join(centeredLines, "\n")
}

// CenteredVertical centers content vertically within given height
func CenteredVertical(height int, content string) string {
	if height <= 0 {
		return content
	}

	lines := strings.Split(content, "\n")
	contentHeight := len(lines)

	padding := (height - contentHeight) / 2
	if padding < 0 {
		padding = 0
	}

	if padding > 0 {
		topPadding := strings.Repeat("\n", padding)
		return topPadding + content
	}

	return content
}

// MaxWidth constrains content to maximum width with word wrapping
func MaxWidth(width int, content string) string {
	if width <= 0 {
		return content
	}

	lines := strings.Split(content, "\n")
	wrappedLines := make([]string, 0)

	for _, line := range lines {
		if lipgloss.Width(line) <= width {
			wrappedLines = append(wrappedLines, line)
		} else {
			// Simple word wrapping
			words := strings.Fields(line)
			currentLine := ""

			for _, word := range words {
				testLine := currentLine
				if testLine != "" {
					testLine += " "
				}
				testLine += word

				if lipgloss.Width(testLine) <= width {
					currentLine = testLine
				} else {
					if currentLine != "" {
						wrappedLines = append(wrappedLines, currentLine)
					}
					currentLine = word
				}
			}

			if currentLine != "" {
				wrappedLines = append(wrappedLines, currentLine)
			}
		}
	}

	return strings.Join(wrappedLines, "\n")
}

// ResponsiveContainer creates a responsive container that adapts to terminal size
func ResponsiveContainer(width, height int, content string) string {
	// Add some margins
	containerWidth := width - 4   // 2 spaces on each side
	containerHeight := height - 4 // 2 lines on top and bottom

	if containerWidth < 20 {
		containerWidth = 20
	}
	if containerHeight < 5 {
		containerHeight = 5
	}

	// Constrain content width
	constrainedContent := MaxWidth(containerWidth, content)

	// Center the content
	centeredContent := CenteredView(width, height, constrainedContent)

	return centeredContent
}

// BoxContent creates a bordered box around content
func BoxContent(content string) string {
	return ContainerStyle.Render(content)
}

// TitleBox creates a titled box with border
func TitleBox(title, content string) string {
	titleLine := TitleStyle.Render(title)
	boxContent := JoinVertical("", titleLine, "", content)
	return BoxContent(boxContent)
}

// StatusBox creates a status message box with appropriate styling
func StatusBox(status, message string) string {
	var style lipgloss.Style
	var icon string

	switch status {
	case "success":
		style = SuccessStyle
		icon = "✅"
	case "error":
		style = ErrorStyle
		icon = "❌"
	case "warning":
		style = WarningStyle
		icon = "⚠️"
	case "info":
		style = InfoStyle
		icon = "ℹ️"
	default:
		style = BodyStyle
		icon = "•"
	}

	content := style.Render(icon + " " + message)
	return BoxContent(content)
}
