import bn from './locales/bn/reports.json';
import en from './locales/en/reports.json';
import { registerNamespace } from './lazy';

// Import this from the reports chunk only (ReportsPage): it is what keeps the strings out of the /live entry.
registerNamespace('reports', en, bn);
