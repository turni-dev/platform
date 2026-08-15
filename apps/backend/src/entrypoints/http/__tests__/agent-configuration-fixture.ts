import { AgentConfigurationAnalytics } from '../../../modules/agent-core/application/agent-configuration-analytics.js';
import { AgentConfigurationService } from '../../../modules/agent-core/application/agent-configuration-service.js';
import type {
  AgentFileIndexEntry,
  AgentFileRecord,
  AgentFileRevision,
  AgentFileStorePort
} from '../../../modules/agent-core/application/agent-file-store.port.js';
import type {
  AgentRecord,
  AgentRepositoryPort
} from '../../../modules/agent-core/application/agent-repository.port.js';
import { FakeDomainEventBus } from '../../../modules/reporting/application/fake-domain-event-bus.js';
import { OwnerAccessTokenService } from '../../../modules/tenancy/application/owner-access-token.js';
import type { OwnerProfile } from '../../../modules/tenancy/application/owner-registration-repository.port.js';

export const agentAuthSecret = 'owner-auth-secret-with-at-least-thirty-two-characters';

const tenantId = '01900000-0000-7000-8000-000000000001';
const userId = '01900000-0000-7000-8000-000000000002';
const sessionId = '01900000-0000-7000-8000-000000000003';
const foreignTenantId = '01900000-0000-7000-8000-000000000004';
const foreignUserId = '01900000-0000-7000-8000-000000000005';

class InMemoryAgentRepository implements AgentRepositoryPort {
  public readonly rows: AgentRecord[] = [];

  public findByTenant(lookup: string): Promise<AgentRecord | undefined> {
    return Promise.resolve(this.rows.find((row) => row.tenantId === lookup));
  }

  public create(record: AgentRecord): Promise<void> {
    this.rows.push(record);
    return Promise.resolve();
  }

  public saveAutomations(
    input: Readonly<{ tenantId: string; agentId: string; presets: readonly string[] }>
  ): Promise<void> {
    const row = this.rows.find(
      (candidate) =>
        candidate.tenantId === input.tenantId && candidate.agentId === input.agentId
    );
    if (row !== undefined) {
      this.rows.splice(this.rows.indexOf(row), 1, {
        ...row,
        automations: { presets: [...input.presets] }
      });
    }

    return Promise.resolve();
  }
}

class InMemoryFileStore implements AgentFileStorePort {
  private readonly rows: AgentFileRevision[] = [];

  public list(
    input: Readonly<{ tenantId: string; agentId: string }>
  ): Promise<readonly AgentFileIndexEntry[]> {
    const live = this.rows.filter(
      (row) => row.tenantId === input.tenantId && row.agentId === input.agentId
    );

    return Promise.resolve(
      [...new Set(live.map((row) => row.path))].sort().map((path) => ({
        path,
        revision: this.latest(path)?.revision ?? 1
      }))
    );
  }

  public read(
    input: Readonly<{ tenantId: string; agentId: string; path: string }>
  ): Promise<AgentFileRecord | undefined> {
    const latest = this.latest(input.path);

    return Promise.resolve(
      latest === undefined
        ? undefined
        : { path: latest.path, revision: latest.revision, content: latest.content }
    );
  }

  public saveRevision(revision: AgentFileRevision): Promise<void> {
    this.rows.push(revision);
    return Promise.resolve();
  }

  public remove(
    input: Readonly<{ tenantId: string; agentId: string; path: string }>
  ): Promise<boolean> {
    const before = this.rows.length;
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (this.rows[index]?.path === input.path) {
        this.rows.splice(index, 1);
      }
    }

    return Promise.resolve(this.rows.length < before);
  }

  private latest(path: string): AgentFileRevision | undefined {
    return [...this.rows].reverse().find((row) => row.path === path);
  }
}

export interface AgentConfigurationFixture {
  readonly service: AgentConfigurationService;
  readonly agents: InMemoryAgentRepository;
  readonly events: FakeDomainEventBus;
  readonly accessTokens: OwnerAccessTokenService;
  readonly owners: { findOwnerProfile(owner: Readonly<{ tenantId: string; userId: string }>): Promise<OwnerProfile | undefined> };
  readonly tenantName: string;
  accessTokenFor(): string;
  foreignAccessToken(): string;
}

/** Composes the agent stack over in-memory stores so HTTP tests stay real. */
export function agentConfigurationFixture(): AgentConfigurationFixture {
  const agents = new InMemoryAgentRepository();
  const events = new FakeDomainEventBus();
  const accessTokens = new OwnerAccessTokenService(agentAuthSecret);
  const tenantName = 'Кофейня на Ленина';
  let sequence = 0;
  const ids = {
    next: (): string => {
      sequence += 1;
      return `01900000-0000-7000-8000-${String(sequence).padStart(12, '0')}`;
    }
  };

  return {
    agents,
    events,
    accessTokens,
    tenantName,
    owners: {
      findOwnerProfile: (owner) =>
        Promise.resolve(
          owner.tenantId === tenantId && owner.userId === userId
            ? {
                userId,
                tenantId,
                tenantName,
                email: 'owner@turni.ru'
              }
            : undefined
        )
    },
    accessTokenFor: () => accessTokens.issue({ userId, tenantId, sessionId }),
    foreignAccessToken: () =>
      accessTokens.issue({
        userId: foreignUserId,
        tenantId: foreignTenantId,
        sessionId
      }),
    service: new AgentConfigurationService({
      agents,
      files: new InMemoryFileStore(),
      ids,
      analytics: new AgentConfigurationAnalytics(events, ids)
    })
  };
}
