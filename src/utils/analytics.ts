import ReactGA from 'react-ga4';

// Initialize Google Analytics
export const initializeGA = (trackingId: string) => {
  if (!trackingId) {
    console.warn('Google Analytics Measurement ID is not provided');
    return;
  }

  ReactGA.initialize(trackingId);
  console.log('Google Analytics initialized with Measurement ID:', trackingId);
};

// Track page views
export const trackPageView = (path: string, title?: string) => {
  ReactGA.send({ 
    hitType: 'pageview', 
    page: path, 
    title: title 
  });
  console.log(`Page view tracked: ${path}${title ? ` (${title})` : ''}`);
};

// Track custom events
export const trackEvent = (category: string, action: string, label?: string, value?: number) => {
  ReactGA.event({
    category,
    action,
    label,
    value
  });
  console.log(`Event tracked: ${category} / ${action}${label ? ` / ${label}` : ''}${value ? ` / ${value}` : ''}`);
};

// Track wiki page views with additional dimensions
export const trackWikiPageView = (pageId: string, pageTitle: string, category?: string) => {
  trackPageView(`/wiki/${pageId}`, pageTitle);
  
  // Also track as an event with additional data
  trackEvent('Wiki', 'View Page', pageTitle, undefined);
  
  // Track the category as a custom dimension if available
  if (category) {
    ReactGA.gtag('event', 'wiki_page_view', {
      page_id: pageId,
      page_title: pageTitle,
      page_category: category
    });
  }
};

// Track contact views
export const trackContactView = (contactId: string, contactName: string, category?: string) => {
  trackPageView(`/directory/${contactId}`, contactName);
  
  // Also track as an event with additional data
  trackEvent('Directory', 'View Contact', contactName, undefined);
  
  // Track the category as a custom dimension if available
  if (category) {
    ReactGA.gtag('event', 'contact_view', {
      contact_id: contactId,
      contact_name: contactName,
      contact_category: category
    });
  }
};
