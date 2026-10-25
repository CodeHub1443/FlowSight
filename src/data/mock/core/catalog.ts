import type { Lang } from '@/domain';
import { toBanglaDigits } from '@/lib/format';
import type { Rng } from './rng';

// Mock master data: SKUs, transport agencies, employees, plates, event titles. All names are mock.
// These strings are simulated backend data (every one is bilingual), not UI text.

export type PackType = 'CASE' | 'SACK' | 'SHRINK';

export type SkuMaster = {
  sku: string;
  modelClass: string;
  name: Lang;
  pack: PackType;
  unitsPerPack: number;
  color: string;
  /** Relative frequency in a mixed truck. */
  weight: number;
};

const sku = (
  code: string,
  en: string,
  bn: string,
  pack: PackType,
  unitsPerPack: number,
  color: string,
  weight: number,
): SkuMaster => ({
  sku: code,
  modelClass: `cls_${code.toLowerCase().replace(/-/g, '_')}`,
  name: { en, bn },
  pack,
  unitsPerPack,
  color,
  weight,
});

export const SKU_MASTER: readonly SkuMaster[] = [
  sku('RIN-PB-1KG', 'Rin Power Bright 1kg', 'রিন পাওয়ার ব্রাইট ১ কেজি', 'SACK', 20, '#2B6CB0', 14),
  sku('RIN-500G', 'Rin 500g', 'রিন ৫০০ গ্রাম', 'CASE', 24, '#3182CE', 8),
  sku('WHL-1KG', 'Wheel 1kg', 'হুইল ১ কেজি', 'SACK', 20, '#DD6B20', 12),
  sku('SRF-EXL-500G', 'Surf Excel 500g', 'সার্ফ এক্সেল ৫০০ গ্রাম', 'CASE', 24, '#C53030', 7),
  sku('LUX-100G', 'Lux Soap 100g', 'লাক্স সাবান ১০০ গ্রাম', 'SHRINK', 48, '#B83280', 9),
  sku('LFB-100G', 'Lifebuoy Soap 100g', 'লাইফবয় সাবান ১০০ গ্রাম', 'SHRINK', 48, '#E53E3E', 9),
  sku('SNS-180ML', 'Sunsilk 180ml', 'সানসিল্ক ১৮০ মি.লি.', 'CASE', 24, '#D69E2E', 6),
  sku('VIM-BAR', 'Vim Bar', 'ভিম বার', 'CASE', 36, '#38A169', 6),
  sku('PEP-200G', 'Pepsodent 200g', 'পেপসোডেন্ট ২০০ গ্রাম', 'CASE', 36, '#2C7A7B', 5),
  sku('CLU-145G', 'Closeup 145g', 'ক্লোজআপ ১৪৫ গ্রাম', 'CASE', 36, '#9B2C2C', 5),
  sku('GNL-50G', 'Glow & Lovely 50g', 'গ্লো অ্যান্ড লাভলি ৫০ গ্রাম', 'CASE', 48, '#D53F8C', 4),
  sku('PND-100G', "Pond's 100g", 'পন্ডস ১০০ গ্রাম', 'CASE', 48, '#805AD5', 4),
  sku('VAS-100ML', 'Vaseline 100ml', 'ভ্যাসলিন ১০০ মি.লি.', 'CASE', 48, '#4299E1', 4),
  sku('DOV-175ML', 'Dove 175ml', 'ডাভ ১৭৫ মি.লি.', 'CASE', 24, '#A0AEC0', 3),
];

export const UNKNOWN_SKU = 'UNKNOWN';

const skuByCode = new Map(SKU_MASTER.map((s) => [s.sku, s]));
export const skuInfo = (code: string): SkuMaster | undefined => skuByCode.get(code);
export const skuName = (code: string): Lang | null => skuByCode.get(code)?.name ?? null;

