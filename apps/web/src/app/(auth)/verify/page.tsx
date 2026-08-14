import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { parseVerifyParams } from '../../../lib/verify-params';
import { OwnerCodeForm } from '../auth-forms';
import styles from '../auth.module.scss';

export default async function VerifyPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = parseVerifyParams(await searchParams);
  if (params === undefined) {
    redirect('/login');
  }

  const t = await getTranslations('Auth');

  return (
    <main className={styles['page']}>
      <section className={styles['card']}>
        <h1>{t('verifyTitle')}</h1>
        <p>{t('verifySubtitle', { email: params.email })}</p>
        <OwnerCodeForm flow={params.flow} email={params.email} />
      </section>
    </main>
  );
}
