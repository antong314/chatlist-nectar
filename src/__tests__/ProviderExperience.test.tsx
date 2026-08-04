import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProviderHero } from '@/features/directory/components/provider/ProviderHero';
import { ProviderReviews } from '@/features/directory/components/provider/ProviderReviews';
import { ReviewForm } from '@/features/directory/components/provider/ReviewForm';
import { ContactForm } from '@/features/directory/components/ContactForm';
import { ProviderPage } from '@/features/directory/pages/ProviderPage';
import { Contact } from '@/features/directory/types/contact';
import { supabase } from '@/lib/supabase';
import * as ReviewsModule from '@/features/reviews';
import * as VerificationModule from '@/features/verification';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('@/features/reviews', () => ({
  ...jest.requireActual('@/features/reviews'),
  uploadReviewImages: jest.fn(),
  useProviderReviews: jest.fn(),
}));

jest.mock('@/features/verification', () => ({
  startWhatsappVerification: jest.fn(),
  checkWhatsappVerification: jest.fn(),
  completeVerifiedReview: jest.fn(),
}));

const providerId = '11111111-1111-4111-8111-111111111111';
const verificationChallenge = {
  actionId: '7a279684-13b7-4df4-b0e0-ac68d41cd656',
  actionToken: 'verification_action_token_12345678901234567890',
  expiresAt: '2026-08-04T14:10:00.000Z',
  phone: '+50687771234',
};

const contact: Contact = {
  id: providerId,
  name: 'Efra Mechanic',
  category: 'Mechanic',
  description: 'Trusted mobile mechanic.',
  phone: '+506 8888-1212',
  website: 'www.example.com',
};

