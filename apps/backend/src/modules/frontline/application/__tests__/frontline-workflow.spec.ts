import { describe, expect, it } from 'vitest';

import { FrontlineWorkflow } from '../frontline-workflow.js';

describe('FrontlineWorkflow', () => {
  it('returns the configured response only for a normalized exact question in the same tenant', () => {
    const workflow = new FrontlineWorkflow([
      {
        tenantId: 'tenant-a',
        question: '  Где вы находитесь? ',
        response: 'Мы на улице Ленина, 10.'
      },
      {
        tenantId: 'tenant-b',
        question: 'Где вы находитесь?',
        response: 'Другой адрес.'
      }
    ]);

    expect(workflow.answer({ tenantId: 'tenant-a', question: 'где вы находитесь?' })).toEqual({
      verdict: 'auto',
      response: 'Мы на улице Ленина, 10.'
    });
  });

  it('returns out_of_kb when the tenant has no exact FAQ answer', () => {
    const workflow = new FrontlineWorkflow([
      { tenantId: 'tenant-a', question: 'Где вы находитесь?', response: 'Ленина, 10.' }
    ]);

    expect(workflow.answer({ tenantId: 'tenant-a', question: 'Какая завтра погода?' })).toEqual({
      verdict: 'out_of_kb'
    });
    expect(workflow.answer({ tenantId: 'tenant-b', question: 'Где вы находитесь?' })).toEqual({
      verdict: 'out_of_kb'
    });
  });

  it('does not allow an embedded NUL to cross tenant FAQ boundaries', () => {
    const workflow = new FrontlineWorkflow([
      {
        tenantId: 'tenant-a\u0000где вы находитесь?',
        question: 'Безопасный вопрос',
        response: 'Ответ tenant A.'
      },
      {
        tenantId: 'tenant-a',
        question: 'Где вы находитесь?\u0000Безопасный вопрос',
        response: 'Ответ tenant B.'
      }
    ]);

    expect(
      workflow.answer({
        tenantId: 'tenant-a\u0000где вы находитесь?',
        question: 'Безопасный вопрос'
      })
    ).toEqual({ verdict: 'auto', response: 'Ответ tenant A.' });
  });

  it('rejects a FAQ entry with an empty response', () => {
    expect(
      () =>
        new FrontlineWorkflow([
          { tenantId: 'tenant-a', question: 'Где вы находитесь?', response: '   ' }
        ])
    ).toThrow();
  });
});
