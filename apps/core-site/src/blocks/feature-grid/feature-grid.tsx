import type { FeatureGridBlock } from './schema';
import styles from './feature-grid.module.scss';

export function FeatureGrid({ heading, columns = 3, items }: FeatureGridBlock) {
  return (
    <section className={styles['section']} data-block="blocks.feature-grid">
      <div className={styles['inner']}>
        {heading === undefined ? null : <h2 className={styles['heading']}>{heading}</h2>}
        <ul className={styles['grid']} data-columns={columns}>
          {items.map((item) => (
            <li className={styles['item']} key={item.title}>
              <h3 className={styles['title']}>{item.title}</h3>
              {item.body === undefined ? null : <p className={styles['body']}>{item.body}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
