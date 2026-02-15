# HNL Pods CLI - Makefile
# Build and manage the pods CLI tool

# Variables
BINARY_NAME=pod
MAIN_PACKAGE=./main.go
BUILD_DIR=./build
DIST_DIR=./dist
VERSION?=1.0.0
COMMIT?=$(shell git rev-parse --short HEAD 2>/dev/null || echo "dev")
LDFLAGS=-ldflags "-X main.version=$(VERSION) -X main.commit=$(COMMIT)"

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod

# Default target
.PHONY: all
all: clean deps build

# Help target
.PHONY: help
help:
	@echo "HNL Pods CLI - Available targets:"
	@echo ""
	@echo "  build         Build the CLI for current platform"
	@echo "  build-all     Build for all platforms (Linux, macOS, Windows)"
	@echo "  clean         Clean build artifacts"
	@echo "  deps          Download and verify dependencies"
	@echo "  fmt           Format Go code"
	@echo "  lint          Run linter (requires golangci-lint)"
	@echo "  test          Run tests"
	@echo "  install       Install to /usr/local/bin (requires sudo)"
	@echo "  uninstall     Remove from /usr/local/bin (requires sudo)"
	@echo "  dist          Create distribution packages"
	@echo "  dev           Build and install for development"
	@echo "  run           Build and run with arguments (make run ARGS='help')"
	@echo ""
	@echo "Variables:"
	@echo "  VERSION=$(VERSION)"
	@echo "  COMMIT=$(COMMIT)"

# Clean build artifacts
.PHONY: clean
clean:
	$(GOCLEAN)
	rm -rf $(BUILD_DIR)
	rm -rf $(DIST_DIR)
	rm -f $(BINARY_NAME)

# Download dependencies
.PHONY: deps
deps:
	$(GOMOD) download
	$(GOMOD) verify
	$(GOMOD) tidy

# Format code
.PHONY: fmt
fmt:
	$(GOCMD) fmt ./...

# Run linter (requires golangci-lint)
.PHONY: lint
lint:
	@which golangci-lint > /dev/null || (echo "golangci-lint not found. Install with: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest" && exit 1)
	golangci-lint run

# Run tests
.PHONY: test
test:
	$(GOTEST) -v ./...

# Build for current platform
.PHONY: build
build: deps fmt
	@mkdir -p $(BUILD_DIR)
	$(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_PACKAGE)
	@echo "Built $(BUILD_DIR)/$(BINARY_NAME)"

# Build for all platforms
.PHONY: build-all
build-all: deps fmt
	@mkdir -p $(BUILD_DIR)
	
	# Linux AMD64
	GOOS=linux GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 $(MAIN_PACKAGE)
	
	# Linux ARM64
	GOOS=linux GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 $(MAIN_PACKAGE)
	
	# macOS AMD64 (Intel)
	GOOS=darwin GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 $(MAIN_PACKAGE)
	
	# macOS ARM64 (Apple Silicon)
	GOOS=darwin GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 $(MAIN_PACKAGE)
	
	# Windows AMD64
	GOOS=windows GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-windows-amd64.exe $(MAIN_PACKAGE)
	
	# Windows ARM64
	GOOS=windows GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-windows-arm64.exe $(MAIN_PACKAGE)
	
	@echo "Built binaries for all platforms in $(BUILD_DIR)/"
	@ls -la $(BUILD_DIR)/

# Install to system PATH (requires sudo on Unix)
.PHONY: install
install: build
	@if [ "$(shell uname)" = "Darwin" ] || [ "$(shell uname)" = "Linux" ]; then \
		echo "Installing $(BINARY_NAME) to /usr/local/bin/ (requires sudo)..."; \
		sudo cp $(BUILD_DIR)/$(BINARY_NAME) /usr/local/bin/$(BINARY_NAME); \
		sudo chmod +x /usr/local/bin/$(BINARY_NAME); \
		echo "✅ Installed $(BINARY_NAME) to /usr/local/bin/"; \
		echo "Run 'pod help' to get started"; \
	else \
		echo "❌ Auto-install not supported on this platform"; \
		echo "Manually copy $(BUILD_DIR)/$(BINARY_NAME) to your PATH"; \
	fi

