import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderReviews } from '@/features/directory/components/provider/ProviderReviews';

const imageUrls = [
  'https://example.com/repair-before.jpg',
  'www.example.com/repair-after.webp',
  'javascript:alert(1)',
];

const renderReviews = () => render(
  <ProviderReviews
    averageRating={5}
    reviews={[
      {
        id: 'review-1',
        rating: 5,
        reviewerName: 'Ana',
        createdAt: '2026-08-01T12:00:00.000Z',
        imageUrls,
      },
    ]}
  />,
);

describe('review photo lightbox', () => {
  test('opens photos in an in-page dialog without rendering external thumbnail links', async () => {
    const user = userEvent.setup();
    const { container } = renderReviews();
    const firstThumbnail = screen.getByRole('button', { name: "View Ana's review photo 1 of 2" });

    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /view ana's review photo/i })).toHaveLength(2);
    expect(screen.getByRole('img', { name: "Ana's review photo 1" })).toHaveAttribute('loading', 'lazy');

    await user.click(firstThumbnail);

    expect(screen.getByRole('dialog', { name: /review photos from ana/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: "Ana's review photo 1 of 2" })).toHaveAttribute(
      'src',
      'https://example.com/repair-before.jpg',
    );
  });

  test('closes with Escape and the close button and restores the originating thumbnail focus', async () => {
    const user = userEvent.setup();
    renderReviews();
    const secondThumbnail = screen.getByRole('button', { name: "View Ana's review photo 2 of 2" });

    await user.click(secondThumbnail);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(secondThumbnail).toHaveFocus();

    await user.click(secondThumbnail);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(secondThumbnail).toHaveFocus();
  });

  test('dismisses when the backdrop is pressed and restores thumbnail focus', async () => {
    const user = userEvent.setup();
    renderReviews();
    const firstThumbnail = screen.getByRole('button', { name: "View Ana's review photo 1 of 2" });

    await user.click(firstThumbnail);
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.previousElementSibling as HTMLElement;
    fireEvent.pointerDown(backdrop, { button: 0, ctrlKey: false });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(firstThumbnail).toHaveFocus();
  });

  test('navigates multiple photos with wraparound controls and arrow keys', async () => {
    const user = userEvent.setup();
    renderReviews();

    await user.click(screen.getByRole('button', { name: "View Ana's review photo 1 of 2" }));
    expect(screen.getByRole('status')).toHaveTextContent('Photo 1 of 2');

    await user.click(screen.getByRole('button', { name: /show previous photo \(2 of 2\)/i }));
    expect(screen.getByRole('status')).toHaveTextContent('Photo 2 of 2');
    expect(screen.getByRole('img', { name: "Ana's review photo 2 of 2" })).toHaveAttribute(
      'src',
      'https://www.example.com/repair-after.webp',
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(screen.getByRole('status')).toHaveTextContent('Photo 1 of 2');
  });
});
