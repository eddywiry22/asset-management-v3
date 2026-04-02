import apiClient from '../api/client';

export interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: { email: string | null; phone: string | null } | null;
}

const attachmentsService = {
  list: async (entityType: string, entityId: string): Promise<Attachment[]> => {
    const res = await apiClient.get(`/attachments/${entityType}/${entityId}`);
    return res.data?.data ?? res.data ?? [];
  },

  upload: async (entityType: string, entityId: string, files: File[]): Promise<void> => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    await apiClient.post(`/attachments/${entityType}/${entityId}`, form, {
      headers: { 'Content-Type': undefined },
    });
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/attachments/${id}`);
  },

  download: async (id: string, fileName: string): Promise<void> => {
    const res = await apiClient.get(`/attachments/${id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  getPreviewBlob: async (id: string): Promise<string> => {
    const res = await apiClient.get(`/attachments/${id}/download`, { responseType: 'blob' });
    return window.URL.createObjectURL(new Blob([res.data]));
  },
};

export default attachmentsService;
