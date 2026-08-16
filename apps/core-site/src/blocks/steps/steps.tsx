import type { StepsBlock } from './schema';
import styles from './steps.module.scss';

export function Steps({ heading, steps, note }: StepsBlock) {
  return (
    <section className={styles['section']} data-block="blocks.steps" id="steps">
      <div className={styles['inner']}>
        <h2 className={styles['heading']}>{heading}</h2>
        <ol className={styles['list']}>
          {steps.map((step) => (
            <li className={styles['step']} key={step.title}>
              <h3 className={styles['title']}>{step.title}</h3>
              <p className={styles['body']}>{step.body}</p>
            </li>
          ))}
        </ol>
        {note === undefined ? null : <p className={styles['note']}>{note}</p>}
      </div>
    </section>
  );
}
