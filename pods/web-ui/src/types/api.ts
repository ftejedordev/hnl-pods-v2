export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  error?: string;
}

export interface Agent {
  name: string;
  description: string;
  config: {
    functions: string[];
  };
  active: boolean;
}

export interface Task {
  id: number;
  prompt: string;
  agent_name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created_at?: string;
  updated_at?: string;
}

export interface Document {
  id: string;
  name: string;
  content: string;
  project_id: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}