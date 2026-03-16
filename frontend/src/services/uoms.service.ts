import apiClient from '../api/client';

export interface Uom {
  id: string;
  code: string;
  name: string;
}

export interface CreateUomInput {
  code: string;
  name: string;
}

export const uomsService = {
  async getAll(): Promise<Uom[]> {
    const res = await apiClient.get<{ success: boolean; data: Uom[] }>('/uoms');
    return res.data.data;
  },

  async create(input: CreateUomInput): Promise<Uom> {
    const res = await apiClient.post<{ success: boolean; data: Uom }>('/uoms', input);
    return res.data.data;
  },
};
