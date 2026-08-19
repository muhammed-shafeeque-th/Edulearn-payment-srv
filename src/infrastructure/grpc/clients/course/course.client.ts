import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { GRPC_COURSE_CLIENT_TOKEN } from './constants';
import { CourseServiceClient } from '@infrastructure/grpc/generated/course_service';

import { ICacheService } from '@application/ports/redis.interface';
import { ClientServiceException } from '@domain/exceptions/domain.exceptions';
import {
  CoursesListData,
  GetCoursesByIdsResponse,
} from '@infrastructure/grpc/generated/course/types/course';
import { ILoggerService } from '@application/ports/logger.service';
import { ICourseClient } from '@application/ports/course-client.interface';

@Injectable()
export class CourseClient
  implements ICourseClient, OnModuleDestroy, OnModuleInit
{
  private orderService!: CourseServiceClient;

  constructor(
    @Inject(GRPC_COURSE_CLIENT_TOKEN) private client: ClientGrpc,
    private readonly _logger: ILoggerService,
    private readonly _redisClient: ICacheService,
  ) {}

  onModuleInit() {
    this.orderService =
      this.client.getService<CourseServiceClient>('CourseService');
    this._logger.info('Course gRPC client initialized');
  }

  onModuleDestroy() {
    this._logger.info('Course gRPC client destroyed');
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

    const cacheResult = await this._redisClient.get(cacheKey);
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
              this._logger.debug(`Fetched courses for ${courseIds} via gRPC`);
              resolve(response.success.courses);
            },
            error: (error: any) => {
              this._logger.error(
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

      await this._redisClient.set(
        cacheKey,
        JSON.stringify(Array.from(courseMap.entries())),
        CACHE_TTL,
      );

      return courseMap;
    } catch (err) {
      this._logger.error('Error fetching courses GRPC', { err });
      throw err;
    }
  }
}
