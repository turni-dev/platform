import { Button } from '@turni/ui';
import type { NavBlock } from './schema.js';
import styles from './nav.module.scss';

export function Nav({ brand, links, cta }: NavBlock) {
  return (
    <header className={styles['header']} data-block="blocks.nav">
      <div className={styles['inner']}>
        <a className={styles['brand']} href="/">
          {brand}
        </a>
        <nav aria-label="Основная навигация" className={styles['nav']}>
          <ul className={styles['links']}>
            {links.map((link) => (
              <li key={link.href}>
                <a className={styles['link']} href={link.href}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {cta ? (
          <Button asChild>
            <a href={cta.href}>{cta.label}</a>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
