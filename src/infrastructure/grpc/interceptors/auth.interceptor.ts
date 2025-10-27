import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const grpcMetadata = context.getArgByIndex(1); // Metadata is the second argument in gRPC
    const authToken = grpcMetadata.get('authorization')?.[0]?.toString();

    if (!authToken || !authToken.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    // The token will be validated by JwtAuthGuard
    return next.handle();
  }
}
