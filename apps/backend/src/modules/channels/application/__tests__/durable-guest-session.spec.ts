import { describe, expect, it } from 'vitest';
import { DurableGuestSessionService } from '../durable-guest-session.js';
import { GuestSessionService } from '../guest-session.js';
import { WidgetRoutingKeyService } from '../widget-routing-key.js';
import type { GuestSessionStorePort, GuestSessionStoreRecord } from '../guest-session-store.port.js';

const secret = 'session-secret-with-at-least-thirty-two-characters';
const now = new Date('2026-08-09T10:00:00.000Z');
const routing = { tenantId: '01900000-0000-7000-8000-000000000010', agentId: '01900000-0000-7000-8000-000000000011', connectionId: '01900000-0000-7000-8000-000000000012', expiresAt: 1_900_000_000, kid: 'primary' };

describe('DurableGuestSessionService', () => {
  it('persists only a token hash before returning and rejects revoked sessions', async () => {
    const rows: GuestSessionStoreRecord[] = [];
    let revoked = false;
    const routingKeys = new WidgetRoutingKeyService(secret);
    const signed = new GuestSessionService(secret, routingKeys);
    const store: GuestSessionStorePort = {
      insert: (row) => { rows.push(row); return Promise.resolve(); },
      findByTokenHash: () => Promise.resolve(revoked ? { ...rows[0]!, revokedAt: now } : rows[0]),
      revoke: () => Promise.resolve(true),
      markUsedByTokenHash: () => Promise.resolve(!revoked)
    };
    const service = new DurableGuestSessionService(signed, store, { next: () => '01900000-0000-7000-8000-000000000013' });
    const session = await service.issue({ widgetKey: routingKeys.issue(routing) }, now);
    expect(JSON.stringify(rows)).not.toContain(session.token);
    await expect(service.verify(session.token, now)).resolves.toEqual({ tenantId: routing.tenantId, agentId: routing.agentId, connectionId: routing.connectionId, sessionId: '01900000-0000-7000-8000-000000000013' });
    revoked = true;
    await expect(service.verify(session.token, now)).rejects.toThrow('Invalid guest session');
  });
});
