import type { SiteSettings } from './site-settings-schema';
import styles from './footer.module.scss';

type FooterProps = Pick<
  SiteSettings,
  'footerContacts' | 'footerLegalLinks'
> & { readonly footerNote?: string };

export function Footer({ footerContacts, footerLegalLinks, footerNote }: FooterProps) {
  return (
    <footer className={styles['footer']} data-site="footer">
      <div className={styles['inner']}>
        <nav aria-label="Контакты" className={styles['column']}>
          <ul className={styles['list']}>
            {footerContacts.map((contact) => (
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
            {footerLegalLinks.map((link) => (
              <li key={link.href}>
                <a className={styles['link']} href={link.href}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {footerNote === undefined ? null : <p className={styles['note']}>{footerNote}</p>}
      </div>
    </footer>
  );
}
