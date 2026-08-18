import { Inject, Injectable } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { KAFKA_CLIENT } from './constants';

@Injectable()
export class KafkaHealthService {
  constructor(
    @Inject(KAFKA_CLIENT)
    private readonly client: ClientKafka,
  ) {}

  async ping(): Promise<boolean> {
    try {
      await this.client.connect();
      return true;
    } catch {
      return false;
    }
  }
}
