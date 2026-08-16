import { createRequire } from 'node:module';
import { mergeConfig, type UserConfig } from 'vite';

const require = createRequire(import.meta.url);

/**
 * Редактор json-полей построен на CodeMirror, а он ломается, если в бандл
 * попадает две его копии: «Unrecognized extension value in extension set» при
 * открытии записи. CodeMirror вшит внутрь @strapi/design-system, и пакет
 * приезжает дважды — в сборке ESM и в сборке CommonJS. Прибиваем к одной.
 */
const designSystem = require
  .resolve('@strapi/design-system/package.json')
  .replace(/package\.json$/, 'dist/index.mjs');

export default (config: UserConfig) =>
  mergeConfig(config, {
    resolve: {
      alias: { '@strapi/design-system': designSystem },
      dedupe: ['@strapi/design-system', '@codemirror/state', '@codemirror/view']
    }
  });
