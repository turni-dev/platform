/**
 * The origin the web server talks to. Browsers never see it: `/api/v1` is
 * rewritten to it, so auth cookies stay same-origin with the pages.
 */
export function readBackendOrigin(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const configured = env['BACKEND_ORIGIN'];
  if (configured === undefined || configured.trim() === '') {
    return 'http://localhost:3000';
  }

  return new URL(configured).origin;
}
