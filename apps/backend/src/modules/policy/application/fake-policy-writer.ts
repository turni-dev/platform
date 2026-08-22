import type { PolicyRow, PolicyRowIdentity, PolicyWriterPort } from './policy-provisioning.port.js';

function keyOf(identity: PolicyRowIdentity, path: string): string {
  return `${identity.tenantId}:${identity.agentId}:${path}`;
}

/** In-memory double for {@link PolicyWriterPort}. Mirrors the Postgres
 * adapter's insert-only-if-absent semantics: a path already present for an
 * (tenant, agent) pair is never overwritten. */
export class FakePolicyWriter implements PolicyWriterPort {
  private readonly rows = new Map<string, PolicyRow>();

  public findByPath(identity: PolicyRowIdentity, path: string): Promise<PolicyRow | undefined> {
    return Promise.resolve(this.rows.get(keyOf(identity, path)));
  }

  public insertIfAbsent(identity: PolicyRowIdentity, row: PolicyRow): Promise<boolean> {
    const key = keyOf(identity, row.path);
    if (this.rows.has(key)) {
      return Promise.resolve(false);
    }
    this.rows.set(key, row);
    return Promise.resolve(true);
  }

  public allRows(identity: PolicyRowIdentity): readonly PolicyRow[] {
    const prefix = `${identity.tenantId}:${identity.agentId}:`;
    return [...this.rows.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, row]) => row);
  }
}
