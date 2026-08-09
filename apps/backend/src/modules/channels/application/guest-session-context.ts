import { z } from 'zod';

export const GuestSessionContextSchema = z.strictObject({
  tenantId: z.uuidv7(),
  agentId: z.uuidv7(),
  guestId: z.uuidv7().optional(),
  connectionId: z.uuidv7(),
  sessionId: z.uuidv7()
});

export type GuestSessionContext = z.infer<typeof GuestSessionContextSchema>;

export interface GuestSessionContextResolver {
  resolve(widgetKey: string): Promise<GuestSessionContext>;
}

export class FakeGuestSessionContextResolver implements GuestSessionContextResolver {
  public constructor(
    private readonly contexts: Readonly<Record<string, GuestSessionContext>>
  ) {}

  public resolve(widgetKey: string): Promise<GuestSessionContext> {
    const context = this.contexts[widgetKey];
    if (context === undefined) {
      return Promise.reject(new Error('Guest session context not found.'));
    }
    return Promise.resolve(GuestSessionContextSchema.parse(context));
  }
}
