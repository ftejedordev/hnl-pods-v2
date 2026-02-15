# Real-Time CLI Architecture with State Machine

## Overview
This document describes the state machine architecture with centralized channels for real-time SSE event processing in the HNL Pods CLI.

## Problem Statement
The previous hybrid approach mixed blocking SSE handling with Bubble Tea, preventing real-time updates. The main thread was blocked waiting for completion while Bubble Tea ran in a goroutine, causing events to only display after flow completion.

## Solution: State Machine + Event Bus Architecture

### Core Components

#### 1. Execution State Machine (`execution_state.go`)
```go
type ExecutionState int
const (
    StateInitializing ExecutionState = iota
    StateConnecting
    StateStreaming  
    StateCompleted
    StateFailed
)

type StateMachine struct {
    state       ExecutionState
    eventBus    *EventBus
    context     ExecutionContext
}
```

#### 2. Centralized Event Bus (`event_bus.go`)
```go
type EventBus struct {
    sseEvents    chan *client.SSEEvent      // SSE events from server
    stateChanges chan StateTransition       // State machine transitions
    uiEvents     chan UIEvent              // UI updates (spinner, display)
    errors       chan ExecutionError       // Error handling
    completion   chan CompletionResult     // Flow completion
    quit         chan struct{}             // Shutdown signal
}
```

#### 3. Bubble Tea Model (`execution_model.go`)
```go
type ExecutionModel struct {
    stateMachine *StateMachine
    eventBus     *EventBus
    
    // UI State
    spinner      spinner.Model
    viewport     viewport.Model
    events       []EventDisplay
    currentStep  string
    
    // Display State
    width        int
    height       int
    showHelp     bool
}
```

#### 4. SSE Event Handler (`sse_handler.go`)
```go
type SSEHandler struct {
    client   *client.SSEClient
    eventBus *EventBus
}

func (h *SSEHandler) StreamEvents(ctx context.Context, executionID string) {
    // Runs in goroutine, sends events to eventBus.sseEvents
}
```

## State Transitions

```
INITIALIZING:
  - Start SSE connection
  - Transition to CONNECTING

CONNECTING:
  - Wait for first SSE event
  - Transition to STREAMING
  - On error: transition to FAILED

STREAMING:
  - Process SSE events via channels
  - Update UI in real-time
  - On completion event: transition to COMPLETED
  - On error: transition to FAILED

COMPLETED/FAILED:
  - Display final results
  - Handle cleanup
```

## Communication Flow

1. **SSE Handler** → `eventBus.sseEvents` → **State Machine**
2. **State Machine** → `eventBus.stateChanges` → **Bubble Tea Model**
3. **State Machine** → `eventBus.uiEvents` → **UI Components**
4. **Error Sources** → `eventBus.errors` → **Error Handler**

## Key Benefits

- **Deterministic**: Clear state transitions, no race conditions
- **Centralized**: All communication goes through event bus
- **Testable**: Each component can be tested in isolation
- **Real-time**: Channels enable immediate event propagation
- **Robust**: Error handling and recovery built into state machine

## Implementation Notes

### Channel Patterns
- Use buffered channels for high-frequency events (SSE)
- Use unbuffered channels for state transitions (synchronous)
- Implement proper channel cleanup and goroutine lifecycle management

### Error Handling
- All errors flow through `eventBus.errors` channel
- State machine handles error recovery and transitions
- UI displays errors through standard event display mechanism

### Resource Management
- Context cancellation for clean shutdown
- Channel closure coordination
- Goroutine lifecycle tied to execution context

### Bubble Tea Integration
- Model subscribes to event bus channels via `tea.Cmd`
- Update() method processes channel messages as `tea.Msg`
- View() renders based on current state and events
- Runs on main thread for proper event loop handling

## Expected Outcomes

- ✅ **Real-time events**: Channels ensure immediate propagation
- ✅ **Deterministic behavior**: State machine prevents race conditions  
- ✅ **Full-screen UI**: Bubble Tea runs properly on main thread
- ✅ **Animated spinner**: UI updates coordinated through channels
- ✅ **Robust error handling**: Centralized error management
- ✅ **Clean shutdown**: Proper resource cleanup

This architecture follows Go concurrency best practices and Bubble Tea patterns for deterministic, real-time applications.