import apiClient from '../api/client';

export interface Attachment {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
}

export const attachmentsService = {
  /**
   * Upload one or more files for a given entity.
   * Each file is sent as a separate request (backend uses upload.single('file')).
   * entityType is uppercased to match backend expectations ('ADJUSTMENT' | 'TRANSFER').
   */
  async upload(entityType: string, entityId: string, files: File[]): Promise<Attachment[]> {
    const results: Attachment[] = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiClient.post<{ success: boolean; data: Attachment }>(
        `/attachments/${entityType.toUpperCase()}/${entityId}`,
        formData,
        {
          headers: { 'Content-Type': undefined }, // let browser set multipart boundary
        },
      );

      results.push(res.data.data);
    }

    return results;
  },

  async list(entityType: string, entityId: string): Promise<Attachment[]> {
    const res = await apiClient.get<{ success: boolean; data: Attachment[] }>(
      `/attachments/${entityType.toUpperCase()}/${entityId}`,
    );
    return res.data.data;
  },

  async download(id: string, fileName: string): Promise<void> {
    const res = await apiClient.get(`/attachments/${id}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/attachments/${id}`);
  },
};
