/** KunlunMeta brand system — warm paper + navy structure + teal activity.
 * Every visual mode draws from this palette so the worlds feel like one catalogue. */
export const T = {
  paper: 0xfbf9f6,
  paperWarm: 0xf6f1e9,
  paperDeep: 0xeee7dc,
  navy: 0x171c60,
  navySoft: 0x3b4177,
  navyMuted: 0x6a6f96,
  teal: 0x33cbcc,
  tealDeep: 0x1f8f92,
  tealPale: 0xbfeaeb,
  ink: 0x22263f,
  line: 0x2a2f58,
  metal: 0x9a9db0,
  metalDeep: 0x707489,
  brass: 0xb28d5e,
  brassPale: 0xd8c6ae,
  rose: 0xc79a9a,
  sage: 0x9bb3a8,
  sand: 0xd8c6ae,
  slate: 0x8e9bb3,
  white: 0xffffff,
} as const;

export const HEX = {
  paper: '#FBF9F6',
  paperWarm: '#F6F1E9',
  paperDeep: '#EEE7DC',
  navy: '#171C60',
  navySoft: '#3B4177',
  teal: '#33CBCC',
  tealDeep: '#1F8F92',
  tealPale: '#BFEAEB',
  ink: '#22263F',
  muted: '#6A6F96',
  line: '#2A2F58',
  metal: '#9A9DB0',
  brass: '#B28D5E',
  rose: '#C79A9A',
  sage: '#9BB3A8',
  slate: '#8E9BB3',
  white: '#FFFFFF',
} as const;

/** Low-saturation warp palette inherited from the Loom creel. */
export const WARP_COLORS = [
  0xd89ac8, 0x9fd8b8, 0x9fb8e8, 0xe8c890, 0xc0a0e0, 0x90d8d8,
  0xe8a0a8, 0xb8e098, 0x98c8e8, 0xe0b890, 0xd8a0d0, 0xa0e0b8,
];

export const EVENT_COLORS = {
  Read: 0x8e9bb3,
  Edit: 0x171c60,
  Write: 0x33cbcc,
  Bash: 0x22263f,
  Search: 0x9bb3a8,
} as const;

/** String tints of the tool families, used by Chips cards / Westworld routing. */
export const TOOL_TINTS: Record<string, { base: string; deep: string; pale: string; ink: string }> = {
  Read:   { base: '#8E9BB3', deep: '#5A6A8C', pale: '#E7EAF0', ink: '#2F3A52' },
  Edit:   { base: '#171C60', deep: '#0E1240', pale: '#DCDDE8', ink: '#FFFFFF' },
  Write:  { base: '#33CBCC', deep: '#1F8F92', pale: '#DDF4F3', ink: '#0C3A3B' },
  Bash:   { base: '#22263F', deep: '#12152A', pale: '#E2E2E6', ink: '#FFFFFF' },
  Search: { base: '#9BB3A8', deep: '#6D8579', pale: '#E9EFEA', ink: '#2C3A33' },
};

export const FONT: Record<'display' | 'mono' | 'serif', string> = {
  display: 'Bahnschrift, "DIN Alternate", "Segoe UI", sans-serif',
  mono: 'Consolas, "JetBrains Mono", "Courier New", monospace',
  serif: 'Georgia, "Times New Roman", serif',
} as const;
