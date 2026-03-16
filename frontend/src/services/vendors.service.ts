import apiClient from '../api/client';

export interface Vendor {
  id: string;
  name: string;
  contactInfo: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorInput {
  name: string;
  contactInfo: string;
  isActive?: boolean;
}

export interface UpdateVendorInput {
  name?: string;
  contactInfo?: string;
  isActive?: boolean;
}

export const vendorsService = {
  async getAll(): Promise<Vendor[]> {
    const res = await apiClient.get<{ success: boolean; data: Vendor[] }>('/admin/vendors');
    return res.data.data;
  },

  async create(input: CreateVendorInput): Promise<Vendor> {
    const res = await apiClient.post<{ success: boolean; data: Vendor }>('/admin/vendors', input);
    return res.data.data;
  },

  async update(id: string, input: UpdateVendorInput): Promise<Vendor> {
    const res = await apiClient.put<{ success: boolean; data: Vendor }>(`/admin/vendors/${id}`, input);
    return res.data.data;
  },
};
