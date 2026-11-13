import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/game.css';
import './styles/results.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
