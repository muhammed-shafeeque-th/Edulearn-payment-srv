import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BaseHealthCheck,
  HealthCheckResult,
  HealthRegistry,
} from '@edulearn/nest';

@Injectable()
export class DBHealthCheck extends BaseHealthCheck {
  name: string = 'database';

  constructor(
    registry: HealthRegistry,
    private readonly datasource: DataSource,
  ) {
    super(registry);
  }

  async check(): Promise<HealthCheckResult> {
    try {
      await this.datasource.query('SELECT 1');
      return {
        name: 'postgres',
        status: 'up',
      };
    } catch (error: any) {
      return {
        name: 'postgres',
        status: 'down',
        message: error?.message ?? 'postgres down',
      };
    }
  }
}
