/** Turns any storefront page (pasted URL or path) into that page + ?aff=CODE. */
export function buildAffiliateLink(input: string, code: string, origin = window.location.origin): string | null {
  const raw = input.trim() || '/';
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  url.searchParams.delete('aff');
  url.searchParams.set('aff', code);
  return url.toString();
}
