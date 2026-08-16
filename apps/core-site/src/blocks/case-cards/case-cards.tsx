import { Button } from '@turni/ui';
import type { CaseCardsBlock } from './schema';
import styles from './case-cards.module.scss';

export function CaseCards({ heading, emptyState, cases }: CaseCardsBlock) {
  return (
    <section className={styles['section']} data-block="blocks.case-cards" id="cases">
      <div className={styles['inner']}>
        <h2 className={styles['heading']}>{heading}</h2>
        {cases.length === 0 ? (
          emptyState === undefined ? null : (
            <div className={styles['empty']}>
              <p className={styles['emptyBody']}>{emptyState.body}</p>
              <Button asChild>
                <a href={emptyState.cta.href}>{emptyState.cta.label}</a>
              </Button>
            </div>
          )
        ) : (
          <ul className={styles['list']}>
            {cases.map((entry) => (
              <li key={entry.title}>
                <article className={styles['card']}>
                  <h3 className={styles['title']}>
                    {entry.href === undefined ? (
                      entry.title
                    ) : (
                      <a href={entry.href}>{entry.title}</a>
                    )}
                  </h3>
                  <dl className={styles['facts']}>
                    <dt>Задача</dt>
                    <dd>{entry.task}</dd>
                    <dt>Что собрали</dt>
                    <dd>{entry.built}</dd>
                    <dt>Результат</dt>
                    <dd>{entry.result}</dd>
                  </dl>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
