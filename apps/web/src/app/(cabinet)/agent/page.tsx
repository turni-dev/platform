import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { readBackendOrigin } from '../../../lib/backend-origin';
import { fetchAgentConfiguration } from '../../../lib/agent-client';
import { CreateAgentButton } from './create-agent-button';
import { MarkdownEditor } from './markdown-editor';
import styles from '../cabinet.module.scss';

export default async function AgentPage(): Promise<React.JSX.Element> {
  const configuration = await fetchAgentConfiguration({
    baseUrl: readBackendOrigin(),
    cookie: (await cookies()).toString()
  });
  const t = await getTranslations('Agent');

  if (configuration === undefined) {
    return (
      <main className={styles['panel']}>
        <h1>{t('firstRunTitle')}</h1>
        <p>{t('firstRunBody')}</p>
        <CreateAgentButton label={t('create')} failureLabel={t('createFailed')} />
      </main>
    );
  }

  return (
    <main className={styles['panel']}>
      <h1>{t('instructionsTitle')}</h1>
      <p>{t('instructionsBody', { revision: configuration.instructions.revision })}</p>
      <MarkdownEditor
        target={{ kind: 'instructions' }}
        initialContent={configuration.instructions.content}
        labels={{
          save: t('save'),
          saving: t('saving'),
          saved: t('saved'),
          failed: t('saveFailed')
        }}
      />
    </main>
  );
}
