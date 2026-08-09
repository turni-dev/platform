import { createHash } from 'node:crypto';
import type { GuestSession, GuestSessionRequest } from '@turni/contracts';
import type { GuestSessionService } from './guest-session.js';
import { parseGuestSessionStoreRecord, type GuestSessionStorePort, type UuidV7GeneratorPort } from './guest-session-store.port.js';
import { GuestSessionContextSchema, type GuestSessionContext } from './guest-session-context.js';

export class DurableGuestSessionService {
  public constructor(private readonly signed: GuestSessionService, private readonly store: GuestSessionStorePort, private readonly ids: UuidV7GeneratorPort) {}
  public async issue(request: GuestSessionRequest, now = new Date()): Promise<GuestSession> {
    const session = this.signed.issue(request, now);
    const routing = this.signed.verify(session.token, now);
    const record = parseGuestSessionStoreRecord({ id: this.ids.next(), tenantId: routing.tenantId, agentId: routing.agentId, connectionId: routing.connectionId, tokenHash: hash(session.token), tokenKid: routing.kid, issuedAt: now, expiresAt: new Date(session.expiresAt) });
    await this.store.insert(record);
    return session;
  }
  public async verify(token: string, now = new Date()): Promise<GuestSessionContext> {
    const routing = this.signed.verify(token, now);
    const tokenHash = hash(token);
    const record = await this.store.findByTokenHash({ tenantId: routing.tenantId, tokenHash });
    if (record === undefined || record.revokedAt !== undefined || record.expiresAt <= now || record.tenantId !== routing.tenantId || record.agentId !== routing.agentId || record.connectionId !== routing.connectionId || record.tokenKid !== routing.kid) throw new Error('Invalid guest session');
    if (!await this.store.markUsedByTokenHash({ tenantId: routing.tenantId, tokenHash, lastUsedAt: now })) throw new Error('Invalid guest session');
    return GuestSessionContextSchema.parse({ tenantId: record.tenantId, agentId: record.agentId, connectionId: record.connectionId, guestId: record.guestId, sessionId: record.id });
  }
}
function hash(token: string): Uint8Array { return createHash('sha256').update(token).digest(); }
