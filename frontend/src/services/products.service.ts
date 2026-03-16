import apiClient from '../api/client';

export interface Product {
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

export interface CreateProductInput {
  sku: string;
  name: string;
  categoryId: string;
  vendorId: string;
  uomId: string;
  isActive?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: string;
  vendorId?: string;
  uomId?: string;
  isActive?: boolean;
}

export const productsService = {
  async getAll(): Promise<Product[]> {
    const res = await apiClient.get<{ success: boolean; data: Product[] }>('/admin/products');
    return res.data.data;
  },

  async create(input: CreateProductInput): Promise<Product> {
    const res = await apiClient.post<{ success: boolean; data: Product }>('/admin/products', input);
    return res.data.data;
  },

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const res = await apiClient.put<{ success: boolean; data: Product }>(`/admin/products/${id}`, input);
    return res.data.data;
  },
};
