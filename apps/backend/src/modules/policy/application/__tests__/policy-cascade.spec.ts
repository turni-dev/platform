import { describe, expect, it } from 'vitest';

import { FakePolicyClassifier } from '../fake-policy-classifier.js';
import { PolicyCascade } from '../policy-cascade.js';
import { PolicyEngine } from '../../domain/policy-engine.js';

describe('PolicyCascade', () => {
  it('returns a locked L0 outcome without calling either classifier', async () => {
    const l1 = new FakePolicyClassifier();
    const l2 = new FakePolicyClassifier();
    const cascade = new PolicyCascade(new PolicyEngine(), l1, l2);

    await expect(cascade.evaluate({ text: 'У гостя аллергия на орехи' })).resolves.toMatchObject({
      verdict: 'approval',
      locked: true,
      rule: 'allergy-health'
    });
    expect(l1.calls).toHaveLength(0);
    expect(l2.calls).toHaveLength(0);
  });

  it('returns the highest-risk L1 candidate when L1 confidence is sufficient', async () => {
    const l1 = new FakePolicyClassifier([
      {
        confidence: 0.8,
        candidates: [
          { verdict: 'auto', riskScore: 2, rule: 'faq' },
          { verdict: 'escalate_human', riskScore: 6, rule: 'ambiguous-request' }
        ]
      }
    ]);
    const l2 = new FakePolicyClassifier();
    const cascade = new PolicyCascade(new PolicyEngine(), l1, l2);

    await expect(cascade.evaluate({ text: 'Подскажите время работы' })).resolves.toEqual({
      verdict: 'escalate_human',
      riskScore: 6,
      locked: false,
      rule: 'ambiguous-request'
    });
    expect(l2.calls).toHaveLength(0);
  });

  it('uses only trusted L2 candidates after low-confidence L1', async () => {
    const l1 = new FakePolicyClassifier([
      {
        confidence: 0.79,
        candidates: [{ verdict: 'auto', riskScore: 8, rule: 'risky-l1' }]
      }
    ]);
    const l2 = new FakePolicyClassifier([
      {
        confidence: 0.95,
        candidates: [{ verdict: 'escalate_human', riskScore: 5, rule: 'l2-human' }]
      }
    ]);
    const cascade = new PolicyCascade(new PolicyEngine(), l1, l2);

    await expect(cascade.evaluate({ text: 'Нестандартный запрос' })).resolves.toEqual({
      verdict: 'escalate_human',
      riskScore: 5,
      locked: false,
      rule: 'l2-human'
    });
    expect(l1.calls).toHaveLength(1);
    expect(l2.calls).toHaveLength(1);
  });

  it.each([
    ['L1 rejects', new FakePolicyClassifier([], new Error('unavailable')), new FakePolicyClassifier()],
    [
      'L2 rejects',
      new FakePolicyClassifier([{ confidence: 0.5, candidates: [{ verdict: 'auto', riskScore: 1, rule: 'l1' }] }]),
      new FakePolicyClassifier([], new Error('unavailable'))
    ],
    [
      'L2 remains low confidence',
      new FakePolicyClassifier([{ confidence: 0.5, candidates: [{ verdict: 'auto', riskScore: 1, rule: 'l1' }] }]),
      new FakePolicyClassifier([{ confidence: 0.79, candidates: [{ verdict: 'auto', riskScore: 1, rule: 'l2' }] }])
    ]
  ])('returns default-deny approval when %s', async (_caseName, l1, l2) => {
    const cascade = new PolicyCascade(new PolicyEngine(), l1, l2);

    await expect(cascade.evaluate({ text: 'Обычный вопрос' })).resolves.toEqual({
      verdict: 'approval',
      riskScore: 7,
      locked: false,
      rule: 'unknown-or-incomplete'
    });
  });

  it('never exposes the raw input in a classifier-derived outcome', async () => {
    const secret = 'Гость Иванов сообщает секрет 12345';
    const cascade = new PolicyCascade(
      new PolicyEngine(),
      new FakePolicyClassifier([{ confidence: 0.9, candidates: [{ verdict: 'auto', riskScore: 1, rule: 'faq' }] }]),
      new FakePolicyClassifier()
    );

    const outcome = await cascade.evaluate({ text: secret });

    expect(JSON.stringify(outcome)).not.toContain(secret);
  });
});
