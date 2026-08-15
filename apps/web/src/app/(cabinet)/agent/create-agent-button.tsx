'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@turni/ui';
import { createAgent } from '../../../lib/agent-client';
import styles from '../cabinet.module.scss';

export function CreateAgentButton({
  label,
  failureLabel
}: Readonly<{ label: string; failureLabel: string }>): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const create = (): void => {
    setPending(true);
    setFailed(false);

    void createAgent().then((configuration) => {
      if (configuration === undefined) {
        setPending(false);
        setFailed(true);
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className={styles['actions']}>
      <Button type="button" onClick={create} disabled={pending}>
        {label}
      </Button>
      {failed ? (
        <p className={styles['failure']} role="alert">
          {failureLabel}
        </p>
      ) : undefined}
    </div>
  );
}
