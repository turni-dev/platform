import messages from '../messages/ru.json' with { type: 'json' };

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'ru';
    Messages: typeof messages;
  }
}
