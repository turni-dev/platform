import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';

export type JsonValue =
  | boolean
  | null
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema)
  ])
);

export const EventActorSchema = z.strictObject({
  type: z.enum(['guest', 'owner', 'agent', 'system']),
  id: z.string().min(1).optional()
});

export const DomainEventEnvelopeSchema = z.strictObject({
  id: z.uuidv7(),
  tenantId: z.uuidv7(),
  name: z.string().min(1).max(200),
  version: z.number().int().positive(),
  actor: EventActorSchema,
  correlationId: z.uuidv7(),
  props: z.record(z.string(), JsonValueSchema),
  createdAt: IsoDateTimeSchema
});

export type EventActor = z.infer<typeof EventActorSchema>;
export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelopeSchema>;
