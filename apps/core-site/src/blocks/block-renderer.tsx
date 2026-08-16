import type { ReactNode } from 'react';
import { CaseCards } from './case-cards/case-cards.js';
import { FaqAccordion } from './faq/faq.js';
import { FeatureGrid } from './feature-grid/feature-grid.js';
import { Footer } from './footer/footer.js';
import { Hero } from './hero/hero.js';
import { LeadForm } from './lead-form/lead-form.js';
import { Nav } from './nav/nav.js';
import { SecurityList } from './security-list/security-list.js';
import { Steps } from './steps/steps.js';
import type { PageBlock } from './page-schema.js';

function renderBlock(block: PageBlock, key: string): ReactNode {
  switch (block.__component) {
    case 'blocks.nav':
      return <Nav key={key} {...block} />;
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
    case 'blocks.footer':
      return <Footer key={key} {...block} />;
    default:
      // Редактор может завести блок раньше, чем задеплоен фронт: одна незнакомая
      // секция не должна ронять страницу целиком.
      return null;
  }
}

export function renderBlocks(blocks: readonly PageBlock[]): ReactNode[] {
  return blocks.map((block, index) => renderBlock(block, `${block.__component}-${index}`));
}
