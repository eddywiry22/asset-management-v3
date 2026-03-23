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

export const productRegistrationsService = {
  async getAll(status: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL'): Promise<ProductRegistration[]> {
    const res = await apiClient.get<{ success: boolean; data: ProductRegistration[] }>(
      '/admin/product-registrations',
      { params: { status } },
    );
    return res.data.data;
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
};
