import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const outputPath = 'ops/sops/secrets.enc.json';

export function validateAgeRecipient(value) {
  if (!/^age1[0-9a-z]{50,100}$/.test(value)) {
    throw new Error('Invalid age recipient');
  }
  return value;
}

export function buildSecretDocument(generate = randomBytes) {
  return {
    KEY_PHONE_V1: generate(32).toString('base64'),
    KEY_CREDENTIALS_V1: generate(32).toString('base64'),
    PEPPER_V1: generate(32).toString('base64'),
    WEBHOOK_ROUTING_SECRET: generate(32).toString('base64')
  };
}

async function encryptSecrets(recipient) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'turni-secrets-'));
  const plaintextPath = join(temporaryDirectory, 'secrets.json');

  try {
    await writeFile(
      plaintextPath,
      `${JSON.stringify(buildSecretDocument(), null, 2)}\n`,
      { mode: 0o600 }
    );
    const { stdout } = await execFileAsync(
      'sops',
      [
        '--encrypt',
        '--age',
        recipient,
        '--input-type',
        'json',
        '--output-type',
        'json',
        plaintextPath
      ],
      { maxBuffer: 1024 * 1024 }
    );
    await writeFile(outputPath, stdout, { encoding: 'utf8', flag: 'wx' });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const recipient = process.argv[2];
  if (!recipient || process.argv.length !== 3) {
    throw new Error('Usage: npm run secrets:init -- <age-recipient>');
  }
  await encryptSecrets(validateAgeRecipient(recipient));
  console.log(`Encrypted secrets written to ${outputPath}`);
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entrypoint === import.meta.url) {
  await main();
}
