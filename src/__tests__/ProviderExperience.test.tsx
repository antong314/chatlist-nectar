import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProviderHero } from '@/features/directory/components/provider/ProviderHero';
import { ProviderReviews } from '@/features/directory/components/provider/ProviderReviews';
import { ReviewForm } from '@/features/directory/components/provider/ReviewForm';
import { ContactDetail } from '@/features/directory/components/ContactDetail';
import { ContactForm } from '@/features/directory/components/ContactForm';
import { ProviderPage } from '@/features/directory/pages/ProviderPage';
import { Contact } from '@/features/directory/types/contact';
import { supabase } from '@/lib/supabase';
import * as ReviewsModule from '@/features/reviews';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('@/features/reviews', () => ({
  useProviderReviews: jest.fn(),
  useSubmitReview: jest.fn(),
}));

const contact: Contact = {
  id: 'provider-1',
  name: 'Efra Mechanic',
  category: 'Mechanic',
  description: 'Trusted mobile mechanic.',
  phone: '+506 8888-1212',
  website: 'www.example.com',
};

describe('Provider experience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('makes WhatsApp the primary action and renders shareable provider details', () => {
    const onShare = jest.fn();

    render(
      <MemoryRouter>
        <ProviderHero
          averageRating={4.8}
          contact={contact}
          onShare={onShare}
          reviewCount={12}
        />
      </MemoryRouter>,
    );

    const whatsappLink = screen.getByRole('link', { name: /message on whatsapp/i });
    expect(whatsappLink).toHaveAttribute('href', expect.stringContaining('https://wa.me/50688881212?text='));
    expect(whatsappLink).toHaveAttribute('href', expect.stringContaining('San%20Mateo%20Love'));
    expect(screen.getByRole('link', { name: /visit website/i })).toHaveAttribute('href', 'https://www.example.com');
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('12 reviews')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  test('normalizes scheme-less map links and rejects unsafe links', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ProviderHero
          averageRating={0}
          contact={{ ...contact, mapUrl: 'maps.google.com/example' }}
          onShare={jest.fn()}
          reviewCount={0}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /view map/i })).toHaveAttribute(
      'href',
      'https://maps.google.com/example',
    );

    rerender(
      <MemoryRouter>
        <ProviderHero
          averageRating={0}
          contact={{ ...contact, mapUrl: 'javascript:alert(1)' }}
          onShare={jest.fn()}
          reviewCount={0}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /view map/i })).not.toBeInTheDocument();
  });

  test('keeps quick view safe, branded, and WhatsApp-first', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <ContactDetail
        contact={{ ...contact, mapUrl: 'maps.google.com/example' }}
        onClose={jest.fn()}
        onEdit={jest.fn()}
      />,
    );

    expect(screen.getByText('Mechanics')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view on map/i })).toHaveAttribute(
      'href',
      'https://maps.google.com/example',
    );

    fireEvent.click(screen.getByRole('button', { name: /message on whatsapp/i }));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/wa\.me\/50688881212\?text=.*San%20Mateo%20Love/),
      '_blank',
      'noopener,noreferrer',
    );

    openSpy.mockRestore();
  });

  test('submits the intentionally short review form', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(<ReviewForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /post review/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a star rating/i);

    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    await user.type(screen.getByLabelText(/your experience/i), 'Showed up quickly and did great work.');
    await user.type(screen.getByLabelText(/whatsapp number/i), '+506 8777 1234');
    await user.click(screen.getByRole('button', { name: /post review/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        rating: 5,
        comment: 'Showed up quickly and did great work.',
        reviewerName: undefined,
        whatsappNumber: '+506 8777 1234',
      });
    });
    expect(screen.getByText(/review is now part of the community rating/i)).toBeInTheDocument();
  });

  test('preserves an existing provider image when public edits leave it unchanged', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const existingImageUrl = 'https://example.com/provider-image.jpg';

    render(
      <ContactForm
        categories={['Mechanic']}
        contact={{ ...contact, image_url: existingImageUrl }}
        onCancel={jest.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        id: contact.id,
        image_url: existingImageUrl,
        imageFile: null,
        removeLogo: false,
      }));
    });
  });

  test('labels unnamed reviewers as anonymous', () => {
    render(
      <ProviderReviews
        averageRating={4}
        reviews={[
          {
            id: 'review-1',
            rating: 4,
            comment: 'Friendly and reliable.',
            reviewerName: null,
            createdAt: '2026-07-12T12:00:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Anonymous neighbor')).toBeInTheDocument();
    expect(screen.getByText('Friendly and reliable.')).toBeInTheDocument();
  });

  test('loads a provider from its permanent route', async () => {
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'provider-1',
          title: 'Efra Mechanic',
          subtitle: 'Trusted mobile mechanic.',
          category: 'Mechanic',
          phone_number: '+506 8888-1212',
          website_url: 'www.example.com',
          map_url: null,
          image_url: null,
        },
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    (supabase.from as jest.Mock).mockReturnValue(query);
    (ReviewsModule.useProviderReviews as jest.Mock).mockReturnValue({
      reviews: [],
      summary: { providerId: 'provider-1', averageRating: 0, reviewCount: 0, ratingCounts: {} },
      isLoading: false,
      error: null,
      reload: jest.fn(),
    });
    (ReviewsModule.useSubmitReview as jest.Mock).mockReturnValue({
      submitReview: jest.fn(),
      isSubmitting: false,
      error: null,
    });

    render(
      <MemoryRouter initialEntries={['/provider/provider-1']}>
        <Routes>
          <Route element={<ProviderPage />} path="/provider/:providerId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Efra Mechanic', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /message on whatsapp/i })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/50688881212'),
    );
    expect(query.eq).toHaveBeenCalledWith('id', 'provider-1');
    expect(screen.getByText(/be the first neighbor to share an experience/i)).toBeInTheDocument();
  });
});
