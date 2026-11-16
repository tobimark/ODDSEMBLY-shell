import { C, bearing, bolt, circle, label, line, metal, plate, poly, rect, surface, type Pen } from './drawing';
import { WEAVE, YARNS } from './textile';

function bobbin(g: Pen, x: number, y: number, color: string, n: number) {
  metal(g, x - 3, y - 14, 6, 84, true);
  rect(g, x - 16, y + 6, 34, 49, '#171C6018', 5);
  const grad = g.createLinearGradient(x - 15, 0, x + 15, 0);
  grad.addColorStop(0, '#586474'); grad.addColorStop(.13, color); grad.addColorStop(.42, '#F2EED477'); grad.addColorStop(.6, color); grad.addColorStop(1, '#3C5360');
  rect(g, x - 15, y, 30, 52, grad, 5, '#5E7376');
  for (let j = 2; j < 51; j += 2.3) {
    line(g, [x - 13, y + j + .6, x + 13, y + j - .6], j % 3 < 1.5 ? '#FFFFFF66' : '#17294444', .6);
  }
  metal(g, x - 20, y - 5, 40, 7); metal(g, x - 20, y + 49, 40, 7);
  circle(g, x, y - 11, 4.5, '#DADFD8', '#83909A', .6);
  label(g, String(n + 1).padStart(2, '0'), x, y + 74, 7, '#73818A', 'center');
}

/** Exhibition sheet: paper, registration marks and catalogue captions only.
 *  The machine itself lives on loomPlate() so it can be moved by the camera. */
export function sheetBase() {
  return surface(1472, 1008, g => {
    rect(g, 0, 0, 1472, 1008, C.paper);
    // Restrained registration marks: the machine sits on an exhibition sheet.
    for (let x = 42; x < 1450; x += 24) for (let y = 120; y < 910; y += 24) circle(g, x, y, .55, '#8F999023');
    line(g, [40, 104, 1432, 104], '#AAB1B251', .7);
    line(g, [40, 924, 1432, 924], '#AAB1B251', .7);
    label(g, 'FIG. 01', 42, 142, 10, '#8B9398');
    label(g, 'THE EVENT', 42, 163, 9, '#8B9398'); label(g, 'BECOMES THREAD.', 42, 177, 9, '#8B9398');
    // Bottom catalogue captions stay fixed to the sheet as the machine pans.
    label(g, '112 ENDS', 354, 905, 9, '#73828B');
    label(g, '2 / 2 BROKEN TWILL', 770, 905, 9, '#73828B', 'center');
    label(g, 'EVENT-DRIVEN / SERIES 01', 1234, 905, 9, '#73828B', 'right');
    label(g, '00 / EVENT SCALE', 42, 882, 8, '#8B9398');
    line(g, [40, 888, 168, 888], '#B5BEBC66', .6);
  });
}

/** The loom machine only (transparent): baked at design coordinates, moved by
 *  the scene camera to make room for the event-scale instrument on the left. */
