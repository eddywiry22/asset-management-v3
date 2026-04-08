import apiClient from '../api/client';

export interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  description: string | null;
  createdAt: string;
  uploadedBy: { id: string; username: string } | null;
}

const attachmentsService = {
  list: async (entityType: string, entityId: string): Promise<Attachment[]> => {
    const res = await apiClient.get(`/attachments/${entityType.toUpperCase()}/${entityId}`);
    return res.data?.data ?? res.data ?? [];
  },

  upload: async (
    entityType: string,
    entityId: string,
    files: File[],
    descriptionMap: Record<string, string> = {},
  ): Promise<void> => {
    const type = entityType.toUpperCase();
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      form.append('description', descriptionMap[file.name] || '');
      await apiClient.post(`/attachments/${type}/${entityId}`, form, {
        headers: { 'Content-Type': undefined },
      });
    }
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
