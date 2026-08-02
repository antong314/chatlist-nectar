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
