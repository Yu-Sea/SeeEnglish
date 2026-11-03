import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/newsreader/wght-italic.css';
import './styles.css';
import './review.css';
import './library.css';
import './profile.css';
import './preferences.css';
import App from './App';
import { applyPreferences, loadPreferences } from './preferences';

applyPreferences(loadPreferences());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
