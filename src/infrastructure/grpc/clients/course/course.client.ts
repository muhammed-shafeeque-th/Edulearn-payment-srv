import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { LoggingService } from 'src/infrastructure/observability/logging/logging.service';
import { GRPC_COURSE_CLIENT_TOKEN } from './constants';
import { CourseServiceClient } from '@infrastructure/grpc/generated/course';
import { Metadata } from '@grpc/grpc-js';

@Injectable()
export class CourseClient implements OnModuleDestroy, OnModuleInit {
  private orderService!: CourseServiceClient;

  constructor(
    @Inject(GRPC_COURSE_CLIENT_TOKEN) private client: ClientGrpc,
    private readonly logger: LoggingService,
  ) {}

  onModuleInit() {
    this.orderService =
      this.client.getService<CourseServiceClient>('CourseService');
    this.logger.info('Course gRPC client initialized');
  }

  onModuleDestroy() {
    this.orderService.close();
    this.logger.info('Course gRPC client destroyed');
  }

  async getCourseItems(
    courseIds: string[],
    metadata: Metadata = new Metadata(),
  ): Promise<
    | Map<
        string,
        {
          title: string;
          description: string;
          thumbnail?: string;
        }
      >
    | undefined
  > {
    return new Promise((resolve, reject) => {
      this.orderService.getCoursesByIds(
        { courseIds },
        metadata,
        (error, response) => {
          if (error) {
            this.logger.error(
              `Failed to fetch courses by ids: ${error.message}`,
              {
                error,
              },
            );
            reject(error);
          }
          if (response.error) {
            throw new Error(response.error.message);
          }
          const { courses } = response.success ?? {};
          type ResultType = Map<
            string,
            {
              title: string;
              description: string;
              thumbnail?: string;
            }
          >;

          this.logger.debug(`Fetched orders with ids via gRPC`);
          resolve(
            courses?.courses?.reduce(
              (acc: ResultType, curr) =>
                acc.set(curr.id, {
                  description: curr.description!.slice(0, 50),
                  title: curr.title!,
                  thumbnail: curr.thumbnail,
                }),
              new Map(),
            ),
          );
        },
      );
    });
  }
}
