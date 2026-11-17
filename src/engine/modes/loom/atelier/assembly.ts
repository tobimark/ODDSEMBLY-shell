import { C, bearing, bolt, circle, label, line, metal, plate, poly, rect, surface, type Pen } from './drawing';
import { FINISH as F } from './finish';
import { WEAVE, YARNS } from './textile';

function bobbin(g: Pen, x: number, y: number, color: string, n: number) {
  metal(g, x - 3, y - 14, 6, 84, true);
  rect(g,x-15,y,30,52,color,3,F.edge);
  for(let j=2;j<51;j+=1.7) {
    line(g,[x-13,y+j+.4,x+13,y+j-.4],F.paper,.32);
    line(g,[x-11,y+j+.9,x+11,y+j+.1],F.paper,.45);
  }
  line(g,[x-12,y+2,x-12,y+49],F.fine,.5);
  metal(g, x - 20, y - 5, 40, 7); metal(g, x - 20, y + 49, 40, 7);
  circle(g, x, y - 11, 4.5, '#DADFD8', '#83909A', .6);
  label(g, String(n + 1).padStart(2, '0'), x, y + 74, 7, '#73818A', 'center');
}

/** Exhibition sheet: paper, registration marks and catalogue captions only.
 *  The machine itself lives on loomPlate() so it can be moved by the camera. */
export function sheetBase() {
  return surface(1472, 1008, g => {
    rect(g, 0, 0, 1472, 1008, C.paper);
    // Quiet exhibition sheet: only two registration rules and the brand line.
    // The 24px dot grid and 9px catalogue captions were unreadable at 730px and
    // read as noise; they are removed rather than redrawn.
    line(g, [40, 104, 1432, 104], '#AAB1B251', .7);
    line(g, [40, 990, 1432, 990], '#AAB1B251', .7);

  });
}

/** The loom machine only (transparent): baked at design coordinates, moved by
 *  the scene camera to make room for the event-scale instrument on the left. */
export function loomPlate() {
  return surface(1472, 1008, g => {
    // Open machine bed: local joints provide depth; no full-panel shadow slab.
    rect(g,333,263,886,594,F.enamel,0,F.fine);
    g.beginPath(); g.roundRect(332.5, 262.5, 887, 595, 2); g.strokeStyle = '#6D7A80'; g.lineWidth = 1.8; g.stroke();
    rect(g,345,276,850,580,F.paper);
    // Rear cross braces remain behind the translucent warp sheets.
    poly(g, [336, 813, 347, 813, 1207, 332, 1207, 344], '#B2B9B229');
    poly(g, [340, 333, 351, 329, 1204, 813, 1198, 823], '#B2B9B222');
    for (const x of [311, 1222]) {
      plate(g, x - 26, 254, 52, 612, true);
      rect(g,x-24,279,11,562,C.navy,2);
      line(g,[x-12,279,x-12,841],'#65738A',1);
      // Recessed guide bed separates the load-bearing shell from the precision rail.
      rect(g,x-9,285,18,548,F.steel,2,F.fine);
      line(g,[x-22,278,x-22,844],F.muted,.75);
      metal(g, x - 5, 292, 10, 535, true);
      for (let y = 315; y < 820; y += 50) { rect(g, x - 21, y, 6, 17, F.recess, 3, F.fine); bolt(g, x + 17, y + 8, 2.4); }
      plate(g, x - 37, 859, 78, 24, true);
      for (const yy of [383, 490, 609]) { plate(g, x - 15, yy, 30, 29, false, false); bolt(g, x, yy + 14, 4); }
    }
    // Rear top rail and creel with sixteen independently wound yarn packages.
    for(const x of [314,1225]) {
      plate(g,x-5,139,10,104,false,false);
      bolt(g,x,153,2);bolt(g,x,226,2);
      plate(g,x-13,230,26,14,false,false);
    }
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
    // Separate drive cassette: moved left with the flywheel/gears, leaving a
    // real gap to the loom frame. Two rails re-connect it as an outboard unit.
    plate(g, 106, 483, 148, 303, false);
    rect(g, 118, 494, 124, 282, F.enamel, 12, F.fine);
    metal(g, 155, 497, 13, 278, true);
    for (const y of [509, 566, 725]) bearing(g, 161, y, 13);
    // A single small tension instrument built into the drive housing.
    plate(g, 135, 346, 100, 103, false);
    circle(g, 186, 393, 35, F.steel, F.edge); circle(g, 186, 392, 31, '#F9F7ED', '#FFFFFF', 1.5);
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI * .75 + i / 24 * Math.PI * 1.5;
      line(g, [186 + Math.cos(a) * (i % 4 ? 26 : 23), 392 + Math.sin(a) * (i % 4 ? 26 : 23), 186 + Math.cos(a) * 28, 392 + Math.sin(a) * 28], '#5A6979', .7);
    }
    label(g, 'TENSION', 186, 408, 5.5, '#657985', 'center'); label(g, 'N', 186, 382, 7, '#657985', 'center');
    label(g, 'WARP / 112', 185, 437, 7, '#687987', 'center');
    // Worm shaft, drive motor and cooling fins.
    plate(g, 95, 800, 157, 57, true);
    for (let x = 107; x < 217; x += 7) metal(g, x, 810, 3, 35, true);
    circle(g, 230, 828, 13, '#D6DBD5', '#738594'); bolt(g, 230, 828, 5);
    metal(g, 159, 774, 12, 28, true); label(g, 'SERVO / KM–01', 103, 875, 8, '#7B8991');
    // Tension gauge measurement tube: gauge right edge -> loom left frame.
    // A short rigid capillary, clamped once; it must not float in the gap.
    line(g, [236, 382, 333, 382], '#5B6C7A', 5); line(g, [236, 382, 333, 382], '#D9D6C7', 2.2);
    plate(g, 296, 374, 16, 16, false); bolt(g, 300, 378, 2); bolt(g, 308, 378, 2);
    // upper link is now a driven output shaft, not a rail: gearbox bearing ->
    // flexible coupling -> output bearing -> loom frame. The lower rail stays.
    plate(g, 254, 514, 24, 34, false); bolt(g, 260, 520, 2.2); bolt(g, 272, 520, 2.2);
    bearing(g, 267, 530, 12);
    metal(g, 276, 526, 56, 8, true);
    for (const y of [522, 538]) { circle(g, 293, y, 4, F.steel, F.edge); bolt(g, 293, y, 1.6); }
    bearing(g, 326, 530, 11);
    line(g, [270, 530, 336, 530], '#2C3340', 1.6);
    metal(g, 333, 526, 8, 8, true);
    // U-guard over the gear-to-shaft take-off (necessary, not decorative)
    line(g, [246, 548, 246, 566, 292, 566], '#5B6C7A', 2.2);
    plate(g, 242, 544, 10, 26, false);
    // lower structural rail remains the only second connection
    metal(g, 254, 742, 62, 9, true); bolt(g, 260, 746, 2.4); bolt(g, 309, 746, 2.4);
    // Lower take-up roller bearing boxes and feet.
    plate(g, 305, 851, 928, 23, false);
    metal(g, 332, 826, 877, 27);
    for (const x of [315, 1227]) bearing(g, x, 840, 21);
    rect(g, 680, 856, 167, 16, C.navy, 2);
    label(g, 'O D D S E M B L Y', 764, 867, 8, '#7A6F62', 'center');
    for (const [y, name] of [[489, 'SERVO A'], [601, 'SERVO B'], [719, 'SERVO R']] as const) label(g, name, 1188, y + 4, 6.5, '#8A8174');
    label(g, 'PICKS', 1238, 842, 7, '#8A8174');
  });
}

