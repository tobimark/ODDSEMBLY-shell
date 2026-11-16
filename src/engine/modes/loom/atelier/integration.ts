import { bolt, label, line, plate, rect, surface } from './drawing';
import { FINISH as F } from './finish';

/** Shared stationary chassis: only the bed under the loom remains. The old
 *  console feet, saddle and service spine were removed with the control box. */
export function sharedChassis() {
  return surface(1472, 1008, g => {
    plate(g, 300, 840, 1105, 30, false, false);
    line(g, [312, 847, 1393, 847], F.fine, .5);
    line(g, [312, 864, 1393, 864], F.fine, .6);
    for (const px of [316, 520, 830, 1130, 1388]) bolt(g, px, 855, 3);
    for (const px of [530, 1350]) {
      rect(g, px - 16, 870, 32, 4, F.steel, 1, F.edge);
      line(g, [px - 22, 876, px + 22, 876], F.fine, .5);
    }
    label(g, 'KM / 01   •   EVENT-TO-WEAVE ASSEMBLY', 980, 859, 7, F.muted, 'center');
  });
}
