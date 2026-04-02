import apiClient from '../api/client';

export interface ProductRegistration {
  id:         string;
  productId:  string;
  locationId: string;
  isActive:   boolean;
  createdAt:  string;
  updatedAt:  string;
  product:    { id: string; sku: string; name: string; lifecycleStatus: 'ACTIVE' | 'RETIRED'; category?: { id: string; name: string } | null };
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
    page?:         number;
    pageSize?:     number;
    status?:       string;
    productId?:    string;
    locationId?:   string;
    productIds?:   string[];
    locationIds?:  string[];
    categoryIds?:  string[];
  } = {}): Promise<ProductRegistrationListResponse> {
    const { page, pageSize, status, productId, locationId, productIds, locationIds, categoryIds } = params;
    const query = new URLSearchParams();
    if (page     != null) query.set('page',     String(page));
    if (pageSize != null) query.set('pageSize', String(pageSize));
    if (status)           query.set('status',   status);

    // Arrays: use repeated params (productIds=a&productIds=b)
    if (productIds && productIds.length > 0) {
      productIds.forEach(id => query.append('productIds', id));
    } else if (productId) {
      query.set('productId', productId);
    }

    if (locationIds && locationIds.length > 0) {
      locationIds.forEach(id => query.append('locationIds', id));
    } else if (locationId) {
      query.set('locationId', locationId);
    }

    if (categoryIds && categoryIds.length > 0) {
      categoryIds.forEach(id => query.append('categoryIds', id));
    }

    const res = await apiClient.get<{
      success: boolean;
      data: ProductRegistration[];
      meta: { page: number; pageSize: number; total: number };
    }>(`/admin/product-registrations?${query.toString()}`);
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
