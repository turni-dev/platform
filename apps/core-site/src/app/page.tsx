import { renderBlocks } from '../blocks/block-renderer.js';
import { requireSeedPage } from '../content/seed-page.js';
import { sitePages } from '../content/site-pages.js';

export default async function HomePage() {
  const page = (await sitePages.getPage('home')) ?? requireSeedPage('home');

  return <>{renderBlocks(page.blocks)}</>;
}
