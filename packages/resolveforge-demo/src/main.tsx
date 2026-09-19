import { instrument } from 'react-scan/lite';

if (import.meta.env.DEV) {
  instrument({
    onEvent: event => {
      if (event.kind === 'commit') {
        const summary = window.__RESOLVEFORGE_RENDERS__ ?? { components: {}, total: 0 };
        window.__RESOLVEFORGE_RENDERS__ = { ...summary, total: summary.total + event.tree.length };
      }
    },
  });
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { InvoiceApp } from './InvoiceApp.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing root element.');
}

createRoot(root).render(
  <StrictMode>
    <InvoiceApp />
  </StrictMode>,
);
