// Environment configuration

// API URL - fetched from environment variables or defaults to the production URL
export const API_URL = import.meta.env.VITE_API_URL || 'https://machu-server-app-2tn7n.ondigitalocean.app';

// Other environment configurations can be added here
export const IS_PRODUCTION = import.meta.env.MODE === 'production';
export const IS_DEVELOPMENT = import.meta.env.MODE === 'development';
