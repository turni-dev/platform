export interface EchoAgentInput {
  readonly text: string;
}

export interface EchoAgentPort {
  reply(input: EchoAgentInput): string;
}

/**
 * Minimal M2-demo agent: it never calls an LLM and never invokes a tool, it
 * only composes a real, deterministic reply that acknowledges the guest's
 * own words instead of returning a hardcoded stub string. FaqChatPipeline
 * only ever calls it after PolicyEngine has cleared the message as
 * `auto`/safe and FrontLine had no exact FAQ match for it — it must never
 * run on a non-auto policy verdict, so it is safe for it to echo the
 * guest's own already-approved text back to them.
 */
export class EchoAgent implements EchoAgentPort {
  public reply(input: EchoAgentInput): string {
    const question = input.text.trim();
    return `Вы спросили: «${question}». Пока не могу ответить точно сам — передам администратору, он продолжит в этом чате.`;
  }
}
