import {
  AgentConfigurationSchema,
  AgentInstructionsPath,
  AutomationAllowlistSchema,
  KnowledgeFilePathSchema,
  type AgentConfiguration,
  type AgentFile,
  type AutomationAllowlist
} from '@turni/contracts';
import { z } from 'zod';
import {
  nextRevision,
  startingAgentName,
  startingAgentTemplate,
  startingInstructions
} from '../domain/agent-configuration.js';
import type { AgentFileRecord, AgentFileStorePort } from './agent-file-store.port.js';
import type {
  AgentIdGeneratorPort,
  AgentRecord,
  AgentRepositoryPort
} from './agent-repository.port.js';

const EnsureSchema = z.strictObject({
  tenantId: z.uuidv7(),
  tenantName: z.string().min(1),
  userId: z.uuidv7()
});
const InstructionsUpdateSchema = z.strictObject({
  tenantId: z.uuidv7(),
  userId: z.uuidv7(),
  content: z.string()
});
const KnowledgeUpsertSchema = InstructionsUpdateSchema.extend({
  path: KnowledgeFilePathSchema
});
const KnowledgeDeleteSchema = z.strictObject({
  tenantId: z.uuidv7(),
  path: KnowledgeFilePathSchema
});
const AutomationsUpdateSchema = z.strictObject({
  tenantId: z.uuidv7(),
  presets: z.array(z.string())
});

export class AgentNotConfiguredError extends Error {
  public constructor() {
    super('Tenant has no agent');
    this.name = 'AgentNotConfiguredError';
  }
}

export interface AgentConfigurationDependencies {
  readonly agents: AgentRepositoryPort;
  readonly files: AgentFileStorePort;
  readonly ids: AgentIdGeneratorPort;
}

/**
 * The owner's view of their one agent: who it is, what it knows, and which
 * automations it may run. Instructions and knowledge are markdown files with
 * one immutable revision per save; `policies/` is not reachable from here at
 * all, so the policy engine can never be rewritten as free text.
 */
export class AgentConfigurationService {
  public constructor(private readonly dependencies: AgentConfigurationDependencies) {}

  /** Returns the tenant's agent, creating the starting one on first sight. */
  public async ensureAgent(
    input: Readonly<{ tenantId: string; tenantName: string; userId: string }>
  ): Promise<AgentConfiguration> {
    const request = EnsureSchema.parse(input);
    const existing = await this.read(request.tenantId);
    if (existing !== undefined) {
      return existing;
    }

    const agent: AgentRecord = {
      agentId: this.dependencies.ids.next(),
      tenantId: request.tenantId,
      name: startingAgentName(request.tenantName),
      template: startingAgentTemplate,
      status: 'draft',
      automations: { presets: [] }
    };

    await this.dependencies.agents.create(agent);
    await this.dependencies.files.saveRevision({
      tenantId: request.tenantId,
      agentId: agent.agentId,
      fileId: this.dependencies.ids.next(),
      revisionId: this.dependencies.ids.next(),
      path: AgentInstructionsPath,
      revision: 1,
      content: startingInstructions(request.tenantName),
      authorUserId: request.userId
    });

    return this.configurationOf(agent);
  }

  public async read(tenantId: string): Promise<AgentConfiguration | undefined> {
    const agent = await this.dependencies.agents.findByTenant(z.uuidv7().parse(tenantId));

    return agent === undefined ? undefined : this.configurationOf(agent);
  }

  public async updateInstructions(
    input: Readonly<{ tenantId: string; userId: string; content: string }>
  ): Promise<AgentFile> {
    const request = InstructionsUpdateSchema.parse(input);

    return this.save({
      tenantId: request.tenantId,
      userId: request.userId,
      path: AgentInstructionsPath,
      content: request.content
    });
  }

  public async upsertKnowledge(
    input: Readonly<{ tenantId: string; userId: string; path: string; content: string }>
  ): Promise<AgentFile> {
    const request = KnowledgeUpsertSchema.parse(input);

    return this.save(request);
  }

  public async deleteKnowledge(
    input: Readonly<{ tenantId: string; path: string }>
  ): Promise<boolean> {
    const request = KnowledgeDeleteSchema.parse(input);
    const agent = await this.requireAgent(request.tenantId);

    return this.dependencies.files.remove({
      tenantId: request.tenantId,
      agentId: agent.agentId,
      path: request.path
    });
  }

  public async updateAutomations(
    input: Readonly<{ tenantId: string; presets: readonly string[] }>
  ): Promise<AutomationAllowlist> {
    const request = AutomationsUpdateSchema.parse(input);
    const allowlist = AutomationAllowlistSchema.parse({ presets: request.presets });
    const agent = await this.requireAgent(request.tenantId);

    await this.dependencies.agents.saveAutomations({
      tenantId: request.tenantId,
      agentId: agent.agentId,
      presets: allowlist.presets
    });

    return allowlist;
  }

  private async save(
    request: Readonly<{ tenantId: string; userId: string; path: string; content: string }>
  ): Promise<AgentFile> {
    const agent = await this.requireAgent(request.tenantId);
    const current = await this.dependencies.files.read({
      tenantId: request.tenantId,
      agentId: agent.agentId,
      path: request.path
    });
    if (current !== undefined) {
      const unchanged =
        nextRevision({
          current: { revision: current.revision, content: current.content },
          content: request.content
        }) === undefined;

      // An identical save would fill the owner's history with noise.
      if (unchanged) {
        return fileOf(current);
      }
    }

    const revision = (current?.revision ?? 0) + 1;

    await this.dependencies.files.saveRevision({
      tenantId: request.tenantId,
      agentId: agent.agentId,
      fileId: this.dependencies.ids.next(),
      revisionId: this.dependencies.ids.next(),
      path: request.path,
      revision,
      content: request.content,
      authorUserId: request.userId
    });

    return { path: request.path, revision, content: request.content };
  }

  private async requireAgent(tenantId: string): Promise<AgentRecord> {
    const agent = await this.dependencies.agents.findByTenant(tenantId);
    if (agent === undefined) {
      throw new AgentNotConfiguredError();
    }

    return agent;
  }

  private async configurationOf(agent: AgentRecord): Promise<AgentConfiguration> {
    const [instructions, index] = await Promise.all([
      this.dependencies.files.read({
        tenantId: agent.tenantId,
        agentId: agent.agentId,
        path: AgentInstructionsPath
      }),
      this.dependencies.files.list({
        tenantId: agent.tenantId,
        agentId: agent.agentId
      })
    ]);

    return AgentConfigurationSchema.parse({
      agent: {
        agentId: agent.agentId,
        name: agent.name,
        template: agent.template,
        status: agent.status
      },
      instructions:
        instructions === undefined
          ? { path: AgentInstructionsPath, revision: 1, content: '' }
          : fileOf(instructions),
      knowledge: index
        .filter((entry) => entry.path !== AgentInstructionsPath)
        .map((entry) => ({ path: entry.path, revision: entry.revision })),
      automations: agent.automations
    });
  }
}

function fileOf(record: AgentFileRecord): AgentFile {
  return { path: record.path, revision: record.revision, content: record.content };
}
