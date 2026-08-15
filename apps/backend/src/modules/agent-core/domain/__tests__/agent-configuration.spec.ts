import { AgentInstructionsPath } from '@turni/contracts';
import { describe, expect, it } from 'vitest';
import {
  nextRevision,
  startingAgentName,
  startingAgentTemplate,
  startingInstructions
} from '../agent-configuration.js';

describe('starting agent', () => {
  it('names the agent after the workspace and starts from the dining template', () => {
    expect(startingAgentName('Кофейня на Ленина')).toBe('Кофейня на Ленина');
    expect(startingAgentTemplate).toBe('dining');
  });

  it('trims a name the tenant table would refuse', () => {
    expect(startingAgentName(`  ${'я'.repeat(300)}  `)).toHaveLength(200);
    expect(startingAgentName('   ')).toBe('Агент');
  });

  it('writes starting instructions the owner can actually edit', () => {
    const instructions = startingInstructions('Кофейня на Ленина');

    expect(instructions).toContain('Кофейня на Ленина');
    expect(instructions.trim().length).toBeGreaterThan(0);
    expect(AgentInstructionsPath).toBe('identity.md');
  });
});

describe('nextRevision', () => {
  it('advances the revision when the content changed', () => {
    expect(nextRevision({ current: { revision: 3, content: 'старое' }, content: 'новое' })).toBe(4);
  });

  it('refuses to spend a revision on an identical save', () => {
    expect(
      nextRevision({ current: { revision: 3, content: 'то же' }, content: 'то же' })
    ).toBeUndefined();
  });

  it('treats a first write as revision one', () => {
    expect(nextRevision({ content: 'первое' })).toBe(1);
  });

  it('sees trailing whitespace as no change, because the reader cannot', () => {
    expect(
      nextRevision({ current: { revision: 1, content: 'меню' }, content: 'меню   \n' })
    ).toBeUndefined();
  });
});
