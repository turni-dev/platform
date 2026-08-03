const HTML_ESCAPE_PATTERN = /[&<'">]/gu;

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  "'": '&#39;',
  '"': '&quot;',
  '>': '&gt;'
};

/** Escapes untrusted text before it is interpolated into static markup. */
export function escapeHtml(value: string): string {
  return value.replace(HTML_ESCAPE_PATTERN, (character) => HTML_ENTITIES[character] ?? character);
}
