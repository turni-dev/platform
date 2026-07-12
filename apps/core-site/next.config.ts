import type { NextConfig } from 'next';
import { resolve } from 'node:path';

// Standalone output so the Docker image ships a self-contained server
// (see apps/core-site/Dockerfile). outputFileTracingRoot pins tracing to the
// monorepo root because this app has no local package.json of its own.
const monorepoRoot = resolve(import.meta.dirname, '../..');

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot
  }
};

export default nextConfig;
