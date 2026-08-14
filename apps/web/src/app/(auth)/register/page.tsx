import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { OwnerEmailForm } from '../auth-forms';
import styles from '../auth.module.scss';

export default async function RegisterPage(): Promise<React.JSX.Element> {
  const t = await getTranslations('Auth');

  return (
    <main className={styles['page']}>
      <section className={styles['card']}>
        <h1>{t('registerTitle')}</h1>
        <OwnerEmailForm flow="register" />
        <Link className={styles['switch']} href="/login">
          {t('toLogin')}
        </Link>
      </section>
    </main>
  );
}
