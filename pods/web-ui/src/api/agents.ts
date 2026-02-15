import { mcp_api } from '@/lib/api';
import type { Agent, AgentCreate, AgentUpdate } from '@/types/agent';

export const agentsApi = {
  // Get all agents (user's agents + default agents)
  getAgents: async (userOnly = false, defaultsOnly = false): Promise<Agent[]> => {
    const params = new URLSearchParams();
    if (userOnly) params.append('user_only', 'true');
    if (defaultsOnly) params.append('defaults_only', 'true');
    
    const response = await mcp_api.get(`/api/agents?${params.toString()}`);
    return response.data;
  },

  // Get specific agent by ID
  getAgent: async (agentId: string): Promise<Agent> => {
    const response = await mcp_api.get(`/api/agents/${agentId}`);
    return response.data;
  },

  // Create new agent
  createAgent: async (agent: AgentCreate): Promise<Agent> => {
    const response = await mcp_api.post('/api/agents', agent);
    return response.data;
  },

  // Update existing agent
  updateAgent: async (agentId: string, agent: AgentUpdate): Promise<Agent> => {
    const response = await mcp_api.put(`/api/agents/${agentId}`, agent);
    return response.data;
  },

  // Delete agent
  deleteAgent: async (agentId: string): Promise<{ message: string }> => {
    const response = await mcp_api.delete(`/api/agents/${agentId}`);
    return response.data;
  },

};