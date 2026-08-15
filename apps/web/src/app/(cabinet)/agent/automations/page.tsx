import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { fetchAgentConfiguration } from '../../../../lib/agent-client';
import { readBackendOrigin } from '../../../../lib/backend-origin';
import styles from '../../cabinet.module.scss';

/**
 * The allowlist is default deny and the catalogue is still empty: Telegram and
 * Google register their presets when those cards land. Saying so plainly beats
 * showing an empty switchboard that pretends to do something.
 */
export default async function AutomationsPage(): Promise<React.JSX.Element> {
  const configuration = await fetchAgentConfiguration({
    baseUrl: readBackendOrigin(),
    cookie: (await cookies()).toString()
  });
  if (configuration === undefined) {
    redirect('/agent');
  }

  const t = await getTranslations('Agent');

  return (
    <main className={styles['panel']}>
      <h1>{t('automationsTitle')}</h1>
      <p>{t('automationsBody')}</p>
      {configuration.automations.presets.length === 0 ? (
        <p>{t('automationsEmpty')}</p>
      ) : (
        <ul className={styles['files']}>
          {configuration.automations.presets.map((preset) => (
            <li key={preset}>{preset}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