# Uninstall from system PATH
.PHONY: uninstall
uninstall:
	@if [ -f "/usr/local/bin/$(BINARY_NAME)" ]; then \
		echo "Removing $(BINARY_NAME) from /usr/local/bin/ (requires sudo)..."; \
		sudo rm /usr/local/bin/$(BINARY_NAME); \
		echo "✅ Uninstalled $(BINARY_NAME)"; \
	else \
		echo "$(BINARY_NAME) not found in /usr/local/bin/"; \
	fi

# Development build and install
.PHONY: dev
dev: build
	@echo "Installing for development..."
	@cp $(BUILD_DIR)/$(BINARY_NAME) ./$(BINARY_NAME)
	@echo "✅ Development binary created: ./$(BINARY_NAME)"
	@echo "Run './$(BINARY_NAME) help' to test"

# Build and run with arguments
.PHONY: run
run: build
	@$(BUILD_DIR)/$(BINARY_NAME) $(ARGS)

# Create distribution packages
.PHONY: dist
dist: build-all
	@mkdir -p $(DIST_DIR)
	
	# Create tar.gz for Linux and macOS
	@for platform in linux-amd64 linux-arm64 darwin-amd64 darwin-arm64; do \
		echo "Creating $(DIST_DIR)/$(BINARY_NAME)-$(VERSION)-$$platform.tar.gz"; \
		tar -czf $(DIST_DIR)/$(BINARY_NAME)-$(VERSION)-$$platform.tar.gz -C $(BUILD_DIR) $(BINARY_NAME)-$$platform README.md; \
	done
	
	# Create zip for Windows
	@for platform in windows-amd64 windows-arm64; do \
		echo "Creating $(DIST_DIR)/$(BINARY_NAME)-$(VERSION)-$$platform.zip"; \
		cd $(BUILD_DIR) && zip ../$(DIST_DIR)/$(BINARY_NAME)-$(VERSION)-$$platform.zip $(BINARY_NAME)-$$platform.exe ../README.md; \
	done
	
	@echo "✅ Distribution packages created in $(DIST_DIR)/"
	@ls -la $(DIST_DIR)/

# Create release with checksums
.PHONY: release
release: dist
	@echo "Creating checksums..."
	@cd $(DIST_DIR) && shasum -a 256 * > checksums.txt
	@echo "✅ Release ready in $(DIST_DIR)/"
	@echo "Files:"
	@ls -la $(DIST_DIR)/

# Quick development workflow
.PHONY: quick
quick: fmt build dev
	@echo "✅ Quick build complete. Use './$(BINARY_NAME)' to test"

# Show build info
.PHONY: info
info:
	@echo "Build Information:"
	@echo "  Binary: $(BINARY_NAME)"
	@echo "  Version: $(VERSION)"
	@echo "  Commit: $(COMMIT)"
	@echo "  Go Version: $(shell go version)"
	@echo "  Platform: $(shell uname -s)-$(shell uname -m)"
	@echo "  Build Dir: $(BUILD_DIR)"

# Docker build (bonus target)
.PHONY: docker
docker:
	@echo "Building Docker image..."
	docker build -t $(BINARY_NAME):$(VERSION) .
	@echo "✅ Docker image built: $(BINARY_NAME):$(VERSION)"

# Performance benchmark of CLI startup
.PHONY: bench
bench: build
	@echo "Benchmarking CLI startup time..."
	@time $(BUILD_DIR)/$(BINARY_NAME) help >/dev/null 2>&1
	@echo "✅ Benchmark complete"

# Validate that all required tools are available
.PHONY: check-tools
check-tools:
	@echo "Checking required tools..."
	@which go > /dev/null || (echo "❌ Go not found" && exit 1)
	@echo "✅ Go found: $(shell go version)"
	@which git > /dev/null || echo "⚠️  Git not found (optional)"
	@which make > /dev/null || echo "⚠️  Make not found"
	@echo "✅ Required tools check complete"