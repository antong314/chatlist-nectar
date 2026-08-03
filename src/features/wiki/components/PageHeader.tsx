import React from 'react';
import { CalendarDays, Edit3, History, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getCategoryIcon } from '@/features/wiki/utils/categoryIcons';

interface PageHeaderProps {
  title: string;
  lastEdited?: string;
  updatedAt?: string;
  category?: string;
  categories?: string[];
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSave?: () => void;
  onTitleChange?: (newTitle: string) => void;
  onCategoryChange?: (category: string) => void;
  onViewHistory?: () => void;
}

const formatDate = (dateString?: string) => {
  if (!dateString) return 'Not available';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  lastEdited,
  updatedAt,
  category,
  categories = ['Uncategorized'],
  isEditing,
  onEdit,
  onDelete,
  onSave,
  onTitleChange,
  onCategoryChange,
  onViewHistory,
}) => {
  const displayDate = updatedAt ? formatDate(updatedAt) : (lastEdited || 'Not available');
  const CategoryIcon = getCategoryIcon(category || 'Uncategorized');

  return (
    <header className="mb-5 rounded-2xl border border-stone-200/80 bg-[var(--directory-paper)] p-5 shadow-[0_2px_12px_rgba(46,57,44,0.06)] sm:p-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--directory-cream)] px-2.5 py-1 text-xs font-semibold text-[var(--directory-green)]">
            <CategoryIcon className="h-3.5 w-3.5" />
            {isEditing && onCategoryChange ? (
              <span className="flex items-center gap-2">
                <Label htmlFor="page-category" className="sr-only">Category</Label>
                <select
                  id="page-category"
                  className="bg-transparent text-xs font-semibold outline-none"
                  value={category || 'Uncategorized'}
                  onChange={(event) => onCategoryChange(event.target.value)}
                >
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </span>
            ) : (
              <span>{category || 'Uncategorized'}</span>
            )}
          </div>

          {isEditing && onTitleChange ? (
            <input
              type="text"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              className="w-full border-b border-stone-300 bg-transparent pb-2 font-header text-3xl font-semibold leading-tight tracking-[-0.02em] text-[var(--directory-ink)] outline-none focus:border-[var(--directory-green)] sm:text-4xl"
              aria-label="Page title"
            />
          ) : (
            <h1 className="font-header text-3xl font-semibold leading-tight tracking-[-0.02em] text-[var(--directory-ink)] sm:text-4xl">
              {title}
            </h1>
          )}

          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--directory-muted)]">
            <CalendarDays className="h-4 w-4 text-[var(--directory-leaf)]" />
            <span>Updated {displayDate}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEditing && onSave ? (
            <Button
              size="sm"
              className="rounded-xl bg-[var(--directory-green)] hover:bg-[var(--directory-green-hover)]"
              onClick={onSave}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save page
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" className="rounded-xl border-stone-200 bg-white hover:bg-[var(--directory-cream)]" onClick={onEdit}>
                <Edit3 className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
              {onViewHistory && (
                <Button variant="outline" size="sm" className="rounded-xl border-stone-200 bg-white hover:bg-[var(--directory-cream)]" onClick={onViewHistory}>
                  <History className="mr-1.5 h-4 w-4" />
                  History
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl text-stone-500 hover:bg-red-50 hover:text-red-700"
                onClick={onDelete}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default PageHeader;
