import { z } from 'zod';

export const AgentFileRecordSchema = z.strictObject({
  path: z.string().min(1).max(200),
  revision: z.number().int().positive(),
  content: z.string()
});

export const AgentFileRevisionSchema = z.strictObject({
  tenantId: z.uuidv7(),
  agentId: z.uuidv7(),
  fileId: z.uuidv7(),
  revisionId: z.uuidv7(),
  path: z.string().min(1).max(200),
  revision: z.number().int().positive(),
  content: z.string(),
  authorUserId: z.uuidv7()
});

export const AgentFileIndexEntrySchema = AgentFileRecordSchema.omit({ content: true });

export type AgentFileRecord = z.infer<typeof AgentFileRecordSchema>;
export type AgentFileRevision = z.infer<typeof AgentFileRevisionSchema>;
export type AgentFileIndexEntry = z.infer<typeof AgentFileIndexEntrySchema>;

/**
 * The owner-editable half of `memory_files`: one markdown file per row, each
 * save an immutable revision. Content never appears in a log or an event.
 */
export interface AgentFileStorePort {
  /** The index carries no content: a knowledge list must not ship the whole
   * business to the browser on every page load. */
  list(
    input: Readonly<{ tenantId: string; agentId: string }>
  ): Promise<readonly AgentFileIndexEntry[]>;
  read(
    input: Readonly<{ tenantId: string; agentId: string; path: string }>
  ): Promise<AgentFileRecord | undefined>;
  /** Writes the revision and moves `current_rev` in one transaction. */
  saveRevision(revision: AgentFileRevision): Promise<void>;
  remove(
    input: Readonly<{ tenantId: string; agentId: string; path: string }>
  ): Promise<boolean>;
}
