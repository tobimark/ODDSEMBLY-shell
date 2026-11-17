/**
 * TitleBar — pixel replica of the CrommaCode title bar.
 *
 * client box: left 0, top 0, 1440 x 48 content + 1px bottom rule (#eae8e4).
 * Native: content y 13..108, rule y 109..110 (2 device px = 1 css px),
 * NavBar starts at native y 111 = client 49.
 *
 * Every number was measured on the 2906x1730 capture (200% DPI) with
 * tools/probe.py / fontmatch.py and converted with client = (native - 13) / 2.
 * The measurement table lives in docs/region-titlebar-navbar.md.
 */
import { BrandMark, BrandWordmark } from '../svg/brand';
import { Icon } from '../svg/Icon';

const INK = '#1a150f';

/** the app's default UI face (Maple Mono CN 400 covers both Latin and CJK here) */
const UI_FONT = "'Maple Mono CN', 'Cromma Sans', 'Microsoft YaHei UI', sans-serif";

/** title-bar menus; `inkX` is the measured ink left edge (client px), `lsb` the glyph's left side bearing */
type MenuItem = { label: string; inkX: number; lsb: number };

const MENU: MenuItem[] = [
  { label: '文件', inkX: 161.5, lsb: 1.5 },
  { label: '编辑', inkX: 208.5, lsb: 1.75 },
  { label: '搜索', inkX: 255.5, lsb: 1.75 },
  { label: '视图', inkX: 302.5, lsb: 1.75 },
  { label: '终端', inkX: 349.5, lsb: 1.75 },
  { label: '帮助', inkX: 396.5, lsb: 1.75 },
];

export function TitleBar() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 1440,
        height: 49,
        background: '#f6f1ea',
        borderBottom: '1px solid #eae8e4',
        overflow: 'hidden',
      }}
    >
      {/* ---- brand mark: ODDSEMBLY robot trolley, ink 30 x 32.7 at client (13.5, 5) ---- */}
      <BrandMark
        height={30}
        color={INK}
        style={{ position: 'absolute', left: 13.5, top: 5, display: 'block' }}
      />

      {/* ---- wordmark: ODDSEMBLY vector, ink 97.6 x 12.3 at client (52.8, 13.85) ---
           proportions follow the supplied brand raster (mark 436x400, gap 89,
           wordmark 1301x164) rather than the old text run that was measured here. */}
      <BrandWordmark
        height={12.3}
        color={INK}
        style={{ position: 'absolute', left: 52.8, top: 13.85, display: 'block' }}
      />

      {/* ---- menus (ink y 40..64 native = client 13.5..25.5) ---------------------- */}
      {MENU.map((m) => (
        <span
          key={m.label}
          style={{
            position: 'absolute',
            left: m.inkX - m.lsb,
            top: 13.25,
            fontFamily: UI_FONT,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: -0.4,
            lineHeight: 1,
            color: INK,
            whiteSpace: 'pre',
          }}
        >
          {m.label}
        </span>
      ))}

      {/* ---- window controls -----------------------------------------------------
          Glyphs are icon-mapper's pixel-measured `win-*` vectors: each draws a
          10.5 x 10 css ink box centred in its 16 grid, so the box is placed at
          (ink centre - 8). */}
      <div
        style={{
          position: 'absolute',
          left: 1341.75,
          top: 11.5,
          width: 16,
          height: 16,
          color: INK,
        }}
      >
        <Icon name="win-minus" size={16} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1377.75,
          top: 12,
          width: 16,
          height: 16,
          color: INK,
        }}
      >
        <Icon name="win-max" size={16} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1413.75,
          top: 12,
          width: 16,
          height: 16,
          color: INK,
        }}
      >
        <Icon name="win-close" size={16} />
      </div>
    </div>
  );
}
