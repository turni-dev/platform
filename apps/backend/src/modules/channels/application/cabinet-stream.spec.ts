import { describe, expect, it } from 'vitest';
import { CabinetStream } from './cabinet-stream.js';

describe('CabinetStream', () => {
  it('publishes a contract-valid draft delta to active subscribers only', () => {
    const stream = new CabinetStream();
    const received: unknown[] = [];
    const unsubscribe = stream.subscribe((event) => received.push(event));

    stream.publish({
      type: 'draft.delta',
      runId: '01900000-0000-7000-8000-000000000004',
      chunk: 'Проверяю наличие столиков'
    });
    unsubscribe();
    stream.publish({
      type: 'draft.delta',
      runId: '01900000-0000-7000-8000-000000000004',
      chunk: 'Этот фрагмент не должен прийти'
    });

    expect(received).toEqual([
      {
        type: 'draft.delta',
        runId: '01900000-0000-7000-8000-000000000004',
        chunk: 'Проверяю наличие столиков'
      }
    ]);
  });
});
