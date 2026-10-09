// devhub design tokens — the nieky.info × deadrop foundation from the
// layout mockup (https://claude.ai/artifact/8Dz8BtmvCZJy7ygiHszXhj).
// Raw values live here; antd-theme.ts maps them onto Ant Design.

export const palette = {
  // Grounds, darkest → most raised (dusty-grape-950 family)
  terminal: '#0C0811',
  ground: '#110C18',
  surface: '#1B1722', // code/command blocks, inputs
  card: '#221E2A',
  raised: '#26222E', // pills, selected rows
  // Lines
  border: '#241F2C',
  borderStrong: '#302B39',
  borderEmphasis: '#3F3850',
  // Text
  text: '#F4F2F7',
  textSecondary: '#D7D2DF',
  textMuted: '#B9B3C4',
  textFaint: '#8E879B',
  // deadrop blue (actions)
  blue: '#1971C2',
  blueTint: '#1B2638',
  blueText: '#74C0FC',
  blueOutline: '#4DABF7',
} as const;

// Agent / pane status — nieky.info's accent dots.
export const status = {
  working: '#4AABE8', // steel-blue-400
  needsYou: '#FFC933', // golden-pollen-400
  done: '#A9DE54', // yellow-green-400
  error: '#FF333A', // vibrant-coral-400
  errorText: '#FF7A7F',
  worktree: '#9478BA', // dusty-grape-400
  idle: '#5F5870',
} as const;

export type Status = keyof typeof status;

export const fonts = {
  display: "'ClashDisplay', 'GeneralSans', system-ui, sans-serif",
  body: "'GeneralSans', system-ui, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
} as const;

export const radius = {
  control: 4, // deadrop buttons/inputs
  card: 10,
  panel: 12,
  pill: 999, // nieky.info nav pills
} as const;

// Spacing scale. Prefer these over ad-hoc values: generous, consistent
// gaps do more for the console's calm than borders do.
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
