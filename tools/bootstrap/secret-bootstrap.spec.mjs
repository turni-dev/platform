import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSecretDocument,
  validateAgeRecipient
} from './secret-bootstrap.mjs';

describe('secret bootstrap', () => {
  it('validates public age recipients', () => {
    assert.equal(
      validateAgeRecipient('age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'),
      'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
    );
    assert.throws(() => validateAgeRecipient('$(malicious)'), /Invalid age recipient/);
  });

  it('creates three independent versioned 256-bit data keys', () => {
    let fill = 0;
    const document = buildSecretDocument((size) => {
      fill += 1;
      return Buffer.alloc(size, fill);
    });

    assert.deepEqual(Object.keys(document), [
      'KEY_PHONE_V1',
      'KEY_CREDENTIALS_V1',
      'PEPPER_V1',
      'WEBHOOK_ROUTING_SECRET'
    ]);
    assert.equal(new Set(Object.values(document)).size, 3);
    for (const value of Object.values(document)) {
      assert.equal(Buffer.from(value, 'base64').byteLength, 32);
    }
  });
});
