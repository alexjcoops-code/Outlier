import '@fontsource/andika/400.css';
import '@fontsource/andika/700.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/game.css';
import './styles/results.css';
import './styles/versus.css';
import './styles/desk.css';
import './styles/archive.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
