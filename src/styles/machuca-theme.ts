// Machuca Wiki Theme Configuration
// Eco-centric, nature-inspired design for the Costa Rican community

export const machucaTheme = {
  colors: {
    // Primary eco-centric palette
    jungleGreen: '#2E7D32',
    earthBrown: '#6D4C41',
    skyBlue: '#81D4FA',
    offWhite: '#FAF9F6',
    neutralGray: '#9E9E9E',
    
    // Category-specific background tints
    shopping: '#FFF9C4',      // Pale yellow for shopping
    localKnowHow: '#DCEDC8',  // Light green for local know-how
    nature: '#B2EBF2',        // Aqua blue for nature
    
    // Sidebar colors
    sidebarBackground: '#F1F8E9',  // Light green background shading
    sidebarActive: '#A5D6A7',      // Active page highlight
    
    // Semantic colors
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#F44336',
    info: '#2196F3',
  },
  
  typography: {
    // Font families
    fonts: {
      header: ['Lora', 'Merriweather', 'serif'],
      body: ['Inter', 'Nunito', 'sans-serif'],
    },
    
    // Font sizes
    sizes: {
      h1: '28px',
      h2: '22px',
      body: '16px',
      sidebar: '14px',
      small: '12px',
    },
    
    // Font weights
    weights: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  
  spacing: {
    // Border radius
    borderRadius: {
      small: '6px',
      medium: '10px',
      large: '12px',
      full: '9999px',
    },
    
    // Shadows
    shadows: {
      card: '0 2px 6px rgba(0, 0, 0, 0.15)',
      hover: '0 4px 12px rgba(0, 0, 0, 0.2)',
      subtle: '0 1px 3px rgba(0, 0, 0, 0.1)',
    },
    
    // Layout dimensions
    layout: {
      headerBannerHeight: '70px',
      sidebarWidth: '256px',
      maxContentWidth: '1200px',
    },
  },
  
  animations: {
    // Hover effects
    hover: {
      lift: 'translateY(-2px)',
      scale: 'scale(1.02)',
    },
    
    // Transition durations
    durations: {
      fast: '150ms',
      normal: '200ms',
      slow: '300ms',
    },
    
    // Easing functions
    easing: {
      default: 'cubic-bezier(0.4, 0, 0.2, 1)',
      bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    },
  },
  
  // Category mappings for consistent theming
  categoryConfig: {
    'Shopping': {
      icon: '🛍️',
      color: '#FFF9C4',
      borderColor: '#F57F17',
    },
    'Local Know-How': {
      icon: '🌱',
      color: '#DCEDC8',
      borderColor: '#2E7D32',
    },
    'Nature': {
      icon: '🌊',
      color: '#B2EBF2',
      borderColor: '#0277BD',
    },
    'default': {
      icon: '📁',
      color: '#F5F5F5',
      borderColor: '#9E9E9E',
    },
  },
} as const;

// CSS custom properties for use in components
export const machucaCSSVariables = {
  '--machuca-jungle-green': machucaTheme.colors.jungleGreen,
  '--machuca-earth-brown': machucaTheme.colors.earthBrown,
  '--machuca-sky-blue': machucaTheme.colors.skyBlue,
  '--machuca-off-white': machucaTheme.colors.offWhite,
  '--machuca-neutral-gray': machucaTheme.colors.neutralGray,
  '--machuca-shopping-bg': machucaTheme.colors.shopping,
  '--machuca-local-know-how-bg': machucaTheme.colors.localKnowHow,
  '--machuca-nature-bg': machucaTheme.colors.nature,
  '--machuca-sidebar-bg': machucaTheme.colors.sidebarBackground,
  '--machuca-sidebar-active': machucaTheme.colors.sidebarActive,
  '--machuca-card-shadow': machucaTheme.spacing.shadows.card,
  '--machuca-hover-shadow': machucaTheme.spacing.shadows.hover,
  '--machuca-border-radius': machucaTheme.spacing.borderRadius.medium,
  '--machuca-header-height': machucaTheme.spacing.layout.headerBannerHeight,
} as const;

// Utility function to get category-specific styling
export const getCategoryStyle = (category: string) => {
  const normalizedCategory = category || 'default';
  return machucaTheme.categoryConfig[normalizedCategory as keyof typeof machucaTheme.categoryConfig] 
    || machucaTheme.categoryConfig.default;
};

// Utility function to apply theme to CSS-in-JS or styled components
export const applyMachucaTheme = (element: HTMLElement) => {
  Object.entries(machucaCSSVariables).forEach(([property, value]) => {
    element.style.setProperty(property, value);
  });
};
