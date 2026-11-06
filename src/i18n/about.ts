import bn from './locales/bn/about.json';
import en from './locales/en/about.json';
import { registerNamespace } from './lazy';

// Imported by AboutDialog only (its own chunk): keeps the About strings out of the /live entry.
registerNamespace('about', en, bn);
