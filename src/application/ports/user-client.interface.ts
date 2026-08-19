export abstract class IUserClient {
  abstract getUser(
    userId: string, // metadata: Metadata = new Metadata(),
  ): Promise<{ id: string; firstName: string }>;
}
