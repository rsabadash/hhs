'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { writeAdmin } from '@/lib/references';
export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <form
      className="admin-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        setPending(true);
        const form = new FormData(event.currentTarget);
        try {
          await writeAdmin('auth/login', 'POST', {
            email: String(form.get('email')).trim(),
            password: form.get('password'),
          });
          router.replace('/admin/categories');
          router.refresh();
        } catch (error) {
          setError(
            error instanceof Error ? error.message : 'Не вдалося увійти.',
          );
          setPending(false);
        }
      }}
    >
      <label>
        Електронна пошта
        <input
          name="email"
          type="email"
          autoComplete="username"
          maxLength={254}
          required
        />
      </label>
      <label>
        Пароль
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={200}
          required
        />
      </label>
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary" disabled={pending}>
        {pending ? 'Входимо…' : 'Увійти'}
      </button>
    </form>
  );
}
