import {
  CabinetStreamEventSchema,
  type CabinetStreamEvent
} from '@turni/contracts';

type CabinetStreamSubscriber = (event: CabinetStreamEvent) => void;

export class CabinetStream {
  private readonly subscribers = new Set<CabinetStreamSubscriber>();

  subscribe(subscriber: CabinetStreamSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  publish(event: CabinetStreamEvent): void {
    const parsedEvent = CabinetStreamEventSchema.parse(event);
    for (const subscriber of this.subscribers) {
      subscriber(parsedEvent);
    }
  }
}
