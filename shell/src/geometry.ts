/**
 * Geometry constants for the CrommaCode shell replica.
 *
 * Source of truth: `analysis/ui-shell/frame-metrics.json`, measured on the
 * native 2906x1730 capture (200% DPI) taken from CrommaCode 0.3.11 on Windows.
 *
 * The app was captured at 2x, so every measurable edge is a native pixel value.
 * We keep the *native* numbers here (prefix N_) and expose logical px (native/2)
 * through `px()`, because the browser replica is authored in logical/CSS px and
 * rendered at devicePixelRatio 2 -- exactly the same raster as the capture.
 */

/** native px -> CSS px at the capture's 200% scale */
export const px = (native: number): number => native / 2;

/** window (including the dark capture frame) */
export const WINDOW = { w: px(2906), h: px(1730) };

/** client area of the app, in page coords */
export const CLIENT = { x: px(13), y: px(13), w: px(2880), h: px(1704) };

/** ---- vertical structure (page coords, logical px) ---- */
export const TITLEBAR = { y: px(13), h: px(96) }; // 6.5 .. 54.5
export const NAVBAR = { y: px(111), h: px(102) }; // 55.5 .. 106.5
export const BODY = { y: px(213), h: px(1485) }; // 106.5 .. 849, below nav

/** ---- horizontal structure (page coords, logical px) ---- */
export const SIDEBAR = { x: px(13), w: px(528) }; // 6.5 .. 270.5
export const CONTENT = { x: px(543), w: px(2334) }; // 271.5 .. 1438.5
export const CANVAS = { x: px(543), w: px(1462) }; // main card 271.5 .. 1002.5
export const AGENT = { x: px(2029), w: px(823) }; // 1014.5 .. 1426
export const RIGHT_GUTTER = px(2892 - 2876); // 8 logical px of chrome on the right

/** ---- colours sampled from the native capture ---- */
export const C = {
  desktop: '#f4f1f9', // area outside the rounded window frame
  windowFrame: '#000000', // dark capture frame around the client area
  chrome: '#f6f1ea', // title bar, sidebar, right gutter
  chromeBorder: '#eae8e4',
  surface: '#fcfaf6', // nav row background / main area
  panel: '#fefcf9', // agent panel body
  panelAlt: '#fffdfb',
  cardBorder: '#dcdad5',
  canvasWell: '#f9f6f1',
  chip: '#f2ece3', // footer button chips
} as const;
