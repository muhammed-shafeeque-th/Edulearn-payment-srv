import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '@infrastructure/config/config.service';

@Injectable()
export class GrpcJwtAuthGuard extends AuthGuard('grpc-jwt') {
  constructor(
    private jwtService: JwtService,
    private configService: AppConfigService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const grpcMetadata = context.getArgByIndex(1);
    const authToken = grpcMetadata.get('authorization')?.[0]?.toString();

    if (!authToken || !authToken.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const token = authToken.substring(7);

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.jwtSecret,
      });

      if (!payload.sub || !payload.role) {
        throw new UnauthorizedException('Invalid JWT payload');
      }

      const request = {
        user: { userId: payload.sub, role: payload.role },
      };

      context.switchToRpc().getContext().user = request.user;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid JWT token');
    }
  }

  getRequest(context: ExecutionContext) {
    return context.switchToRpc().getContext();
  }
}
