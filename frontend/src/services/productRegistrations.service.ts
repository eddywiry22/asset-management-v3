import apiClient from '../api/client';

export interface ProductRegistration {
  id:         string;
  productId:  string;
  locationId: string;
  isActive:   boolean;
  createdAt:  string;
  updatedAt:  string;
  product:    { id: string; sku: string; name: string };
  location:   { id: string; code: string; name: string };
}

export interface CreateProductRegistrationInput {
  productId:  string;
  locationId: string;
  isActive?:  boolean;
}

export interface UpdateProductRegistrationInput {
  isActive: boolean;
}

export interface DeactivationCheck {
  canDeactivate: boolean;
  pendingCount:  number;
  adjustments:   number;
  transfers:     number;
}

export interface BulkToggleResult {
  successCount: number;
  failed:       { id: string; reason: string }[];
}

export interface ProductRegistrationListResponse {
  data:  ProductRegistration[];
  meta: {
    page:     number;
    pageSize: number;
    total:    number;
  };
}

export const productRegistrationsService = {
  async getAll(params: {
    page?:       number;
    pageSize?:   number;
    status?:     string;
    productId?:  string;
    locationId?: string;
  } = {}): Promise<ProductRegistrationListResponse> {
    const query: Record<string, string> = {};
    if (params.page      != null) query.page      = String(params.page);
    if (params.pageSize  != null) query.pageSize  = String(params.pageSize);
    if (params.status)             query.status    = params.status;
    if (params.productId)          query.productId  = params.productId;
    if (params.locationId)         query.locationId = params.locationId;

    const res = await apiClient.get<{ success: boolean; data: ProductRegistration[]; meta: { page: number; pageSize: number; total: number } }>(
      '/admin/product-registrations',
      { params: query },
    );
    return { data: res.data.data, meta: res.data.meta };
  },

  async create(input: CreateProductRegistrationInput): Promise<ProductRegistration> {
    const res = await apiClient.post<{ success: boolean; data: ProductRegistration }>(
      '/admin/product-registrations',
      input,
    );
    return res.data.data;
  },

  async update(id: string, input: UpdateProductRegistrationInput): Promise<ProductRegistration> {
    const res = await apiClient.put<{ success: boolean; data: ProductRegistration }>(
      `/admin/product-registrations/${id}`,
      input,
    );
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/admin/product-registrations/${id}`);
  },

  async checkDeactivation(id: string): Promise<DeactivationCheck> {
    const res = await apiClient.get<{ success: boolean; data: DeactivationCheck }>(
      `/admin/product-registrations/${id}/check-deactivate`,
    );
    return res.data.data;
  },

  async bulkToggle(ids: string[], isActive: boolean): Promise<BulkToggleResult> {
    const res = await apiClient.post<{ success: boolean; data: BulkToggleResult }>(
      '/admin/product-registrations/bulk-toggle',
      { ids, isActive },
    );
    return res.data.data;
  },
};
