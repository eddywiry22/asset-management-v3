import apiClient from '../api/client';

export type UserRole = 'OPERATOR' | 'MANAGER';
export type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export interface AssignedLocation {
  locationId: string;
  locationCode: string;
  locationName: string;
  isActive: boolean;
  role: UserRole;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  assignedLocations: AssignedLocation[];
}

export interface CreateUserInput {
  username: string;
  email?: string | null;
  phone?: string | null;
  password: string;
  role: UserRole;
  locationIds: string[];
}

export interface UpdateUserInput {
  username?: string;
  email?: string | null;
  phone?: string | null;
  role?: UserRole;
  locationIds?: string[];
}

export const adminUsersService = {
  async getAll(
    status?: StatusFilter,
    role?: UserRole,
    locationId?: string,
  ): Promise<AdminUser[]> {
    const params: Record<string, string> = {};
    if (status && status !== 'ALL') params.status = status;
    if (role) params.role = role;
    if (locationId) params.locationId = locationId;
    const res = await apiClient.get<{ success: boolean; data: AdminUser[] }>(
      '/admin/users',
      { params },
    );
    return res.data.data;
  },

  async create(input: CreateUserInput): Promise<AdminUser> {
    const res = await apiClient.post<{ success: boolean; data: AdminUser }>(
      '/admin/users',
      input,
    );
    return res.data.data;
  },

  async update(id: string, input: UpdateUserInput): Promise<AdminUser> {
    const res = await apiClient.put<{ success: boolean; data: AdminUser }>(
      `/admin/users/${id}`,
      input,
    );
    return res.data.data;
  },

  async toggleActive(id: string): Promise<AdminUser> {
    const res = await apiClient.patch<{ success: boolean; data: AdminUser }>(
      `/admin/users/${id}/toggle-active`,
    );
    return res.data.data;
  },

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await apiClient.patch(`/admin/users/${id}/reset-password`, { newPassword });
  },
};
