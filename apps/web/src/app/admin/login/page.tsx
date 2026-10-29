import Link from 'next/link';
import LoginForm from './login-form';
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  return (
    <main id="main" className="login-page">
      <Link className="brand" href="/">
        HHS
      </Link>
      <p className="eyebrow">Адміністративна частина</p>
      <h1>З поверненням</h1>
      <p className="muted">Увійдіть, щоб керувати каталогом і довідниками.</p>
      {(await searchParams).expired ? (
        <p role="status" className="feedback">
          Сеанс завершено. Увійдіть знову.
        </p>
      ) : null}
      <LoginForm />
      <p className="login-help">
        Потрібен доступ або новий пароль? Зверніться до власника системи.
      </p>
    </main>
  );
}
