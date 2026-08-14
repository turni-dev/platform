'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signOutOwner } from '../../lib/owner-auth-client';

export function SignOutButton({ label }: { label: string }): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = (): void => {
    setPending(true);

    void signOutOwner().then(() => {
      router.replace('/login');
      router.refresh();
    });
  };

  return (
    <button type="button" onClick={signOut} disabled={pending}>
      {label}
    </button>
  );
}
