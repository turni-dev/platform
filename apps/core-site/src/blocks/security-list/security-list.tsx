import type { SecurityIcon, SecurityListBlock } from './schema';
import styles from './security-list.module.scss';

const iconPaths: Record<SecurityIcon, string> = {
  shield: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z',
  server: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 9a3 3 0 100 6 3 3 0 000-6z',
  audit: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6'
};

export function SecurityList({ heading, items }: SecurityListBlock) {
  return (
    <section className={styles['section']} data-block="blocks.security-list" id="security">
      <div className={styles['inner']}>
        <h2 className={styles['heading']}>{heading}</h2>
        <ul className={styles['list']}>
          {items.map((item) => (
            <li className={styles['item']} key={item.title}>
              <svg
                className={styles['icon']}
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d={iconPaths[item.icon ?? 'shield']} />
              </svg>
              <div>
                <h3 className={styles['title']}>{item.title}</h3>
                {item.body === undefined ? null : <p className={styles['body']}>{item.body}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
