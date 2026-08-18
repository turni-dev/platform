'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input } from 'antd';
import { deleteKnowledgeFile, saveKnowledgeFile } from '../../../../lib/agent-client';
import styles from '../../cabinet.module.scss';

/** The cabinet writes files as `knowledge/<name>.md`; the owner types the name. */
export function NewKnowledgeFile({
  labels
}: Readonly<{
  labels: Readonly<{
    name: string;
    placeholder: string;
    create: string;
    failed: string;
  }>;
}>): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const create = (): void => {
    setPending(true);
    setFailed(false);
    const path = `knowledge/${name.trim()}.md`;

    void saveKnowledgeFile(path, '').then((file) => {
      setPending(false);
      if (file === undefined) {
        setFailed(true);
        return;
      }

      router.push(`/agent/knowledge?path=${encodeURIComponent(path)}`);
      router.refresh();
    });
  };

  return (
    <div className={styles['editor']}>
      <label htmlFor="knowledge-name">{labels.name}</label>
      <Input
        id="knowledge-name"
        name="name"
        type="text"
        value={name}
        placeholder={labels.placeholder}
        onChange={(event) => {
          setName(event.target.value);
          setFailed(false);
        }}
      />
      <div className={styles['actions']}>
        <Button type="primary" onClick={create} loading={pending} disabled={name.trim() === ''}>
          {labels.create}
        </Button>
        {failed ? (
          <p className={styles['failure']} role="alert">
            {labels.failed}
          </p>
        ) : undefined}
      </div>
    </div>
  );
}

export function DeleteKnowledgeFile({
  path,
  label,
  failureLabel
}: Readonly<{ path: string; label: string; failureLabel: string }>): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = (): void => {
    setPending(true);
    setFailed(false);

    void deleteKnowledgeFile(path).then((removed) => {
      setPending(false);
      if (!removed) {
        setFailed(true);
        return;
      }

      router.push('/agent/knowledge');
      router.refresh();
    });
  };

  return (
    <>
      <Button danger onClick={remove} loading={pending}>
        {label}
      </Button>
      {failed ? (
        <span className={styles['failure']} role="alert">
          {failureLabel}
        </span>
      ) : undefined}
    </>
  );
}
