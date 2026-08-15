import { AgentInstructionsPath } from '@turni/contracts';
import { describe, expect, it } from 'vitest';
import { createHttpApp, type HttpAppOptions } from '../app.js';
import { AuthCookieName } from '../auth-cookies.js';
import {
  agentConfigurationFixture,
  type AgentConfigurationFixture
} from './agent-configuration-fixture.js';

const origin = 'https://app.turni.ru';

function options(fixture: AgentConfigurationFixture): HttpAppOptions {
  return {
    agent: {
      service: fixture.service,
      owners: fixture.owners,
      accessTokens: fixture.accessTokens,
      allowedOrigins: [origin]
    }
  };
}

function session(fixture: AgentConfigurationFixture): Record<string, string> {
  return { cookie: `${AuthCookieName.Access}=${fixture.accessTokenFor()}` };
}

describe('agent configuration HTTP surface', () => {
  it('stays unmounted until the agent stack is composed', async () => {
    const app = await createHttpApp();
    try {
      await expect(
        app.inject({ method: 'GET', url: '/api/v1/agent' })
      ).resolves.toMatchObject({ statusCode: 404 });
    } finally {
      await app.close();
    }
  });

  it('refuses every route without a session', async () => {
    const fixture = agentConfigurationFixture();
    const app = await createHttpApp(options(fixture));
    try {
      for (const call of [
        { method: 'GET' as const, url: '/api/v1/agent' },
        { method: 'POST' as const, url: '/api/v1/agent' },
        { method: 'PUT' as const, url: '/api/v1/agent/instructions' },
        { method: 'PUT' as const, url: '/api/v1/agent/knowledge' },
        { method: 'PUT' as const, url: '/api/v1/agent/automations' }
      ]) {
        const response = await app.inject({ ...call, headers: { origin } });
        expect(response.statusCode).toBe(401);
      }
    } finally {
      await app.close();
    }
  });

  it('says the tenant has no agent yet, then creates it once', async () => {
    const fixture = agentConfigurationFixture();
    const app = await createHttpApp(options(fixture));
    try {
      await expect(
        app.inject({ method: 'GET', url: '/api/v1/agent', headers: session(fixture) })
      ).resolves.toMatchObject({ statusCode: 404 });

      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/agent',
        headers: { origin, ...session(fixture) }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        agent: { name: fixture.tenantName, status: 'draft' },
        instructions: { path: AgentInstructionsPath, revision: 1 },
        knowledge: [],
        automations: { presets: [] }
      });

      const again = await app.inject({
        method: 'POST',
        url: '/api/v1/agent',
        headers: { origin, ...session(fixture) }
      });
      expect(again.statusCode).toBe(200);
      expect(fixture.agents.rows).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('versions instructions and refuses a body the contract rejects', async () => {
    const fixture = agentConfigurationFixture();
    const app = await createHttpApp(options(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/agent',
        headers: { origin, ...session(fixture) }
      });

      const saved = await app.inject({
        method: 'PUT',
        url: '/api/v1/agent/instructions',
        headers: { origin, ...session(fixture) },
        payload: { content: 'Мы кофейня третьей волны.' }
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ revision: 2 });

      const refused = await app.inject({
        method: 'PUT',
        url: '/api/v1/agent/instructions',
        headers: { origin, ...session(fixture) },
        payload: { content: 'x'.repeat(20_001) }
      });
      expect(refused.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('keeps the owner inside the knowledge folder', async () => {
    const fixture = agentConfigurationFixture();
    const app = await createHttpApp(options(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/agent',
        headers: { origin, ...session(fixture) }
      });

      for (const path of ['policies/allergens.md', AgentInstructionsPath, 'knowledge/../x.md']) {
        const response = await app.inject({
          method: 'PUT',
          url: '/api/v1/agent/knowledge',
          headers: { origin, ...session(fixture) },
          payload: { path, content: 'x' }
        });
        expect(response.statusCode).toBe(400);
      }
    } finally {
      await app.close();
    }
  });

  it('stores, lists and removes a knowledge file', async () => {
    const fixture = agentConfigurationFixture();
    const app = await createHttpApp(options(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/agent',
        headers: { origin, ...session(fixture) }
      });
      await app.inject({
        method: 'PUT',
        url: '/api/v1/agent/knowledge',
        headers: { origin, ...session(fixture) },
        payload: { path: 'knowledge/menu.md', content: 'Эспрессо 180 ₽' }
      });

      const listed = await app.inject({
        method: 'GET',
        url: '/api/v1/agent',
        headers: session(fixture)
      });
      expect(listed.json()).toMatchObject({
        knowledge: [{ path: 'knowledge/menu.md', revision: 1 }]
      });

      const removed = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agent/knowledge?path=knowledge%2Fmenu.md',
        headers: { origin, ...session(fixture) }
      });
      expect(removed.statusCode).toBe(204);

      const gone = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agent/knowledge?path=knowledge%2Fmenu.md',
        headers: { origin, ...session(fixture) }
      });
      expect(gone.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('reads a single knowledge file with its content', async () => {
    const fixture = agentConfigurationFixture();
    const app = await createHttpApp(options(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/agent',
        headers: { origin, ...session(fixture) }
      });
      await app.inject({
        method: 'PUT',
        url: '/api/v1/agent/knowledge',
        headers: { origin, ...session(fixture) },
        payload: { path: 'knowledge/menu.md', content: 'Эспрессо 180 ₽' }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agent/knowledge?path=knowledge%2Fmenu.md',
        headers: session(fixture)
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        path: 'knowledge/menu.md',
        revision: 1,
        content: 'Эспрессо 180 ₽'
      });
    } finally {
      await app.close();
    }
  });

  it('refuses a mutation that carries no trusted origin', async () => {
    const fixture = agentConfigurationFixture();
    const app = await createHttpApp(options(fixture));
    try {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/agent/instructions',
        headers: session(fixture),
        payload: { content: 'x' }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('cannot see another tenant through a valid session', async () => {
    const fixture = agentConfigurationFixture();
    const app = await createHttpApp(options(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/agent',
        headers: { origin, ...session(fixture) }
      });

      const stranger = await app.inject({
        method: 'GET',
        url: '/api/v1/agent',
        headers: { cookie: `${AuthCookieName.Access}=${fixture.foreignAccessToken()}` }
      });

      expect(stranger.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('stores an automation allowlist and refuses one the contract rejects', async () => {
    const fixture = agentConfigurationFixture();
    const app = await createHttpApp(options(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/agent',
        headers: { origin, ...session(fixture) }
      });

      const saved = await app.inject({
        method: 'PUT',
        url: '/api/v1/agent/automations',
        headers: { origin, ...session(fixture) },
        payload: { presets: ['telegram.reply'] }
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toEqual({ presets: ['telegram.reply'] });

      const refused = await app.inject({
        method: 'PUT',
        url: '/api/v1/agent/automations',
        headers: { origin, ...session(fixture) },
        payload: { presets: [''] }
      });
      expect(refused.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('records the configuration funnel without shipping content into events', async () => {
    const fixture = agentConfigurationFixture();
    const app = await createHttpApp(options(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/agent',
        headers: { origin, ...session(fixture) }
      });
      await app.inject({
        method: 'PUT',
        url: '/api/v1/agent/knowledge',
        headers: { origin, ...session(fixture) },
        payload: { path: 'knowledge/menu.md', content: 'Эспрессо 180 ₽' }
      });

      expect(fixture.events.publishedEvents.map((event) => event.name)).toEqual([
        'agent.created',
        'agent.knowledge_updated'
      ]);
      expect(JSON.stringify(fixture.events.publishedEvents)).not.toContain('Эспрессо');
    } finally {
      await app.close();
    }
  });
});
