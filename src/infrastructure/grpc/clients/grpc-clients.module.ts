import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import path from 'path';
import { getProtoPath, PROTO_ROOT_DIR } from '@edulearn/core';
import { UserClient } from './user/user.client';
import { GRPC_USER_CLIENT_TOKEN } from './user/constants';
import { AppConfigService } from '@infrastructure/config/config.service';
import { GRPC_ORDER_CLIENT_TOKEN } from './order/constants';
import { OrderClient } from './order/order.client';
import { GRPC_COURSE_CLIENT_TOKEN } from './course/constants';
import { CourseClient } from './course/course.client';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { IOrderClient } from '../../../application/ports/order-client.interface';
import { IUserClient } from '../../../application/ports/user-client.interface';
import { ICourseClient } from '../../../application/ports/course-client.interface';

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
              protoPath: [getProtoPath('user')],
              loader: {
                includeDirs: [path.join(PROTO_ROOT_DIR, 'user')],
              },
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
              protoPath: [getProtoPath('order')],
              loader: {
                includeDirs: [path.join(PROTO_ROOT_DIR, 'order')],
              },
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
              protoPath: [getProtoPath('course')],
              loader: {
                includeDirs: [path.join(PROTO_ROOT_DIR, 'course')],
              },
              url: `${config.courseGrpcUrl}`,
            },
          }),
          inject: [AppConfigService],
        },
      ],
    }),
  ],
  providers: [
    { provide: IUserClient, useClass: UserClient },
    { provide: IOrderClient, useClass: OrderClient },
    { provide: ICourseClient, useClass: CourseClient },
  ],
  exports: [IUserClient, IOrderClient, ICourseClient],
})
export class GrpcClientsModule {}
