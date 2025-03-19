// Add React Testing Library's custom assertions
import '@testing-library/jest-dom';

// Add fetch polyfill for Node environment
import 'whatwg-fetch';

// Setup XMLHttpRequest for FormData support in Node
import { XMLHttpRequest } from 'xmlhttprequest';
global.XMLHttpRequest = XMLHttpRequest;

// Mock window.matchMedia - required for our use-mobile hook
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // Deprecated
    removeListener: jest.fn(), // Deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Suppress React 18 console errors/warnings when testing with Testing Library
// These relate to React's act() warnings and should be fixed in upcoming Testing Library versions
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      /Warning: ReactDOM.render is no longer supported in React 18./.test(args[0]) ||
      /Warning: An update to .* inside a test was not wrapped in act/.test(args[0])
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
