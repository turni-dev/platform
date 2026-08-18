import type { ChangelogItemBlock } from './schema';
import styles from './changelog-item.module.scss';

/** Дата приходит машинным `ГГГГ-ММ-ДД`; читателю показываем её же по-русски.
 * UTC здесь обязателен: иначе дата уезжает на день в зависимости от сервера. */
const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});

export function ChangelogItem({ date, version, title, body, tags, link }: ChangelogItemBlock) {
  return (
    <section className={styles['section']} data-block="blocks.changelog-item">
      <div className={styles['inner']}>
        <article className={styles['entry']}>
          <p className={styles['meta']}>
            <time className={styles['date']} dateTime={date}>
              {dateFormat.format(new Date(`${date}T00:00:00Z`))}
            </time>
            {version === undefined ? null : <span className={styles['version']}>{version}</span>}
          </p>
          <h2 className={styles['title']}>{title}</h2>
          <p className={styles['body']}>{body}</p>
          {tags === undefined || tags.length === 0 ? null : (
            <ul className={styles['tags']}>
              {tags.map((tag) => (
                <li className={styles['tag']} key={tag}>
                  {tag}
                </li>
              ))}
            </ul>
          )}
          {link === undefined ? null : (
            <a className={styles['link']} href={link.href}>
              {link.label}
            </a>
          )}
        </article>
      </div>
    </section>
  );
}
