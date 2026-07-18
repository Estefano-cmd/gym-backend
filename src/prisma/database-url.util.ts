export function resolveDatabaseUrl(url = process.env.DATABASE_URL): string {
  if (!url) return '';

  const usesTransactionPooler = url.includes(':6543');

  if (usesTransactionPooler && !url.includes('pgbouncer=true')) {
    return `${url}${url.includes('?') ? '&' : '?'}pgbouncer=true&connection_limit=1`;
  }

  return url;
}
