import { z } from 'zod';

// All timestamps are ISO-8601 with an explicit offset (docs/03 intro). A timestamp without offset is invalid.
export const IsoTsSchema = z.iso.datetime({ offset: true });
export const IsoDateSchema = z.iso.date();
export const HHmmSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'HH:mm');

export const LangSchema = z.object({ en: z.string(), bn: z.string() });

export const VersionSchema = z.literal(1);

export const CountSchema = z.number().int().nonnegative();
export const PctSchema = z.number().min(0).max(100);
export const ConfSchema = z.number().min(0).max(1);
export const NonNegSchema = z.number().nonnegative();
