import Link from 'next/link';

export default function Home() {
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="HHS — головна">
          HHS<span>матеріали для прикрас</span>
        </Link>
      </header>
      <main id="main" className="welcome">
        <p className="eyebrow">Для ваших особливих ідей</p>
        <h1>
          Маленькі деталі.
          <br />
          Особливі прикраси.
        </h1>
        <p className="intro">
          Перлини, конектори та фурнітура для речей, які хочеться носити.
        </p>
        <div className="notice">
          <span className="dot" aria-hidden="true" />
          <p>
            Готуємо каталог до відкриття. Незабаром тут з’являться матеріали для
            ваших прикрас.
          </p>
        </div>
      </main>
      <footer>HHS · Матеріали для прикрас · Україна</footer>
    </>
  );
}
