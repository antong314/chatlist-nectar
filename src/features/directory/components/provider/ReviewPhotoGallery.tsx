import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

interface ReviewPhotoGalleryProps {
  imageUrls: string[];
  reviewerLabel: string;
}

export function ReviewPhotoGallery({ imageUrls, reviewerLabel }: ReviewPhotoGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const originatingThumbnailRef = useRef<HTMLButtonElement | null>(null);
  const activeImageUrl = imageUrls[activeIndex] ?? imageUrls[0];
  const hasMultiplePhotos = imageUrls.length > 1;

  const openPhoto = (index: number, thumbnail: HTMLButtonElement) => {
    originatingThumbnailRef.current = thumbnail;
    setActiveIndex(index);
    setIsOpen(true);
  };

  const showPreviousPhoto = () => {
    setActiveIndex((currentIndex) => (currentIndex - 1 + imageUrls.length) % imageUrls.length);
  };

  const showNextPhoto = () => {
    setActiveIndex((currentIndex) => (currentIndex + 1) % imageUrls.length);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasMultiplePhotos) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showPreviousPhoto();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      showNextPhoto();
    }
  };

  if (!activeImageUrl) return null;

  const previousIndex = (activeIndex - 1 + imageUrls.length) % imageUrls.length;
  const nextIndex = (activeIndex + 1) % imageUrls.length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <ul aria-label={`Photos from ${reviewerLabel}'s review`} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {imageUrls.map((imageUrl, index) => (
          <li className="aspect-square overflow-hidden rounded-lg bg-gray-100" key={`${imageUrl}-${index}`}>
            <button
              aria-haspopup="dialog"
              aria-label={`View ${reviewerLabel}'s review photo ${index + 1} of ${imageUrls.length}`}
              className="block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              onClick={(event) => openPhoto(index, event.currentTarget)}
              type="button"
            >
              <img
                alt={`${reviewerLabel}'s review photo ${index + 1}`}
                className="h-full w-full object-cover transition duration-200 hover:scale-105"
                loading="lazy"
                src={imageUrl}
              />
            </button>
          </li>
        ))}
      </ul>

      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-5xl gap-3 border-0 bg-stone-950 p-3 text-white shadow-2xl sm:rounded-xl sm:p-4 [&>button]:right-3 [&>button]:top-3 [&>button]:z-20 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:bg-black/70 [&>button]:p-0 [&>button]:text-white [&>button]:opacity-100"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          originatingThumbnailRef.current?.focus();
        }}
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Review photos from {reviewerLabel}</DialogTitle>
        <DialogDescription className="sr-only">
          {hasMultiplePhotos
            ? 'Use the previous and next buttons or the Left and Right Arrow keys to browse photos.'
            : 'Full-size review photo.'}
        </DialogDescription>

        <div className="relative flex min-h-[12rem] items-center justify-center overflow-hidden rounded-lg bg-black">
          <img
            alt={`${reviewerLabel}'s review photo ${activeIndex + 1} of ${imageUrls.length}`}
            className="max-h-[calc(100vh-8rem)] w-full object-contain"
            src={activeImageUrl}
          />

          {hasMultiplePhotos && (
            <>
              <button
                aria-label={`Show previous photo (${previousIndex + 1} of ${imageUrls.length})`}
                className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white shadow transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={showPreviousPhoto}
                type="button"
              >
                <ChevronLeft aria-hidden="true" className="h-6 w-6" />
              </button>
              <button
                aria-label={`Show next photo (${nextIndex + 1} of ${imageUrls.length})`}
                className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white shadow transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={showNextPhoto}
                type="button"
              >
                <ChevronRight aria-hidden="true" className="h-6 w-6" />
              </button>
            </>
          )}
        </div>

        <p aria-live="polite" className="text-center text-sm font-medium text-white" role="status">
          Photo {activeIndex + 1} of {imageUrls.length}
        </p>
      </DialogContent>
    </Dialog>
  );
}
