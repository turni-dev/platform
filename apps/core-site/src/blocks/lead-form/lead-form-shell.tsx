'use client';

import { Button } from '@turni/ui';
import { useState, type FormEvent, type ReactNode } from 'react';
import styles from './lead-form.module.scss';

/**
 * Форма отправляется обычным POST и без javascript. Здесь добавляется только
 * то, чего браузер сам не даёт: блокировка повторного клика, сообщение об
 * ошибке без потери введённого и подтверждение на месте.
 */
export function LeadFormShell({
  submitLabel,
  children
}: Readonly<{ submitLabel: string; children: ReactNode }>) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [message, setMessage] = useState<string>('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state === 'sending') {
      return;
    }

    const form = event.currentTarget;
    setState('sending');
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: new FormData(form)
      });
      if (!response.ok) {
        const problem: unknown = await response.json();
        setMessage(
          typeof problem === 'object' && problem !== null && 'message' in problem
            ? String(problem.message)
            : 'Не отправилось, попробуйте ещё раз'
        );
        setState('failed');

        return;
      }

      form.reset();
      setState('sent');
    } catch {
      setMessage('Не отправилось, попробуйте ещё раз');
      setState('failed');
    }
  }

  return (
    <form
      className={styles['form']}
      method="post"
      action="/api/leads"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {children}
      <Button type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Отправляем…' : submitLabel}
      </Button>
      {state === 'sent' ? (
        <p className={styles['status']} role="status">
          Получили. Свяжемся в течение рабочего дня.
        </p>
      ) : null}
      {state === 'failed' ? (
        <p className={styles['status']} role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
