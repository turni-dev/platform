'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from 'antd';
import { signOutOwner } from '../../../lib/owner-auth-client';

export function SignOutButton({
  label,
  failureLabel
}: {
  label: string;
  failureLabel: string;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const signOut = (): void => {
    setPending(true);
    setFailed(false);

    void signOutOwner().then((signedOut) => {
      // A refused logout leaves the session alive; leaving the page would tell
      // the owner they are out while their credential still works.
      if (!signedOut) {
        setPending(false);
        setFailed(true);
        return;
      }

      router.replace('/login');
      router.refresh();
    });
  };

  return (
    <>
      <Button onClick={signOut} loading={pending}>
        {label}
      </Button>
      {failed ? <p role="alert">{failureLabel}</p> : undefined}
    </>
  );
}
