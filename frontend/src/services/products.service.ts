import apiClient from '../api/client';

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  vendorId: string;
  uomId: string;
  lifecycleStatus: 'ACTIVE' | 'RETIRED';
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

  async retire(id: string): Promise<Product> {
    const res = await apiClient.patch<{ success: boolean; data: Product }>(`/admin/products/${id}/retire`);
    return res.data.data;
  },

  async renameSku(id: string, newSku: string): Promise<Product> {
    const res = await apiClient.patch<{ success: boolean; data: Product }>(`/admin/products/${id}/rename-sku`, { newSku });
    return res.data.data;
  },

  async downloadBulkTemplate(): Promise<void> {
    const res = await apiClient.get('/admin/products/bulk-template', {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-product-template.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  async uploadBulkProducts(file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/admin/products/bulk-upload', formData, {
      responseType: 'blob',
      headers: { 'Content-Type': undefined }, // clear json default; let browser set multipart boundary
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-upload-result.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
