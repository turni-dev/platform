import { describe, expect, it } from 'vitest';
import type { McpInvocation, McpInvocationResult } from '@turni/contracts';
import {
  FirstPartyMcpRegistry,
  McpProviderNotAllowedError,
  type McpProvider
} from '../first-party-mcp-registry.js';

const tenantId = '018f2d15-7b34-7a20-8f49-b2f1a430e4d1';
const agentId = '018f2d15-7b35-7f10-9cb8-b9b654e9b652';

class FakeGoogleProvider implements McpProvider {
  public readonly providerSlug = 'google';
  public readonly capabilities = [
    { id: 'google.calendar.events.list', providerSlug: 'google', operation: 'read' as const },
    { id: 'google.calendar.events.create', providerSlug: 'google', operation: 'write' as const }
  ] as const;
  public calls: McpInvocation[] = [];

  public invoke(input: McpInvocation): Promise<McpInvocationResult> {
    this.calls.push(input);
    return Promise.resolve({ output: { source: 'fake-google' } });
  }
}

describe('FirstPartyMcpRegistry', () => {
  it('discovers capabilities from allowlisted providers', async () => {
    const registry = new FirstPartyMcpRegistry([new FakeGoogleProvider()]);

    await expect(registry.discover({ tenantId, agentId })).resolves.toEqual([
      { id: 'google.calendar.events.list', providerSlug: 'google', operation: 'read' },
      { id: 'google.calendar.events.create', providerSlug: 'google', operation: 'write' }
    ]);
  });

  it('dispatches an invocation to the provider that owns its capability', async () => {
    const google = new FakeGoogleProvider();
    const registry = new FirstPartyMcpRegistry([google]);
    const invocation = {
      connectionId: tenantId,
      capabilityId: 'google.calendar.events.list',
      input: { calendarId: 'primary', maxResults: 3 }
    };

    await expect(registry.invoke(invocation)).resolves.toEqual({ output: { source: 'fake-google' } });
    expect(google.calls).toEqual([invocation]);
  });

  it('rejects a capability that no first-party provider owns', async () => {
    const registry = new FirstPartyMcpRegistry([new FakeGoogleProvider()]);

    await expect(
      registry.invoke({
        connectionId: tenantId,
        capabilityId: 'unreviewed.crm.records.write',
        input: {}
      })
    ).rejects.toBeInstanceOf(McpProviderNotAllowedError);
  });
});
