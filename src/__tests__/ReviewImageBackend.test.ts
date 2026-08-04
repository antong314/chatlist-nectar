import {
  REVIEW_IMAGES_BUCKET,
  uploadReviewImages,
} from '@/features/reviews/api/reviewsApi';
import {
  normalizeReviewImagePaths,
  REVIEW_IMAGE_MAX_BYTES,
  ReviewValidationError,
  validateReviewImageFiles,
} from '@/features/reviews/validation';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mockUpload = jest.fn();
const mockStorageFrom = jest.fn(() => ({
  upload: mockUpload,
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: (...args: unknown[]) => mockStorageFrom(...args),
    },
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => '9aef6b9e-7d7f-4f63-975d-1c1266e5d7c3'),
}));

const providerId = '7bf39fa3-2c3e-4248-8ef4-6377274e44d1';
const storagePath = `${providerId}/9aef6b9e-7d7f-4f63-975d-1c1266e5d7c3.jpg`;

describe('review image backend contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpload.mockResolvedValue({ data: { path: storagePath }, error: null });
  });

  test('validates the complete selection before uploading any file', async () => {
    const validFile = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
    const tooManyFiles = Array.from({ length: 5 }, () => validFile);

    await expect(uploadReviewImages(providerId, tooManyFiles)).rejects.toBeInstanceOf(
      ReviewValidationError,
    );
    expect(mockUpload).not.toHaveBeenCalled();

    expect(() => validateReviewImageFiles([
      new File(['image'], 'photo.gif', { type: 'image/gif' }),
    ])).toThrow('JPEG, PNG, or WebP');
    expect(() => validateReviewImageFiles([
      new File([new Uint8Array(REVIEW_IMAGE_MAX_BYTES + 1)], 'large.png', { type: 'image/png' }),
    ])).toThrow('5 MiB');
  });

  test('uploads to a random provider-prefixed path without upsert', async () => {
    const file = new File(['image'], 'original-name.jpeg', { type: 'image/jpeg' });

    await expect(uploadReviewImages(providerId, [file])).resolves.toEqual([storagePath]);
    expect(mockStorageFrom).toHaveBeenCalledWith(REVIEW_IMAGES_BUCKET);
    expect(mockUpload).toHaveBeenCalledWith(storagePath, file, {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: false,
    });
  });

  test('rejects foreign, duplicate, malformed, or excessive metadata paths', () => {
    expect(normalizeReviewImagePaths(providerId, [storagePath])).toEqual([storagePath]);
    expect(() => normalizeReviewImagePaths(providerId, [storagePath, storagePath]))
      .toThrow('unique');
    expect(() => normalizeReviewImagePaths(providerId, [
      `4380eb01-addb-4de4-a6a4-4164c6d6b5c3/9aef6b9e-7d7f-4f63-975d-1c1266e5d7c3.jpg`,
    ])).toThrow('provider/image path');
    expect(() => normalizeReviewImagePaths(providerId, [
      `${providerId}/9aef6b9e-7d7f-4f63-975d-1c1266e5d7c3.gif`,
    ])).toThrow('allowed extension');
  });

  test('keeps the migration compatible with clients that omit image paths', () => {
    const migrationSql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260802213000_provider_review_images.sql'),
      'utf8',
    );
    const canonicalSql = readFileSync(
      resolve(process.cwd(), 'database/reviews_setup.sql'),
      'utf8',
    );
    const defaultImagePaths = /p_image_paths\s+TEXT\[\]\s+DEFAULT\s+ARRAY\[\]::TEXT\[\]/i;

    expect(migrationSql).toMatch(defaultImagePaths);
    expect(canonicalSql).toMatch(defaultImagePaths);
  });
});