export function heddle(width = 906, rear = false) {
  return surface(width + 20, 57, g => {
    for (let i = 0; i < WEAVE.ends / 2; i++) {
      const x = 45 + i * 2 * 822 / (WEAVE.ends - 1);
      line(g, [x, 18, x, 52], rear ? '#7D8B9370' : '#A3AEA6', .65);
      line(g, [x + .7, 18, x + .7, 52], '#FFFFFF80', .4);
    }
    rect(g, 8, 19, width, 12, F.shadow, 2);
    metal(g, 7, 11, width, 12);
    line(g, [12, 15, width, 15], rear ? '#97A7AA' : '#F9FAF6', 1);
    for (const x of [15, width - 6]) { plate(g, x - 11, 3, 24, 30, false, false); bolt(g, x + 1, 18, 4); }
    for (let x = 64; x < width - 20; x += 86) bolt(g, x, 17, 2);
    label(g, rear ? 'II' : 'I', 32, 20, 7, '#65788A');
  });
}

export function reed() {
  return surface(930, 75, g => {
    rect(g, 10, 46, 910, 15, F.shadow, 2);
    for (let x = 47; x < 879; x += 832 / WEAVE.ends) { line(g, [x, 7, x, 42], '#5A6D7A', .8); line(g, [x + .9, 7, x + .9, 42], '#FFFFFFA0', .5); }
    metal(g, 7, 3, 912, 9); metal(g, 7, 38, 912, 13);
    for (const x of [19, 905]) { plate(g, x - 12, 0, 26, 55, false, false); bolt(g, x, 12, 4); bolt(g, x, 43, 4); }
    rect(g, 420, 39, 88, 10, C.navy, 1); label(g, 'R E E D  /  112', 464, 46, 5.5, '#7A6F62', 'center');
  });
}

export function shuttle() {
  const s = surface(112, 37, g => {
    poly(g, [3, 20, 24, 5, 87, 5, 109, 20, 87, 33, 24, 33], '#7A6F6227');
    poly(g, [2, 16, 22, 2, 87, 2, 108, 16, 87, 28, 22, 28], F.steel, F.muted);
    poly(g, [6, 14, 25, 3, 85, 3, 103, 14, 85, 23, 25, 23], F.enamel, F.edge);
    rect(g, 27, 6, 53, 15, F.recess, 7); metal(g, 29, 11, 49, 4);
    rect(g, 39, 6, 29, 14, C.teal, 5, '#22767A');
    for (let x = 42; x < 68; x += 2.2) line(g, [x, 7, x - 2, 19], '#DFEDCB90', .7);
    bolt(g, 19, 14, 2.4); bolt(g, 89, 14, 2.4);
  }); s.anchor.set(.5, .405); return s;
}
