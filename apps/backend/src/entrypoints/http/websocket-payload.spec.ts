import { describe, expect, it } from 'vitest';
import { websocketPayloadToText } from './websocket-payload.js';

describe('websocketPayloadToText', () => {
  it('decodes every ws RawData representation as UTF-8 text', () => {
    expect(websocketPayloadToText(Buffer.from('hello'))).toBe('hello');
    expect(websocketPayloadToText(new TextEncoder().encode('hello').buffer)).toBe('hello');
    expect(websocketPayloadToText([Buffer.from('he'), Buffer.from('llo')])).toBe('hello');
  });
});
