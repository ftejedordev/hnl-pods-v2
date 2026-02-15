import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsApi } from '@/api/agents';
import type { AgentCreate, AgentUpdate } from '@/types/agent';

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAgents(),
  });
}

export function useUserAgents() {
  return useQuery({
    queryKey: ['agents', 'user'],
    queryFn: () => agentsApi.getAgents(true, false),
  });
}

export function useDefaultAgents() {
  return useQuery({
    queryKey: ['agents', 'default'],
    queryFn: () => agentsApi.getAgents(false, true),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentCreate) => agentsApi.createAgent(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AgentUpdate }) => agentsApi.updateAgent(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentsApi.deleteAgent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}
