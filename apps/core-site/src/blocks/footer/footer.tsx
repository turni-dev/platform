import type { FooterBlock } from './schema.js';
import styles from './footer.module.scss';

export function Footer({ contacts, legalLinks, note }: FooterBlock) {
  return (
    <footer className={styles['footer']} data-block="blocks.footer">
      <div className={styles['inner']}>
        <nav aria-label="Контакты" className={styles['column']}>
          <ul className={styles['list']}>
            {contacts.map((contact) => (
              <li key={contact.label}>
                {contact.href === undefined ? (
                  contact.label
                ) : (
                  <a className={styles['link']} href={contact.href}>
                    {contact.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Правовая информация" className={styles['column']}>
          <ul className={styles['list']}>
            {legalLinks.map((link) => (
              <li key={link.href}>
                <a className={styles['link']} href={link.href}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {note === undefined ? null : <p className={styles['note']}>{note}</p>}
      </div>
    </footer>
  );
}
