import { z } from 'zod';

export const ChannelTypeSchema = z.enum(['telegram', 'widget', 'vk']);
export const ChannelStatusSchema = z.enum(['pending', 'active', 'error', 'disabled']);

/** What the cabinet is allowed to see: never a credential, not even encrypted. */
export const ChannelConnectionSummarySchema = z.strictObject({
  id: z.uuidv7(),
  type: ChannelTypeSchema,
  status: ChannelStatusSchema,
  communityName: z.string().min(1)
});

/** What the inbound path needs: the encrypted key and the shared secret stay
 * inside the backend and are never handed to a route's reply. */
export const ChannelConnectionRecordSchema = z.strictObject({
  id: z.uuidv7(),
  tenantId: z.uuidv7(),
  agentId: z.uuidv7(),
  type: ChannelTypeSchema,
  status: ChannelStatusSchema,
  credentialsEncrypted: z.string().min(1),
  webhookSecret: z.string().min(1),
  metadata: z.record(z.string(), z.unknown())
});

export type ChannelConnectionSummary = z.infer<typeof ChannelConnectionSummarySchema>;
export type ChannelConnectionRecord = z.infer<typeof ChannelConnectionRecordSchema>;

export interface ChannelConnectionRepositoryPort {
  create(record: ChannelConnectionRecord): Promise<void>;
  findById(
    input: Readonly<{ tenantId: string; connectionId: string }>
  ): Promise<ChannelConnectionRecord | undefined>;
  listByTenant(tenantId: string): Promise<readonly ChannelConnectionSummary[]>;
  saveMetadata(
    input: Readonly<{
      tenantId: string;
      connectionId: string;
      metadata: Record<string, unknown>;
    }>
  ): Promise<void>;
  /** Moves a connection to active exactly once; a repeat returns false. */
  activate(
    input: Readonly<{ tenantId: string; connectionId: string }>
  ): Promise<boolean>;
}
