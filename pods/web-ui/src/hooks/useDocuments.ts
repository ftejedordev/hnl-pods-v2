import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ragApi } from '@/api/rag';

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => ragApi.getDocuments(),
    select: (data) => data.documents,
  });
}

export function useUploadDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => ragApi.uploadFiles(files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}
