import type { NumberedStepsBlock } from './schema';
import styles from './numbered-steps.module.scss';

export function NumberedSteps({ heading, intro, steps, note }: NumberedStepsBlock) {
  return (
    <section className={styles['section']} data-block="blocks.numbered-steps">
      <div className={styles['inner']}>
        <h2 className={styles['heading']}>{heading}</h2>
        {intro === undefined ? null : <p className={styles['intro']}>{intro}</p>}
        <ol className={styles['list']}>
          {steps.map((step) => (
            <li className={styles['step']} key={step.title}>
              <div className={styles['copy']}>
                <h3 className={styles['title']}>{step.title}</h3>
                <p className={styles['body']}>{step.body}</p>
              </div>
              {step.caption === undefined ? null : (
                <p className={styles['caption']}>{step.caption}</p>
              )}
            </li>
          ))}
        </ol>
        {note === undefined ? null : <p className={styles['note']}>{note}</p>}
      </div>
    </section>
  );
}
