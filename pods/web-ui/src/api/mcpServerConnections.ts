import { mcp_api } from '@/lib/api';
import type { 
  McpServerConnection, 
  McpServerConnectionCreate, 
  McpServerConnectionUpdate,
  ConnectivityTestResult,
  MCPToolsListResponse,
  MCPToolExecuteRequest,
  MCPToolExecuteResponse,
  MCPConnectionStatus,
  MCPServerCapabilities
} from '@/types/mcp';

export const mcpServerConnectionsApi = {
  // Get all MCP server connections for the current user
  getAll: async (): Promise<McpServerConnection[]> => {
    const response = await mcp_api.get('/api/mcp-server-connections');
    return response.data;
  },

  // Get a specific MCP server connection by ID
  getById: async (id: string): Promise<McpServerConnection> => {
    const response = await mcp_api.get(`/api/mcp-server-connections/${id}`);
    return response.data;
  },

  // Create a new MCP server connection
  create: async (connection: McpServerConnectionCreate): Promise<McpServerConnection> => {
    const response = await mcp_api.post('/api/mcp-server-connections', connection);
    return response.data;
  },

  // Update an existing MCP server connection
  update: async (id: string, connection: McpServerConnectionUpdate): Promise<McpServerConnection> => {
    const response = await mcp_api.put(`/api/mcp-server-connections/${id}`, connection);
    return response.data;
  },

  // Delete an MCP server connection
  delete: async (id: string): Promise<{ message: string }> => {
    const response = await mcp_api.delete(`/api/mcp-server-connections/${id}`);
    return response.data;
  },

  // Test connectivity to an MCP server
  testConnectivity: async (id: string): Promise<ConnectivityTestResult> => {
    const response = await mcp_api.post(`/api/mcp-server-connections/${id}/test-connectivity`);
    return response.data;
  },

  // Get available tools from an MCP server
  getTools: async (id: string, forceRefresh: boolean = false): Promise<MCPToolsListResponse> => {
    const response = await mcp_api.get(`/api/mcp-server-connections/${id}/tools`, {
      params: { force_refresh: forceRefresh }
    });
    return response.data;
  },

  // Execute a tool on an MCP server
  executeTool: async (id: string, request: MCPToolExecuteRequest): Promise<MCPToolExecuteResponse> => {
    const response = await mcp_api.post(`/api/mcp-server-connections/${id}/execute-tool`, request);
    return response.data;
  },

  // Get server capabilities
  getCapabilities: async (id: string): Promise<MCPServerCapabilities> => {
    const response = await mcp_api.get(`/api/mcp-server-connections/${id}/capabilities`);
    return response.data;
  },

  // Get overview of all connections
  getOverview: async (): Promise<MCPConnectionStatus[]> => {
    const response = await mcp_api.get('/api/mcp-server-connections/overview');
    return response.data;
  },

  // Direct MCP operations (like main2.py)
  
  // Connect and discover via stdio transport
  connectStdio: async (command: string, args: string[] = []): Promise<{
    status: string;
    transport: string;
    server_info: any;
    tools: any[];
    resources: any[];
    total_tools: number;
    total_resources: number;
  }> => {
    const response = await mcp_api.post('/api/mcp/connect/stdio', {
      command,
      args
    });
    return response.data;
  },

  // Connect and discover via SSE transport
  connectSSE: async (url: string, headers?: Record<string, string>): Promise<{
    status: string;
    transport: string;
    server_info: any;
    tools: any[];
    resources: any[];
    total_tools: number;
    total_resources: number;
  }> => {
    const response = await mcp_api.post('/api/mcp/connect/sse', {
      url,
      headers: headers || {}
    });
    return response.data;
  },

  // Test MCP connection directly
  testMCPConnection: async (transportType: 'stdio' | 'sse', config: { command?: string; args?: string[]; url?: string; headers?: Record<string, string> }): Promise<{
    status: string;
    transport: string;
    server_info?: any;
    success: boolean;
    error?: string;
  }> => {
    const response = await mcp_api.post('/api/mcp/test-connection', {
      transport_type: transportType,
      ...config
    });
    return response.data;
  },

  // Execute tool directly on MCP server
  executeMCPTool: async (transportType: 'stdio' | 'sse', toolName: string, config: { 
    command?: string; 
    args?: string[]; 
    url?: string; 
    headers?: Record<string, string>;
    arguments?: any 
  }): Promise<{
    success: boolean;
    tool_name: string;
    result?: any;
    error?: string;
    transport: string;
  }> => {
    const response = await mcp_api.post('/api/mcp/execute-tool', {
      transport_type: transportType,
      tool_name: toolName,
      arguments: config.arguments || {},
      ...config
    });
    return response.data;
  }
};