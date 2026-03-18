import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { userRepository } from '../users/repositories/user.repository';
import { AuthError } from '../../utils/errors';
import { AuthUser, LoginResponse, TokenPayload } from '../../types/auth.types';

export class AuthService {
  async login(identifier: string, password: string): Promise<LoginResponse> {
    const user = await userRepository.findByEmailOrPhone(identifier);

    if (!user) {
      throw new AuthError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new AuthError('Your account is inactive. Contact admin.');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new AuthError('Invalid credentials');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      isAdmin: (user as any).isAdmin ?? false,
    };

    const access_token = this.generateAccessToken(authUser);
    const refresh_token = this.generateRefreshToken(authUser);

    return { access_token, refresh_token, user: authUser };
  }

  generateAccessToken(user: AuthUser): string {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      isAdmin: user.isAdmin,
    };
    return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
  }

  generateRefreshToken(user: AuthUser): string {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      isAdmin: user.isAdmin,
    };
    return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn } as jwt.SignOptions);
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, env.jwtSecret) as TokenPayload;
    } catch {
      throw new AuthError('Invalid or expired token');
    }
  }
}

export const authService = new AuthService();
