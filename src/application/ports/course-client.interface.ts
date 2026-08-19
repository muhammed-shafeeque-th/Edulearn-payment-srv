export abstract class ICourseClient {
  abstract getCourseItems(courseIds: string[]): Promise<
    | Map<
        string,
        {
          title: string;
          description: string;
          thumbnail?: string;
        }
      >
    | undefined
  >;
}
