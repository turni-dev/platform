import { renderBlocks } from '../blocks/block-renderer.js';
import { requireSeedPage } from '../content/seed-page.js';

export default function HomePage() {
  return <>{renderBlocks(requireSeedPage('home').blocks)}</>;
}
