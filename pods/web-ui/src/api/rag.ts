import { rag_api } from "@/lib/api";
import type {
  RagServerDocumentResponse,
  RagServerDocumentUpload,
} from "@/types/rag";

/**
 * RAG API - Documents
 */
export const ragApi = {
  /**
   * Get all documents
   * @returns Documents
   */
  getDocuments: async (): Promise<RagServerDocumentResponse> => {
    const response = await rag_api.get("/api/documents");
    return response.data;
  },

  /**
   * Upload multiple files
   * @param files - Array of files to upload
   * @returns The uploaded files
   */
  uploadFiles: async (files: File[]): Promise<RagServerDocumentUpload> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });
    const response = await rag_api.post("/api/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },
};
