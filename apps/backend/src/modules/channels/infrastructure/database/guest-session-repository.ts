import { z } from 'zod';

const uuidV7 = z.uuidv7();
const tokenHash = z.instanceof(Uint8Array).refine((value) => value.length > 0);

const GuestSessionInsertSchema = z.strictObject({
  id: uuidV7,
  tenantId: uuidV7,
  agentId: uuidV7,
  connectionId: uuidV7,
  guestId: uuidV7.optional(),
  tokenHash,
  tokenKid: z.string().trim().min(1).max(128),
  issuedAt: z.date(),
  expiresAt: z.date()
}).refine((input) => input.issuedAt < input.expiresAt, {
  message: 'Guest session expiry must be after issuance.',
  path: ['expiresAt']
});

const GuestSessionLookupSchema = z.strictObject({
  tenantId: uuidV7,
  tokenHash
});

const GuestSessionRevocationSchema = GuestSessionLookupSchema.extend({
  revokedAt: z.date()
});

const GuestSessionRecordSchema = GuestSessionInsertSchema.extend({
  revokedAt: z.date().optional(),
  lastUsedAt: z.date().optional(),
  createdAt: z.date()
});

export type GuestSessionInsert = z.output<typeof GuestSessionInsertSchema>;
export type GuestSessionLookup = z.output<typeof GuestSessionLookupSchema>;
export type GuestSessionRevocation = z.output<typeof GuestSessionRevocationSchema>;
export type GuestSessionRecord = z.output<typeof GuestSessionRecordSchema>;

export interface GuestSessionDatabaseExecutor {
  insertGuestSession(input: GuestSessionInsert): Promise<void>;
  findGuestSessionByTokenHash(
    input: GuestSessionLookup
  ): Promise<GuestSessionRecord | undefined>;
  revokeGuestSessionByTokenHash(input: GuestSessionRevocation): Promise<boolean>;
}

export class GuestSessionRepository {
  public constructor(private readonly database: GuestSessionDatabaseExecutor) {}

  public async insert(input: GuestSessionInsert): Promise<void> {
    await this.database.insertGuestSession(GuestSessionInsertSchema.parse(input));
  }

  public async findByTokenHash(
    input: GuestSessionLookup
  ): Promise<GuestSessionRecord | undefined> {
    const found = await this.database.findGuestSessionByTokenHash(
      GuestSessionLookupSchema.parse(input)
    );
    return found === undefined ? undefined : GuestSessionRecordSchema.parse(found);
  }

  public async revokeByTokenHash(input: GuestSessionRevocation): Promise<boolean> {
    return z.boolean().parse(
      await this.database.revokeGuestSessionByTokenHash(
        GuestSessionRevocationSchema.parse(input)
      )
    );
  }
}
