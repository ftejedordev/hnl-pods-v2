// Flow types that match the backend models

// Agent configuration overrides for flow steps
export interface AgentOverride {
  llm_id?: string | null;
  mcp_connections?: string[] | null;
  system_prompt?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
}

export interface EdgeMetadata {
  edge_id: string;
  source_step_id: string;
  target_step_id: string;

  // Feedback loop configuration
  is_feedback_loop: boolean;
  max_iterations?: number;
  quality_threshold?: number;
  convergence_criteria?: string;

  // Execution state tracking
  current_iteration?: number;
  feedback_history?: Array<{
    iteration: number;
    source_output?: string;
    target_feedback?: string;
    quality_score?: number;
    acceptable?: boolean;
    final_output?: string;
    improved_output?: string;
    timestamp: string;
  }>;
  quality_scores?: number[];
}

export interface FlowStep {
  id: string;
  agent_id?: string;
  name: string;
  description?: string;
  system_prompt?: string;
  type: 'llm' | 'tool' | 'condition' | 'parallel' | 'webhook' | 'quality_check' | 'approval';
  parameters: Record<string, any>;
  next_steps: string[];
  condition?: string;
  timeout_seconds?: number;
  retry_count: number;
  position: { x: number; y: number };

  // Agent configuration overrides for this step
  agent_overrides?: AgentOverride | null;
}

export interface Flow {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  steps: FlowStep[];
  start_step_id: string;
  variables: Record<string, any>;
  metadata: Record<string, any>;
  edge_metadata: Record<string, EdgeMetadata>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FlowCreate {
  name: string;
  description?: string;
  steps: FlowStep[];
  start_step_id: string;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
  edge_metadata?: Record<string, EdgeMetadata>;
}

export interface FlowUpdate {
  name?: string;
  description?: string;
  steps?: FlowStep[];
  start_step_id?: string;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
  edge_metadata?: Record<string, EdgeMetadata>;
  is_active?: boolean;
}

export interface FlowStepResult {
  step_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  start_time?: string;
  end_time?: string;
  execution_time_ms?: number;
  retry_attempt: number;
  agent_output?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: any;
    };
  }>;
  tool_results?: Array<{
    tool_name: string;
    arguments: any;
    result: any;
    connection_id?: string;
    success?: boolean;
    error?: string;
  }>;
  model_used?: string;
  usage?: any;
  latency_ms?: number;
  agent_id?: string;
  agent_name?: string;
}

export interface FlowExecution {
  id: string;
  flow_id: string;
  user_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input_data: Record<string, any>;
  current_step_id?: string;
  completed_steps: string[];
  failed_steps: string[];
  step_results: Record<string, FlowStepResult>;
  variables: Record<string, any>;
  error?: string;
  start_time?: string;
  end_time?: string;
  execution_time_ms?: number;
  created_at: string;
  updated_at: string;
  
  // Feedback loop and execution control
  max_loop_iteration_count?: number;
  is_cancellation_requested?: boolean;
}

export interface FlowExecutionCreate {
  flow_id: string;
  input_data?: Record<string, any>;
  variables?: Record<string, any>;
}

export interface FlowExecutionEvent {
  id: string;
  execution_id: string;
  event_type: 'execution_started' | 'execution_completed' | 'execution_failed' | 'execution_cancelled' | 
              'step_started' | 'step_completed' | 'step_failed' | 'step_skipped' | 'step_progress';
  step_id?: string;
  message: string;
  data: Record<string, any>;
  timestamp: string;
}

export interface FlowExecutionListResponse {
  executions: FlowExecution[];
  total: number;
  page: number;
  per_page: number;
}

export interface MockAgent {
  agent_id: string;
  name: string;
  description: string;
  capabilities: string[];
  execution_count: number;
  last_execution_time?: number;
  failure_rate: number;
}

export interface MockAgentStats {
  total_agents: number;
  total_executions: number;
  agents: Record<string, {
    execution_count: number;
    last_execution_time?: number;
    failure_rate: number;
  }>;
}