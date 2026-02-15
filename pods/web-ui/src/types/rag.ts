export interface RagServerDocumentResponse {
  status: string;
  total_count: number;
  documents: RagServerDocument[];
}

export interface RagServerDocument {
  id: number;
  filename: string;
  created_at: string;
}

export interface RagServerDocumentUpload {
  results: RagServerResults[];
}

export interface RagServerResults {
  filename: string;
  status: string;
  size: number;
}
