import {
  McpCapabilitySchema,
  McpDiscoveryInputSchema,
  McpInvocationResultSchema,
  McpInvocationSchema,
  type McpCapability,
  type McpDiscoveryInput,
  type McpInvocation,
  type McpInvocationResult,
  type McpPort,
  type McpProviderSlug
} from '@turni/contracts';

export interface McpProvider {
  readonly providerSlug: McpProviderSlug;
  readonly capabilities: readonly McpCapability[];
  invoke(input: McpInvocation): Promise<McpInvocationResult>;
}

export class McpProviderNotAllowedError extends Error {
  public constructor(capabilityId: string) {
    super(`No reviewed MCP provider owns capability ${capabilityId}`);
    this.name = 'McpProviderNotAllowedError';
  }
}

/** Registry of code-reviewed first-party providers. User supplied manifests,
 * remote URLs and executable providers deliberately have no registration path. */
export class FirstPartyMcpRegistry implements McpPort {
  public constructor(private readonly providers: readonly McpProvider[]) {}

  public discover(input: McpDiscoveryInput): Promise<readonly McpCapability[]> {
    McpDiscoveryInputSchema.parse(input);

    return Promise.resolve(
      this.providers.flatMap((provider) =>
        provider.capabilities.map((capability) => McpCapabilitySchema.parse(capability))
      )
    );
  }

  public async invoke(input: McpInvocation): Promise<McpInvocationResult> {
    const invocation = McpInvocationSchema.parse(input);
    const provider = this.providers.find((candidate) =>
      candidate.capabilities.some((capability) => capability.id === invocation.capabilityId)
    );
    if (provider === undefined) {
      throw new McpProviderNotAllowedError(invocation.capabilityId);
    }

    return McpInvocationResultSchema.parse(await provider.invoke(invocation));
  }
}
