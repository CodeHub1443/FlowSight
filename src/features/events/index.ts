// Keep this barrel to the page only. Shell code (bell, toasts, tray links) must import from '@/features/events/urlState'
// and '@/features/events/EvidenceImage' directly so the events chunk stays out of the /live entry.
export { EventsPage } from './EventsPage';
