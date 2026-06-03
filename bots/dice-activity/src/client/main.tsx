// MUST be the first executable line: patchUrlMappings monkey-patches global
// fetch, WebSocket, and XMLHttpRequest. Anything imported above this that does
// network I/O will capture the un-patched constructors and bypass Discord's
// proxy — which then trips CSP. See docs/discord/dicetable/README.md
// ("Platform constraints").
import { patchUrlMappings } from '@discord/embedded-app-sdk';

patchUrlMappings([
  // All /api/* calls go to our backend via Discord's URL-mapping proxy.
  // These prefixes must match the mappings configured in the Discord Developer
  // Portal exactly.
  { prefix: '/api', target: '/api' },
]);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
