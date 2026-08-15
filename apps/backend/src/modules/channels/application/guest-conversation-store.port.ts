import { z } from 'zod';

export const GuestResolutionSchema = z.strictObject({
  tenantId: z.uuidv7(),
  /** '<channel>:<external id>', the one key every channel identifies a guest
   * by until a phone number is known. */
  channelRef: z.string().min(3),
  guestId: z.uuidv7(),
  seenAt: z.date()
});

export const ConversationResolutionSchema = z.strictObject({
  tenantId: z.uuidv7(),
  agentId: z.uuidv7(),
  connectionId: z.uuidv7(),
  guestId: z.uuidv7(),
  conversationId: z.uuidv7()
});

export const MessageAppendSchema = z.strictObject({
  tenantId: z.uuidv7(),
  conversationId: z.uuidv7(),
  messageId: z.uuidv7(),
  role: z.enum(['guest', 'agent']),
  content: z.string().min(1)
});

export type GuestResolution = z.infer<typeof GuestResolutionSchema>;
export type ConversationResolution = z.infer<typeof ConversationResolutionSchema>;
export type MessageAppend = z.infer<typeof MessageAppendSchema>;

/**
 * Where a channel message lands. Both resolvers are idempotent: the proposed
 * id is used only when nothing exists yet, and the existing id comes back
 * otherwise, so a guest writing twice keeps one guest row and one thread.
 */
export interface GuestConversationStorePort {
  resolveGuest(input: GuestResolution): Promise<string>;
  resolveConversation(input: ConversationResolution): Promise<string>;
  appendMessage(input: MessageAppend): Promise<void>;
}
