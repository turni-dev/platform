import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOpenApiDocument } from '../../apps/backend/src/platform/http/openapi/generate-openapi.js';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, '../../apps/backend/openapi/openapi.generated.json');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(generateOpenApiDocument(), null, 2)}\n`, 'utf8');

console.log(`OpenAPI document written to ${outputPath}`);
