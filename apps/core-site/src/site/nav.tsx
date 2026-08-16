import { Button } from '@turni/ui';
import type { BlockLink } from '../blocks/shared';
import type { NavItem } from './site-settings-schema';
import styles from './nav.module.scss';

type NavProps = Readonly<{
  brand: string;
  /** Меню приходит из плагина навигации, а не из настроек сайта. */
  nav: readonly NavItem[];
  navCta?: BlockLink;
}>;

function NavLink({ item }: { readonly item: NavItem }) {
  if (item.children === undefined || item.children.length === 0) {
    return (
      <a className={styles['link']} href={item.href}>
        {item.label}
      </a>
    );
  }

  // Вложенность раскрыта разметкой, а не скриптом: список читается и с
  // клавиатуры, и поисковым роботом, и при выключенном javascript.
  return (
    <>
      <a className={styles['link']} href={item.href}>
        {item.label}
      </a>
      <ul className={styles['children']}>
        {item.children.map((child) => (
          <li key={child.href}>
            <a className={styles['link']} href={child.href}>
              {child.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Nav({ brand, nav, navCta }: NavProps) {
  return (
    <header className={styles['header']} data-site="nav">
      <div className={styles['inner']}>
        <a className={styles['brand']} href="/">
          {brand}
        </a>
        <nav aria-label="Основная навигация" className={styles['nav']}>
          <ul className={styles['links']}>
            {nav.map((item) => (
              <li key={item.href}>
                <NavLink item={item} />
              </li>
            ))}
          </ul>
        </nav>
        {navCta ? (
          <Button asChild>
            <a href={navCta.href}>{navCta.label}</a>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
