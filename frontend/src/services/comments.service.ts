import apiClient from '../api/client';

export const createComment = (data: {
  entityType: string;
  entityId: string;
  message: string;
}) => apiClient.post('/comments', data);

export const editComment = (id: string, message: string) =>
  apiClient.patch(`/comments/${id}`, { message });

export const deleteComment = (id: string) =>
  apiClient.delete(`/comments/${id}`);
