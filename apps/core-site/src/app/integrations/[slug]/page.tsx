import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cabinetUrl, siteIntegrations } from '../../../content/site-pages';
import {
  CATALOG_PATH,
  integrationCta,
  textParagraphs
} from '../../../integrations/integration-catalog';
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type Integration
} from '../../../integrations/integration-schema';
import styles from '../../../integrations/catalog.module.scss';

type RouteProps = Readonly<{ params: Promise<{ slug: string }> }>;

async function findIntegration(slug: string): Promise<Integration | undefined> {
  return (await siteIntegrations.list()).find((integration) => integration.slug === slug);
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const integration = await findIntegration((await params).slug);
  if (integration === undefined) {
    return {};
  }

  return {
    title: `${integration.name} — интеграция Turni`,
    description: integration.summary,
    alternates: { canonical: `${CATALOG_PATH}/${integration.slug}` }
  };
}

export default async function IntegrationPage({ params }: RouteProps) {
  const integration = await findIntegration((await params).slug);
  if (integration === undefined) {
    notFound();
  }

  const cta = integrationCta(integration, { cabinetUrl });

  return (
    <article className={styles['section']} data-page="integration">
      <div className={styles['inner']}>
        <p className={styles['breadcrumb']}>
          <a href={CATALOG_PATH}>Интеграции</a> ·{' '}
          <a href={`${CATALOG_PATH}?category=${integration.category}`}>
            {CATEGORY_LABELS[integration.category]}
          </a>
        </p>

        <div className={styles['cardHead']}>
          {integration.logo === undefined ? null : (
            <img alt="" className={styles['logoLarge']} src={integration.logo} />
          )}
          <h1 className={styles['heading']}>{integration.name}</h1>
        </div>
        <p className={styles['status']} data-status={integration.status}>
          {STATUS_LABELS[integration.status]}
        </p>
        <p className={styles['lead']}>{integration.summary}</p>

        <h2 className={styles['subheading']}>Что умеет</h2>
        {textParagraphs(integration.whatItCan).map((line) => (
          <p className={styles['body']} key={line}>
            {line}
          </p>
        ))}

        {/* Права — обязательный раздел карточки: человек должен видеть, что
            именно он отдаёт, до того как нажмёт «Подключить». */}
        <h2 className={styles['subheading']}>Какие права запрашиваем и зачем</h2>
        {textParagraphs(integration.permissionsAsked).map((line) => (
          <p className={styles['body']} key={line}>
            {line}
          </p>
        ))}

        <p className={styles['cta']}>
          <a className={styles['ctaLink']} href={cta.href}>
            {cta.label}
          </a>
        </p>
      </div>
    </article>
  );
}
