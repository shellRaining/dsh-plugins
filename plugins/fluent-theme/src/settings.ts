// Stable storage/channel identity retained after the fluent-theme package rename.
// Every reader normalizes through this schema so older records stay valid.
export const PLUGIN_ID = 'dsh-acrylic-wallpaper';

export const FITS = Object.freeze(['cover', 'contain', 'stretch', 'tile'] as const);
export type Fit = (typeof FITS)[number];

export const LIMITS = Object.freeze({ blur: 64, tint: 95, noise: 8 });
export type Amount = keyof typeof LIMITS;

const SWITCHES = ['enabled', 'fluent', 'reveal'] as const;
export type Switch = (typeof SWITCHES)[number];

export type Settings = { -readonly [Key in Switch]: boolean } & { -readonly [Key in Amount]: number } & { fit: Fit };
export type SettingsPatch = Partial<Settings>;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ enabled: true, blur: 32, tint: 72, noise: 3, fit: 'cover', fluent: true, reveal: true });

export const own = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
export const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const isFit = (value: unknown): value is Fit => (FITS as readonly unknown[]).includes(value);

export function normalizeSettings(input: unknown): Settings {
  const value = object(input);
  const result: Settings = { ...DEFAULT_SETTINGS };
  for (const key of SWITCHES) {
    const candidate = value[key];
    if (own(value, key) && typeof candidate === 'boolean') result[key] = candidate;
  }
  for (const [key, max] of Object.entries(LIMITS) as [Amount, number][]) {
    const candidate = value[key];
    if (own(value, key) && typeof candidate === 'number' && Number.isFinite(candidate)) {
      result[key] = Math.max(0, Math.min(max, candidate));
    }
  }
  if (isFit(value.fit)) result.fit = value.fit;
  return result;
}
