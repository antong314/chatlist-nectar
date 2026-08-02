import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactsList } from '@/features/directory/components/ContactsList';
import { getProviderReviewSummaries } from '@/features/reviews/api/reviewsApi';
import type { Contact } from '@/types/contact';

jest.mock('@/features/reviews/api/reviewsApi', () => ({
  getProviderReviewSummaries: jest.fn(),
}));

const contacts: Contact[] = [
  {
    id: 'provider-b',
    name: 'Beto Repairs',
    category: 'Construction',
    description: 'Home repairs from a trusted neighbor.',
    phone: '+506 8888 1000',
  },
  {
    id: 'provider-a',
    name: 'Ana Taxi',
    category: 'Taxi',
    description: 'Local rides and airport pickups.',
    phone: '+506 8888 2000',
  },
];

const renderDirectory = () => render(
  <MemoryRouter>
    <ContactsList
      contacts={contacts}
      isLoading={false}
      onEditContact={jest.fn()}
      onViewContact={jest.fn()}
    />
  </MemoryRouter>,
);

describe('directory review summaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads all visible provider aggregates in one batch and renders the score', async () => {
    (getProviderReviewSummaries as jest.Mock).mockResolvedValue({
      'provider-a': {
        providerId: 'provider-a',
        averageRating: 4.75,
        reviewCount: 8,
        ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 6 },
      },
      'provider-b': {
        providerId: 'provider-b',
        averageRating: 0,
        reviewCount: 0,
        ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      },
    });

    renderDirectory();

    expect(await screen.findByText('4.8')).toBeInTheDocument();
    expect(screen.getByText(/8 reviews/i)).toBeInTheDocument();
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
    expect(getProviderReviewSummaries).toHaveBeenCalledTimes(1);
    expect(getProviderReviewSummaries).toHaveBeenCalledWith([
      'provider-a',
      'provider-b',
    ]);
  });

  test('keeps the directory usable when the review RPC has not been migrated', async () => {
    (getProviderReviewSummaries as jest.Mock).mockRejectedValue(
      new Error('Could not find the function in the schema cache'),
    );

    renderDirectory();

    await waitFor(() => {
      expect(getProviderReviewSummaries).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Ana Taxi')).toBeInTheDocument();
    expect(screen.getByText('Beto Repairs')).toBeInTheDocument();
    expect(screen.getAllByText(/no reviews yet/i)).toHaveLength(2);
  });
});
