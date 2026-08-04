import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CategoryFilter } from '@/features/directory/components/CategoryFilter';
import type { Category } from '@/types/contact';

const categories: Category[] = [
  'All',
  'Service',
  'Construction',
  'Mechanic',
  'Taxi',
  'Tow Truck',
  'Groceries',
  'Healer',
  'Creative',
  'Retreats',
];

describe('responsive category filter', () => {
  test('keeps one touch-scroll row on mobile and wraps every pill on wider screens', () => {
    const onCategoryChange = jest.fn();
    render(
      <CategoryFilter
        categories={categories}
        onCategoryChange={onCategoryChange}
        selectedCategory="All"
      />,
    );

    const navigation = screen.getByRole('navigation', { name: /filter by service category/i });
    const categoryTrack = navigation.firstElementChild as HTMLElement;

    expect(navigation).toHaveClass('overflow-x-auto', 'sm:overflow-visible', 'touch-pan-x');
    expect(categoryTrack).toHaveClass('w-max', 'flex-nowrap', 'sm:w-full', 'sm:flex-wrap');
    expect(screen.getAllByRole('button')).toHaveLength(categories.length);
    expect(screen.getByRole('button', { name: 'All services' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Mechanics' }));
    expect(onCategoryChange).toHaveBeenCalledWith('Mechanic');
  });

  test('makes the mobile scroll affordance clickable while categories remain offscreen', () => {
    const onCategoryChange = jest.fn();
    render(
      <CategoryFilter
        categories={categories}
        onCategoryChange={onCategoryChange}
        selectedCategory="All"
      />,
    );

    const navigation = screen.getByRole('navigation', { name: /filter by service category/i });
    Object.defineProperty(navigation, 'scrollWidth', { configurable: true, value: 900 });
    Object.defineProperty(navigation, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(navigation, 'scrollLeft', { configurable: true, value: 0, writable: true });
    const scrollBy = jest.fn(({ left }: ScrollToOptions) => {
      navigation.scrollLeft += Number(left ?? 0);
    });
    Object.defineProperty(navigation, 'scrollBy', { configurable: true, value: scrollBy });

    fireEvent(window, new Event('resize'));
    expect(screen.getByRole('status')).toHaveTextContent('Swipe or use the arrow to see more categories.');

    fireEvent.click(screen.getByRole('button', { name: 'Show more categories' }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' });
    expect(onCategoryChange).not.toHaveBeenCalled();

    navigation.scrollLeft = 580;
    fireEvent.scroll(navigation);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
