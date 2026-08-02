import { getSafeExternalUrl, normalizeWebsiteUrl } from '@/lib/urls';

describe('normalizeWebsiteUrl', () => {
  test.each([
    ['www.sophiehardy.org', 'https://www.sophiehardy.org'],
    ['sophiehardy.org', 'https://sophiehardy.org'],
    ['//sophiehardy.org', 'https://sophiehardy.org'],
    ['https://sophiehardy.org', 'https://sophiehardy.org'],
    ['HTTP://sophiehardy.org', 'HTTP://sophiehardy.org'],
    ['  www.sophiehardy.org  ', 'https://www.sophiehardy.org'],
    ['', ''],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeWebsiteUrl(input)).toBe(expected);
  });
});

describe('getSafeExternalUrl', () => {
  test.each([
    ['www.sophiehardy.org', 'https://www.sophiehardy.org'],
    ['https://maps.google.com/place/foo', 'https://maps.google.com/place/foo'],
    ['javascript:alert(1)', ''],
    ['https://', ''],
    ['   ', ''],
  ])('accepts only usable web links for %s', (input, expected) => {
    expect(getSafeExternalUrl(input)).toBe(expected);
  });
});
