import bn from './locales/bn/events.json';
import en from './locales/en/events.json';
import { registerNamespace } from './lazy';

// Import this from the events chunk only (EventsPage, EvidenceImage): it is what keeps the strings out of the /live entry.
registerNamespace('events', en, bn);