export const AGENCIES: readonly Lang[] = [
  { en: 'CITY EXPRESS TRANSPORT', bn: 'সিটি এক্সপ্রেস ট্রান্সপোর্ট' },
  { en: 'PADMA LOGISTICS', bn: 'পদ্মা লজিস্টিকস' },
  { en: 'MEGHNA CARRYING CO.', bn: 'মেঘনা ক্যারিং কোং' },
  { en: 'JAMUNA TRANSPORT', bn: 'যমুনা ট্রান্সপোর্ট' },
  { en: 'BANGLA FREIGHT', bn: 'বাংলা ফ্রেইট' },
  { en: 'SHAPLA MOVERS', bn: 'শাপলা মুভার্স' },
  { en: 'RUPSHA CARGO', bn: 'রূপসা কার্গো' },
  { en: 'KARNAPHULI HAULAGE', bn: 'কর্ণফুলী হলেজ' },
];

// ---- plates ---------------------------------------------------------------------------------------------------

const SERIES: readonly { bn: string; en: string }[] = [
  { bn: 'ট', en: 'TA' },
  { bn: 'ড', en: 'DA' },
  { bn: 'ন', en: 'NA' },
  { bn: 'শ', en: 'SHA' },
];

export type Plate = { bn: string; en: string };

/** "ঢাকা মেট্রো-ড ১১-২১৭১" / "DHAKA METRO-DA 11-2171". */
export function makePlate(rng: Rng): Plate {
  const series = rng.pick(SERIES);
  const cls = rng.int(11, 40);
  const num = String(rng.int(1000, 9999));
  return {
    bn: `ঢাকা মেট্রো-${series.bn} ${toBanglaDigits(String(cls))}-${toBanglaDigits(num)}`,
    en: `DHAKA METRO-${series.en} ${cls}-${num}`,
  };
}

// ---- people ---------------------------------------------------------------------------------------------------

export type EmployeeRole = 'CAPTAIN' | 'WORKER' | 'FORKLIFT_OP';
export type EmployeeRec = { employeeId: string; name: Lang; role: EmployeeRole; active: boolean };

const FIRST: readonly Lang[] = [
  { en: 'Rahim', bn: 'রহিম' },
  { en: 'Karim', bn: 'করিম' },
  { en: 'Jahid', bn: 'জাহিদ' },
  { en: 'Sabbir', bn: 'সাব্বির' },
  { en: 'Monir', bn: 'মনির' },
  { en: 'Kamal', bn: 'কামাল' },
  { en: 'Faruk', bn: 'ফারুক' },
  { en: 'Nasir', bn: 'নাসির' },
  { en: 'Shahin', bn: 'শাহিন' },
  { en: 'Rubel', bn: 'রুবেল' },
];
const LAST: readonly Lang[] = [
  { en: 'Uddin', bn: 'উদ্দিন' },
  { en: 'Hossain', bn: 'হোসেন' },
  { en: 'Ahmed', bn: 'আহমেদ' },
  { en: 'Mia', bn: 'মিয়া' },
];

function personName(i: number, honorific: boolean): Lang {
  const f = FIRST[i % FIRST.length];
  const l = LAST[Math.floor(i / FIRST.length) % LAST.length];
  if (!f || !l) throw new Error('name tables are empty');
  return honorific
    ? { en: `Md. ${f.en} ${l.en}`, bn: `মোঃ ${f.bn} ${l.bn}` }
    : { en: `${f.en} ${l.en}`, bn: `${f.bn} ${l.bn}` };
}

export const CAPTAIN_COUNT = 12;
export const EMPLOYEES: readonly EmployeeRec[] = [
  ...Array.from({ length: CAPTAIN_COUNT }, (_, i) => ({
    employeeId: `EMP-${1040 + i}`,
    name: personName(i, true),
    role: 'CAPTAIN' as const,
    active: true,
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    employeeId: `EMP-${2001 + i}`,
    name: personName(i + 12, false),
    role: 'FORKLIFT_OP' as const,
    active: true,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    employeeId: `EMP-${3001 + i}`,
    name: personName(i + 20, false),
    role: 'WORKER' as const,
    active: i !== 19,
  })),
];

export const CAPTAINS: readonly EmployeeRec[] = EMPLOYEES.filter((e) => e.role === 'CAPTAIN');

