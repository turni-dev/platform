import { AgentInstructionsPath } from '@turni/contracts';
import { describe, expect, it } from 'vitest';
import { AgentConfigurationService } from '../agent-configuration-service.js';
import type {
  AgentFileIndexEntry,
  AgentFileRecord,
  AgentFileRevision,
  AgentFileStorePort
} from '../agent-file-store.port.js';
import type { AgentRecord, AgentRepositoryPort } from '../agent-repository.port.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const userId = '01900000-0000-7000-8000-000000000002';
const tenantName = 'Кофейня на Ленина';

class FakeAgentRepository implements AgentRepositoryPort {
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

class FakeFileStore implements AgentFileStorePort {
  public readonly revisions: AgentFileRevision[] = [];

  public list(
    input: Readonly<{ tenantId: string; agentId: string }>
  ): Promise<readonly AgentFileIndexEntry[]> {
    const paths = new Set(
      this.revisions
        .filter((row) => row.tenantId === input.tenantId && row.agentId === input.agentId)
        .map((row) => row.path)
    );

    return Promise.resolve(
      [...paths].map((path) => {
        const latest = this.latest(path);
        return { path, revision: latest?.revision ?? 1 };
      })
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
    this.revisions.push(revision);
    return Promise.resolve();
  }

  public remove(
    input: Readonly<{ tenantId: string; agentId: string; path: string }>
  ): Promise<boolean> {
    const before = this.revisions.length;
    for (let index = this.revisions.length - 1; index >= 0; index -= 1) {
      if (this.revisions[index]?.path === input.path) {
        this.revisions.splice(index, 1);
      }
    }

    return Promise.resolve(this.revisions.length < before);
  }

  private latest(path: string): AgentFileRevision | undefined {
    return [...this.revisions].reverse().find((row) => row.path === path);
  }
}

function build(): {
  readonly service: AgentConfigurationService;
  readonly agents: FakeAgentRepository;
  readonly files: FakeFileStore;
} {
  const agents = new FakeAgentRepository();
  const files = new FakeFileStore();
  let sequence = 0;

  return {
    agents,
    files,
    service: new AgentConfigurationService({
      agents,
      files,
      ids: {
        next: () => {
          sequence += 1;
          return `01900000-0000-7000-8000-0000000001${String(sequence).padStart(2, '0')}`;
        }
      }
    })
  };
}

describe('AgentConfigurationService.ensureAgent', () => {
  it('creates the starting agent with editable instructions', async () => {
    const context = build();

    const configuration = await context.service.ensureAgent({
      tenantId,
      tenantName,
      userId
    });

    expect(context.agents.rows).toHaveLength(1);
    expect(configuration.agent.name).toBe(tenantName);
    expect(configuration.agent.status).toBe('draft');
    expect(configuration.instructions.path).toBe(AgentInstructionsPath);
    expect(configuration.instructions.revision).toBe(1);
    expect(configuration.instructions.content).toContain(tenantName);
    expect(configuration.knowledge).toEqual([]);
    expect(configuration.automations).toEqual({ presets: [] });
  });

  it('is a no-op the second time, so a reload cannot create a second agent', async () => {
    const context = build();

    const first = await context.service.ensureAgent({ tenantId, tenantName, userId });
    const second = await context.service.ensureAgent({ tenantId, tenantName, userId });

    expect(context.agents.rows).toHaveLength(1);
    expect(second.agent.agentId).toBe(first.agent.agentId);
    expect(context.files.revisions).toHaveLength(1);
  });
});

describe('AgentConfigurationService.updateInstructions', () => {
  it('writes an immutable revision and leaves the previous one alone', async () => {
    const context = build();
    await context.service.ensureAgent({ tenantId, tenantName, userId });

    const updated = await context.service.updateInstructions({
      tenantId,
      userId,
      content: 'Мы кофейня третьей волны.'
    });

    expect(updated.revision).toBe(2);
    expect(context.files.revisions).toHaveLength(2);
    expect(context.files.revisions[0]?.revision).toBe(1);
    expect(context.files.revisions[1]?.authorUserId).toBe(userId);
  });

  it('does not spend a revision when the owner saves the same text', async () => {
    const context = build();
    const created = await context.service.ensureAgent({ tenantId, tenantName, userId });

    const saved = await context.service.updateInstructions({
      tenantId,
      userId,
      content: created.instructions.content
    });

    expect(saved.revision).toBe(1);
    expect(context.files.revisions).toHaveLength(1);
  });
});

describe('AgentConfigurationService knowledge', () => {
  it('creates and then versions a knowledge file', async () => {
    const context = build();
    await context.service.ensureAgent({ tenantId, tenantName, userId });

    const created = await context.service.upsertKnowledge({
      tenantId,
      userId,
      path: 'knowledge/menu.md',
      content: 'Эспрессо 180 ₽'
    });
    const updated = await context.service.upsertKnowledge({
      tenantId,
      userId,
      path: 'knowledge/menu.md',
      content: 'Эспрессо 200 ₽'
    });

    expect(created.revision).toBe(1);
    expect(updated.revision).toBe(2);

    const configuration = await context.service.read(tenantId);
    expect(configuration?.knowledge).toEqual([
      { path: 'knowledge/menu.md', revision: 2 }
    ]);
  });

  it('refuses a path outside the knowledge folder', async () => {
    const context = build();
    await context.service.ensureAgent({ tenantId, tenantName, userId });

    for (const path of ['policies/allergens.md', AgentInstructionsPath, '../secrets.md']) {
      await expect(
        context.service.upsertKnowledge({ tenantId, userId, path, content: 'x' })
      ).rejects.toThrow();
    }
    expect(context.files.revisions).toHaveLength(1);
  });

  it('removes a knowledge file and reports whether anything was there', async () => {
    const context = build();
    await context.service.ensureAgent({ tenantId, tenantName, userId });
    await context.service.upsertKnowledge({
      tenantId,
      userId,
      path: 'knowledge/menu.md',
      content: 'Эспрессо'
    });

    await expect(
      context.service.deleteKnowledge({ tenantId, path: 'knowledge/menu.md' })
    ).resolves.toBe(true);
    await expect(
      context.service.deleteKnowledge({ tenantId, path: 'knowledge/menu.md' })
    ).resolves.toBe(false);
  });

  it('refuses to delete the instructions through the knowledge path', async () => {
    const context = build();
    await context.service.ensureAgent({ tenantId, tenantName, userId });

    await expect(
      context.service.deleteKnowledge({ tenantId, path: AgentInstructionsPath })
    ).rejects.toThrow();
  });
});

describe('AgentConfigurationService.updateAutomations', () => {
  it('stores the allowlist and keeps default deny as the empty case', async () => {
    const context = build();
    await context.service.ensureAgent({ tenantId, tenantName, userId });

    const allowed = await context.service.updateAutomations({
      tenantId,
      presets: ['telegram.reply']
    });
    expect(allowed.presets).toEqual(['telegram.reply']);

    const cleared = await context.service.updateAutomations({ tenantId, presets: [] });
    expect(cleared.presets).toEqual([]);
  });

  it('refuses to configure an agent the tenant does not have', async () => {
    const context = build();

    await expect(
      context.service.updateAutomations({ tenantId, presets: [] })
    ).rejects.toThrow();
  });
});

describe('AgentConfigurationService.read', () => {
  it('says nothing for a tenant without an agent', async () => {
    await expect(build().service.read(tenantId)).resolves.toBeUndefined();
  });
});
