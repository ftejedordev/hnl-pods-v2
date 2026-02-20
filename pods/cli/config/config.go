package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Config holds the CLI configuration
type Config struct {
	APIEndpoint    string            `json:"api_endpoint"`
	Token          string            `json:"token"`
	OpenRouterKey  string            `json:"openrouter_key"`
	Verbose        bool              `json:"verbose"`
	DefaultTimeout int               `json:"default_timeout"`
	ColorScheme    map[string]string `json:"color_scheme"`

	// Runtime flags (not persisted)
	JSONOutput      bool   `json:"-"`
	NoColor         bool   `json:"-"`
	RuntimeEndpoint string `json:"-"` // Discovered from Tauri's runtime.json
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	return &Config{
		APIEndpoint:    "http://localhost:8000",
		Token:          "",
		OpenRouterKey:  "",
		Verbose:        false,
		DefaultTimeout: 300,
		ColorScheme: map[string]string{
			"info":    "#3B82F6", // Blue
			"success": "#10B981", // Green
			"warning": "#F59E0B", // Amber
			"error":   "#EF4444", // Red
			"agent":   "#8B5CF6", // Purple
		},
	}
}

// ConfigPath returns the path to the configuration file
func ConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	configDir := filepath.Join(home, ".config", "pods-cli")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return "", err
	}

	return filepath.Join(configDir, "config.json"), nil
}

// Load loads the configuration from file, creating defaults if needed
func Load() (*Config, error) {
	configPath, err := ConfigPath()
	if err != nil {
		return DefaultConfig(), nil // Fallback to defaults
	}

	// If config doesn't exist, create defaults
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		cfg := DefaultConfig()
		if saveErr := cfg.Save(); saveErr != nil {
			// Log warning but continue with defaults
			return cfg, nil
		}
		return cfg, nil
	}

	// Load existing config
	data, err := os.ReadFile(configPath)
	if err != nil {
		return DefaultConfig(), nil // Fallback to defaults
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return DefaultConfig(), nil // Fallback to defaults
	}

	// Merge with defaults for any missing fields
	defaults := DefaultConfig()
	if cfg.APIEndpoint == "" {
		cfg.APIEndpoint = defaults.APIEndpoint
	}
	if cfg.DefaultTimeout == 0 {
		cfg.DefaultTimeout = defaults.DefaultTimeout
	}
	if cfg.ColorScheme == nil {
		cfg.ColorScheme = defaults.ColorScheme
	}

	// Attempt to discover Tauri's runtime backend port
	if ri, err := LoadRuntimeInfo(); err == nil && ri != nil {
		cfg.RuntimeEndpoint = fmt.Sprintf("http://localhost:%d", ri.BackendPort)
	}

	return &cfg, nil
}

// Save saves the configuration to file
func (c *Config) Save() error {
	configPath, err := ConfigPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0644)
}

// GetAgentColor returns the color for an agent, with fallback
func (c *Config) GetAgentColor(agentColor string) string {
	if agentColor != "" && agentColor != "#000000" {
		return agentColor
	}
	return c.ColorScheme["agent"]
}

// GetSystemColor returns a system color by name
func (c *Config) GetSystemColor(colorName string) string {
	if color, exists := c.ColorScheme[colorName]; exists {
		return color
	}
	return c.ColorScheme["info"] // Default fallback
}

// SaveToken securely saves a JWT token to the configuration
func (c *Config) SaveToken(token string) error {
	c.Token = token
	return c.Save()
}

// ClearToken removes the stored JWT token
func (c *Config) ClearToken() error {
	c.Token = ""
	return c.Save()
}

// HasValidToken checks if a token is present (basic validation)
func (c *Config) HasValidToken() bool {
	return c.Token != ""
}

// GetTokenAge returns the age of the token (requires parsing JWT - simplified version)
// Note: This is a basic implementation. For full JWT validation, we'd need to decode the token
func (c *Config) GetTokenAge() (time.Duration, error) {
	if c.Token == "" {
		return 0, nil
	}

	// For now, we'll return 0 since we don't store token creation time
	// In a full implementation, we'd parse the JWT and check the 'iat' (issued at) claim
	return 0, nil
}

// IsTokenExpired checks if the stored token might be expired
// Note: This is a placeholder - real implementation would decode JWT and check 'exp' claim
func (c *Config) IsTokenExpired() bool {
	if c.Token == "" {
		return true
	}

	// Since our tokens now last 7 days (604800 seconds), and we don't store creation time,
	// we'll assume tokens are valid. The backend should handle token validation.
	// In a full implementation, we'd parse JWT claims and check the 'exp' field.
	return false
}
