import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) {
      return true;
    }

    // Handle both HTTP and gRPC contexts
    let user;
    try {
      // Try HTTP context first
      const request = context.switchToHttp().getRequest();
      user = request.user;
    } catch {
      // If HTTP context fails, try gRPC context
      const grpcContext = context.switchToRpc().getContext();
      user = grpcContext.user;
    }

    return requiredRoles.some((role) => user?.role === role);
  }
}
