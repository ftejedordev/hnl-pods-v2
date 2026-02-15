import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { llmsApi } from '@/api/llms';
import type { LLMCreate, LLMUpdate, LLMTestRequest } from '@/types/llm';

export function useLLMs() {
  return useQuery({
    queryKey: ['llms'],
    queryFn: () => llmsApi.getLLMs(),
    select: (data) => data.llms,
  });
}

export function useLLMProviders() {
  return useQuery({
    queryKey: ['llm-providers'],
    queryFn: () => llmsApi.getProviders(),
    select: (data) => data.providers,
  });
}

export function useCreateLLM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LLMCreate) => llmsApi.createLLM(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llms'] });
    },
  });
}

export function useUpdateLLM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: LLMUpdate }) => llmsApi.updateLLM(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llms'] });
    },
  });
}

export function useDeleteLLM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => llmsApi.deleteLLM(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llms'] });
    },
  });
}

export function useTestLLM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: string; request?: LLMTestRequest }) => llmsApi.testLLM(id, request),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llms'] });
    },
  });
}
