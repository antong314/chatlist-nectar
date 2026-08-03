import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronUp, Menu, Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WikiSearch from './WikiSearch';

interface WikiHeaderProps {
  title: string;
  isEditing?: boolean;
  onMenuToggle: () => void;
}

const WikiHeader: React.FC<WikiHeaderProps> = ({ title, onMenuToggle }) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[#f8f5ed]/90 py-3 backdrop-blur-md sm:py-4">
      <div className="directory-container">
        <nav className="directory-nav" aria-label={`${title} navigation`}>
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full text-stone-500 hover:bg-[var(--directory-cream)] hover:text-[var(--directory-green)]"
              onClick={onMenuToggle}
              aria-label="Toggle wiki pages"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <Link to="/wiki" className="directory-wordmark" aria-label="San Mateo Love Wiki home">
              <img
                src="/SanMateo_love_logo2_sm.jpg"
                alt=""
                className="h-10 w-10 rounded-xl object-cover shadow-sm sm:h-11 sm:w-11"
              />
              <span className="min-w-0">
                <span className="block truncate font-header text-base font-semibold leading-tight text-[var(--directory-ink)] sm:text-lg">
                  San Mateo Love
                </span>
                <span className="hidden text-xs text-[var(--directory-muted)] sm:block">Community wiki</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden lg:block">
              <WikiSearch variant="inline" />
            </div>
            <Link to="/" className="directory-nav-link">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Directory</span>
            </Link>
            <Link to="/elements" className="directory-nav-link hidden md:inline-flex">
              <Newspaper className="h-4 w-4" aria-hidden="true" />
              <span>Elements</span>
            </Link>
            <div className="lg:hidden">
              <WikiSearch variant="icon" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-stone-500 hover:bg-[var(--directory-cream)] hover:text-[var(--directory-green)] md:hidden"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label="Toggle navigation"
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </nav>

        {mobileNavOpen && (
          <div className="mt-2 rounded-2xl border border-white/70 bg-white/95 p-2 shadow-sm md:hidden">
            <Link
              to="/elements"
              className="directory-nav-link w-full justify-start"
              onClick={() => setMobileNavOpen(false)}
            >
              <Newspaper className="h-4 w-4" />
              <span>Elements</span>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default WikiHeader;
