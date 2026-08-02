import { normalizeWebsiteUrl } from '@/lib/urls';

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
