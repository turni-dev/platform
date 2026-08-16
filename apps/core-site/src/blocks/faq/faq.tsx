import type { FaqBlock } from './schema.js';
import styles from './faq.module.scss';

/**
 * Нативный disclosure: клавиатура, раскрытое состояние и поиск по странице
 * достаются от платформы, а на первый экран не приезжает ни байта javascript.
 */
export function FaqAccordion({ heading, items }: FaqBlock) {
  return (
    <section className={styles['section']} data-block="blocks.faq" id="faq">
      <div className={styles['inner']}>
        <h2 className={styles['heading']}>{heading}</h2>
        <div className={styles['list']}>
          {items.map((item) => (
            <details className={styles['item']} key={item.question}>
              <summary className={styles['question']}>{item.question}</summary>
              <p className={styles['answer']}>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
