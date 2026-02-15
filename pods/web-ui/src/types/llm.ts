export type LLMProvider = "anthropic" | "openai" | "openrouter" | "custom";

export type LLMStatus = "active" | "inactive" | "error" | "testing";

export interface LLMConfig {
  // Common fields
  model_name?: string;
  max_tokens?: number;
  temperature?: number;
  
  // Anthropic specific
  anthropic_version?: string;
  
  // OpenAI specific
  organization_id?: string;
  
  // OpenRouter specific
  site_url?: string;
  app_name?: string;
  
  // Custom provider specific
  base_url?: string;
  headers?: Record<string, string>;
  verify_ssl?: boolean;
  available_models?: string[];
}

export interface LLMUsageStats {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  last_used?: string;
  requests_this_month: number;
  tokens_this_month: number;
  cost_this_month: number;
}

export interface LLM {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  provider: LLMProvider;
  config: LLMConfig;
  status: LLMStatus;
  usage_stats: LLMUsageStats;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  last_tested?: string;
  test_error?: string;
}

export interface LLMCreate {
  name: string;
  description?: string;
  provider: LLMProvider;
  api_key: string;
  config?: LLMConfig;
  is_default?: boolean;
}

export interface LLMUpdate {
  name?: string;
  description?: string;
  api_key?: string;
  config?: LLMConfig;
  status?: LLMStatus;
  is_default?: boolean;
}

export interface LLMListResponse {
  llms: LLM[];
  total: number;
}

export interface LLMTestRequest {
  test_prompt?: string;
}

export interface LLMTestResponse {
  success: boolean;
  response_text?: string;
  error?: string;
  latency_ms?: number;
  model_used?: string;
}

export interface LLMProviderInfo {
  provider: LLMProvider;
  name: string;
  description: string;
  documentation_url: string;
  api_key_url: string;
  required_fields: string[];
  optional_fields: string[];
  supported_models?: string[];
}

export interface LLMProvidersResponse {
  providers: LLMProviderInfo[];
}