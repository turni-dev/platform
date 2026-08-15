import {
  AgentConfigurationSchema,
  AgentFileSchema,
  AutomationAllowlistSchema,
  type AgentConfiguration,
  type AgentFile,
  type AutomationAllowlist
} from '@turni/contracts';
import type { ZodType } from 'zod';

export interface AgentClientOptions {
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
  /** Set only when a server component renders: the browser sends its own. */
  readonly cookie?: string;
}

const agentPath = '/api/v1/agent';

/**
 * The cabinet's view of the agent API. Every answer is validated against the
 * contract, and a refusal returns nothing rather than a half-parsed object:
 * the screens must never show a saved state that did not happen.
 */
export async function fetchAgentConfiguration(
  options?: AgentClientOptions
): Promise<AgentConfiguration | undefined> {
  return call(agentPath, { method: 'GET' }, AgentConfigurationSchema, options);
}

export async function createAgent(
  options?: AgentClientOptions
): Promise<AgentConfiguration | undefined> {
  return call(agentPath, { method: 'POST' }, AgentConfigurationSchema, options);
}

export async function saveInstructions(
  content: string,
  options?: AgentClientOptions
): Promise<AgentFile | undefined> {
  return call(
    `${agentPath}/instructions`,
    { method: 'PUT', body: { content } },
    AgentFileSchema,
    options
  );
}

export async function fetchKnowledgeFile(
  path: string,
  options?: AgentClientOptions
): Promise<AgentFile | undefined> {
  return call(
    `${agentPath}/knowledge?path=${encodeURIComponent(path)}`,
    { method: 'GET' },
    AgentFileSchema,
    options
  );
}

export async function saveKnowledgeFile(
  path: string,
  content: string,
  options?: AgentClientOptions
): Promise<AgentFile | undefined> {
  return call(
    `${agentPath}/knowledge`,
    { method: 'PUT', body: { path, content } },
    AgentFileSchema,
    options
  );
}

/** True only when the server actually removed something. */
export async function deleteKnowledgeFile(
  path: string,
  options?: AgentClientOptions
): Promise<boolean> {
  const response = await send(
    `${agentPath}/knowledge?path=${encodeURIComponent(path)}`,
    { method: 'DELETE' },
    options
  );

  return response?.ok ?? false;
}

export async function saveAutomations(
  presets: readonly string[],
  options?: AgentClientOptions
): Promise<AutomationAllowlist | undefined> {
  return call(
    `${agentPath}/automations`,
    { method: 'PUT', body: { presets: [...presets] } },
    AutomationAllowlistSchema,
    options
  );
}

async function call<T>(
  path: string,
  request: Readonly<{ method: string; body?: unknown }>,
  schema: ZodType<T>,
  options?: AgentClientOptions
): Promise<T | undefined> {
  const response = await send(path, request, options);
  if (response === undefined || !response.ok) {
    return undefined;
  }

  try {
    const parsed = schema.safeParse(await response.json());

    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function send(
  path: string,
  request: Readonly<{ method: string; body?: unknown }>,
  options?: AgentClientOptions
): Promise<Response | undefined> {
  const perform = options?.fetch ?? fetch;
  const headers: Record<string, string> = {
    ...(options?.cookie === undefined ? {} : { cookie: options.cookie }),
    ...(request.body === undefined ? {} : { 'content-type': 'application/json' })
  };

  try {
    return await perform(`${options?.baseUrl ?? ''}${path}`, {
      method: request.method,
      credentials: 'same-origin',
      cache: 'no-store',
      ...(Object.keys(headers).length === 0 ? {} : { headers }),
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) })
    });
  } catch {
    return undefined;
  }
}
