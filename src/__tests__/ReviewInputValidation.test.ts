import {
  normalizeReviewComment,
  normalizeReviewerName,
  normalizeSubmitReviewInput,
  ReviewValidationError,
} from '@/features/reviews/validation';

describe('review input validation', () => {
  test('normalizes the simple account-free review payload', () => {
    expect(normalizeSubmitReviewInput({
      providerId: '7bf39fa3-2c3e-4248-8ef4-6377274e44d1',
      rating: 5,
      comment: '  Great work!\r\nWould call again.  ',
      reviewerName: '  Ana    M. ',
    })).toEqual({
      providerId: '7bf39fa3-2c3e-4248-8ef4-6377274e44d1',
      rating: 5,
      comment: 'Great work!\nWould call again.',
      reviewerName: 'Ana M.',
      imagePaths: [],
    });
  });

  test('allows an anonymous star-only review before Machu supplies the private actor', () => {
    expect(normalizeSubmitReviewInput({
      providerId: '4380eb01-addb-4de4-a6a4-4164c6d6b5c3',
      rating: 4,
      comment: '   ',
      reviewerName: '',
    })).toEqual({
      providerId: '4380eb01-addb-4de4-a6a4-4164c6d6b5c3',
      rating: 4,
      comment: undefined,
      reviewerName: undefined,
      imagePaths: [],
    });
  });

  test.each([
    ['rating', { rating: 0 }],
    ['rating', { rating: 6 }],
    ['rating', { rating: 4.5 }],
    ['providerId', { providerId: 'not-a-provider-id' }],
  ])('rejects an invalid %s', (field, override) => {
    expect(() => normalizeSubmitReviewInput({
      providerId: '75197052-95f8-4099-8685-2886cdea30f2',
      rating: 5,
      ...override,
    })).toThrow(ReviewValidationError);
  });

  test('enforces public text length limits', () => {
    expect(() => normalizeReviewComment('x'.repeat(1001))).toThrow('1000 characters');
    expect(() => normalizeReviewerName('x'.repeat(81))).toThrow('80 characters');
  });
});
