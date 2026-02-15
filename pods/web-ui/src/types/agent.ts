export interface Agent {
  id: string;
  user_id: string;
  name: string;
  description: string;
  llm_id?: string;
  mcp_connections: string[];
  rag_documents: number[];
  is_default: boolean;
  avatar_url?: string;
  color?: string;
  role?: string;
  system_prompt?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentCreate {
  name: string;
  description: string;
  llm_id?: string;
  mcp_connections: string[];
  rag_documents: number[];
}

export interface AgentUpdate {
  name?: string;
  description?: string;
  llm_id?: string;
  mcp_connections?: string[];
  rag_documents?: number[];
}

export interface AgentFormData {
  name: string;
  description: string;
  llm_id?: string;
  mcp_connections: string[];
  avatar_url?: string;
  color?: string;
  role?: string;
  system_prompt?: string;
  rag_documents: number[];
}