export function employeeName(employeeId: string): Lang | null {
  return EMPLOYEES.find((e) => e.employeeId === employeeId)?.name ?? null;
}

// ---- events ---------------------------------------------------------------------------------------------------

export const EVENT_TITLES: Readonly<Record<string, Lang>> = {
  'truck.arrived': { en: 'Truck arrived', bn: 'ট্রাক পৌঁছেছে' },
  'truck.docked': { en: 'Truck docked', bn: 'ট্রাক ডকে লেগেছে' },
  'truck.started': { en: 'Loading started', bn: 'লোডিং শুরু' },
  'truck.finished': { en: 'Loading finished', bn: 'লোডিং শেষ' },
  'truck.departed': { en: 'Truck departed', bn: 'ট্রাক প্রস্থান করেছে' },
  'truck.detention': { en: 'Truck detention', bn: 'ট্রাক আটকে আছে' },
  'truck.unknown_plate': { en: 'Unreadable licence plate', bn: 'নম্বর প্লেট শনাক্ত করা যায়নি' },
  'belt.state_changed': { en: 'Belt state changed', bn: 'বেল্টের অবস্থা পরিবর্তিত' },
  'belt.empty_run': { en: 'Belt running empty', bn: 'বেল্ট খালি চলছে' },
  'belt.fall_off': { en: 'Item fell off the belt', bn: 'বেল্ট থেকে পণ্য পড়ে গেছে' },
  'hygiene.damaged': { en: 'Damaged case on belt', bn: 'বেল্টে ক্ষতিগ্রস্ত কার্টন' },
  'hygiene.open_tape': { en: 'Open tape on case', bn: 'কার্টনের টেপ খোলা' },
  'hygiene.torn_sack': { en: 'Torn sack on belt', bn: 'বেল্টে ছেঁড়া বস্তা' },
  'hygiene.wet_stained': { en: 'Wet or stained pack', bn: 'ভেজা বা দাগযুক্ত প্যাক' },
  'hygiene.spillage': { en: 'Spillage on floor', bn: 'মেঝেতে পণ্য ছড়িয়ে আছে' },
  'hygiene.debris': { en: 'Debris on floor', bn: 'মেঝেতে আবর্জনা' },
  'handling.rough_handling': { en: 'Rough handling', bn: 'অসতর্ক হ্যান্ডলিং' },
  'ppe.violation': { en: 'PPE violation', bn: 'পিপিই লঙ্ঘন' },
  'compliance.on_belt': { en: 'Person on the belt', bn: 'বেল্টের উপর মানুষ' },
  'compliance.crowding': { en: 'Crowding at belt mouth', bn: 'বেল্টের মুখে ভিড়' },
  'compliance.forklift_proximity': { en: 'Person in forklift path', bn: 'ফর্কলিফটের পথে মানুষ' },
  'roster.captain_detected': { en: 'Captain detected', bn: 'ক্যাপ্টেন শনাক্ত হয়েছে' },
  'roster.captain_absent': { en: 'Captain absent', bn: 'ক্যাপ্টেন অনুপস্থিত' },
  'staging.pallet_wait': { en: 'Pallet waiting for forklift', bn: 'ফর্কলিফটের অপেক্ষায় প্যালেট' },
  'security.after_hours_presence': { en: 'After-hours presence', bn: 'কর্মঘণ্টার বাইরে উপস্থিতি' },
  'security.door_open_idle': { en: 'Door open, no activity', bn: 'দরজা খোলা, কোনো কার্যক্রম নেই' },
  'security.truck_entry_no_loading': {
    en: 'Entered truck without loading',
    bn: 'লোডিং ছাড়াই ট্রাকে প্রবেশ',
  },
  'system.camera_offline': { en: 'Camera offline', bn: 'ক্যামেরা অফলাইন' },
  'system.camera_obstructed': { en: 'Camera obstructed', bn: 'ক্যামেরা ঢাকা পড়েছে' },
  'system.camera_defocus': { en: 'Camera out of focus', bn: 'ক্যামেরা ফোকাসের বাইরে' },
  'system.camera_moved': { en: 'Camera moved', bn: 'ক্যামেরা সরে গেছে' },
  'system.camera_ok': { en: 'Camera back online', bn: 'ক্যামেরা আবার সচল' },
  'system.pipeline_lag': { en: 'Pipeline lag', bn: 'পাইপলাইন বিলম্ব' },
};

