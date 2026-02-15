export type McpTransportType = 'http' | 'stdio' | 'sse' | 'internal';
export type UserMcpTransportType = 'http' | 'stdio' | 'sse';

export interface McpServerConnection {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  api_key?: string;
  description?: string;
  is_active: boolean;
  is_default: boolean;
  transport_type: McpTransportType;
  stdio_command?: string;
  stdio_args?: string[];
  sse_url?: string;
  sse_headers?: Record<string, string>;
  env_vars?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface McpServerConnectionCreate {
  name: string;
  base_url: string;
  api_key?: string;
  description?: string;
  is_active?: boolean;
  transport_type: UserMcpTransportType;
  stdio_command?: string;
  stdio_args?: string[];
  sse_url?: string;
  sse_headers?: Record<string, string>;
  env_vars?: Record<string, string>;
}

export interface McpServerConnectionUpdate {
  name?: string;
  base_url?: string;
  api_key?: string;
  description?: string;
  is_active?: boolean;
  transport_type?: UserMcpTransportType;
  stdio_command?: string;
  stdio_args?: string[];
  sse_url?: string;
  sse_headers?: Record<string, string>;
  env_vars?: Record<string, string>;
}

export interface ConnectivityTestResult {
  status: string;
  error?: string;
  response_time_ms?: number;
}

export type ConnectionStatus = 'connected' | 'failed' | 'testing' | 'unknown';

// MCP Tools Types
export interface MCPToolSchema {
  type: string;
  properties: Record<string, any>;
  required: string[];
  additionalProperties?: boolean;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  input_schema: MCPToolSchema;
  discovered_at: string;
}

export interface MCPToolsListResponse {
  connection_id: string;
  connection_name: string;
  tools: MCPToolInfo[];
  last_discovery?: string;
  total_tools: number;
}

export interface MCPToolExecuteRequest {
  tool_name: string;
  parameters: Record<string, any>;
}

export interface MCPToolExecuteResponse {
  success: boolean;
  result?: any;
  error?: string;
  execution_time_ms?: number;
  tool_name: string;
  connection_id: string;
}

export interface MCPConnectionStatus {
  connection_id: string;
  connection_name: string;
  is_healthy: boolean;
  last_check?: string;
  endpoint_used?: string;
  response_time_ms?: number;
  error?: string;
}

export interface MCPServerCapabilities {
  connection_id: string;
  connection_name: string;
  supports_tools: boolean;
  supports_resources: boolean;
  supports_prompts: boolean;
  total_tools: number;
  available_endpoints: string[];
  last_discovery?: string;
}

export interface MCPToolParameter {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  default?: any;
  enum?: any[];
}