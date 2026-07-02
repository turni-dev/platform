import {
  CreateInvoiceRequestSchema,
  CredentialValidationSchema,
  InboundMessageSchema,
  InvoiceSchema,
  MessengerConnectionSchema,
  MessengerCredentialsSchema,
  OutboundMessageSchema,
  PaymentSchema,
  PaymentWebhookSchema,
  SendMessageResultSchema,
  WebhookSetupSchema,
  type CreateInvoiceRequest,
  type CredentialValidation,
  type InboundMessage,
  type Invoice,
  type MessengerConnection,
  type MessengerCredentials,
  type MessengerPort,
  type OutboundMessage,
  type Payment,
  type PaymentPort,
  type PaymentWebhook,
  type SendMessageResult,
  type WebhookSetup
} from '@turni/contracts';
import {
  EmbeddingRequestSchema,
  EmbeddingResponseSchema,
  LlmRequestSchema,
  LlmUsageSchema,
  type EmbeddingPort,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type LlmPort,
  type LlmRequest,
  type LlmResponse,
  type StructuredLlmRequest
} from '@turni/llm';
import type { z } from 'zod';

export class FakeLlm implements LlmPort {
  readonly requests: LlmRequest[] = [];

  constructor(private readonly configuredOutput: unknown) {}

  generate<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    return this.respond(request);
  }

  classify<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    return this.respond(request);
  }

  private respond<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    const { outputSchema, ...input } = request;
    this.requests.push(LlmRequestSchema.parse(input));

    return Promise.resolve({
      output: outputSchema.parse(this.configuredOutput),
      model: 'fake-llm',
      usage: LlmUsageSchema.parse({
        inputTokens: 1,
        outputTokens: 1,
        cachedTokens: 0
      })
    });
  }
}

export class FakeEmbedding implements EmbeddingPort {
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const parsed = EmbeddingRequestSchema.parse(request);
    const vectors = parsed.texts.map((text) =>
      Array.from(
        { length: 1024 },
        (_, index) => (text.length + (index % 17)) / 1000
      )
    );

    return Promise.resolve(
      EmbeddingResponseSchema.parse({ model: 'fake-embedding-1024', vectors })
    );
  }
}

export type SentMessage = Readonly<{
  connection: MessengerConnection;
  message: OutboundMessage;
}>;

export class FakeMessenger implements MessengerPort {
  private readonly sentMessages: SentMessage[] = [];
  private messageSequence = 0;

  get sent(): readonly SentMessage[] {
    return this.sentMessages;
  }

  send(
    connection: MessengerConnection,
    message: OutboundMessage
  ): Promise<SendMessageResult> {
    const parsedConnection = MessengerConnectionSchema.parse(connection);
    const parsedMessage = OutboundMessageSchema.parse(message);
    this.sentMessages.push({
      connection: parsedConnection,
      message: parsedMessage
    });
    this.messageSequence += 1;
    return Promise.resolve(
      SendMessageResultSchema.parse({
        externalId: `fake-message-${this.messageSequence}`
      })
    );
  }

  parseWebhook(raw: unknown): Promise<InboundMessage> {
    return Promise.resolve(InboundMessageSchema.parse(raw));
  }

  setupWebhook(
    connection: MessengerConnection,
    setup: WebhookSetup
  ): Promise<void> {
    MessengerConnectionSchema.parse(connection);
    WebhookSetupSchema.parse(setup);
    return Promise.resolve();
  }

  validateCredentials(
    credentials: MessengerCredentials
  ): Promise<CredentialValidation> {
    const parsed = MessengerCredentialsSchema.parse(credentials);
    return Promise.resolve(
      CredentialValidationSchema.parse({
        valid: parsed.secret !== 'invalid',
        ...(parsed.secret === 'invalid' ? {} : { identity: 'fake-bot' })
      })
    );
  }
}

export class FakePayment implements PaymentPort {
  private readonly payments = new Map<string, Payment>();
  private invoiceSequence = 0;

  createInvoice(request: CreateInvoiceRequest): Promise<Invoice> {
    const parsed = CreateInvoiceRequestSchema.parse(request);
    this.invoiceSequence += 1;
    const id = `fake-invoice-${this.invoiceSequence}`;
    const invoice = InvoiceSchema.parse({
      id,
      status: 'paid',
      checkoutUrl: `https://fake.turni.local/pay/${id}`
    });
    this.payments.set(
      id,
      PaymentSchema.parse({
        id,
        status: 'paid',
        amount: parsed.amount,
        currency: parsed.currency
      })
    );
    return Promise.resolve(invoice);
  }

  parseWebhook(raw: unknown): Promise<PaymentWebhook> {
    return Promise.resolve(PaymentWebhookSchema.parse(raw));
  }

  fetchPayment(id: string): Promise<Payment> {
    const payment = this.payments.get(id);
    if (!payment) {
      return Promise.reject(new Error(`Unknown fake payment: ${id}`));
    }
    return Promise.resolve(payment);
  }
}
