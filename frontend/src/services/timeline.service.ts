import apiClient from '../api/client';

export const getTimeline = async (entityType: string, entityId: string) => {
  const res = await apiClient.get(`/timeline/${entityType}/${entityId}`);
  return res.data.data.events;
};
