import { mcp_api } from '../lib/api';
import type { 
  Flow, 
  FlowCreate, 
  FlowUpdate, 
  FlowExecution, 
  FlowExecutionCreate, 
  FlowExecutionListResponse,
  MockAgent,
  MockAgentStats
} from '../types/flow';

// SSE Connection wrapper interface
export interface SSEConnection {
  close: () => void;
  stopReconnecting?: () => void; // Stop automatic reconnection attempts
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
  readyState: number;
}

// Flow management API
export const flowsApi = {
  // Get all flows
  getFlows: async (skip = 0, limit = 100): Promise<Flow[]> => {
    const response = await mcp_api.get(`/api/flows?skip=${skip}&limit=${limit}`);
    return response.data;
  },

  // Get a specific flow
  getFlow: async (flowId: string): Promise<Flow> => {
    const response = await mcp_api.get(`/api/flows/${flowId}`);
    return response.data;
  },

  // Create a new flow
  createFlow: async (flowData: FlowCreate): Promise<Flow> => {
    const response = await mcp_api.post('/api/flows', flowData);
    return response.data;
  },

  // Update a flow
  updateFlow: async (flowId: string, flowUpdate: FlowUpdate): Promise<Flow> => {
    const response = await mcp_api.put(`/api/flows/${flowId}`, flowUpdate);
    return response.data;
  },

  // Delete a flow
  deleteFlow: async (flowId: string): Promise<void> => {
    await mcp_api.delete(`/api/flows/${flowId}`);
  },

  // Execute a flow
  executeFlow: async (flowId: string, executionData: Omit<FlowExecutionCreate, 'flow_id'>): Promise<FlowExecution> => {
    const response = await mcp_api.post(`/api/flows/${flowId}/execute`, executionData);
    return response.data;
  },

  // Cancel an execution
  cancelExecution: async (executionId: string): Promise<void> => {
    await mcp_api.post(`/api/executions/${executionId}/cancel`);
  },
};

// Flow execution API
export const executionsApi = {
  // Get all executions (optionally filtered by flow)
  getExecutions: async (flowId?: string, skip = 0, limit = 100): Promise<FlowExecutionListResponse> => {
    const params = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
    if (flowId) params.append('flow_id', flowId);
    
    const response = await mcp_api.get(`/api/executions?${params}`);
    return response.data;
  },

  // Get a specific execution
  getExecution: async (executionId: string): Promise<FlowExecution> => {
    const response = await mcp_api.get(`/api/executions/${executionId}`);
    return response.data;
  },

  // Cancel an execution
  cancelExecution: async (executionId: string): Promise<void> => {
    await mcp_api.post(`/api/executions/${executionId}/cancel`);
  },

  // Submit approval decision for a pending approval step
  submitApproval: async (executionId: string, approved: boolean): Promise<{ message: string; approved: boolean }> => {
    const response = await mcp_api.post(`/api/executions/${executionId}/approve?approved=${approved}`);
    return response.data;
  },

  // Subscribe to execution events via HTTP polling (reliable in Tauri webview)
  subscribeToExecutionEvents: (executionId: string, onEvent: (event: any) => void, onError?: (error: Error) => void): SSEConnection => {
    let isClosed = false;
    let readyState = EventSource.CONNECTING;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let eventsSeen = 0;
    let consecutiveErrors = 0;

    const startPolling = () => {
      readyState = EventSource.OPEN;

      // Emit synthetic connection_established event
      onEvent({
        event_type: 'connection_established',
        execution_id: executionId,
        message: 'Connected to execution stream (polling)',
      });

      console.log(`[Polling] Started for execution ${executionId}`);

      // Poll immediately, then every 1.5 seconds
      const poll = async () => {
        if (isClosed) return;

        try {
          const resp = await mcp_api.get(`/api/executions/${executionId}/events?after=${eventsSeen}`);
          const newEvents: any[] = resp.data;
          consecutiveErrors = 0;

          for (const event of newEvents) {
            eventsSeen++;
            onEvent(event);

            // Check for terminal events
            const terminalTypes = ['execution_completed', 'execution_failed', 'execution_cancelled'];
            if (terminalTypes.includes(event.event_type)) {
              console.log(`[Polling] Terminal event received: ${event.event_type}`);
              isClosed = true;
              if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
              }
              readyState = EventSource.CLOSED;
              return;
            }
          }
        } catch (err: any) {
          consecutiveErrors++;
          console.warn(`[Polling] Error (attempt ${consecutiveErrors}):`, err?.message);

          if (consecutiveErrors >= 10) {
            console.error(`[Polling] Too many errors, stopping`);
            isClosed = true;
            if (pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
            readyState = EventSource.CLOSED;
            onError?.(new Error('Polling failed after too many errors'));
            return;
          }
        }
      };

      // First poll immediately
      poll();
      // Then poll every 1.5 seconds
      pollTimer = setInterval(poll, 1500);
    };

    startPolling();

    const wrapper: SSEConnection = {
      close: () => {
        isClosed = true;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        readyState = EventSource.CLOSED;
      },
      stopReconnecting: () => {
        isClosed = true;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      },
      get readyState() {
        return readyState;
      }
    };

    return wrapper;
  },
};

