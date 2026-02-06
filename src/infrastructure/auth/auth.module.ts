import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from '@infrastructure/config/config.service';
import { JwtStrategy } from './jwt.strategy';
import { GrpcJwtStrategy } from './grpc-jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GrpcJwtAuthGuard } from './grpc-jwt-auth.guard';
import { RoleGuard } from './role.auth';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => ({
        secret: configService.jwtSecret,
        signOptions: { expiresIn: configService.jwtExpiresIn },
      }),
    }),
  ],
  providers: [
    JwtStrategy,
    GrpcJwtStrategy,
    JwtAuthGuard,
    GrpcJwtAuthGuard,
    RoleGuard,
  ],
  exports: [JwtAuthGuard, GrpcJwtAuthGuard, RoleGuard],
})
export class AuthModule {}
