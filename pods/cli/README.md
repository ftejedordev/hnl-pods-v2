# HNL Pods CLI

A command-line interface for executing and monitoring HNL Pods agent flows with real-time streaming output.

## Features

- 🚀 **Execute flows** with key-value variables
- 📡 **Real-time streaming** with Server-Sent Events (SSE)
- 🎨 **Colored output** with agent-specific colors
- 🤖 **Predictive summaries** using OpenRouter LLM integration
- 📋 **Flow discovery** and detailed help
- ⚙️ **Configuration management**

## Installation

### Option 1: Using Make (Recommended)

1. **Prerequisites:**
   - Go 1.21 or higher
   - Make
   - Access to HNL Pods API server

2. **Build and Install:**
   ```bash
   cd pods/cli
   make install  # Builds and installs to /usr/local/bin
   ```

3. **Development Build:**
   ```bash
   make dev      # Creates ./pod for testing
   ```

### Option 2: Manual Build

1. **Build:**
   ```bash
   cd pods/cli
   go mod tidy
   go build -o pod main.go
   ```

2. **Install:**
   ```bash
   # Move to your PATH
   sudo mv pod /usr/local/bin/
   
   # Or add to PATH
   export PATH=$PATH:$(pwd)
   ```

### Option 3: Docker

```bash
# Build Docker image
make docker

# Run via Docker
docker run --rm -it pod:1.0.0 help
```

## Configuration

### Initial Setup

```bash
# Set API endpoint
pod config set api http://localhost:8000

# Set authentication token
pod config set token your-jwt-token

# Set OpenRouter API key (optional, for better summaries)
pod config set openrouter-key your-openrouter-key
```

### View Configuration

```bash
pod config show
```

## Usage

### Execute a Flow

```bash
# Basic execution
pod run myflow key1 value1 key2 value2

# Execute with timeout
pod run myflow --timeout 600 key1 value1

# Execute without streaming
pod run myflow --no-stream key1 value1
```

### List Available Flows

```bash
# List active flows
pod list

# List all flows (including inactive)
pod list --all

# List only inactive flows
pod list --inactive
```

### Get Help

```bash
# General CLI help
pod help

# Detailed flow information
pod help myflow
```

### Configuration Management

```bash
# Show current config
pod config

# Set configuration values
pod config set api http://localhost:8000
pod config set token your-token
pod config set openrouter-key your-key

# Reset to defaults
pod config reset
```

## Example Output

```bash
$ pod run dev01 issue "#121" repo "https://xyz.com/abc" task "Implementa autenticación con OAuth"

🚀 Starting flow: dev01
📋 Variables:
  • issue: #121
  • repo: https://xyz.com/abc
  • task: Implementa autenticación con OAuth

🆔 Execution ID: 507f1f77bcf86cd799439011

[09:42:15] 🔄 Execution started
[09:42:15] ▶️  JAX analizando estructura del proyecto...
[09:42:18] ▶️  JAX identificando componentes para autenticación OAuth
[09:42:25] ✅ JAX Research Phase completed
[09:42:25] ▶️  MAX generando implementación de OAuth...
[09:42:45] 🔧 MAX using file-system tools
[09:43:02] ✅ MAX creando archivos: src/auth/oauth.js, src/auth/providers.js
[09:43:02] ▶️  TESS verificando implementación...
[09:43:10] ▶️  TESS creando tests para autenticación
[09:43:18] ✅ TESS Verification Phase completed
[09:43:18] ▶️  BUGZ analizando posibles mejoras de seguridad
[09:43:25] ✅ BUGZ Security Analysis completed
[09:43:25] ▶️  LEX documentando nueva API de autenticación
[09:43:40] ✅ LEX Documentation Phase completed
[09:43:40] ✅ Execution completed successfully

✅ Flow execution completed successfully
```

## Configuration File

The CLI stores configuration in `~/.config/pods-cli/config.json`:

```json
{
  "api_endpoint": "http://localhost:8000",
  "token": "your-jwt-token",
  "openrouter_key": "your-openrouter-key",
  "verbose": false,
  "default_timeout": 300,
  "color_scheme": {
    "info": "#3B82F6",
    "success": "#10B981",
    "warning": "#F59E0B",
    "error": "#EF4444",
    "agent": "#8B5CF6"
  }
}
```

## Advanced Features

### OpenRouter Integration (Optional)

For enhanced predictive summaries instead of template-based ones, configure an OpenRouter API key:

**Step 1: Get OpenRouter API Key**
1. Visit [openrouter.ai](https://openrouter.ai)
2. Sign up and get your API key (starts with `sk-or-v1-...`)

**Step 2: Configure CLI**
```bash
pod config set openrouter-key sk-or-v1-your-actual-key-here
```

**Benefits:**
- Uses GPT-4o Mini for fast, contextual summaries (~530ms response time)
- Cost: ~$0.00015 per 1K tokens (very cheap)
- Generates Spanish predictive messages like: `"analizando estructura del proyecto..."`
- Falls back to templates automatically if API fails

**Without OpenRouter:** Template-based summaries still work fine, just less contextual.

### Agent Colors

Each agent has a specific color that appears in the CLI output. Colors are automatically assigned or can be customized through the web interface.

### Streaming vs Polling

- **Streaming mode** (default): Real-time updates via SSE
- **Polling mode** (`--no-stream`): Periodic status checks

## Troubleshooting

### Connection Issues

```bash
# Test API connection
pod config show

# Check if API server is running
curl http://localhost:8000/health
```

### Authentication Issues

```bash
# Verify token is set
pod config show

# Update token
pod config set token new-token
```

### Verbose Output

```bash
# Enable verbose logging
pod -v execute -f myflow key value

# Or set permanently
pod config set verbose true
```

## API Endpoints Used

The CLI communicates with these API endpoints:

- `GET /api/cli/flows` - List available flows
- `POST /api/cli/flows/{name}/execute` - Execute flow
- `GET /api/cli/flows/{name}/help` - Get flow details
- `GET /api/cli/executions/{id}/summary` - Get execution summary
- `GET /api/executions/{id}/stream` - SSE streaming

## Development

### Make Commands

```bash
# Show all available commands
make help

# Quick development workflow
make quick          # Format, build, and create ./pod

# Build for current platform
make build          # Creates build/pod

# Build for all platforms
make build-all      # Linux, macOS, Windows (AMD64 + ARM64)

# Run tests and linting
make test
make lint           # Requires golangci-lint

# Format code
make fmt

# Create distribution packages
make dist           # Creates tar.gz and zip files

# Development helpers
make run ARGS="help"    # Build and run with arguments
make bench             # Benchmark CLI startup time
make info              # Show build information
```

### Manual Development

```bash
cd pods/cli
go mod tidy
go build -o pod main.go
```

### Running Tests

```bash
make test
# Or manually:
go test ./...
```

### Dependencies

- **charmbracelet/log** v0.4.2 - Styled logging
- **charmbracelet/bubbletea** v1.3.6 - Future TUI support
- **spf13/cobra** v1.9.1 - CLI framework
- **gorilla/websocket** v1.5.0 - SSE client

## License

Part of the HNL Pods project.