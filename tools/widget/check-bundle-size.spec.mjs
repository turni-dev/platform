import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { assertArtifactGzipSize, assertGzipSize } from './check-bundle-size.mjs';

function createIncompressiblePayload(size) {
  const payload = Buffer.allocUnsafe(size);
  let state = 0x9e3779b9;

  for (let index = 0; index < size; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    payload[index] = state >>> 24;
  }

  return payload;
}

describe('assertGzipSize', () => {
  it('rejects a gzip payload over 70 KB', () => {
    expect(() => assertGzipSize(createIncompressiblePayload(71 * 1024), 70 * 1024)).toThrow('70 KB');
  });

  it('accepts an under-budget artifact and its relative JavaScript import', () => {
    const artifactDirectory = mkdtempSync(join(tmpdir(), 'widget-size-'));
    const entryArtifact = join(artifactDirectory, 'index.js');

    try {
      writeFileSync(entryArtifact, "import './feature.js';\n");
      writeFileSync(join(artifactDirectory, 'feature.js'), 'export const feature = true;\n');

      expect(() => assertArtifactGzipSize(entryArtifact)).not.toThrow();
    } finally {
      rmSync(artifactDirectory, { force: true, recursive: true });
    }
  });

  it('rejects relative JavaScript modules whose combined gzip payload exceeds 70 KB', () => {
    const artifactDirectory = mkdtempSync(join(tmpdir(), 'widget-size-'));
    const entryArtifact = join(artifactDirectory, 'index.js');

    try {
      writeFileSync(entryArtifact, Buffer.concat([Buffer.from("import './feature.js';\n"), createIncompressiblePayload(36 * 1024)]));
      writeFileSync(join(artifactDirectory, 'feature.js'), createIncompressiblePayload(36 * 1024));

      expect(() => assertArtifactGzipSize(entryArtifact)).toThrow('70 KB');
    } finally {
      rmSync(artifactDirectory, { force: true, recursive: true });
    }
  });

  it('checks an explicit artifact path through the command line', () => {
    const artifactDirectory = mkdtempSync(join(tmpdir(), 'widget-size-'));
    const entryArtifact = join(artifactDirectory, 'index.js');

    try {
      writeFileSync(entryArtifact, 'export const widget = true;\n');

      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-bundle-size.mjs', import.meta.url)), entryArtifact]);

      expect(result.status).toBe(0);
    } finally {
      rmSync(artifactDirectory, { force: true, recursive: true });
    }
  });
});
