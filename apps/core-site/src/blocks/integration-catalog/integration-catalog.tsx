import {
  CATALOG_PATH,
  catalogHref,
  categoryFilters,
  filterIntegrations,
  type CatalogQuery
} from '../../integrations/integration-catalog';
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type Integration
} from '../../integrations/integration-schema';
import type { IntegrationCatalogBlock } from './schema';
import styles from './integration-catalog.module.scss';

type IntegrationCatalogProps = IntegrationCatalogBlock &
  Readonly<{
    /** Каталог целиком: блок серверный и своего запроса не делает. */
    integrations: readonly Integration[];
    /** Путь страницы, на которой стоит блок: от него строятся ссылки фильтра. */
    basePath: string;
    /** Состояние фильтра и поиска, разобранное из адреса страницы. */
    query: CatalogQuery;
  }>;

/** Подпись поля поиска по умолчанию — редактор может задать свою в CMS. */
const DEFAULT_SEARCH_LABEL = 'Поиск по названию';

/**
 * Витрина каталога интеграций. Состояние фильтра и поиска живёт только в
 * адресе: фильтр — обычные ссылки, поиск — GET-форма, поэтому страницей можно
 * поделиться и она работает без javascript.
 */
export function IntegrationCatalog({
  heading,
  intro,
  searchLabel,
  integrations,
  basePath,
  query
}: IntegrationCatalogProps) {
  const shown = filterIntegrations(integrations, query);
  const searchAction = catalogHref({}, basePath);

  return (
    <section className={styles['section']} data-block="blocks.integration-catalog">
      <div className={styles['inner']}>
        <h2 className={styles['heading']}>{heading}</h2>
        {intro === undefined ? null : <p className={styles['intro']}>{intro}</p>}

        {/* Фильтр — обычные ссылки: состояние живёт в адресе, поэтому им можно
            поделиться, а страница работает без javascript. */}
        <nav aria-label="Категории интеграций" className={styles['filters']}>
          <ul className={styles['filterList']}>
            {categoryFilters(query, basePath).map((filter) => (
              <li key={filter.href}>
                <a
                  aria-current={filter.current ? 'page' : undefined}
                  className={styles['filter']}
                  data-current={filter.current ? 'true' : undefined}
                  href={filter.href}
                >
                  {filter.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <form action={searchAction} className={styles['search']} method="get" role="search">
          {query.category === undefined ? null : (
            <input name="category" type="hidden" value={query.category} />
          )}
          <label className={styles['searchLabel']} htmlFor="integration-search">
            {searchLabel ?? DEFAULT_SEARCH_LABEL}
          </label>
          <input
            className={styles['searchInput']}
            defaultValue={query.query ?? ''}
            id="integration-search"
            name="q"
            type="search"
          />
          <button className={styles['searchButton']} type="submit">
            Найти
          </button>
        </form>

        {/* Пустой каталог и пустая выборка — разные события: в первом случае
            искать нечего, во втором сбросить фильтр помогает. */}
        {integrations.length === 0 ? (
          <p className={styles['empty']}>Пока пусто — каталог интеграций ещё не заполнен.</p>
        ) : shown.length === 0 ? (
          <p className={styles['empty']}>
            Ничего не нашлось — по этому фильтру пусто.{' '}
            <a href={searchAction}>Показать весь каталог</a>
          </p>
        ) : (
          <ul className={styles['grid']}>
            {shown.map((integration) => (
              <li key={integration.slug}>
                <article className={styles['card']}>
                  <div className={styles['cardHead']}>
                    {integration.logo === undefined ? null : (
                      // Логотип подписан именем рядом, поэтому сам он декоративный.
                      <img alt="" className={styles['logo']} src={integration.logo} />
                    )}
                    <h3 className={styles['name']}>
                      {/* Карточка интеграции — запись типа контента, её адрес
                          не зависит от того, где стоит блок витрины. */}
                      <a href={`${CATALOG_PATH}/${integration.slug}`}>{integration.name}</a>
                    </h3>
                  </div>
                  <p className={styles['summary']}>{integration.summary}</p>
                  <p className={styles['meta']}>
                    <span className={styles['status']} data-status={integration.status}>
                      {STATUS_LABELS[integration.status]}
                    </span>
                    <span className={styles['category']}>
                      {CATEGORY_LABELS[integration.category]}
                    </span>
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
