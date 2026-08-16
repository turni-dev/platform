import { handleLeadRequest } from '../../../leads/lead-intake';

export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return handleLeadRequest(request, {
    baseUrl: process.env['CMS_BASE_URL'],
    // Ключ записи живёт только на сервере: в браузер он не попадает.
    apiToken: process.env['CMS_WRITE_TOKEN'],
    fetch: (url, init) => fetch(url, init),
    onWarning: (message) => {
      console.warn(message);
    }
  });
}
