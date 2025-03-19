import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Import debug utilities
import { enableFetchDebugging } from './utils/debug-fetch';

// Enable fetch debugging in development mode
if (import.meta.env.DEV) {
  // Wait for DOM to be ready
  window.addEventListener('DOMContentLoaded', () => {
    console.log('🔍 Initializing debug tools...');
    enableFetchDebugging();
    console.log('✅ Debug tools initialized');
  });
}

createRoot(document.getElementById("root")!).render(<App />);
