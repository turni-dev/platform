import { describe, expect, it } from 'vitest';
import {
  AgentConfigurationSchema,
  AgentInstructionsPath,
  AgentInstructionsUpdateSchema,
  AutomationAllowlistSchema,
  KnowledgeFilePathSchema,
  KnowledgeFileUpsertSchema
} from '../ports/agent-configuration.js';

const agentId = '01900000-0000-7000-8000-000000000001';

describe('knowledge file paths', () => {
  it('accepts a markdown file inside the knowledge folder', () => {
    expect(KnowledgeFilePathSchema.parse('knowledge/menu.md')).toBe('knowledge/menu.md');
  });

  it('refuses anything outside the knowledge folder', () => {
    for (const path of [
      AgentInstructionsPath,
      'policies/allergens.md',
      'learned/notes.md',
      'knowledge/../policies/allergens.md',
      '/knowledge/menu.md',
      'knowledge/menu.txt',
      'knowledge/',
      'knowledge/nested/menu.md'
    ]) {
      expect(KnowledgeFilePathSchema.safeParse(path).success).toBe(false);
    }
  });
});

describe('agent configuration DTOs', () => {
  it('carries the agent, its instructions and its knowledge index', () => {
    const configuration = AgentConfigurationSchema.parse({
      agent: { agentId, name: 'Turni', template: 'dining', status: 'draft' },
      instructions: { path: AgentInstructionsPath, revision: 3, content: 'Мы кофейня.' },
      knowledge: [{ path: 'knowledge/menu.md', revision: 1 }],
      automations: { presets: [] }
    });

    expect(configuration.instructions.revision).toBe(3);
    expect(configuration.knowledge[0]?.path).toBe('knowledge/menu.md');
  });

  it('refuses a revision that is not a positive integer', () => {
    expect(
      AgentConfigurationSchema.safeParse({
        agent: { agentId, name: 'Turni', template: 'dining', status: 'draft' },
        instructions: { path: AgentInstructionsPath, revision: 0, content: '' },
        knowledge: [],
        automations: { presets: [] }
      }).success
    ).toBe(false);
  });

  it('treats the automation allowlist as default deny', () => {
    expect(AutomationAllowlistSchema.parse({}).presets).toEqual([]);
    expect(
      AutomationAllowlistSchema.safeParse({ presets: ['telegram.reply'] }).success
    ).toBe(true);
    expect(AutomationAllowlistSchema.safeParse({ presets: [''] }).success).toBe(false);
  });

  it('bounds what the owner can save so a paste cannot exhaust the context', () => {
    expect(
      AgentInstructionsUpdateSchema.safeParse({ content: 'x'.repeat(20_001) }).success
    ).toBe(false);
    expect(AgentInstructionsUpdateSchema.safeParse({ content: 'x' }).success).toBe(true);
    expect(
      KnowledgeFileUpsertSchema.safeParse({
        path: 'knowledge/menu.md',
        content: 'x'.repeat(20_001)
      }).success
    ).toBe(false);
  });
});
