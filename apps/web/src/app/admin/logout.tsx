'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { writeAdmin } from '@/lib/references';
export default function Logout() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <div>
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError('');
          try {
            await writeAdmin('auth/logout', 'POST', {});
            router.replace('/admin/login');
            router.refresh();
          } catch {
            setError('Не вдалося вийти. Спробуйте ще раз.');
            setPending(false);
          }
        }}
      >
        Вийти
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
