import { z } from 'zod';

/**
 * Витрина каталога интеграций. Карточки в блок не заводятся: они приходят из
 * типа контента «Интеграция», иначе витрина и карточки разошлись бы уже на
 * второй правке. Редактор задаёт только обрамление и место блока на странице.
 */
export const IntegrationCatalogBlockSchema = z.object({
  __component: z.literal('blocks.integration-catalog'),
  heading: z.string().min(1),
  intro: z.string().min(1).optional(),
  searchLabel: z.string().min(1).optional()
});

export type IntegrationCatalogBlock = z.infer<typeof IntegrationCatalogBlockSchema>;
