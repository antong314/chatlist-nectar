/**
 * Turns a user-entered website into an absolute HTTP(S) URL.
 * Browsers otherwise interpret values such as "www.example.com" as paths on
 * the current site.
 */
export const normalizeWebsiteUrl = (value: string): string => {
  const trimmedValue = value.trim();

  if (!trimmedValue) return '';
  if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue;
  if (trimmedValue.startsWith('//')) return `https:${trimmedValue}`;

  return `https://${trimmedValue}`;
};

/** Returns an absolute HTTP(S) URL or an empty string for unsafe/malformed values. */
export const getSafeExternalUrl = (value: string | null | undefined): string => {
  if (!value?.trim()) return '';

  const normalizedUrl = normalizeWebsiteUrl(value);
  try {
    const parsedUrl = new URL(normalizedUrl);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
      ? normalizedUrl
      : '';
  } catch {
    return '';
  }
};
