package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

// RuntimeInfo represents the runtime port file written by Tauri
type RuntimeInfo struct {
	BackendPort int    `json:"backend_port"`
	PID         int    `json:"pid"`
	StartedAt   string `json:"started_at"`
}

// RuntimeFilePath returns the path to the runtime file
func RuntimeFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "pods-cli", "runtime.json"), nil
}

// LoadRuntimeInfo reads and validates the runtime file.
// Returns nil, nil if the file does not exist or is stale.
func LoadRuntimeInfo() (*RuntimeInfo, error) {
	runtimePath, err := RuntimeFilePath()
	if err != nil {
		return nil, nil
	}

	data, err := os.ReadFile(runtimePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to read runtime file: %w", err)
	}

	var info RuntimeInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, nil
	}

	if info.BackendPort < 1 || info.BackendPort > 65535 {
		return nil, nil
	}

	if !isProcessAlive(info.PID) {
		_ = os.Remove(runtimePath)
		return nil, nil
	}

	// Reject files older than 7 days as a safety net
	if info.StartedAt != "" {
		if t, err := time.Parse(time.RFC3339, info.StartedAt); err == nil {
			if time.Since(t) > 7*24*time.Hour {
				_ = os.Remove(runtimePath)
				return nil, nil
			}
		}
	}

	return &info, nil
}

// isProcessAlive checks if a process with the given PID exists.
func isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Unix, Signal(0) checks existence without affecting the process.
	err = process.Signal(syscall.Signal(0))
	return err == nil
}
