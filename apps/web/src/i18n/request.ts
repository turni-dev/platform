import { getRequestConfig } from 'next-intl/server';
import messages from '../../messages/ru.json' with { type: 'json' };

export default getRequestConfig(() =>
  Promise.resolve({
    locale: 'ru',
    messages
  })
);
