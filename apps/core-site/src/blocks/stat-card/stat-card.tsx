import type { StatCardBlock } from './schema';
import styles from './stat-card.module.scss';

export function StatCard({ heading, intro, stats, source }: StatCardBlock) {
  return (
    <section className={styles['section']} data-block="blocks.stat-card">
      <div className={styles['inner']}>
        {heading === undefined ? null : <h2 className={styles['heading']}>{heading}</h2>}
        {intro === undefined ? null : <p className={styles['intro']}>{intro}</p>}
        <ul className={styles['list']}>
          {stats.map((stat) => (
            <li className={styles['card']} key={stat.label}>
              <p className={styles['value']}>{stat.value}</p>
              <p className={styles['label']}>{stat.label}</p>
              {stat.note === undefined ? null : <p className={styles['note']}>{stat.note}</p>}
            </li>
          ))}
        </ul>
        {source === undefined ? null : <p className={styles['source']}>{source}</p>}
      </div>
    </section>
  );
}
