import type { BlockLink } from '../blocks/shared';
import {
  CATEGORY_LABELS,
  INTEGRATION_CATEGORIES,
  IntegrationSlugSchema,
  type Integration,
  type IntegrationCategory
} from './integration-schema';

/** Адрес витрины: страница живёт своим сегментом, а не приходит из CMS. */
export const CATALOG_PATH = '/integrations';

/** Куда ведёт запрос на недоступную интеграцию — на страницу с формой заявки. */
export const LEAD_PATH = '/products/private-agent';

/** Публичное имя параметра адреса: оно из спеки и в урле остаётся snake_case. */
export const REQUESTED_INTEGRATION_PARAM = 'requested_integration';

export interface CatalogQuery {
  readonly category?: IntegrationCategory | undefined;
  readonly query?: string | undefined;
}

/**
 * Категория приезжает из адресной строки, то есть от кого угодно. Всё, чего нет
 * в списке категорий, считаем «фильтр не задан»: страница обязана открыться и
 * по битой ссылке.
 */
export function parseCategory(raw: string | readonly string[] | undefined): IntegrationCategory | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  return INTEGRATION_CATEGORIES.find((category) => category === raw);
}

/** Поисковый запрос из адреса: пустая строка равносильна отсутствию поиска. */
export function parseQuery(raw: string | readonly string[] | undefined): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Какая интеграция понадобилась посетителю — читаем из адреса страницы с
 * формой. Значение приходит от кого угодно, поэтому всё, что не выглядит
 * слагом каталога, считаем отсутствующим: заявку это не ломает, а записать
 * в неё килобайт чужого текста через ссылку не даёт.
 */
export function parseRequestedIntegration(
  raw: string | readonly string[] | undefined
): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const parsed = IntegrationSlugSchema.safeParse(raw.trim());

  return parsed.success ? parsed.data : undefined;
}

export function filterIntegrations(
  integrations: readonly Integration[],
  { category, query }: CatalogQuery
): readonly Integration[] {
  const needle = query?.toLocaleLowerCase('ru');

  return integrations.filter(
    (integration) =>
      (category === undefined || integration.category === category) &&
      (needle === undefined || integration.name.toLocaleLowerCase('ru').includes(needle))
  );
}

/** Стена логотипов показывает только то, что уже работает. */
export function availableIntegrations(
  integrations: readonly Integration[]
): readonly Integration[] {
  return integrations.filter((integration) => integration.status === 'available');
}

/** Адрес витрины с сохранённым состоянием фильтра — им можно поделиться. */
export function catalogHref({ category, query }: CatalogQuery): string {
  const params = new URLSearchParams();
  if (category !== undefined) {
    params.set('category', category);
  }
  if (query !== undefined) {
    params.set('q', query);
  }
  const search = params.toString();

  return search.length === 0 ? CATALOG_PATH : `${CATALOG_PATH}?${search}`;
}

export interface CategoryFilter {
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
}

export function categoryFilters(current: CatalogQuery): readonly CategoryFilter[] {
  const all: CategoryFilter = {
    label: 'Все',
    href: catalogHref({ ...(current.query === undefined ? {} : { query: current.query }) }),
    current: current.category === undefined
  };

  return [
    all,
    ...INTEGRATION_CATEGORIES.map((category) => ({
      label: CATEGORY_LABELS[category],
      href: catalogHref({ category, ...(current.query === undefined ? {} : { query: current.query }) }),
      current: current.category === category
    }))
  ];
}

export interface CtaOptions {
  /** Адрес кабинета; пока его нет, «Подключить» вести некуда. */
  readonly cabinetUrl?: string | undefined;
}

/**
 * Кнопка карточки. Работающая интеграция ведёт в кабинет, всё остальное — в
 * заявку с проставленной интеграцией: спрос на то, чего ещё нет, тоже надо
 * собирать, а не упираться в пустоту.
 */
export function integrationCta(integration: Integration, { cabinetUrl }: CtaOptions): BlockLink {
  if (integration.status === 'available' && cabinetUrl !== undefined && cabinetUrl.length > 0) {
    return {
      label: 'Подключить',
      href: `${cabinetUrl.replace(/\/+$/, '')}/integrations/${integration.slug}`
    };
  }

  return {
    label: 'Нужна эта интеграция',
    href: `${LEAD_PATH}?${REQUESTED_INTEGRATION_PARAM}=${encodeURIComponent(integration.slug)}#lead`
  };
}

/** Абзацы из текстового поля CMS: markdown не рендерим, только plain text. */
export function textParagraphs(value: string): readonly string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
