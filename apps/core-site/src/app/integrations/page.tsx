import type { Metadata } from 'next';
import { siteIntegrations } from '../../content/site-pages';
import {
  CATALOG_PATH,
  catalogHref,
  categoryFilters,
  filterIntegrations,
  parseCategory,
  parseQuery,
  type CatalogQuery
} from '../../integrations/integration-catalog';
import { CATEGORY_LABELS, STATUS_LABELS } from '../../integrations/integration-schema';
import styles from '../../integrations/catalog.module.scss';

type RouteProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export const metadata: Metadata = {
  title: 'Интеграции — Turni',
  description:
    'С какими сервисами уже работает ИИ-сотрудник Turni: календари, мессенджеры, документы, почта и CRM.',
  alternates: { canonical: CATALOG_PATH }
};

export default async function IntegrationsPage({ searchParams }: RouteProps) {
  const params = await searchParams;
  const category = parseCategory(params['category']);
  const query = parseQuery(params['q']);
  const current: CatalogQuery = { category, query };

  const integrations = filterIntegrations(await siteIntegrations.list(), current);

  return (
    <section className={styles['section']} data-page="integrations">
      <div className={styles['inner']}>
        <h1 className={styles['heading']}>Интеграции</h1>
        <p className={styles['lead']}>
          Сервисы, с которыми ИИ-сотрудник работает уже сейчас, и те, что мы подключаем по запросу.
          У каждой карточки написано, какие права она запрашивает и зачем.
        </p>

        {/* Фильтр — обычные ссылки: состояние живёт в адресе, поэтому им можно
            поделиться, а страница работает без javascript. */}
        <nav aria-label="Категории интеграций" className={styles['filters']}>
          <ul className={styles['filterList']}>
            {categoryFilters(current).map((filter) => (
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

        <form action={CATALOG_PATH} className={styles['search']} method="get" role="search">
          {category === undefined ? null : <input name="category" type="hidden" value={category} />}
          <label className={styles['searchLabel']} htmlFor="integration-search">
            Поиск по названию
          </label>
          <input
            className={styles['searchInput']}
            defaultValue={query ?? ''}
            id="integration-search"
            name="q"
            type="search"
          />
          <button className={styles['searchButton']} type="submit">
            Найти
          </button>
        </form>

        {integrations.length === 0 ? (
          <p className={styles['empty']}>
            Пока пусто — по этому фильтру ничего нет.{' '}
            <a href={catalogHref({})}>Показать весь каталог</a>
          </p>
        ) : (
          <ul className={styles['grid']}>
            {integrations.map((integration) => (
              <li key={integration.slug}>
                <article className={styles['card']}>
                  <div className={styles['cardHead']}>
                    {integration.logo === undefined ? null : (
                      <img alt="" className={styles['logo']} src={integration.logo} />
                    )}
                    <h2 className={styles['name']}>
                      <a href={`${CATALOG_PATH}/${integration.slug}`}>{integration.name}</a>
                    </h2>
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
