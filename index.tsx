import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx'; // Import ErrorBoundary
import { GlobalWorkerOptions } from 'pdfjs-dist';

// Setup PDF.js worker. This is crucial for pdfjs-dist to work.
if (typeof window !== 'undefined') {
  // Pinning the version to match the importmap exactly to avoid version mismatch errors.
  // The API version (from the import) and the Worker version MUST be the same.
  // Using .mjs for the ES module worker.
  GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.3.93/build/pdf.worker.mjs`;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary fallbackMessage="خطایی در بارگذاری اولیه برنامه رخ داده است.">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);