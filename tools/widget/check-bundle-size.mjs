import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const WIDGET_GZIP_BUDGET_BYTES = 70 * 1024;

function assertGzipByteSize(gzipSize, limitBytes) {
  if (gzipSize > limitBytes) {
    throw new Error(`Widget gzip size ${gzipSize} exceeds ${limitBytes / 1024} KB`);
  }
}

export function assertGzipSize(payload, limitBytes = WIDGET_GZIP_BUDGET_BYTES) {
  const gzipSize = gzipSync(payload).byteLength;

  assertGzipByteSize(gzipSize, limitBytes);
}

function resolveRelativeImport(sourcePath, specifier) {
  const basePath = resolve(dirname(sourcePath), specifier);
  const candidates = [basePath, `${basePath}.js`, resolve(basePath, 'index.js')];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve widget import ${specifier} from ${sourcePath}`);
}

function findRelativeImports(source) {
  const staticImports = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g;
  const dynamicImports = /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

  return [...source.matchAll(staticImports), ...source.matchAll(dynamicImports)]
    .map((match) => match[1])
    .filter((specifier) => specifier !== undefined);
}

export function assertArtifactGzipSize(entryArtifactPath, limitBytes = WIDGET_GZIP_BUDGET_BYTES) {
  const visitedModules = new Set();
  let gzipSize = 0;

  function visit(modulePath) {
    if (visitedModules.has(modulePath)) {
      return;
    }

    visitedModules.add(modulePath);
    const payload = readFileSync(modulePath);
    gzipSize += gzipSync(payload).byteLength;

    for (const specifier of findRelativeImports(payload.toString('utf8'))) {
      visit(resolveRelativeImport(modulePath, specifier));
    }
  }

  visit(resolve(entryArtifactPath));
  assertGzipByteSize(gzipSize, limitBytes);
}

function main(artifactPath) {
  if (artifactPath === undefined) {
    throw new Error('Expected a widget artifact path');
  }

  assertArtifactGzipSize(artifactPath);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2]);
}
