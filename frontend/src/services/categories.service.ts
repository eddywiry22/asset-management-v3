import apiClient from '../api/client';

export interface Category {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  isActive?: boolean;
}

export const categoriesService = {
  async getAll(): Promise<Category[]> {
    const res = await apiClient.get<{ success: boolean; data: Category[] }>('/categories');
    return res.data.data;
  },

  async create(input: CreateCategoryInput): Promise<Category> {
    const res = await apiClient.post<{ success: boolean; data: Category }>('/categories', input);
    return res.data.data;
  },

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const res = await apiClient.put<{ success: boolean; data: Category }>(`/categories/${id}`, input);
    return res.data.data;
  },
};
