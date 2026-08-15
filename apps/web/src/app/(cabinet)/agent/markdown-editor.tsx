'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveInstructions, saveKnowledgeFile } from '../../../lib/agent-client';
import styles from '../cabinet.module.scss';

/** Which file the editor writes. A server component can only hand a client one
 * serializable data, so the target is data, not a callback. */
export type EditorTarget =
  | Readonly<{ kind: 'instructions' }>
  | Readonly<{ kind: 'knowledge'; path: string }>;

export interface MarkdownEditorLabels {
  readonly save: string;
  readonly saving: string;
  readonly saved: string;
  readonly failed: string;
}

export function MarkdownEditor({
  target,
  initialContent,
  labels
}: Readonly<{
  target: EditorTarget;
  initialContent: string;
  labels: MarkdownEditorLabels;
}>): React.JSX.Element {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const save = (): void => {
    setState('saving');

    void (
      target.kind === 'instructions'
        ? saveInstructions(content)
        : saveKnowledgeFile(target.path, content)
    ).then((file) => {
      // A refused save must not look like a stored one.
      if (file === undefined) {
        setState('failed');
        return;
      }

      setState('saved');
      router.refresh();
    });
  };

  return (
    <div className={styles['editor']}>
      <textarea
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setState('idle');
        }}
      />
      <div className={styles['actions']}>
        <button type="button" onClick={save} disabled={state === 'saving'}>
          {state === 'saving' ? labels.saving : labels.save}
        </button>
        {state === 'saved' ? <p className={styles['status']}>{labels.saved}</p> : undefined}
        {state === 'failed' ? (
          <p className={styles['failure']} role="alert">
            {labels.failed}
          </p>
        ) : undefined}
      </div>
    </div>
  );
}
