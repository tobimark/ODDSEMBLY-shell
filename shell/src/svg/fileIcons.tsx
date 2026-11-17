import type { CSSProperties } from 'react';

/**
 * Colour file-type icons for the sidebar file tree.
 *
 * WHAT THEY ACTUALLY ARE (found, not guessed)
 *   16x16 RGBA pixel-art bitmaps, Material-palette colours, drawn 1 bitmap pixel == 1
 *   logical px. The reference frame is a 200% capture, so every source pixel lands on an
 *   exact 2x2 native block (verified: max per-channel deviation inside all 2x2 blocks = 0),
 *   which means the bitmaps below are recovered LOSSLESSLY from .tmp/shell/ref.png.
 *   e.g. python = #0288D1 (Blue 700) + #FDD835 (Yellow 600), 112 opaque pixels of 256.
 *
 * WHAT I COULD NOT FIND
 *   The app references `assets/file-icons/index.json` (string in cromma-bees.exe at
 *   0x2677961, next to crates\app\src\app\assets.rs) but that index is the ONLY path
 *   under file-icons/ and its JSON body is not present as plaintext in the shipped
 *   binary: there is no "'py'"/"'xlsx'"/"fileExtensions" JSON key, no <svg> with a
 *   coloured file-icon shape (the 344 `<svg` literals are all currentColor 16x16 UI icons
 *   plus 24x24 provider logos, brand marks and one 1028x5250 stroke illustration), and no
 *   PNG payload (all 31 PNG signatures in the binary are the app-icon .ico set and
 *   about/hand-*.png). So the atlas is either packed/decoded at runtime or built into a
 *   build we do not have. Embedding the recovered 16x16 bitmaps is the highest-fidelity
 *   option that exists without those bytes; it is pixel-exact, not an approximation.
 *
 * Only the 8 types visible in the reference frame are covered; FileIcon returns null for
 * anything else (see FILE_ICON_MISSING) and the caller draws the monochrome `file` icon
 * from uiIcons.ts instead.
 */

const DATA: Record<string, string> = {
  /** .py .pyw .ipynb-adjacent scripts */
  'python': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAg0lEQVR42mP89vEVAyWABZcEz/Tn/5H5XzIlGbGpYyJGMy4xnAaQArAa8CVTkhGXk3GGAS4nogP2597/GRgYGH5KbmWEu4BYzdgMIjoMcHmJBZdCmA1w8JyB+FjA0EwoFogNcWQAC0QWQn5EVkx2QmJ/7v0fl7dokxKxORmXNxgpzc4ACtg01TzlI7UAAAAASUVORK5CYII=',
  /** .json .jsonc .json5 */
  'json': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAX0lEQVR42mP89vEVAyWABZnDvN36PzL/r+dRRnziGAagS2ITQzeMiYFCwITLZHwAWS0TsgA25+PyDkwPdbyAK7TxOR+mhwlf6BPyBlW8wIIvhInxGiOlSZl6CWnoGgAAj+cxx1otaCoAAAAASUVORK5CYII=',
  /** .png .jpg .jpeg .gif .webp .bmp .ico */
  'image': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAb0lEQVR42mP89vEVAyWABZljsHXDf1wKL3gHMGITZyJGMz55JmKcCbMdmyFMxPoVlyFMpAQYNkNYiFGEL3yYGCgETMSGNkkuwGUItrTARCjQYJoIJiR8tuHSjNMAfBqoHguMyLmR2BhAdiEjpdkZAIXcN206N0CPAAAAAElFTkSuQmCC',
  /** .svg */
  'svg': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAcklEQVR42q1SuREAIQgE5hIbsJwr3nLITDT0Usfh85SIcZFdWLBVhpMgC0wlj1Ty+N1gW4HHKOGkFUbeAABwXaI3c38ZTQVrgYdhq+yyWg2PXUDpkDRF0ggU/axhpBXMbHMeugNJqubOE7UwvIMrLuzEBxBTQbNBfN3cAAAAAElFTkSuQmCC',
  /** .mp4 .mov .mkv .webm .avi */
  'video': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAVUlEQVR42mP89vEVAyWAiYGBgYFzudh/zuVi/2GC2PjocjAxJmTTkBWiA1xyTNgEv0e+YsRlELoc47ePr/DajA98j3zFyMRAIRg1gAoGMFIlKY9wAwC2FyK5YrFN1AAAAABJRU5ErkJggg==',
  /** .xlsx .xls .csv */
  'xlsx': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAdklEQVR42mP89vEVAyWABZkz9VLCf1wKs/UWMGITZyLWJlyGE2UAzHZshhDtAlyGMJESYNjCgYUS/+N0QbbeAkZk29D5ZHuBaANgTka2meRoRNZAchjAbJ96KeH/1EsJ/3H5H28gEpuUWYiJNrK8QCxgpDQ7AwDwlzsB/kX3egAAAABJRU5ErkJggg==',
  /** .html .htm */
  'html': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAaklEQVR42mP89vEVAyWABcb4kCD2nxSNAgteMTIwMDAwMVAIWHCZjAugu5SFWIW4APW9QMgr6C5jRI5GfM6GGfghQew/suEkeQGbBUykOJ8qYUCUAaSkSkZseQGXAdhcxUhpZqI4IVFsAAAFAC3SbZ4riAAAAABJRU5ErkJggg==',
  /** .md .markdown .mdx */
  'md': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAVUlEQVR42mP89vEVAyWACcbw2cL932cL939cfFxiLOgmoisg2gXkAhZiFGHzCgMDA8MWn6+MGC7Y4vOVcYvPV0Z0MWzqSPICsiHIbEaqReOoASPaAACvMSXZnPhCfAAAAABJRU5ErkJggg==',
};

