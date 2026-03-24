import apiClient from '../api/client';

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  vendorId: string;
  uomId: string;
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
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: string;
  vendorId?: string;
  uomId?: string;
}

export interface ProductsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryIds?: string[];
  vendorIds?: string[];
}

export interface ProductsListResponse {
  data: Product[];
  meta: { page: number; limit: number; total: number };
}

export const productsService = {
  async getAll(params?: ProductsQueryParams): Promise<ProductsListResponse> {
    const res = await apiClient.get<{ success: boolean; data: Product[]; meta: { page: number; limit: number; total: number } }>('/admin/products', {
      params,
    });
    return { data: res.data.data, meta: res.data.meta };
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
