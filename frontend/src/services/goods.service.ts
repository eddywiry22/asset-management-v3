import apiClient from '../api/client';

export interface Goods {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  vendorId: string;
  uomId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string };
  vendor: { id: string; name: string };
  uom: { id: string; code: string; name: string };
}

export interface CreateGoodsInput {
  sku: string;
  name: string;
  categoryId: string;
  vendorId: string;
  uomId: string;
  isActive?: boolean;
}

export interface UpdateGoodsInput {
  name?: string;
  categoryId?: string;
  vendorId?: string;
  uomId?: string;
  isActive?: boolean;
}

export const goodsService = {
  async getAll(): Promise<Goods[]> {
    const res = await apiClient.get<{ success: boolean; data: Goods[] }>('/goods');
    return res.data.data;
  },

  async create(input: CreateGoodsInput): Promise<Goods> {
    const res = await apiClient.post<{ success: boolean; data: Goods }>('/goods', input);
    return res.data.data;
  },

  async update(id: string, input: UpdateGoodsInput): Promise<Goods> {
    const res = await apiClient.put<{ success: boolean; data: Goods }>(`/goods/${id}`, input);
    return res.data.data;
  },
};
