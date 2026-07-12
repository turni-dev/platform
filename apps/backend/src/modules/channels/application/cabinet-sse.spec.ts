import { describe, expect, it } from 'vitest';
import { serializeCabinetStreamEvent } from './cabinet-sse.js';

describe('serializeCabinetStreamEvent', () => {
  it('serializes a validated draft delta as an SSE event', () => {
    expect(
      serializeCabinetStreamEvent({
        type: 'draft.delta',
        runId: '01900000-0000-7000-8000-000000000005',
        chunk: 'Черновик ответа'
      })
    ).toBe(
      'event: draft.delta\ndata: {"type":"draft.delta","runId":"01900000-0000-7000-8000-000000000005","chunk":"Черновик ответа"}\n\n'
    );
  });
});
