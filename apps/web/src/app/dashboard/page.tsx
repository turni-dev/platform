import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readBackendOrigin } from '../../lib/backend-origin';
import { fetchOwnerIdentity } from '../../lib/owner-auth-client';
import { SignOutButton } from './sign-out-button';
import styles from '../page.module.scss';

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const identity = await fetchOwnerIdentity({
    baseUrl: readBackendOrigin(),
    cookie: (await cookies()).toString()
  });
  if (identity === undefined) {
    redirect('/login');
  }

  const t = await getTranslations('Dashboard');

  return (
    <main className={styles['page']}>
      <header className={styles['header']}>
        <h1>{identity.tenantName}</h1>
        <p>{t('signedInAs', { email: identity.email })}</p>
        <SignOutButton label={t('signOut')} failureLabel={t('signOutFailed')} />
      </header>
      <section className={styles['empty']}>
        <h2>{t('emptyTitle')}</h2>
        <p>{t('emptyBody')}</p>
      </section>
    </main>
  );
}
