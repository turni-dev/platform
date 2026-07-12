import type { RawData } from 'ws';

export function websocketPayloadToText(payload: RawData): string {
  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString('utf8');
  }

  if (Buffer.isBuffer(payload)) {
    return payload.toString('utf8');
  }

  return Buffer.from(new Uint8Array(payload)).toString('utf8');
}
