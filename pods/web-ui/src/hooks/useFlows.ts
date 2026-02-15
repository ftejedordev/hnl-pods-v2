import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { flowsApi, executionsApi } from '@/api/flows';
import type { FlowCreate, FlowExecutionCreate } from '@/types/flow';

export function useFlows() {
  return useQuery({
    queryKey: ['flows'],
    queryFn: () => flowsApi.getFlows(),
  });
}

export function useExecutions() {
  return useQuery({
    queryKey: ['executions'],
    queryFn: () => executionsApi.getExecutions(),
    select: (data) => data.executions,
  });
}

export function useCreateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FlowCreate) => flowsApi.createFlow(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] });
    },
  });
}

export function useDeleteFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (flowId: string) => flowsApi.deleteFlow(flowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] });
    },
  });
}

export function useExecuteFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flowId, data }: { flowId: string; data: Omit<FlowExecutionCreate, 'flow_id'> }) =>
      flowsApi.executeFlow(flowId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['executions'] });
    },
  });
}
