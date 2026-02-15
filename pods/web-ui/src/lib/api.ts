import axios from 'axios';
import type { LoginCredentials, RegisterCredentials, AuthResponse, User } from '@/types/auth';

const MCP_API_BASE_URL = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8000';
const RAG_API_BASE_URL = import.meta.env.VITE_RAG_API_URL || 'http://localhost:8001';


/**
 * MCP API
 */
export const mcp_api = axios.create({
  baseURL: MCP_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

mcp_api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

mcp_api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth-token');
      // Emitir evento personalizado en lugar de recargar la página
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

/**
 * MCP API - Auth
 */
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await mcp_api.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  register: async (credentials: RegisterCredentials): Promise<{ message: string; user_id: string }> => {
    const response = await mcp_api.post('/auth/register', credentials);
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await mcp_api.get<User>('/auth/me');
    return response.data;
  },
};

/**
 * RAG API
 */
export const rag_api = axios.create({
  baseURL: RAG_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

rag_api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

rag_api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth-token');
      // Emitir evento personalizado en lugar de recargar la página
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);