/** logical (CSS) box the app draws each icon in — 16x16, 1 bitmap px = 1 CSS px */
export const FILE_ICON_SIZE = 16;

export const FILE_ICON_PATHS: Record<string, string> = DATA;

/** extension -> icon key. Mirrors the rows seen in the reference frame. */
export const FILE_ICON_EXT: Record<string, string> = {
  'py': 'python',
  'pyw': 'python',
  'pyi': 'python',
  'json': 'json',
  'jsonc': 'json',
  'json5': 'json',
  'lock': 'json',
  'png': 'image',
  'jpg': 'image',
  'jpeg': 'image',
  'gif': 'image',
  'webp': 'image',
  'bmp': 'image',
  'ico': 'image',
  'avif': 'image',
  'svg': 'svg',
  'mp4': 'video',
  'mov': 'video',
  'mkv': 'video',
  'webm': 'video',
  'avi': 'video',
  'm4v': 'video',
  'xlsx': 'xlsx',
  'xls': 'xlsx',
  'csv': 'xlsx',
  'html': 'html',
  'htm': 'html',
  'md': 'md',
  'markdown': 'md',
  'mdx': 'md',
};

export const FILE_ICON_KINDS = Object.keys(DATA);

/** types the app renders that are NOT in this table (not recoverable from this build) */
export const FILE_ICON_MISSING = ['js/ts', 'css', 'yaml/toml', 'zip/tar/gz', 'pdf', 'sql', 'sh', 'rs', 'go', 'java', 'xml', 'font', 'unknown'];

export interface FileIconProps {
  /** file name or bare extension; the lookup is extension based */
  name?: string;
  /** explicit kind: one of FILE_ICON_KINDS */
  kind?: string;
  /** drawn box in logical px, default 16 */
  size?: number;
  style?: CSSProperties;
  className?: string;
}

function kindOf(name: string): string | undefined {
  const i = name.lastIndexOf('.');
  if (i < 0) return undefined;
  return FILE_ICON_EXT[name.slice(i + 1).toLowerCase()];
}

/**
 * Colour file-type icon. Raster source, so it is rendered 1:1 with
 * `image-rendering: pixelated` (the app draws the same 16x16 bitmap unscaled — any
 * CSS scale must stay integer to keep the pixel grid crisp).
 * Returns null for unknown types; the caller then draws the monochrome `file` icon
 * (see FILE_ICON_MISSING).
 */
export function FileIcon({ name, kind, size = FILE_ICON_SIZE, style, className }: FileIconProps) {
  const key = kind ?? (name ? kindOf(name) : undefined);
  const src = key ? DATA[key] : undefined;
  if (!src) return null;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{ display: 'block', width: size, height: size, flex: '0 0 auto', imageRendering: 'pixelated', ...style }}
    />
  );
}
