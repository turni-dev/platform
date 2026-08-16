import { Input, Textarea } from '@turni/ui';
import { randomUUID } from 'node:crypto';
import { LeadFormShell } from './lead-form-shell.js';
import type { LeadFormBlock } from './schema.js';
import styles from './lead-form.module.scss';

/**
 * Обычная HTML-форма: заявка уходит и без javascript. Состояния отправки
 * добавляются поверх этого, а не вместо него.
 */
export function LeadForm({
  heading,
  note,
  submitLabel,
  labels,
  groups,
  consent
}: LeadFormBlock) {
  return (
    <section className={styles['section']} data-block="blocks.lead-form" id="lead">
      <div className={styles['inner']}>
        <h2 className={styles['heading']}>{heading}</h2>
        {note === undefined ? null : <p className={styles['note']}>{note}</p>}
        <LeadFormShell submitLabel={submitLabel}>
          {/* Ключ попытки рождается вместе с формой: повторная отправка той же
              страницы не создаёт вторую заявку даже без javascript. */}
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <div className={styles['field']}>
            <label className={styles['label']} htmlFor="lead-name">
              {labels.name}
            </label>
            <Input id="lead-name" name="name" autoComplete="name" />
          </div>

          <div className={styles['field']}>
            <label className={styles['label']} htmlFor="lead-contact">
              {labels.contact}
            </label>
            <Input id="lead-contact" name="contact" required />
          </div>

          <div className={styles['field']}>
            <label className={styles['label']} htmlFor="lead-company">
              {labels.company}
            </label>
            <Input id="lead-company" name="company" autoComplete="organization" />
          </div>

          <div className={styles['field']}>
            <label className={styles['label']} htmlFor="lead-task">
              {labels.task}
            </label>
            <Textarea id="lead-task" name="task" rows={5} />
          </div>

          <fieldset className={styles['group']}>
            <legend className={styles['legend']}>{groups.channels.legend}</legend>
            <div className={styles['chips']}>
              {groups.channels.options.map((option) => (
                <label className={styles['chip']} key={option}>
                  <input type="checkbox" name="channels" value={option} />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles['group']}>
            <legend className={styles['legend']}>{groups.hasServer.legend}</legend>
            <div className={styles['chips']}>
              {groups.hasServer.options.map((option) => (
                <label className={styles['chip']} key={option}>
                  <input type="radio" name="hasServer" value={option} />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles['group']}>
            <legend className={styles['legend']}>{groups.timeline.legend}</legend>
            <div className={styles['chips']}>
              {groups.timeline.options.map((option) => (
                <label className={styles['chip']} key={option}>
                  <input type="radio" name="timeline" value={option} />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className={styles['consent']}>
            <input type="checkbox" name="consent" value="yes" required />
            <span>
              <a href={consent.href}>{consent.label}</a>
            </span>
          </label>

          {/* Ловушка для ботов: людям она не видна и не попадает в обход табом. */}
          <div className={styles['trap']} aria-hidden="true">
            <label htmlFor="lead-company-site">Не заполняйте это поле</label>
            <input id="lead-company-site" name="companySite" tabIndex={-1} autoComplete="off" />
          </div>
        </LeadFormShell>
      </div>
    </section>
  );
}
