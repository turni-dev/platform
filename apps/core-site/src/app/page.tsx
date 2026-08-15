import { Button } from '@turni/ui';

export default function HomePage() {
  return (
    <main>
      <h1>Turni</h1>
      <p>ИИ-сотрудник для вашего бизнеса.</p>
      <Button asChild>
        <a href="https://app.turni.ru/login">Открыть кабинет</a>
      </Button>
    </main>
  );
}
