import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { GRPC_USER_CLIENT_TOKEN } from './constants';
// import { Metadata } from '@grpc/grpc-js';
import {
  GetUserResponse,
  UserData,
  UserServiceClient,
} from '@infrastructure/grpc/generated/user_service';
import { ClientServiceException } from '@domain/exceptions/domain.exceptions';
import { ILoggerService } from '@application/ports/logger.service';
import { IUserClient } from '@application/ports/user-client.interface';

@Injectable()
export class UserClient implements IUserClient, OnModuleDestroy, OnModuleInit {
  private userService!: UserServiceClient;

  constructor(
    @Inject(GRPC_USER_CLIENT_TOKEN) private client: ClientGrpc,
    private readonly _logger: ILoggerService,
  ) {}

  onModuleInit() {
    this.userService = this.client.getService<UserServiceClient>('UserService');
    this._logger.info('User gRPC client initialized');
  }

  onModuleDestroy() {
    // this.userService.close();
    this._logger.info('User gRPC client destroyed');
  }

  async getUser(
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
          this._logger.debug(`Fetched user for Id${userId} via gRPC`);
          resolve(response.user);
        },
        error: (error: any) => {
          this._logger.error(
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
