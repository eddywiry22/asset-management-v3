import apiClient from '../api/client';

export interface SavedFilter {
  id:         string;
  name:       string;
  module:     string;
  filterJson: Record<string, unknown>;
  createdBy:  string;
  createdAt:  string;
  updatedAt:  string;
}

export interface CreateSavedFilterInput {
  name:       string;
  module:     string;
  filterJson: Record<string, unknown>;
}

export const savedFiltersService = {
  async getAll(module: string): Promise<SavedFilter[]> {
    const res = await apiClient.get<{ success: boolean; data: SavedFilter[] }>('/saved-filters', {
      params: { module },
    });
    return res.data.data;
  },

  async create(input: CreateSavedFilterInput): Promise<SavedFilter> {
    const res = await apiClient.post<{ success: boolean; data: SavedFilter }>('/saved-filters', input);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/saved-filters/${id}`);
  },
};
