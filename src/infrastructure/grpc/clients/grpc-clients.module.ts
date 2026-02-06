import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { UserClient } from './user/user.client';
import { GRPC_USER_CLIENT_TOKEN } from './user/constants';
import { AppConfigService } from '@infrastructure/config/config.service';
import { GRPC_ORDER_CLIENT_TOKEN } from './order/constants';
import { OrderClient } from './order/order.client';
import { GRPC_COURSE_CLIENT_TOKEN } from './course/constants';
import { CourseClient } from './course/course.client';
import { RedisModule } from '@infrastructure/redis/redis.module';

@Module({
  imports: [
    RedisModule,
    ClientsModule.registerAsync({
      clients: [
        {
          name: GRPC_USER_CLIENT_TOKEN,
          useFactory: (config: AppConfigService) => ({
            transport: Transport.GRPC,
            options: {
              package: 'user_service',
              protoPath: join(process.cwd(), 'proto', 'user_service.proto'),
              // protoPath: join(__dirname, '..', 'proto', 'user_service.proto'),
              url: `${config.userGrpcUrl}`,
            },
          }),
          inject: [AppConfigService],
        },
        {
          name: GRPC_ORDER_CLIENT_TOKEN,
          useFactory: (config: AppConfigService) => ({
            transport: Transport.GRPC,
            options: {
              package: 'order_service',
              protoPath: join(process.cwd(), 'proto', 'order_service.proto'),
              // protoPath: join(__dirname, '..', 'proto', 'order_service.proto'),
              url: `${config.orderGrpcUrl}`,
            },
          }),
          inject: [AppConfigService],
        },
        {
          name: GRPC_COURSE_CLIENT_TOKEN,
          useFactory: (config: AppConfigService) => ({
            transport: Transport.GRPC,
            options: {
              package: 'course_service',
              protoPath: join(process.cwd(), 'proto', 'course_service.proto'),
              url: `${config.courseGrpcUrl}`,
              loader: {
                includeDirs: [join(process.cwd(), 'proto')],
              },
            },
          }),
          inject: [AppConfigService],
        },
      ],
    }),
  ],
  providers: [UserClient, OrderClient, CourseClient],
  exports: [UserClient, OrderClient, CourseClient],
})
export class GrpcClientsModule {}
