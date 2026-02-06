import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { LoggingService } from 'src/infrastructure/observability/logging/logging.service';
import { GRPC_USER_CLIENT_TOKEN } from './constants';
// import { Metadata } from '@grpc/grpc-js';
import {
  GetUserResponse,
  UserData,
  UserServiceClient,
} from '@infrastructure/grpc/generated/user_service';
import { ClientServiceException } from '@domain/exceptions/domain.exceptions';

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
    // this.userService.close();
    this.logger.info('User gRPC client destroyed');
  }

  async getOrder(
    userId: string,
    // metadata: Metadata = new Metadata(),
  ): Promise<{ id: string; firstName: string }> {
    const userRes = await new Promise<UserData>((resolve, reject) => {
      this.userService.getUser({ userId }).subscribe({
        next: (response: GetUserResponse) => {
          if (response.error) {
            return reject(new ClientServiceException(response.error.message));
          }
          if (!response.user) {
            return reject(
              new ClientServiceException(
                `Can't fetch User from user service for id ${userId}`,
              ),
            );
          }
          this.logger.debug(`Fetched user for Id${userId} via gRPC`);
          resolve(response.user);
        },
        error: (error: any) => {
          this.logger.error(
            `Failed to fetch courses by ids: ${error.message}`,
            { error },
          );
          reject(error);
        },
      });
    });

    return { id: userRes.id, firstName: userRes.firstName };
  }
}
