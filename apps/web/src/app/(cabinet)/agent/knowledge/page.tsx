import { KnowledgeFilePathSchema } from '@turni/contracts';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  fetchAgentConfiguration,
  fetchKnowledgeFile
} from '../../../../lib/agent-client';
import { readBackendOrigin } from '../../../../lib/backend-origin';
import { MarkdownEditor } from '../markdown-editor';
import { DeleteKnowledgeFile, NewKnowledgeFile } from './knowledge-controls';
import styles from '../../cabinet.module.scss';

export default async function KnowledgePage({
  searchParams
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>): Promise<React.JSX.Element> {
  const session = {
    baseUrl: readBackendOrigin(),
    cookie: (await cookies()).toString()
  };
  const configuration = await fetchAgentConfiguration(session);
  if (configuration === undefined) {
    redirect('/agent');
  }

  const t = await getTranslations('Agent');
  const requested = KnowledgeFilePathSchema.safeParse((await searchParams)['path']);
  const opened = requested.success
    ? await fetchKnowledgeFile(requested.data, session)
    : undefined;

  if (opened !== undefined) {
    return (
      <main className={styles['panel']}>
        <h1>{opened.path}</h1>
        <p>{t('instructionsBody', { revision: opened.revision })}</p>
        <MarkdownEditor
          target={{ kind: 'knowledge', path: opened.path }}
          initialContent={opened.content}
          labels={{
            save: t('save'),
            saving: t('saving'),
            saved: t('saved'),
            failed: t('saveFailed')
          }}
        />
        <p className={styles['actions']}>
          <Link href="/agent/knowledge">{t('backToKnowledge')}</Link>
          <DeleteKnowledgeFile
            path={opened.path}
            label={t('delete')}
            failureLabel={t('deleteFailed')}
          />
        </p>
      </main>
    );
  }

  return (
    <main className={styles['panel']}>
      <h1>{t('knowledgeTitle')}</h1>
      <p>{t('knowledgeBody')}</p>
      {configuration.knowledge.length === 0 ? (
        <p>{t('knowledgeEmpty')}</p>
      ) : (
        <ul className={styles['files']}>
          {configuration.knowledge.map((file) => (
            <li key={file.path}>
              <Link href={`/agent/knowledge?path=${encodeURIComponent(file.path)}`}>
                {file.path}
              </Link>
              <span className={styles['revision']}>
                {t('revision', { revision: file.revision })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <NewKnowledgeFile
        labels={{
          name: t('newFileLabel'),
          placeholder: t('newFilePlaceholder'),
          create: t('newFileCreate'),
          failed: t('newFileFailed')
        }}
      />
    </main>
  );
}
