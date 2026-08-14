import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { OwnerEmailForm } from '../auth-forms';
import styles from '../auth.module.scss';

export default async function LoginPage(): Promise<React.JSX.Element> {
  const t = await getTranslations('Auth');

  return (
    <main className={styles['page']}>
      <section className={styles['card']}>
        <h1>{t('loginTitle')}</h1>
        <OwnerEmailForm flow="login" />
        <Link className={styles['switch']} href="/register">
          {t('toRegister')}
        </Link>
      </section>
    </main>
  );
}
