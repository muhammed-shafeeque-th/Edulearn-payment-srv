// import { Injectable, OnModuleDestroy } from '@nestjs/common';
// import { Kafka, Producer } from 'kafkajs';
// import { AppConfigService } from '@infrastructure/config/config.service';
// import { IKafkaProducer } from '@domain/interfaces/kafka-producer.interface';
// import {
//   PaymentEventSchema,
//   RefundEventSchema,
// } from '@infrastructure/kafka/avro.types';
// import { TracingService } from '@infrastructure/observability/tracing/trace.service';
// import { LoggingService } from '@infrastructure/observability/logging/logging.service';

// @Injectable()
// export class IKafkaProducerImpl implements IKafkaProducer, OnModuleDestroy {
//   private readonly producer: Producer;

//   constructor(
//     private readonly configService: AppConfigService,
//     private readonly logger: LoggingService,
//     private readonly tracer: TracingService,
//   ) {
//     const kafka = new Kafka({
//       clientId: this.configService.kafkaClientId,
//       brokers: this.configService.kafkaBrokers,
//       retry: {
//         initialRetryTime: 100,
//         retries: 3,
//       },
//     });
//     this.producer = kafka.producer({
//       idempotent: true,
//       maxInFlightRequests: 1,
//       retry: {
//         initialRetryTime: 100,
//         retries: 3,
//       },
//     });
//     this.connect();
//   }

//   private async connect() {
//     try {
//       await this.producer.connect();
//       this.logger.debug('Kafka producer connected', { ctx: 'IKafkaProducer' });
//     } catch (error: any) {
//       this.logger.error(`Failed to connect Kafka producer: ${error.message}`, {
//         error,
//         ctx: 'IKafkaProducer',
//       });
//       throw error;
//     }
//   }

//   async sendPaymentEvent(event: any): Promise<void> {
//     return await this.tracer.startActiveSpan(
//       'IKafkaProducer.sendPaymentEvent',
//       async (span) => {
//         span.setAttribute('event.type', event.eventType);
//         try {
//           const buffer = PaymentEventSchema.toBuffer(event);
//           await this.producer.send({
//             topic: 'payment-service.payment.events',
//             messages: [{ value: buffer }],
//           });
//           this.logger.debug(`Published payment event: ${JSON.stringify(event)}`, {
//             ctx: 'IKafkaProducer',
//           });
//         } catch (error: any) {
//           this.logger.error(
//             `Failed to publish payment event: ${error.message}`,
//             { error, ctx: 'IKafkaProducer' },
//           );
//           throw error;
//         }
//       },
//     );
//   }

//   async sendRefundEvent(event: any): Promise<void> {
//     return await this.tracer.startActiveSpan(
//       'IKafkaProducer.sendRefundEvent',
//       async (span) => {
//         span.setAttribute('event.type', event.eventType);
//         try {
//           const buffer = RefundEventSchema.toBuffer(event);
//           await this.producer.send({
//             topic: 'payment-service.refund.events',
//             messages: [{ value: buffer }],
//           });
//           this.logger.debug(`Published refund event: ${JSON.stringify(event)}`, {
//             ctx: 'IKafkaProducer',
//           });
//         } catch (error: any) {
//           this.logger.error(
//             `Failed to publish refund event: ${error.message}`,
//             { error, ctx: 'IKafkaProducer' },
//           );
//           throw error;
//         }
//       },
//     );
//   }

//   async onModuleDestroy() {
//     await this.producer.disconnect();
//     this.logger.debug('Kafka producer disconnected', { ctx: 'IKafkaProducer' });
//   }
// }
