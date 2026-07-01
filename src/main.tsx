import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/globals.css';
import { ThemeProvider } from './theme';
import { AudioPlayerProvider } from './audio/AudioPlayerContext';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <AudioPlayerProvider>
      <App />
    </AudioPlayerProvider>
  </ThemeProvider>
);
