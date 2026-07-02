import { getTranslations } from 'next-intl/server';
import styles from './page.module.scss';

export default async function DashboardPage() {
  const t = await getTranslations('Dashboard');
  return (
    <main className={styles['page']}>
      <header className={styles['header']}>
        <h1>{t('title')}</h1>
      </header>
      <section className={styles['empty']}>
        <h2>{t('emptyTitle')}</h2>
        <p>{t('emptyBody')}</p>
      </section>
    </main>
  );
}
