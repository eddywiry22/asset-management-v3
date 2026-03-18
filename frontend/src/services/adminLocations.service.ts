import apiClient from '../api/client';

export interface AdminLocation {
  id:                   string;
  code:                 string;
  name:                 string;
  address:              string | null;
  isActive:             boolean;
  blockingRequestCount: number;
}

export interface CreateLocationInput {
  code:     string;
  name:     string;
  address?: string;
}

export interface UpdateLocationInput {
  name:     string;
  address?: string | null;
}

export const adminLocationsService = {
  async getAll(status?: 'ACTIVE' | 'INACTIVE' | 'ALL'): Promise<AdminLocation[]> {
    const params: Record<string, string> = {};
    if (status && status !== 'ALL') params.status = status;
    const res = await apiClient.get<{ success: boolean; data: AdminLocation[] }>(
      '/admin/locations',
      { params },
    );
    return res.data.data;
  },

  async create(input: CreateLocationInput): Promise<AdminLocation> {
    const res = await apiClient.post<{ success: boolean; data: AdminLocation }>(
      '/admin/locations',
      input,
    );
    return res.data.data;
  },

  async update(id: string, input: UpdateLocationInput): Promise<AdminLocation> {
    const res = await apiClient.put<{ success: boolean; data: AdminLocation }>(
      `/admin/locations/${id}`,
      input,
    );
    return res.data.data;
  },

  async toggleActive(id: string): Promise<AdminLocation> {
    const res = await apiClient.patch<{ success: boolean; data: AdminLocation }>(
      `/admin/locations/${id}/toggle-active`,
    );
    return res.data.data;
  },
};
