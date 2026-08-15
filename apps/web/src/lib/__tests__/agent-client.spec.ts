import { describe, expect, it } from 'vitest';
import {
  createAgent,
  deleteKnowledgeFile,
  fetchAgentConfiguration,
  fetchKnowledgeFile,
  saveAutomations,
  saveInstructions,
  saveKnowledgeFile
} from '../agent-client';

const configuration = {
  agent: {
    agentId: '01900000-0000-7000-8000-000000000001',
    name: 'Кофейня на Ленина',
    template: 'dining',
    status: 'draft'
  },
  instructions: { path: 'identity.md', revision: 1, content: '# Кофейня' },
  knowledge: [{ path: 'knowledge/menu.md', revision: 2 }],
  automations: { presets: [] }
};

interface Call {
  readonly url: string;
  readonly init?: RequestInit;
}

function respondWith(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    calls.push({ url, ...(init === undefined ? {} : { init }) });

    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), { status })
    );
  }) as unknown as typeof fetch;
}

describe('fetchAgentConfiguration', () => {
  it('validates the configuration against the contract', async () => {
    const calls: Call[] = [];

    await expect(
      fetchAgentConfiguration({ fetch: respondWith(200, configuration, calls) })
    ).resolves.toEqual(configuration);
    expect(calls[0]?.url).toBe('/api/v1/agent');
  });

  it('says nothing when the tenant has no agent yet', async () => {
    await expect(
      fetchAgentConfiguration({ fetch: respondWith(404, undefined) })
    ).resolves.toBeUndefined();
  });

  it('refuses a body that does not match the contract', async () => {
    await expect(
      fetchAgentConfiguration({ fetch: respondWith(200, { agent: {} }) })
    ).resolves.toBeUndefined();
  });

  it('forwards the session cookie when the server renders the page', async () => {
    const calls: Call[] = [];

    await fetchAgentConfiguration({
      fetch: respondWith(200, configuration, calls),
      baseUrl: 'http://backend:3000',
      cookie: 'turni_access=token'
    });

    expect(calls[0]?.url).toBe('http://backend:3000/api/v1/agent');
    expect(calls[0]?.init?.headers).toEqual({ cookie: 'turni_access=token' });
  });
});

describe('createAgent', () => {
  it('posts and returns the created configuration', async () => {
    const calls: Call[] = [];

    await expect(
      createAgent({ fetch: respondWith(201, configuration, calls) })
    ).resolves.toEqual(configuration);
    expect(calls[0]?.init?.method).toBe('POST');
  });
});

describe('saveInstructions', () => {
  it('returns the stored revision', async () => {
    const calls: Call[] = [];

    await expect(
      saveInstructions('# Кофейня', {
        fetch: respondWith(
          200,
          { path: 'identity.md', revision: 2, content: '# Кофейня' },
          calls
        )
      })
    ).resolves.toMatchObject({ revision: 2 });
    expect(calls[0]?.url).toBe('/api/v1/agent/instructions');
    expect(calls[0]?.init?.method).toBe('PUT');
  });

  it('says nothing rather than pretending a refused save worked', async () => {
    await expect(
      saveInstructions('#', { fetch: respondWith(400, undefined) })
    ).resolves.toBeUndefined();
  });
});

describe('knowledge files', () => {
  it('reads one file by path', async () => {
    const calls: Call[] = [];
    const file = { path: 'knowledge/menu.md', revision: 2, content: 'Эспрессо' };

    await expect(
      fetchKnowledgeFile('knowledge/menu.md', {
        fetch: respondWith(200, file, calls)
      })
    ).resolves.toEqual(file);
    expect(calls[0]?.url).toBe('/api/v1/agent/knowledge?path=knowledge%2Fmenu.md');
  });

  it('saves a file and reports the refusal of an invalid one', async () => {
    await expect(
      saveKnowledgeFile('knowledge/menu.md', 'Эспрессо', {
        fetch: respondWith(200, {
          path: 'knowledge/menu.md',
          revision: 1,
          content: 'Эспрессо'
        })
      })
    ).resolves.toMatchObject({ revision: 1 });
    await expect(
      saveKnowledgeFile('policies/x.md', 'x', { fetch: respondWith(400, undefined) })
    ).resolves.toBeUndefined();
  });

  it('deletes a file and reports whether anything was removed', async () => {
    const calls: Call[] = [];

    await expect(
      deleteKnowledgeFile('knowledge/menu.md', {
        fetch: respondWith(204, undefined, calls)
      })
    ).resolves.toBe(true);
    expect(calls[0]?.init?.method).toBe('DELETE');
    await expect(
      deleteKnowledgeFile('knowledge/menu.md', { fetch: respondWith(404, undefined) })
    ).resolves.toBe(false);
  });
});

describe('saveAutomations', () => {
  it('returns the stored allowlist', async () => {
    await expect(
      saveAutomations([], { fetch: respondWith(200, { presets: [] }) })
    ).resolves.toEqual({ presets: [] });
  });

  it('survives a backend that is simply not there', async () => {
    const failing = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;

    await expect(saveAutomations([], { fetch: failing })).resolves.toBeUndefined();
  });
});
