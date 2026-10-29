import type { Metadata } from 'next';
import './globals.css';
import '@/components/list-controls.css';

export const metadata: Metadata = {
  title: 'HHS — матеріали для прикрас',
  description: 'Перлини, конектори та фурнітура для ваших прикрас.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body>
        <a className="skip-link" href="#main">
          Перейти до вмісту
        </a>
        {children}
      </body>
    </html>
  );
}
