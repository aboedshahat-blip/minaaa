// Mobile polyfill for pdfjs compatibility
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeLargeLocalDataStore } from './lib/storage'

const renderApp = () => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// Hydrate IndexedDB and migrate any old localStorage data before App reads it.
void initializeLargeLocalDataStore().catch((error) => {
  console.error('تعذر تجهيز التخزين المحلي الموسع:', error)
}).finally(renderApp)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.storage?.persist?.().catch(() => false);
    void navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('تعذر تجهيز التطبيق للعمل دون اتصال:', error);
    });
  });
}
