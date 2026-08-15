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
import type { AgentConfigurationAnalytics } from './agent-configuration-analytics.js';
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
  userId: z.uuidv7(),
  path: KnowledgeFilePathSchema
});
const AutomationsUpdateSchema = z.strictObject({
  tenantId: z.uuidv7(),
  userId: z.uuidv7(),
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
  /** Absent in deployments that do not record analytics yet. */
  readonly analytics?: AgentConfigurationAnalytics;
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
    input: Readonly<{ tenantId: string; tenantName: string; userId: string }>,
    now = new Date()
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
    await this.dependencies.analytics?.agentCreated({
      tenantId: request.tenantId,
      userId: request.userId,
      agentId: agent.agentId,
      at: now
    });

    return this.configurationOf(agent);
  }

  public async read(tenantId: string): Promise<AgentConfiguration | undefined> {
    const agent = await this.dependencies.agents.findByTenant(z.uuidv7().parse(tenantId));

    return agent === undefined ? undefined : this.configurationOf(agent);
  }

  /** Reads one knowledge file with its content, or nothing when it is gone. */
  public async readFile(
    input: Readonly<{ tenantId: string; path: string }>
  ): Promise<AgentFile | undefined> {
    const request = z
      .strictObject({ tenantId: z.uuidv7(), path: KnowledgeFilePathSchema })
      .parse(input);
    const agent = await this.requireAgent(request.tenantId);
    const file = await this.dependencies.files.read({
      tenantId: request.tenantId,
      agentId: agent.agentId,
      path: request.path
    });

    return file === undefined ? undefined : fileOf(file);
  }

  public async updateInstructions(
    input: Readonly<{ tenantId: string; userId: string; content: string }>,
    now = new Date()
  ): Promise<AgentFile> {
    const request = InstructionsUpdateSchema.parse(input);
    const saved = await this.save({
      tenantId: request.tenantId,
      userId: request.userId,
      path: AgentInstructionsPath,
      content: request.content
    });

    if (saved.changed) {
      await this.dependencies.analytics?.instructionsUpdated(
        this.context(request, saved.agentId, now),
        saved.file.revision
      );
    }

    return saved.file;
  }

  public async upsertKnowledge(
    input: Readonly<{ tenantId: string; userId: string; path: string; content: string }>,
    now = new Date()
  ): Promise<AgentFile> {
    const request = KnowledgeUpsertSchema.parse(input);
    const saved = await this.save(request);

    if (saved.changed) {
      await this.dependencies.analytics?.knowledgeUpdated(
        this.context(request, saved.agentId, now),
        { path: saved.file.path, revision: saved.file.revision }
      );
    }

    return saved.file;
  }

  public async deleteKnowledge(
    input: Readonly<{ tenantId: string; userId: string; path: string }>,
    now = new Date()
  ): Promise<boolean> {
    const request = KnowledgeDeleteSchema.parse(input);
    const agent = await this.requireAgent(request.tenantId);
    const removed = await this.dependencies.files.remove({
      tenantId: request.tenantId,
      agentId: agent.agentId,
      path: request.path
    });

    if (removed) {
      await this.dependencies.analytics?.knowledgeDeleted(
        this.context(request, agent.agentId, now),
        request.path
      );
    }

    return removed;
  }

  public async updateAutomations(
    input: Readonly<{ tenantId: string; userId: string; presets: readonly string[] }>,
    now = new Date()
  ): Promise<AutomationAllowlist> {
    const request = AutomationsUpdateSchema.parse(input);
    const allowlist = AutomationAllowlistSchema.parse({ presets: request.presets });
    const agent = await this.requireAgent(request.tenantId);

    await this.dependencies.agents.saveAutomations({
      tenantId: request.tenantId,
      agentId: agent.agentId,
      presets: allowlist.presets
    });
    await this.dependencies.analytics?.automationsUpdated(
      this.context(request, agent.agentId, now),
      allowlist.presets
    );

    return allowlist;
  }

  private context(
    request: Readonly<{ tenantId: string; userId: string }>,
    agentId: string,
    at: Date
  ): Readonly<{ tenantId: string; userId: string; agentId: string; at: Date }> {
    return { tenantId: request.tenantId, userId: request.userId, agentId, at };
  }

  private async save(
    request: Readonly<{ tenantId: string; userId: string; path: string; content: string }>
  ): Promise<{ readonly file: AgentFile; readonly changed: boolean; readonly agentId: string }> {
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
        return { file: fileOf(current), changed: false, agentId: agent.agentId };
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

    return {
      file: { path: request.path, revision, content: request.content },
      changed: true,
      agentId: agent.agentId
    };
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
