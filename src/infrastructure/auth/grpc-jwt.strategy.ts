import { AppConfigService } from '@infrastructure/config/config.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';

@Injectable()
export class GrpcJwtStrategy extends PassportStrategy(Strategy, 'grpc-jwt') {
  constructor(configService: AppConfigService) {
    super({
      jwtFromRequest: () => {
        // For gRPC, the token is passed through metadata
        // This will be handled by the guard
        return null;
      },
      ignoreExpiration: false,
      secretOrKey: configService.jwtSecret,
    });
  }

  async validate(payload: any) {
    if (!payload.sub || !payload.role) {
      throw new UnauthorizedException('Invalid JWT payload');
    }
    return { userId: payload.sub, role: payload.role };
  }
}
