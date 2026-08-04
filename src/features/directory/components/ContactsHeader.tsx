import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Heart, MessageCircle, Newspaper, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MACHU_WHATSAPP_URL } from '@/lib/machu';
import { trackEvent } from '@/utils/analytics';

interface ContactsHeaderProps {
  title: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onAddClick: () => void;
}

export function ContactsHeader({
  title,
  searchQuery,
  setSearchQuery,
  onAddClick,
}: ContactsHeaderProps) {
  const trackMachuClick = (placement: string) => {
    trackEvent('Machu', 'Open WhatsApp', placement);
  };

  return (
    <header className="mb-7">
      <nav className="directory-nav" aria-label="Main navigation">
        <Link to="/" className="directory-wordmark" aria-label="San Mateo Love home">
          <img
            src="/SanMateo_love_logo2_sm.jpg"
            alt=""
            className="h-11 w-11 rounded-xl object-cover shadow-sm"
          />
          <span>
            <span className="block font-header text-lg font-semibold leading-tight text-[var(--directory-ink)]">
              {title}
            </span>
            <span className="hidden text-xs text-[var(--directory-muted)] sm:block">Community directory</span>
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link to="/wiki" className="directory-nav-link">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Wiki</span>
          </Link>
          <Link to="/elements" className="directory-nav-link">
            <Newspaper className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Elements</span>
          </Link>
          <a
            href={MACHU_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="machu-nav-btn hidden md:inline-flex"
            onClick={() => trackMachuClick('Navigation')}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Ask Machu
          </a>
          <Button type="button" onClick={onAddClick} className="add-entry-btn ml-1">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Recommend someone</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </nav>

      <section className="directory-hero" aria-labelledby="directory-heading">
        <div className="directory-hero-content">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--directory-green)] shadow-sm">
              <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              Made by neighbors, for neighbors
            </div>
            <h1 id="directory-heading" className="directory-hero-title">
              Find someone your neighbors trust.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--directory-muted)] sm:text-base">
              Discover local services, see community feedback, and start a conversation on WhatsApp.
            </p>

            <label htmlFor="directory-search" className="sr-only">Search local services</label>
            <div className="directory-search-shell">
              <Search className="h-5 w-5 shrink-0 text-[var(--directory-green)]" aria-hidden="true" />
              <input
                id="directory-search"
                type="search"
                placeholder="Search for plumber, plomero, taxi…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent py-3 text-base text-[var(--directory-ink)] outline-none placeholder:text-stone-400"
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="rounded-full px-3 py-2 text-xs font-semibold text-[var(--directory-muted)] hover:bg-stone-100 hover:text-[var(--directory-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--directory-green)]"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--directory-muted)]">
              Search in English or Spanish — small typos are okay.
            </p>
          </div>

          <aside className="machu-promo-card" aria-labelledby="machu-promo-heading">
            <img
              src="/machu-eco-bot.webp"
              alt="Machu, the San Mateo Love eco bot"
              className="machu-promo-image"
              width="640"
              height="640"
            />
            <div className="min-w-0">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--directory-leaf)]">
                Meet the eco bot
              </p>
              <h2 id="machu-promo-heading" className="mt-1 font-header text-2xl font-semibold text-[var(--directory-ink)]">
                Ask Machu
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--directory-muted)]">
                Find a trusted local—or send her a contact to help the directory grow.
              </p>
              <a
                href={MACHU_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="machu-whatsapp-btn"
                onClick={() => trackMachuClick('Directory hero')}
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Ask on WhatsApp
              </a>
            </div>
          </aside>
        </div>
      </section>
    </header>
  );
}
