import {
  CabinetStreamEventSchema,
  type CabinetStreamEvent
} from '@turni/contracts';

export function serializeCabinetStreamEvent(event: CabinetStreamEvent): string {
  const parsedEvent = CabinetStreamEventSchema.parse(event);
  return `event: ${parsedEvent.type}\ndata: ${JSON.stringify(parsedEvent)}\n\n`;
}
