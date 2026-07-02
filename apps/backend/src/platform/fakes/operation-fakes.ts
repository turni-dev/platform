import {
  AvailabilityRequestSchema,
  AvailabilitySchema,
  BookingSchema,
  BusyIntervalSchema,
  CalendarEventRequestSchema,
  CalendarEventSchema,
  CreateBookingRequestSchema,
  FreeBusyRequestSchema,
  KnowledgeDocumentSchema,
  KnowledgeSyncRequestSchema,
  ProvisionBotRequestSchema,
  ProvisionedConnectionSchema,
  SpeechAudioSchema,
  SpeechToTextRequestSchema,
  SpeechToTextResultSchema,
  TextToSpeechRequestSchema,
  type Availability,
  type AvailabilityRequest,
  type Booking,
  type BookingSystemPort,
  type BotProvisionerPort,
  type BusyInterval,
  type CalendarEvent,
  type CalendarEventRequest,
  type CalendarPort,
  type CreateBookingRequest,
  type FreeBusyRequest,
  type KnowledgeDocument,
  type KnowledgeSyncRequest,
  type ProvisionBotRequest,
  type ProvisionedConnection,
  type SpeechAudio,
  type SpeechPort,
  type SpeechToTextRequest,
  type SpeechToTextResult,
  type TextToSpeechRequest
} from '@turni/contracts';

function deterministicUuid(sequence: number): string {
  return `01900000-0000-7000-8000-${sequence.toString().padStart(12, '0')}`;
}

export class FakeBotProvisioner implements BotProvisionerPort {
  private sequence = 0;

  provision(request: ProvisionBotRequest): Promise<ProvisionedConnection> {
    ProvisionBotRequestSchema.parse(request);
    this.sequence += 1;
    return Promise.resolve(
      ProvisionedConnectionSchema.parse({
        connectionId: deterministicUuid(this.sequence),
        type: 'telegram',
        status: 'active',
        identity: `fake-bot-${this.sequence}`
      })
    );
  }
}

type FakeBookingConfig = Readonly<{
  available?: boolean;
  remainingCapacity?: number;
  menu?: readonly KnowledgeDocument[];
  stopList?: readonly KnowledgeDocument[];
}>;

export class FakeBookingSystem implements BookingSystemPort {
  private sequence = 0;
  private readonly menu: readonly KnowledgeDocument[];
  private readonly stopList: readonly KnowledgeDocument[];

  constructor(private readonly config: FakeBookingConfig = {}) {
    this.menu = (config.menu ?? []).map((item) =>
      KnowledgeDocumentSchema.parse(item)
    );
    this.stopList = (config.stopList ?? []).map((item) =>
      KnowledgeDocumentSchema.parse(item)
    );
  }

  checkAvailability(request: AvailabilityRequest): Promise<Availability> {
    AvailabilityRequestSchema.parse(request);
    return Promise.resolve(
      AvailabilitySchema.parse({
        available: this.config.available ?? true,
        ...(this.config.remainingCapacity === undefined
          ? {}
          : { remainingCapacity: this.config.remainingCapacity })
      })
    );
  }

  createBooking(request: CreateBookingRequest): Promise<Booking> {
    const parsed = CreateBookingRequestSchema.parse(request);
    this.sequence += 1;
    return Promise.resolve(
      BookingSchema.parse({
        id: deterministicUuid(this.sequence),
        status: 'confirmed',
        at: parsed.at,
        partySize: parsed.partySize
      })
    );
  }

  syncMenu(request: KnowledgeSyncRequest): Promise<readonly KnowledgeDocument[]> {
    KnowledgeSyncRequestSchema.parse(request);
    return Promise.resolve(this.menu);
  }

  syncStopList(
    request: KnowledgeSyncRequest
  ): Promise<readonly KnowledgeDocument[]> {
    KnowledgeSyncRequestSchema.parse(request);
    return Promise.resolve(this.stopList);
  }
}

export class FakeCalendar implements CalendarPort {
  private sequence = 0;
  private readonly intervals: readonly BusyInterval[];

  constructor(intervals: readonly BusyInterval[] = []) {
    this.intervals = intervals.map((interval) =>
      BusyIntervalSchema.parse(interval)
    );
  }

  freeBusy(request: FreeBusyRequest): Promise<readonly BusyInterval[]> {
    FreeBusyRequestSchema.parse(request);
    return Promise.resolve(this.intervals);
  }

  createEvent(request: CalendarEventRequest): Promise<CalendarEvent> {
    const parsed = CalendarEventRequestSchema.parse(request);
    this.sequence += 1;
    return Promise.resolve(
      CalendarEventSchema.parse({
        id: `fake-event-${this.sequence}`,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt
      })
    );
  }
}

export class FakeSpeech implements SpeechPort {
  constructor(
    private readonly transcription = 'Fake transcription',
    private readonly language = 'ru'
  ) {}

  speechToText(request: SpeechToTextRequest): Promise<SpeechToTextResult> {
    SpeechToTextRequestSchema.parse(request);
    return Promise.resolve(
      SpeechToTextResultSchema.parse({
        text: this.transcription,
        language: this.language
      })
    );
  }

  textToSpeech(request: TextToSpeechRequest): Promise<SpeechAudio> {
    const parsed = TextToSpeechRequestSchema.parse(request);
    return Promise.resolve(
      SpeechAudioSchema.parse({
        audio: new TextEncoder().encode(parsed.text),
        contentType: 'audio/wav'
      })
    );
  }
}
