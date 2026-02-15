# Multi-stage build for HNL Pods CLI
FROM golang:1.21-alpine AS builder

# Set working directory
WORKDIR /app

# Install git for go modules
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags '-extldflags "-static"' -o pod main.go

# Final stage - minimal image
FROM alpine:latest

# Install ca-certificates for HTTPS requests
RUN apk --no-cache add ca-certificates

# Create non-root user
RUN adduser -D -s /bin/sh poduser

# Set working directory
WORKDIR /home/poduser/

# Copy binary from builder
COPY --from=builder /app/pod .

# Copy README for help
COPY README.md .

# Change ownership
RUN chown poduser:poduser pod README.md

# Switch to non-root user
USER poduser

# Make binary executable
RUN chmod +x pod

# Entry point
ENTRYPOINT ["./pod"]

# Default command
CMD ["help"]