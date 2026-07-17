import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.id) throw new ForbiddenException('Acceso denegado');

    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null, status: 'ACTIVE' },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!dbUser) throw new ForbiddenException('Acceso denegado');

    const userPerms = new Set<string>();
    for (const ur of dbUser.roles) {
      for (const rp of ur.role.permissions) {
        userPerms.add(rp.permission.slug);
      }
    }

    if (userPerms.has('all')) return true;

    const hasPermission = required.some((p) => userPerms.has(p));
    if (!hasPermission) {
      throw new ForbiddenException('No tiene permisos para esta acción');
    }

    return true;
  }
}