describe('Provider experience', () => {
  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn((file: File) => `blob:${file.name}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (URL.createObjectURL as jest.Mock).mockImplementation((file: File) => `blob:${file.name}`);
    (VerificationModule.startWhatsappVerification as jest.Mock).mockResolvedValue(verificationChallenge);
    (VerificationModule.checkWhatsappVerification as jest.Mock).mockResolvedValue({
      status: 'approved',
      actionType: 'provider_review',
      requiresCompletion: true,
    });
    (VerificationModule.completeVerifiedReview as jest.Mock).mockResolvedValue({
      status: 'approved',
      actionType: 'provider_review',
    });
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
    expect(screen.getByRole('link', { name: /edit listing/i })).toHaveAttribute(
      'href',
      `/?edit=${providerId}`,
    );

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

  test('submits the intentionally short review form', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(<ReviewForm onSubmit={onSubmit} providerId={providerId} />);

    expect(screen.getByText(/one-time code here to verify your review/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /submit review/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a star rating/i);

    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    await user.type(screen.getByLabelText(/your experience/i), 'Showed up quickly and did great work.');
    await user.type(screen.getByLabelText(/whatsapp number/i), '+506 8777 1234');
    await user.click(screen.getByRole('button', { name: /submit review/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/we sent a verification code/i)).toBeInTheDocument();
    await user.type(await screen.findByLabelText(/whatsapp confirmation code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify & post review/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        rating: 5,
        comment: 'Showed up quickly and did great work.',
        reviewerName: undefined,
        whatsappNumber: '+50687771234',
        images: [],
      }, verificationChallenge, '123456');
    });
    expect(screen.getByText(/review is now part of the community rating/i)).toBeInTheDocument();
  });

  test('previews, removes, and submits optional review photos', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const firstImage = new File(['first'], 'before.jpg', { type: 'image/jpeg' });
    const secondImage = new File(['second'], 'after.webp', { type: 'image/webp' });

    render(<ReviewForm onSubmit={onSubmit} providerId={providerId} />);

    await user.upload(screen.getByLabelText(/photos/i), [firstImage, secondImage]);
    expect(screen.getByRole('img', { name: /preview 1: before.jpg/i })).toHaveAttribute('src', 'blob:before.jpg');
    expect(screen.getByRole('img', { name: /preview 2: after.webp/i })).toHaveAttribute('src', 'blob:after.webp');

    await user.click(screen.getByRole('button', { name: /remove before.jpg/i }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:before.jpg');
    expect(screen.queryByRole('img', { name: /before.jpg/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    await user.type(screen.getByLabelText(/whatsapp number/i), '+506 8777 1234');
    await user.click(screen.getByRole('button', { name: /submit review/i }));
    await user.type(await screen.findByLabelText(/whatsapp confirmation code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify & post review/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        images: [secondImage],
      }), verificationChallenge, '123456');
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:after.webp');
  });

  test('enforces the four-photo review limit', async () => {
    const user = userEvent.setup();
    const images = Array.from({ length: 5 }, (_, index) =>
      new File([String(index)], `photo-${index + 1}.png`, { type: 'image/png' }),
    );

    render(<ReviewForm onSubmit={jest.fn()} providerId={providerId} />);
    await user.upload(screen.getByLabelText(/photos/i), images);

    expect(screen.getAllByRole('img', { name: /preview/i })).toHaveLength(4);
    expect(screen.getByRole('alert')).toHaveTextContent(/up to 4 images/i);
  });

  test('rejects unsupported and oversized review photos', () => {
    const unsupportedImage = new File(['gif'], 'animated.gif', { type: 'image/gif' });
    const oversizedImage = new File(['large'], 'large.png', { type: 'image/png' });
    Object.defineProperty(oversizedImage, 'size', { value: (5 * 1024 * 1024) + 1 });

    render(<ReviewForm onSubmit={jest.fn()} providerId={providerId} />);
    fireEvent.change(screen.getByLabelText(/photos/i), {
      target: { files: [unsupportedImage, oversizedImage] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/JPEG, PNG, or WebP/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/5 MB or smaller/i);
    expect(screen.queryByRole('img', { name: /preview/i })).not.toBeInTheDocument();
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
            imageUrls: [
              'https://example.com/review-1.jpg',
              'https://example.com/review-2.webp',
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('Anonymous neighbor')).toBeInTheDocument();
    expect(screen.getByText('Friendly and reliable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view anonymous neighbor's review photo 1 of 2/i })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    expect(screen.getAllByRole('img', { name: /anonymous neighbor's review photo/i })).toHaveLength(2);
  });

  test('loads a provider from its permanent route', async () => {
    const user = userEvent.setup();
    const reviewImage = new File(['work'], 'repair.jpg', { type: 'image/jpeg' });
    const reviewImagePath = `${providerId}/22222222-2222-4222-8222-222222222222.jpg`;
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: providerId,
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
      summary: { providerId, averageRating: 0, reviewCount: 0, ratingCounts: {} },
      isLoading: false,
      error: null,
      reload: jest.fn(),
    });
    (ReviewsModule.uploadReviewImages as jest.Mock).mockResolvedValue([reviewImagePath]);

    render(
      <MemoryRouter initialEntries={[`/provider/${providerId}`]}>
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
    expect(query.eq).toHaveBeenCalledWith('id', providerId);
    expect(screen.getByText(/be the first neighbor to share an experience/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /edit listing/i })).toHaveAttribute(
      'href',
      `/?edit=${providerId}`,
    );

    await user.upload(screen.getByLabelText(/photos/i), reviewImage);
    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    await user.type(screen.getByLabelText(/whatsapp number/i), '+506 8777 1234');
    await user.click(screen.getByRole('button', { name: /submit review/i }));
    await user.type(await screen.findByLabelText(/whatsapp confirmation code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify & post review/i }));

    await waitFor(() => {
      expect(ReviewsModule.uploadReviewImages).toHaveBeenCalledWith(providerId, [reviewImage]);
      expect(VerificationModule.checkWhatsappVerification).toHaveBeenCalledWith(
        verificationChallenge,
        '123456',
      );
      expect(VerificationModule.completeVerifiedReview).toHaveBeenCalledWith(
        verificationChallenge,
        [reviewImagePath],
      );
    });
  });

  test('does not save a review when its image upload fails', async () => {
    const user = userEvent.setup();
    const reviewImage = new File(['work'], 'repair.jpg', { type: 'image/jpeg' });
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: providerId,
          title: 'Efra Mechanic',
          subtitle: 'Trusted mobile mechanic.',
          category: 'Mechanic',
          phone_number: '+506 8888-1212',
          website_url: null,
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
      summary: { providerId, averageRating: 0, reviewCount: 0, ratingCounts: {} },
      isLoading: false,
      error: null,
      reload: jest.fn(),
    });
    (ReviewsModule.uploadReviewImages as jest.Mock).mockRejectedValue(
      new Error('Photos could not be uploaded. Please try again.'),
    );

    render(
      <MemoryRouter initialEntries={[`/provider/${providerId}`]}>
        <Routes>
          <Route element={<ProviderPage />} path="/provider/:providerId" />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Efra Mechanic', level: 1 });
    await user.upload(screen.getByLabelText(/photos/i), reviewImage);
    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    const whatsappInput = screen.getByLabelText(/whatsapp number/i);
    await user.type(whatsappInput, 'not-a-number');
    await user.click(screen.getByRole('button', { name: /submit review/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/WhatsApp number with country code/i);
    expect(ReviewsModule.uploadReviewImages).not.toHaveBeenCalled();
    expect(VerificationModule.checkWhatsappVerification).not.toHaveBeenCalled();

    await user.clear(whatsappInput);
    await user.type(whatsappInput, '+506 8777 1234');
    await user.click(screen.getByRole('button', { name: /submit review/i }));
    await user.type(await screen.findByLabelText(/whatsapp confirmation code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify & post review/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/photos could not be uploaded/i);
    expect(VerificationModule.completeVerifiedReview).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /preview 1: repair.jpg/i })).toBeInTheDocument();
  });
});
