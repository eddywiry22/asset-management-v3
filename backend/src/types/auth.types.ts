export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
}

export interface TokenPayload {
  sub: string;
  email: string | null;
  phone: string | null;
  isAdmin: boolean;
  iat?: number;
  exp?: number;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}
