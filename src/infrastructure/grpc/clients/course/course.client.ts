import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { LoggingService } from 'src/infrastructure/observability/logging/logging.service';
import { GRPC_COURSE_CLIENT_TOKEN } from './constants';
import { CourseServiceClient } from '@infrastructure/grpc/generated/course_service';

import { ICacheService } from '@application/adaptors/redis.interface';
import { ClientServiceException } from '@domain/exceptions/domain.exceptions';
import {
  CoursesListData,
  GetCoursesByIdsResponse,
} from '@infrastructure/grpc/generated/course/types/course';

@Injectable()
export class CourseClient implements OnModuleDestroy, OnModuleInit {
  private orderService!: CourseServiceClient;

  constructor(
    @Inject(GRPC_COURSE_CLIENT_TOKEN) private client: ClientGrpc,
    private readonly logger: LoggingService,
    private readonly redisClient: ICacheService,
  ) {}

  onModuleInit() {
    this.orderService =
      this.client.getService<CourseServiceClient>('CourseService');
    this.logger.info('Course gRPC client initialized');
  }

  onModuleDestroy() {
    this.logger.info('Course gRPC client destroyed');
  }

  async getCourseItems(courseIds: string[]): Promise<
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
    const CACHE_TTL = 10 * 60;
    const cacheKey = `course_prices:${courseIds.sort().join(',')}`;

    const cacheResult = await this.redisClient.get(cacheKey);
    if (cacheResult) {
      const parsed = JSON.parse(cacheResult);

      return new Map(parsed);
    }

    try {
      const coursesResult = await new Promise<CoursesListData>(
        (resolve, reject) => {
          this.orderService.getCoursesByIds({ courseIds }).subscribe({
            next: (response: GetCoursesByIdsResponse) => {
              if (response.error) {
                return reject(
                  new ClientServiceException(response.error.message),
                );
              }
              if (!response.success?.courses) {
                return reject(
                  new ClientServiceException(
                    `Can't fetch courses from course service for ids ${courseIds}`,
                  ),
                );
              }
              this.logger.debug(`Fetched courses for ${courseIds} via gRPC`);
              resolve(response.success.courses);
            },
            error: (error: any) => {
              this.logger.error(
                `Failed to fetch courses by ids: ${error.message}`,
                { error },
              );
              reject(error);
            },
          });
        },
      );

      const courseMap = new Map<
        string,
        { title: string; description: string; thumbnail?: string }
      >();
      coursesResult.courses.forEach((course) => {
        if (!course?.id) return;
        courseMap.set(course.id, {
          title: course.title!,
          description: course.description
            ? course.description.slice(0, 50)
            : '',
          thumbnail: course.thumbnail,
        });
      });

      await this.redisClient.set(
        cacheKey,
        JSON.stringify(Array.from(courseMap.entries())),
        CACHE_TTL,
      );

      return courseMap;
    } catch (err) {
      this.logger.error('Error fetching courses GRPC', { err });
      throw err;
    }
  }
}
