import { describe, expect, it } from 'vitest';
import { ProblemDetailsSchema, ProblemType } from '../common.js';

describe('ProblemDetailsSchema', () => {
  it('accepts a minimal RFC 7807 problem', () => {
    expect(
      ProblemDetailsSchema.parse({
        type: ProblemType.InvalidRequest,
        title: 'Invalid request',
        status: 400
      })
    ).toEqual({
      type: ProblemType.InvalidRequest,
      title: 'Invalid request',
      status: 400
    });
  });

  it('accepts detail and instance when present', () => {
    const problem = {
      type: ProblemType.InvalidRequest,
      title: 'Invalid request',
      status: 400,
      detail: 'The "email" field is required.',
      instance: '/api/v1/owner/auth/request'
    };

    expect(ProblemDetailsSchema.parse(problem)).toEqual(problem);
  });

  it('rejects a status code outside the HTTP range', () => {
    expect(() =>
      ProblemDetailsSchema.parse({
        type: ProblemType.InvalidRequest,
        title: 'Invalid request',
        status: 42
      })
    ).toThrow();
  });

  it('rejects a missing title', () => {
    expect(() =>
      ProblemDetailsSchema.parse({
        type: ProblemType.InvalidRequest,
        status: 400
      })
    ).toThrow();
  });
});
