const BLOCKED = new Set([
  'email',
  'token',
  'password',
  'authorization',
  'shanText',
  'englishText',
  'sourceText',
  'contactValue',
  'cookie',
]);

export function log(
  level: 'info' | 'error' | 'warn',
  message: string,
  fields: Record<string, unknown> = {},
) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!BLOCKED.has(key)) safe[key] = value;
  }
  console.log(JSON.stringify({ level, message, time: new Date().toISOString(), ...safe }));
}
