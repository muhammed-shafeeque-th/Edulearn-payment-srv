export abstract class IEventProcessRepository {
  abstract isProcessed(eventId: string): Promise<boolean>;
  abstract markAsProcessed(eventId: string): Promise<boolean>;
}
