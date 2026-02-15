import { mcp_api } from '@/lib/api';
import type { 
  LLM, 
  LLMCreate, 
  LLMUpdate, 
  LLMListResponse,
  LLMTestRequest,
  LLMTestResponse,
  LLMProvidersResponse
} from '@/types/llm';

export const llmsApi = {
  // Get information about supported providers
  getProviders: async (): Promise<LLMProvidersResponse> => {
    const response = await mcp_api.get('/api/llms/providers');
    return response.data;
  },

  // Get all LLMs for the current user
  getLLMs: async (): Promise<LLMListResponse> => {
    const response = await mcp_api.get('/api/llms');
    return response.data;
  },

  // Get specific LLM by ID
  getLLM: async (llmId: string): Promise<LLM> => {
    const response = await mcp_api.get(`/api/llms/${llmId}`);
    return response.data;
  },

  // Create new LLM
  createLLM: async (llm: LLMCreate): Promise<LLM> => {
    const response = await mcp_api.post('/api/llms', llm);
    return response.data;
  },

  // Update existing LLM
  updateLLM: async (llmId: string, llm: LLMUpdate): Promise<LLM> => {
    const response = await mcp_api.put(`/api/llms/${llmId}`, llm);
    return response.data;
  },

  // Delete LLM
  deleteLLM: async (llmId: string): Promise<{ message: string }> => {
    const response = await mcp_api.delete(`/api/llms/${llmId}`);
    return response.data;
  },

  // Test LLM connectivity
  testLLM: async (llmId: string, testRequest?: LLMTestRequest): Promise<LLMTestResponse> => {
    const response = await mcp_api.post(`/api/llms/${llmId}/test`, testRequest || {});
    return response.data;
  },

  // Migrate LLM configs to remove inappropriate provider fields
  migrateLLMConfigs: async (): Promise<{ message: string }> => {
    const response = await mcp_api.post('/api/llms/migrate-configs');
    return response.data;
  },
};