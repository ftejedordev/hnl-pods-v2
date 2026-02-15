import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mcpServerConnectionsApi } from '@/api/mcpServerConnections';
import type { McpServerConnectionCreate } from '@/types/mcp';

export function useMcpConnections() {
  return useQuery({
    queryKey: ['mcp-connections'],
    queryFn: () => mcpServerConnectionsApi.getAll(),
  });
}

export function useCreateMcpConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: McpServerConnectionCreate) => mcpServerConnectionsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-connections'] });
    },
  });
}

export function useDeleteMcpConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mcpServerConnectionsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-connections'] });
    },
  });
}
