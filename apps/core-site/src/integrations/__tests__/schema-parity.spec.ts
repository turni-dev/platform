import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { IntegrationCatalogBlockSchema } from '../../blocks/integration-catalog/schema';
import { LogoWallBlockSchema } from '../../blocks/logo-wall/schema';
import { IntegrationSchema } from '../integration-schema';

const cmsDirectory = resolve(__dirname, '../../../../cms/src');

const StrapiSchemaShape = z.object({ attributes: z.record(z.string(), z.unknown()) });

function strapiFields(path: string): string[] {
  const raw: unknown = JSON.parse(readFileSync(resolve(cmsDirectory, path), 'utf8'));

  return Object.keys(StrapiSchemaShape.parse(raw).attributes).sort();
}

function schemaFields(schema: z.ZodObject): string[] {
  return Object.keys(schema.shape)
    .filter((field) => field !== '__component')
    .sort();
}

/**
 * Расхождение между кодом и админкой иначе всплывает только в проде — пустым
 * каталогом на живой странице, поэтому оно ловится тестом, а не глазами.
 */
describe('Strapi integration catalog and its schemas', () => {
  it('keeps the integration content type in step with the code', () => {
    expect(strapiFields('api/integration/content-types/integration/schema.json')).toEqual(
      schemaFields(IntegrationSchema)
    );
  });

  it('keeps the wall of logos in step with the CMS', () => {
    expect(strapiFields('components/blocks/logo-wall.json')).toEqual(
      schemaFields(LogoWallBlockSchema)
    );
  });

  it('keeps the catalog showcase in step with the CMS', () => {
    expect(strapiFields('components/blocks/integration-catalog.json')).toEqual(
      schemaFields(IntegrationCatalogBlockSchema)
    );
  });

  it('lets the page assemble the wall of logos and the catalog showcase', () => {
    const page: unknown = JSON.parse(
      readFileSync(resolve(cmsDirectory, 'api/page/content-types/page/schema.json'), 'utf8')
    );
    const blocks = z
      .object({ attributes: z.object({ blocks: z.object({ components: z.array(z.string()) }) }) })
      .parse(page).attributes.blocks.components;

    expect(blocks).toContain('blocks.logo-wall');
    expect(blocks).toContain('blocks.integration-catalog');
  });

  it('demands the permissions field: a card without it must not publish', () => {
    const raw: unknown = JSON.parse(
      readFileSync(
        resolve(cmsDirectory, 'api/integration/content-types/integration/schema.json'),
        'utf8'
      )
    );
    const attributes = z
      .object({ attributes: z.record(z.string(), z.object({ required: z.boolean().optional() })) })
      .parse(raw).attributes;

    expect(attributes['permissionsAsked']?.required).toBe(true);
  });
});
