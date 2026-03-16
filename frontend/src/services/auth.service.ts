import apiClient from '../api/client';
import { LoginResponse } from '../types/auth.types';

export async function loginApi(identifier: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post<{ status: string; data: LoginResponse }>('/auth/login', {
    identifier,
    password,
  });
  return res.data.data;
}
