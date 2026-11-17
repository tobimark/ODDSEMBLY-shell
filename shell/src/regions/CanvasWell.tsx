/**
 * The centre GameView well.
 *
 * OUT OF SCOPE: the actual game canvas (Westworld / Loom / Factory … scenes) is
 * not reproduced here — this is the empty well it sits in, plus the one piece of
 * chrome that lives on top of it: the mode strip.
 *
 * Measured on the native capture (2906x1730 @200%):
 *   well        x 543..2004  y 213..1699   (client 265..995.5, 100..843)
 *   strip       x 730..1839  y 212..271    (client 358.5..913, 99.5..129)
 *   active pill x 737..938   y 219..264    (client 362..462.5, 103..125.5)
 *   strip fill  #f9f6f1     border ~#edeae5
 *   labels      Maple Mono CN 400 15px
 *
 * The real well shows no side border — the GameView paints edge to edge inside
 * the surface — so this is a flush block rather than a card.
 */
import { px } from '../geometry';
import { FilePreview } from './FilePreview';
import { LoomView } from './LoomView';

const WELL = {
  left: (543 - 13) / 2,
  top: (213 - 13) / 2,
  width: (2004 - 543) / 2,
  height: (1699 - 213) / 2,
};

const STRIP = {
  // mounted inside the well, so subtract the well origin
  left: (730 - 13) / 2 - WELL.left,
  top: (212 - 13) / 2 - WELL.top,
  width: (1839 - 730 + 1) / 2,
  height: (271 - 212 + 1) / 2,
};

const PILL = {
  // child of the strip: measured native box 737..938 x 219..264, minus the
  // strip's 1px border and converted to logical px
  left: (737 - 730 - 2) / 2,
  top: (219 - 212 - 2) / 2,
  width: (938 - 737 + 1) / 2,
  height: (264 - 219 + 1) / 2,
};

/** Page y where the shell's 游戏视图 caption and HUD row start: the canvas floor. */
const VIEW_BOTTOM = 660;

/** measured ink-left of each label (native px) */
const TABS: { label: string; inkLeft: number; active?: boolean }[] = [
  { label: 'Westworld', inkLeft: 757 },
  { label: 'Loom', inkLeft: 966, active: true },
  { label: 'Factory', inkLeft: 1081 },
  { label: 'Chips', inkLeft: 1250 },
  { label: 'Rhythm', inkLeft: 1385 },
  { label: 'Slots', inkLeft: 1536 },
  { label: 'Roulette', inkLeft: 1671 },
];

/** The active pill is measured on Westworld; move it under whichever tab is live. */
const ACTIVE_INK = TABS.find((t) => t.active)?.inkLeft ?? 757;
const PILL_LEFT = (ACTIVE_INK - 13) / 2 - 10 - WELL.left - STRIP.left;

export function CanvasWell({
  mode = 'vibe',
  file = null,
  onCloseFile,
}: {
  mode?: 'vibe' | 'files';
  file?: string | null;
  onCloseFile?: () => void;
}) {
  const showingFile = mode === 'files' && file != null;
  return (
    <div
      style={{
        position: 'absolute',
        left: WELL.left,
        top: WELL.top,
        width: WELL.width,
        height: WELL.height,
        background: '#fbf9f5',
        overflow: 'hidden',
      }}
    >
      {/* the well's own 1px top edge + the soft shade above it (native y 196..214) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: -8.5,
          width: '100%',
          height: 9.5,
          background:
            'linear-gradient(to bottom, rgba(120,105,80,0) 0%, rgba(120,105,80,0.085) 92%, rgba(120,105,80,0.10) 100%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: 1,
          background: '#dddbda',
        }}
      />

      {showingFile ? (
        <FilePreview
          path={file as string}
          onClose={() => onCloseFile?.()}
          width={WELL.width}
          height={WELL.height}
        />
      ) : null}

      {/* The Game View itself: the Loom engine, edge to edge under the mode strip.
          Its floor is the 游戏视图 caption / HUD row, which belong to the shell. */}
      {!showingFile && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: STRIP.height + 2,
            width: '100%',
            height: VIEW_BOTTOM - (WELL.top + STRIP.height + 2),
          }}
        >
          <LoomView />
        </div>
      )}

      {/* mode strip (hidden while the file view owns the well) */}
      {!showingFile && (
      <div
        style={{
          position: 'absolute',
          left: STRIP.left,
          top: STRIP.top,
          width: STRIP.width,
          height: STRIP.height,
          background: '#f9f6f1',
          border: '1px solid #edeae5',
          borderRadius: 10,
          boxShadow: '0 1px 2px rgba(60,50,35,0.05)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: PILL_LEFT,
            top: PILL.top,
            width: PILL.width,
            height: PILL.height,
            background: '#fffdfb',
            border: '1px solid #edeae5',
            borderRadius: 7,
            boxShadow: '0 1px 2px rgba(60,50,35,0.06)',
          }}
        />
        {TABS.map((t) => (
          <div
            key={t.label}
            style={{
              position: 'absolute',
              left: (t.inkLeft - 13) / 2 - WELL.left - STRIP.left - 0.5,
              top: 0,
              height: STRIP.height - 2,
              display: 'flex',
              alignItems: 'center',
              fontFamily: "'Maple Mono CN', monospace",
              fontWeight: 400,
              fontSize: 15,
              lineHeight: 1,
              color: t.active ? '#241f19' : '#4a4238',
              whiteSpace: 'pre',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

export { px };
