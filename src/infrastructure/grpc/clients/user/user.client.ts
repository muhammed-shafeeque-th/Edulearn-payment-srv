import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { LoggingService } from 'src/infrastructure/observability/logging/logging.service';
import { GRPC_USER_CLIENT_TOKEN } from './constants';
import { Metadata } from '@grpc/grpc-js';
import { UserServiceClient } from '@infrastructure/grpc/generated/user_service';

@Injectable()
export class UserClient implements OnModuleDestroy, OnModuleInit {
  private userService!: UserServiceClient;

  constructor(
    @Inject(GRPC_USER_CLIENT_TOKEN) private client: ClientGrpc,
    private readonly logger: LoggingService,
  ) {}

  onModuleInit() {
    this.userService = this.client.getService<UserServiceClient>('UserService');
    this.logger.info('User gRPC client initialized');
  }

  onModuleDestroy() {
    this.userService.close();
    this.logger.info('User gRPC client destroyed');
  }

  async getOrder(
    userId: string,
    metadata: Metadata = new Metadata(),
  ): Promise<{ id: string; firstName: string }> {
    return new Promise((resolve, reject) => {
      this.userService.getUser({ userId }, metadata, (error, response) => {
        if (error) {
          this.logger.error(
            `Failed to fetch user ${userId}: ${error.message}`,
            {
              error,
            },
          );
          reject(error);
        }
        if (response.error) {
          throw new Error(response.error.message);
        }
        const { user } = response ?? {};

        this.logger.debug(`Fetched user ${userId} via gRPC`);
        resolve({ id: user!.id, firstName: user!.firstName });
      });
    });
  }
}
