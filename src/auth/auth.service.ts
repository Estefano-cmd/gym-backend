import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email.toLowerCase().trim(),
        deletedAt: null,
        status: 'ACTIVE',
      },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: this.mapUser(user),
      tokens,
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new BadRequestException('Refresh token requerido');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          include: {
            roles: { include: { role: true } },
          },
        },
      },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesión expirada, inicie sesión nuevamente');
    }

    if (stored.user.deletedAt || stored.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Usuario inactivo');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(stored.user.id, stored.user.email);
    await this.saveRefreshToken(stored.user.id, tokens.refreshToken);

    return {
      user: this.mapUser(stored.user),
      tokens,
    };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { token: refreshToken, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { message: 'Sesión cerrada correctamente' };
  }

  async getProfile(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        roles: { include: { role: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return this.mapUser(user);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase().trim(), deletedAt: null },
    });

    if (!user) {
      return { message: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    // En producción: enviar correo. En desarrollo se devuelve el token.
    return {
      message: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña',
      ...(process.env.NODE_ENV === 'development' && { resetToken: token }),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token inválido o expirado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Contraseña restablecida correctamente' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Contraseña actual incorrecta');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  private async generateTokens(userId: string, email: string): Promise<AuthTokens> {
    const payload = { sub: userId, email };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const expiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');

    return { accessToken, refreshToken, expiresIn };
  }

  private async saveRefreshToken(userId: string, token: string) {
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const expiresAt = this.parseExpiry(expiresIn);

    await this.prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });
  }

  private parseExpiry(expiry: string): Date {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }

  private mapUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: { role: { slug: string } }[];
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles.map((r) => r.role.slug),
    };
  }
}
