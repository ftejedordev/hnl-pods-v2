package display

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

// ClipboardManager handles copying content to system clipboard
type ClipboardManager struct {
	buffer []string // Store all output for copying
}

// NewClipboardManager creates a new clipboard manager
func NewClipboardManager() *ClipboardManager {
	return &ClipboardManager{
		buffer: make([]string, 0),
	}
}

// AddToBuffer adds content to the buffer for later copying
func (cm *ClipboardManager) AddToBuffer(content string) {
	cm.buffer = append(cm.buffer, content)
}

// GetFullBuffer returns the complete buffer content
func (cm *ClipboardManager) GetFullBuffer() string {
	return strings.Join(cm.buffer, "\n")
}

// ClearBuffer clears the current buffer
func (cm *ClipboardManager) ClearBuffer() {
	cm.buffer = make([]string, 0)
}

// CopyToClipboard copies the full buffer to system clipboard
func (cm *ClipboardManager) CopyToClipboard() error {
	content := cm.GetFullBuffer()
	if content == "" {
		return fmt.Errorf("no content to copy")
	}

	return copyToSystemClipboard(content)
}

// copyToSystemClipboard handles cross-platform clipboard copying
func copyToSystemClipboard(content string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin": // macOS
		cmd = exec.Command("pbcopy")
	case "linux":
		// Try xclip first, then xsel as fallback
		if _, err := exec.LookPath("xclip"); err == nil {
			cmd = exec.Command("xclip", "-selection", "clipboard")
		} else if _, err := exec.LookPath("xsel"); err == nil {
			cmd = exec.Command("xsel", "--clipboard", "--input")
		} else {
			return fmt.Errorf("no clipboard utility found (xclip or xsel required on Linux)")
		}
	case "windows":
		cmd = exec.Command("clip")
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	cmd.Stdin = strings.NewReader(content)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to copy to clipboard: %w", err)
	}

	return nil
}

// ClipboardStats returns information about the buffer
func (cm *ClipboardManager) ClipboardStats() (int, int) {
	lines := len(cm.buffer)
	chars := len(cm.GetFullBuffer())
	return lines, chars
}
