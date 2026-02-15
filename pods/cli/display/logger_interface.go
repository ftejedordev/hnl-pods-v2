package display

import "pods-cli/client"

// LoggerInterface defines the interface that all loggers must implement
type LoggerInterface interface {
	// Agent management
	SetAgentInfo(agentID, name, color, description string)

	// Flow logging
	LogFlowStart(flowName string, variables map[string]interface{})
	UpdateFlowVariables(variables map[string]interface{})
	LogEvent(event *client.SSEEvent)

	// Spinner management
	StartSpinner(message string)
	UpdateSpinnerMessage(newMessage string)
	UpdateSpinnerWithContext(agentName, agentRole string, data map[string]interface{})
	StopSpinner()

	// Basic logging
	LogError(message string, err error)
	LogSuccess(message string)
	LogInfo(message string)
	LogWarning(message string)
}

// InteractiveLoggerInterface extends LoggerInterface with interactive features
type InteractiveLoggerInterface interface {
	LoggerInterface

	// Interactive mode management
	StartInteractiveMode()
	StopInteractiveMode()
}
