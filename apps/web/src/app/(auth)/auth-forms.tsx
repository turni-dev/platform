'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  requestOwnerCode,
  verifyOwnerCode,
  type OwnerAuthFlow
} from '../../lib/owner-auth-client';
import { authErrorMessageKey } from '../../lib/owner-auth-messages';
import styles from './auth.module.scss';

export function OwnerEmailForm({ flow }: { flow: OwnerAuthFlow }): React.JSX.Element {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(undefined);

    void requestOwnerCode(flow, email).then((outcome) => {
      setPending(false);
      if (outcome.status === 'error') {
        setError(t(authErrorMessageKey(outcome.code)));
        return;
      }

      router.push(
        `/verify?flow=${flow}&email=${encodeURIComponent(email.trim().toLowerCase())}`
      );
    });
  };

  return (
    <form className={styles['form']} onSubmit={submit}>
      <label className={styles['label']} htmlFor="email">
        {t('emailLabel')}
      </label>
      <input
        className={styles['input']}
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {error === undefined ? null : (
        <p className={styles['error']} role="alert">
          {error}
        </p>
      )}
      <button className={styles['submit']} type="submit" disabled={pending}>
        {t(flow === 'register' ? 'registerSubmit' : 'loginSubmit')}
      </button>
    </form>
  );
}

export function OwnerCodeForm({
  flow,
  email
}: {
  flow: OwnerAuthFlow;
  email: string;
}): React.JSX.Element {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(undefined);

    void verifyOwnerCode(flow, email, code).then((outcome) => {
      setPending(false);
      if (outcome.status === 'error') {
        setError(t(authErrorMessageKey(outcome.code)));
        return;
      }

      router.replace('/dashboard');
    });
  };

  const resend = (): void => {
    setError(undefined);

    void requestOwnerCode(flow, email).then((outcome) => {
      if (outcome.status === 'error') {
        setError(t(authErrorMessageKey(outcome.code)));
      }
    });
  };

  return (
    <form className={styles['form']} onSubmit={submit}>
      <label className={styles['label']} htmlFor="code">
        {t('codeLabel')}
      </label>
      <input
        className={styles['input']}
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      {error === undefined ? null : (
        <p className={styles['error']} role="alert">
          {error}
        </p>
      )}
      <button className={styles['submit']} type="submit" disabled={pending}>
        {t('verifySubmit')}
      </button>
      <button className={styles['secondary']} type="button" onClick={resend}>
        {t('resend')}
      </button>
    </form>
  );
}
