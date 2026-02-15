import axios from 'axios';
import { invoke } from '@tauri-apps/api/core';
import type { LoginCredentials, RegisterCredentials, AuthResponse, User } from '@/types/auth';

const DEFAULT_API_URL = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:8000';
const RAG_API_BASE_URL = import.meta.env.VITE_RAG_API_URL || 'http://localhost:8001';


/**
 * MCP API
 */
export const mcp_api = axios.create({
  baseURL: DEFAULT_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Initialize API base URL from Tauri backend port.
 * In Tauri context, fetches the dynamic port assigned to the backend.
 * In dev mode (no Tauri), falls back to the default URL.
 */
export async function initializeApiBaseUrl(): Promise<void> {
  try {
    const port = await invoke<number>('get_backend_port');
    const url = `http://localhost:${port}`;
    mcp_api.defaults.baseURL = url;
    console.log(`API configured at ${url}`);
  } catch {
    // No Tauri context (dev mode) — use default
    console.log(`API using default: ${DEFAULT_API_URL}`);
  }
}

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