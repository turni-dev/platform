import type { ReactNode } from 'react';
import { CaseCards } from './case-cards/case-cards';
import { FaqAccordion } from './faq/faq';
import { FeatureGrid } from './feature-grid/feature-grid';
import { Hero } from './hero/hero';
import { LeadForm } from './lead-form/lead-form';
import { SecurityList } from './security-list/security-list';
import { Steps } from './steps/steps';
import type { PageBlock } from './page-schema';

function renderBlock(block: PageBlock, key: string): ReactNode {
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
    case 'blocks.faq':
      return <FaqAccordion key={key} {...block} />;
    case 'blocks.lead-form':
      return <LeadForm key={key} {...block} />;
    default:
      // Редактор может завести блок раньше, чем задеплоен фронт: одна незнакомая
      // секция не должна ронять страницу целиком.
      return null;
  }
}

export function renderBlocks(blocks: readonly PageBlock[]): ReactNode[] {
  return blocks.map((block, index) => renderBlock(block, `${block.__component}-${index}`));
}