export function loomPlate() {
  return surface(1472, 1008, g => {
    // Contact shadows are bound to the footprint and return faces.
    g.save(); g.filter = 'blur(15px)'; rect(g, 282, 877, 1010, 13, '#171C6021', 15); g.restore();
    g.save(); g.filter = 'blur(8px)'; rect(g, 326, 264, 932, 620, '#171C6017', 8); g.restore();
    rect(g, 333, 263, 886, 594, '#E5E5DB');
    const field = g.createLinearGradient(340, 0, 1200, 0); field.addColorStop(0, '#D0D4CB'); field.addColorStop(.1, '#F0EEE5'); field.addColorStop(.6, '#F7F5EE'); field.addColorStop(1, '#DEDFD5');
    rect(g, 345, 276, 850, 580, field);
    // Rear cross braces remain behind the translucent warp sheets.
    poly(g, [336, 813, 347, 813, 1207, 332, 1207, 344], '#B2B9B229');
    poly(g, [340, 333, 351, 329, 1204, 813, 1198, 823], '#B2B9B222');
    for (const x of [311, 1222]) {
      plate(g, x - 26, 254, 52, 612, true);
      metal(g, x - 5, 292, 10, 535, true);
      for (let y = 315; y < 820; y += 50) { rect(g, x - 21, y, 6, 17, '#121B45', 3, '#687392'); bolt(g, x + 17, y + 8, 2.4); }
      plate(g, x - 37, 859, 78, 24, true);
      for (const yy of [383, 490, 609]) { plate(g, x - 15, yy, 30, 29, false, false); bolt(g, x, yy + 14, 4); }
    }
    // Rear top rail and creel with sixteen independently wound yarn packages.
    metal(g, 313, 136, 910, 11);
    for (let i = 0; i < 16; i++) bobbin(g, 380 + i * 52, 158, YARNS[i], i);
    for (let i = 0; i < WEAVE.ends; i++) {
      const group = Math.floor(i / 7);
      const x = 359 + i * 822 / (WEAVE.ends - 1);
      line(g, [380 + group * 52 + (i % 7 - 3) * .5, 213, x, 243], YARNS[group] + '99', .6);
    }
    plate(g, 302, 239, 936, 36, false);
    metal(g, 342, 252, 853, 14);
    for (let i = 0; i < WEAVE.ends; i++) {
      const x = 359 + i * 822 / (WEAVE.ends - 1);
      line(g, [x - 5, 253, x + 5, 266], '#798D9370', .5);
      line(g, [x + 5, 253, x - 5, 266], '#798D9340', .4);
    }
    bearing(g, 314, 254, 15); bearing(g, 1225, 254, 15);
    // Split ceramic thread guides, not a decorative row of boxes.
    for (let i = 0; i < 16; i++) {
      const x = 380 + i * 52;
      rect(g, x - 13, 276, 26, 8, '#FFFFFF', 3, '#A0AAA9');
      line(g, [x - 8, 279, x + 8, 279], YARNS[i], 1);
    }
    // Fixed lease rods.
    for (const y of [329, 345]) { metal(g, 325, y, 889, 6); for (const x of [322, 1217]) { plate(g, x - 8, y - 6, 16, 19, false, false); bolt(g, x, y + 3, 3); } }
    // Main drive cassette, bolted directly to the left stanchion.
    plate(g, 166, 483, 148, 303, false);
    rect(g, 178, 494, 124, 282, '#D8DDD7', 42, '#BAC2BC');
    metal(g, 215, 497, 13, 278, true);
    for (const y of [509, 566, 725]) bearing(g, 221, y, 13);
    // A single small tension instrument built into the drive housing.
    plate(g, 195, 346, 100, 103, false);
    circle(g, 246, 393, 35, '#BAC2BF', '#7D8996'); circle(g, 246, 392, 31, '#F9F7ED', '#FFFFFF', 1.5);
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI * .75 + i / 24 * Math.PI * 1.5;
      line(g, [246 + Math.cos(a) * (i % 4 ? 26 : 23), 392 + Math.sin(a) * (i % 4 ? 26 : 23), 246 + Math.cos(a) * 28, 392 + Math.sin(a) * 28], '#5A6979', .7);
    }
    label(g, 'TENSION', 246, 408, 5.5, '#657985', 'center'); label(g, 'N', 246, 382, 7, '#657985', 'center');
    label(g, 'WARP / 112', 245, 437, 7, '#687987', 'center');
    // Tension linkage and physically mounted sensor cable.
    line(g, [246, 346, 246, 313, 301, 313], '#5B6C7A', 5); line(g, [246, 346, 246, 313, 301, 313], '#C2CCC6', 2.5);
    // Worm shaft, drive motor and cooling fins.
    plate(g, 155, 800, 157, 57, true);
    for (let x = 167; x < 277; x += 7) metal(g, x, 810, 3, 35, true);
    circle(g, 290, 828, 13, '#D6DBD5', '#738594'); bolt(g, 290, 828, 5);
    metal(g, 219, 774, 12, 28, true); label(g, 'SERVO / KM–01', 163, 875, 8, '#7B8991');
    // Lower take-up roller bearing boxes and feet.
    plate(g, 305, 851, 928, 23, false);
    metal(g, 332, 826, 877, 27);
    for (const x of [315, 1227]) bearing(g, x, 840, 21);
    rect(g, 680, 856, 167, 16, C.navy, 2);
    label(g, 'K U N L U N M E T A', 764, 867, 8, '#EEEFE9', 'center');
    for (const [y, name] of [[489, 'SERVO A'], [601, 'SERVO B'], [719, 'SERVO R']] as const) label(g, name, 1300, y + 4, 6.5, '#8B969A');
    label(g, 'PICKS', 1271, 842, 7, '#8A959A');
  });
}

export function heddle(width = 906, rear = false) {
  return surface(width + 20, 57, g => {
    for (let i = 0; i < WEAVE.ends / 2; i++) {
      const x = 45 + i * 2 * 822 / (WEAVE.ends - 1);
      line(g, [x, 18, x, 52], rear ? '#7D8B9370' : '#A3AEA6', .65);
      line(g, [x + .7, 18, x + .7, 52], '#FFFFFF80', .4);
    }
    rect(g, 8, 19, width, 12, '#171C601C', 2);
    metal(g, 7, 11, width, 12);
    line(g, [12, 15, width, 15], rear ? '#97A7AA' : '#F9FAF6', 1);
    for (const x of [15, width - 6]) { plate(g, x - 11, 3, 24, 30, false, false); bolt(g, x + 1, 18, 4); }
    for (let x = 64; x < width - 20; x += 86) bolt(g, x, 17, 2);
    label(g, rear ? 'II' : 'I', 32, 20, 7, '#65788A');
  });
}

export function reed() {
  return surface(930, 75, g => {
    rect(g, 10, 46, 910, 15, '#171C6025', 2);
    for (let x = 47; x < 879; x += 832 / WEAVE.ends) { line(g, [x, 7, x, 42], '#5A6D7A', .8); line(g, [x + .9, 7, x + .9, 42], '#FFFFFFA0', .5); }
    metal(g, 7, 3, 912, 9); metal(g, 7, 38, 912, 13);
    for (const x of [19, 905]) { plate(g, x - 12, 0, 26, 55, false, false); bolt(g, x, 12, 4); bolt(g, x, 43, 4); }
    rect(g, 420, 39, 88, 10, C.navy, 1); label(g, 'R E E D  /  112', 464, 46, 5.5, '#F8F7ED', 'center');
  });
}

export function shuttle() {
  const s = surface(112, 37, g => {
    poly(g, [3, 20, 24, 5, 87, 5, 109, 20, 87, 33, 24, 33], '#171C6027');
    poly(g, [2, 16, 22, 2, 87, 2, 108, 16, 87, 28, 22, 28], '#8E7A5D', '#5B5E62');
    poly(g, [6, 14, 25, 3, 85, 3, 103, 14, 85, 23, 25, 23], '#D1B992', '#F8E4BA');
    rect(g, 27, 6, 53, 15, '#3D5260', 7); metal(g, 29, 11, 49, 4);
    rect(g, 39, 6, 29, 14, C.teal, 5, '#22767A');
    for (let x = 42; x < 68; x += 2.2) line(g, [x, 7, x - 2, 19], '#DFEDCB90', .7);
    bolt(g, 19, 14, 2.4); bolt(g, 89, 14, 2.4);
  }); s.anchor.set(.5, .405); return s;
}
