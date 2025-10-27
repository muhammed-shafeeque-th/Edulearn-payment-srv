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

@Module({
  imports: [
    ClientsModule.registerAsync({
      clients: [
        {
          name: GRPC_USER_CLIENT_TOKEN,
          useFactory: (config: AppConfigService) => ({
            transport: Transport.GRPC,
            options: {
              package: 'user_service',
              protoPath: join(
                process.cwd(),
                'src',
                'infrastructure',
                'grpc',
                'protos',
                'user_service.proto',
              ),
              // protoPath: join(__dirname, '..', 'proto', 'user_service.proto'),
              url: `0.0.0.0:${config.userGrpcPort}`,
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
              protoPath: join(
                process.cwd(),
                'src',
                'infrastructure',
                'grpc',
                'protos',
                'order_service.proto',
              ),
              // protoPath: join(__dirname, '..', 'proto', 'order_service.proto'),
              url: `0.0.0.0:${config.orderGrpcPort}`,
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
              protoPath: join(
                process.cwd(),
                'src',
                'infrastructure',
                'grpc',
                'protos',
                'course_service.proto',
              ),
              url: `0.0.0.0:${config.courseGrpcPort}`,
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
