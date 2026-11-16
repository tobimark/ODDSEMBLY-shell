import { bolt, label, line, plate, rect, surface } from './drawing';
import { FINISH as F } from './finish';

/** Shared stationary chassis: only the bed under the loom remains. The old
 *  console feet, saddle and service spine were removed with the control box. */
export function sharedChassis() {
  return surface(1472, 1008, g => {
    plate(g, 460, 840, 920, 30, false, false);
    line(g, [472, 847, 1368, 847], F.fine, .5);
    line(g, [472, 864, 1368, 864], F.fine, .6);
    for (const px of [480, 700, 900, 1100, 1360]) bolt(g, px, 855, 3);
    for (const px of [650, 1290]) {
      rect(g, px - 16, 870, 32, 4, F.steel, 1, F.edge);
      line(g, [px - 22, 876, px + 22, 876], F.fine, .5);
    }
    label(g, 'KM / 01   •   EVENT-TO-WEAVE ASSEMBLY', 950, 859, 7, F.muted, 'center');
  });
}
