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
    const grpcMetadata = context.getArgByIndex(1); // Metadata is the second argument in gRPC
    const authToken = grpcMetadata.get('authorization')?.[0]?.toString();

    if (!authToken || !authToken.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const token = authToken.substring(7); // Remove 'Bearer ' prefix

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.jwtSecret,
      });

      if (!payload.sub || !payload.role) {
        throw new UnauthorizedException('Invalid JWT payload');
      }

      // Attach user info to the request context
      const request = {
        user: { userId: payload.sub, role: payload.role },
      };

      // Store the request in the context for later use
      context.switchToRpc().getContext().user = request.user;

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid JWT token');
    }
  }

  getRequest(context: ExecutionContext) {
    // For gRPC, we don't need to get the request from HTTP context
    return context.switchToRpc().getContext();
  }
}
