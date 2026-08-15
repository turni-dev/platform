import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readBackendOrigin } from '../../lib/backend-origin';
import { fetchOwnerIdentity } from '../../lib/owner-auth-client';
import styles from './cabinet.module.scss';

/**
 * The cabinet's one session check. Every page inside this group renders on the
 * server behind it, so no screen has to remember to look for an owner.
 */
export default async function CabinetLayout({
  children
}: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  const identity = await fetchOwnerIdentity({
    baseUrl: readBackendOrigin(),
    cookie: (await cookies()).toString()
  });
  if (identity === undefined) {
    redirect('/login');
  }

  const t = await getTranslations('Cabinet');
  // The lint rule that keeps hardcoded strings out of JSX attributes reads the
  // key literal inside `t(...)` as visible text, so the label travels by name.
  const navLabel = t('navLabel');

  return (
    <div className={styles['shell']}>
      <nav className={styles['nav']} aria-label={navLabel}>
        <span className={styles['workspace']}>{identity.tenantName}</span>
        <Link href="/dashboard">{t('inbox')}</Link>
        <Link href="/agent">{t('agent')}</Link>
        <Link href="/agent/knowledge">{t('knowledge')}</Link>
        <Link href="/agent/automations">{t('automations')}</Link>
      </nav>
      {children}
    </div>
  );
}