// Mock agents API (for testing)
export const mockAgentsApi = {
  // Get all mock agents
  getMockAgents: async (): Promise<{ agents: MockAgent[] }> => {
    const response = await mcp_api.get('/api/mock-agents');
    return response.data;
  },

  // Get mock agent statistics
  getMockAgentStats: async (): Promise<MockAgentStats> => {
    const response = await mcp_api.get('/api/mock-agents/statistics');
    return response.data;
  },
};

// Helper function to create a sample flow
// NOTE: agent_id is undefined so users must assign agents manually after creation
export const createSampleFlow = (name: string, description?: string): FlowCreate => {
  return {
    name,
    description,
    steps: [
      {
        id: 'step-1',
        agent_id: undefined, // User must assign an agent manually
        name: 'Research',
        description: 'Research the given topic',
        type: 'llm',
        parameters: {
          task: 'Research the topic: ${topic}',
          processing_time: 4
        },
        next_steps: ['step-2'],
        retry_count: 1,
        position: { x: 100, y: 100 }
      },
      {
        id: 'step-2',
        agent_id: undefined, // User must assign an agent manually
        name: 'Analysis',
        description: 'Analyze the research findings',
        type: 'llm',
        parameters: {
          task: 'Analyze the research findings',
          processing_time: 3
        },
        next_steps: ['step-3', 'step-4'],
        retry_count: 1,
        position: { x: 550, y: 100 }
      },
      {
        id: 'step-3',
        agent_id: undefined, // User must assign an agent manually
        name: 'Summary',
        description: 'Create a summary',
        type: 'llm',
        parameters: {
          task: 'Create a comprehensive summary',
          processing_time: 2
        },
        next_steps: [],
        retry_count: 1,
        position: { x: 1000, y: 50 }
      },
      {
        id: 'step-4',
        agent_id: undefined, // User must assign an agent manually
        name: 'Fact Check',
        description: 'Verify the facts',
        type: 'llm',
        parameters: {
          task: 'Verify the key facts',
          processing_time: 3
        },
        next_steps: [],
        retry_count: 1,
        position: { x: 1000, y: 150 }
      }
    ],
    start_step_id: 'step-1',
    variables: {
      topic: 'AI and Machine Learning trends'
    },
    metadata: {
      created_by: 'flow_builder',
      version: '1.0'
    }
  };
};

// Helper function to get status color
export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'pending': return 'text-yellow-600 bg-yellow-50 dark:text-yellow-300 dark:bg-yellow-500/10';
    case 'running': return 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-500/10';
    case 'completed': return 'text-green-600 bg-green-50 dark:text-green-300 dark:bg-green-500/10';
    case 'failed': return 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-500/10';
    case 'cancelled': return 'text-gray-600 bg-gray-50 dark:text-gray-300 dark:bg-gray-500/10';
    case 'skipped': return 'text-gray-600 bg-gray-50 dark:text-gray-300 dark:bg-gray-500/10';
    default: return 'text-gray-600 bg-gray-50 dark:text-gray-300 dark:bg-gray-500/10';
  }
};

// Helper function to get agent type color
export const getAgentTypeColor = (agentId: string): string => {
  // Use only three colors: deep purple, deep blue, and deep cyan
  const colors = [
    'bg-purple-600 text-white dark:bg-purple-600 dark:text-white',
    'bg-blue-600 text-white dark:bg-blue-600 dark:text-white', 
    'bg-cyan-600 text-white dark:bg-cyan-600 dark:text-white'
  ];
  
  // Generate a consistent color based on agent ID hash
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) & 0xffffffff;
  }
  
  return colors[Math.abs(hash) % colors.length];
};
