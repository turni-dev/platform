import { z } from 'zod';

/**
 * The only place a VK payload is understood. Past this file nothing speaks
 * their vocabulary, so a change on their side stops here instead of reaching
 * conversations, guests or policy.
 */
const ConfirmationSchema = z.object({
  type: z.literal('confirmation'),
  group_id: z.number().int().positive(),
  /** Optional on purpose: the very first confirmation may arrive before a
   * secret exists, and the confirmation code is itself the proof. */
  secret: z.string().min(1).optional()
});

const MessageNewSchema = z.object({
  type: z.literal('message_new'),
  event_id: z.string().min(1),
  group_id: z.number().int().positive(),
  /** Required: we always register a secret, so a message without one is not
   * ours to answer. */
  secret: z.string().min(1),
  object: z.object({
    message: z.object({
      from_id: z.number().int(),
      peer_id: z.number().int(),
      text: z.string().min(1)
    })
  })
});

const VkCallbackSchema = z.discriminatedUnion('type', [
  ConfirmationSchema,
  MessageNewSchema
]);

export type VkCallback =
  | Readonly<{ type: 'confirmation'; groupId: number; secret?: string }>
  | Readonly<{
      type: 'message_new';
      eventId: string;
      groupId: number;
      secret: string;
      senderId: string;
      peerId: string;
      text: string;
    }>;

export function parseVkCallback(raw: unknown): VkCallback {
  const parsed = VkCallbackSchema.parse(raw);

  if (parsed.type === 'confirmation') {
    return {
      type: 'confirmation',
      groupId: parsed.group_id,
      ...(parsed.secret === undefined ? {} : { secret: parsed.secret })
    };
  }

  return {
    type: 'message_new',
    eventId: parsed.event_id,
    groupId: parsed.group_id,
    secret: parsed.secret,
    senderId: String(parsed.object.message.from_id),
    peerId: String(parsed.object.message.peer_id),
    text: parsed.object.message.text
  };
}
