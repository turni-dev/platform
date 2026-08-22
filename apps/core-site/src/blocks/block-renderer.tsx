import type { ReactNode } from 'react';
import { Bento } from './bento/bento';
import { CaseCards } from './case-cards/case-cards';
import { ChangelogItem } from './changelog-item/changelog-item';
import { FaqAccordion } from './faq/faq';
import { FeatureGrid } from './feature-grid/feature-grid';
import { Hero } from './hero/hero';
import { Illustration } from './illustration/illustration';
import { IntegrationCatalog } from './integration-catalog/integration-catalog';
import { LeadForm } from './lead-form/lead-form';
import { LegalDocument } from './legal-document/legal-document';
import { LogoWall } from './logo-wall/logo-wall';
import { NumberedSteps } from './numbered-steps/numbered-steps';
import { SecurityList } from './security-list/security-list';
import { StatCard } from './stat-card/stat-card';
import { Steps } from './steps/steps';
import type { PageBlock } from './page-schema';
import { CATALOG_PATH, type CatalogQuery } from '../integrations/integration-catalog';
import type { BookingSlotOption } from '../site/booking-slots-source';
import type { Integration } from '../integrations/integration-schema';

export interface RenderBlocksOptions {
  /** Слоты консультации: приходят отдельно от CMS-контента блока, потому что
   * их доступность меняется чаще, чем перерисовывается страница. */
  readonly slots?: readonly BookingSlotOption[] | undefined;
  /** Каталог интеграций: стена логотипов рисуется из него, а не из полей блока. */
  readonly integrations?: readonly Integration[] | undefined;
  /** Слаг из `?requested_integration=` адреса страницы: форма заявки кладёт
   * его в скрытое поле, остальные блоки о нём не знают. */
  readonly requestedIntegration?: string | undefined;
  /** Путь текущей страницы: витрина каталога строит от него ссылки фильтра,
   * поэтому блок работает на любой странице, куда его поставил редактор. */
  readonly pathname?: string | undefined;
  /** Состояние витрины из адреса (`?category=`, `?q=`), разобранное на сервере. */
  readonly catalogQuery?: CatalogQuery | undefined;
}

function renderBlock(block: PageBlock, key: string, options: RenderBlocksOptions): ReactNode {
  switch (block.__component) {
    case 'blocks.hero':
      return <Hero key={key} {...block} />;
    case 'blocks.feature-grid':
      return <FeatureGrid key={key} {...block} />;
    case 'blocks.steps':
      return <Steps key={key} {...block} />;
    case 'blocks.security-list':
      return <SecurityList key={key} {...block} />;
    case 'blocks.case-cards':
      return <CaseCards key={key} {...block} />;
    case 'blocks.bento':
      return <Bento key={key} {...block} />;
    case 'blocks.numbered-steps':
      return <NumberedSteps key={key} {...block} />;
    case 'blocks.stat-card':
      return <StatCard key={key} {...block} />;
    case 'blocks.changelog-item':
      return <ChangelogItem key={key} {...block} />;
    case 'blocks.illustration':
      return <Illustration key={key} {...block} />;
    case 'blocks.faq':
      return <FaqAccordion key={key} {...block} />;
    case 'blocks.legal-document':
      return <LegalDocument key={key} {...block} />;
    case 'blocks.lead-form':
      return (
        <LeadForm
          key={key}
          {...block}
          slots={options.slots}
          requestedIntegration={options.requestedIntegration}
        />
      );
    case 'blocks.integration-catalog':
      return (
        <IntegrationCatalog
          key={key}
          {...block}
          integrations={options.integrations ?? []}
          basePath={options.pathname ?? CATALOG_PATH}
          query={options.catalogQuery ?? {}}
        />
      );
    case 'blocks.logo-wall':
      return <LogoWall key={key} {...block} integrations={options.integrations ?? []} />;
    default:
      // Редактор может завести блок раньше, чем задеплоен фронт: одна незнакомая
      // секция не должна ронять страницу целиком.
      return null;
  }
}

export function renderBlocks(
  blocks: readonly PageBlock[],
  options: RenderBlocksOptions = {}
): ReactNode[] {
  return blocks.map((block, index) => renderBlock(block, `${block.__component}-${index}`, options));
}
