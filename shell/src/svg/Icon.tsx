import type { CSSProperties } from 'react';
import { ICON_PATHS, ICON_SPECIAL, type IconName } from './icons';
import { UI_ICON_PATHS } from './uiIcons';

export type { IconName };

export interface IconProps {
  name: IconName | string;
  /** rendered box in logical px (the capture is 200% DPI) */
  size?: number;
  style?: CSSProperties;
  className?: string;
  /** stroke colour override; icons follow currentColor by default */
  color?: string;
}

/**
 * Renders one of the icon-theme SVGs shipped inside CrommaCode 0.3.11.
 *
 * Two tables, both lifted verbatim from the binary:
 *   - `uiIcons.ts`   98 icons the app's own UI uses (wins: it is the set the
 *                    chrome is drawn with, and 6 names exist in both tables with
 *                    different artwork — see UI_ICON_OVERRIDES)
 *   - `icons.ts`     the 189-icon alphabetical theme block
 */
export function Icon({ name, size = 16, style, className, color }: IconProps) {
  const uiInner = UI_ICON_PATHS[name];
  const themeInner = ICON_PATHS[name];
  const inner = uiInner ?? themeInner ?? null;

  if (inner === null) {
    const special = ICON_SPECIAL[name];
    if (!special) return null;
    return (
      <svg
        viewBox={special.vb}
        width={size}
        height={size}
        style={{ display: 'block', color, ...style }}
        className={className}
        dangerouslySetInnerHTML={{
          __html: special.attrs ? `<g ${special.attrs}>${special.inner}</g>` : special.inner,
        }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      style={{ display: 'block', color, ...style }}
      className={className}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
