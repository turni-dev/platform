import { describe, expect, it } from 'vitest';
import { addCost, zeroCost } from '../tool-call-cost.js';

describe('tool call cost', () => {
  it('starts a run at zero for the given currency', () => {
    expect(zeroCost('RUB')).toEqual({ amount: '0.00', currency: 'RUB' });
  });

  it('adds two costs in the same currency as decimal cents', () => {
    const sum = addCost({ amount: '0.10', currency: 'RUB' }, { amount: '0.05', currency: 'RUB' });
    expect(sum).toEqual({ amount: '0.15', currency: 'RUB' });
  });

  it('avoids floating point drift across repeated additions', () => {
    let running = zeroCost('RUB');
    for (let i = 0; i < 10; i += 1) {
      running = addCost(running, { amount: '0.10', currency: 'RUB' });
    }
    expect(running).toEqual({ amount: '1.00', currency: 'RUB' });
  });

  it('refuses to add costs in different currencies', () => {
    expect(() =>
      addCost({ amount: '1.00', currency: 'RUB' }, { amount: '1.00', currency: 'USD' })
    ).toThrow(/currenc/iu);
  });

  it('rejects a malformed amount', () => {
    expect(() => addCost({ amount: '1', currency: 'RUB' }, zeroCost('RUB'))).toThrow();
  });
});
