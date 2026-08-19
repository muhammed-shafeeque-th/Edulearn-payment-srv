import { Injectable } from '@nestjs/common';
import {
  BaseHealthCheck,
  HealthCheckResult,
  HealthRegistry,
} from '@edulearn/nest';
import { KafkaHealthService } from '@infrastructure/kafka/kafka-heath.service';

@Injectable()
export class KafkaHealthCheck extends BaseHealthCheck {
  name: string = 'kafka';

  constructor(
    registry: HealthRegistry,
    private readonly kafkaHealthService: KafkaHealthService,
  ) {
    super(registry);
  }

  async check(): Promise<HealthCheckResult> {
    try {
      await this.kafkaHealthService.ping();
      return {
        name: 'kafka',
        status: 'up',
      };
    } catch (error: any) {
      return {
        name: 'kafka',
        status: 'down',
        message: error.message ?? 'Kafka down',
      };
    }
  }
}