/** Informational lifecycle events: never alerts. They are auto-closed by the system at creation. */
export const TIMELINE_EVENTS: ReadonlySet<string> = new Set([
  'truck.arrived',
  'truck.docked',
  'truck.started',
  'truck.finished',
  'truck.departed',
  'belt.state_changed',
  'roster.captain_detected',
  'system.camera_ok',
]);

/** Which camera role and model "produce" each event key; `null` = not camera-sourced. */
export const EVENT_SOURCE: Readonly<
  Record<string, { role: 'DOCK' | 'CREW' | 'BELT'; model: string } | null>
> = {
  'truck.arrived': { role: 'DOCK', model: 'lpr-v1.0' },
  'truck.docked': { role: 'DOCK', model: 'lpr-v1.0' },
  'truck.started': { role: 'BELT', model: 'belt-count-v2.1' },
  'truck.finished': { role: 'BELT', model: 'belt-count-v2.1' },
  'truck.departed': { role: 'DOCK', model: 'lpr-v1.0' },
  'truck.detention': null,
  'truck.unknown_plate': { role: 'DOCK', model: 'lpr-v1.0' },
  'belt.state_changed': { role: 'BELT', model: 'belt-count-v2.1' },
  'belt.empty_run': { role: 'BELT', model: 'belt-count-v2.1' },
  'belt.fall_off': { role: 'BELT', model: 'belt-count-v2.1' },
  'hygiene.damaged': { role: 'BELT', model: 'hygiene-v1.2' },
  'hygiene.open_tape': { role: 'BELT', model: 'hygiene-v1.2' },
  'hygiene.torn_sack': { role: 'BELT', model: 'hygiene-v1.2' },
  'hygiene.wet_stained': { role: 'BELT', model: 'hygiene-v1.2' },
  'hygiene.spillage': { role: 'CREW', model: 'housekeeping-v0.9' },
  'hygiene.debris': { role: 'CREW', model: 'housekeeping-v0.9' },
  'handling.rough_handling': { role: 'CREW', model: 'handling-v0.8' },
  'ppe.violation': { role: 'CREW', model: 'ppe-v1.4' },
  'compliance.on_belt': { role: 'CREW', model: 'pose-v1.1' },
  'compliance.crowding': { role: 'CREW', model: 'ppe-v1.4' },
  'compliance.forklift_proximity': { role: 'CREW', model: 'pose-v1.1' },
  'roster.captain_detected': { role: 'CREW', model: 'ppe-v1.4' },
  'roster.captain_absent': { role: 'CREW', model: 'ppe-v1.4' },
  'staging.pallet_wait': { role: 'CREW', model: 'staging-v1.0' },
  'security.after_hours_presence': { role: 'CREW', model: 'ppe-v1.4' },
  'security.door_open_idle': { role: 'DOCK', model: 'lpr-v1.0' },
  'security.truck_entry_no_loading': { role: 'DOCK', model: 'pose-v1.1' },
  'system.camera_offline': null,
  'system.camera_obstructed': null,
  'system.camera_defocus': null,
  'system.camera_moved': null,
  'system.camera_ok': null,
  'system.pipeline_lag': null,
};

/** Events that carry a snapshot (evidence image). Everything else has `media: null`. */
export const EVIDENCE_EVENTS: ReadonlySet<string> = new Set([
  'truck.arrived',
  'truck.unknown_plate',
  'belt.fall_off',
  'hygiene.damaged',
  'hygiene.open_tape',
  'hygiene.torn_sack',
  'hygiene.wet_stained',
  'hygiene.spillage',
  'hygiene.debris',
  'handling.rough_handling',
  'ppe.violation',
  'compliance.on_belt',
  'compliance.crowding',
  'compliance.forklift_proximity',
  'staging.pallet_wait',
  'security.after_hours_presence',
  'security.truck_entry_no_loading',
]);
