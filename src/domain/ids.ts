import { z } from 'zod';

// Identifier formats, docs/03 §1.

export const SiteIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'site slug');
// Contract says B01–B07; the format (not the range) is validated so other sites can have more bays.
export const BayIdSchema = z.string().regex(/^B\d{2}$/, 'bay id');
export const CameraIdSchema = z.string().regex(/^B\d{2}-(?:DOCK|CREW|BELT)$/, 'camera id');
export const VisitIdSchema = z.string().regex(/^V-\d{8}-B\d{2}-\d{4}$/, 'visit id');
export const TrackIdSchema = z.string().regex(/^[tf]-\d+$/, 'track id');
export const EmployeeIdSchema = z.string().regex(/^EMP-\d+$/, 'employee id');
export const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'ULID');
// SKU master code or `UNKNOWN`; the master itself is config, so only non-empty is enforced.
export const SkuCodeSchema = z.string().min(1);
