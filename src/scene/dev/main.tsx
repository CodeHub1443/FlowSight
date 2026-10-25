import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/noto-sans-bengali/bengali-400.css';
import '@fontsource/noto-sans-bengali/bengali-700.css';
import '@/i18n';
import '@/index.css';
import { ScenePreview } from './ScenePreview';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ScenePreview />
    </StrictMode>,
  );
}
