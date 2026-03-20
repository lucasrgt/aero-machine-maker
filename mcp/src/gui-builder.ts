/**
 * GUI Texture Builder — TypeScript port of gui_builder.py
 * Generates pixel-perfect 256x256 RGBA PNGs for Minecraft Beta 1.7.3 GUIs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import type { GuiComponent } from './types.js';

// === PALETTE (RGBA tuples) ===
type Color = [number, number, number, number];

const T:       Color = [0, 0, 0, 0];           // transparent
const BK:      Color = [0, 0, 0, 255];          // black (outer border)
const WH:      Color = [255, 255, 255, 255];    // white (highlight)
const BG:      Color = [198, 198, 198, 255];    // background fill
const DK:      Color = [85, 85, 85, 255];       // dark gray (shadow)
const SD:      Color = [55, 55, 55, 255];       // slot dark border
const SL:      Color = [139, 139, 139, 255];    // slot inner fill
const GY:      Color = [104, 104, 104, 255];    // gray (arrow shadow)
const BAR_BG:  Color = [64, 64, 64, 255];       // energy bar empty
const TANK_BG: Color = [120, 120, 120, 255];    // fluid/gas tank empty
const GAUGE:   Color = [86, 0, 1, 255];         // tank gauge marks (bordeaux)

class GuiBuilder {
  private width: number;
  private height: number;
  private data: Uint8Array;
  private _furnace: PNG | null = null;
  private projectRoot: string;

  constructor(projectRoot: string, width = 256, height = 256) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4); // initialized to 0 (transparent)
    this.projectRoot = projectRoot;
  }

  private putPixel(x: number, y: number, color: Color): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    this.data[idx]     = color[0];
    this.data[idx + 1] = color[1];
    this.data[idx + 2] = color[2];
    this.data[idx + 3] = color[3];
  }

  private fillRect(x1: number, y1: number, x2: number, y2: number, color: Color): void {
    for (let py = y1; py <= y2; py++) {
      for (let px = x1; px <= x2; px++) {
        this.putPixel(px, py, color);
      }
    }
  }

  private getFurnace(): PNG {
    if (this._furnace === null) {
      const furnacePath = path.join(this.projectRoot, 'temp', 'merged', 'gui', 'furnace.png');
      const buffer = fs.readFileSync(furnacePath);
      this._furnace = PNG.sync.read(buffer);
    }
    return this._furnace;
  }

  /**
   * Paste a cropped region from a source PNG onto this image.
   * srcRect: [x1, y1, x2, y2] (x2/y2 exclusive, like PIL crop)
   */
  private paste(src: PNG, srcRect: [number, number, number, number], destX: number, destY: number): void {
    const [sx1, sy1, sx2, sy2] = srcRect;
    for (let sy = sy1; sy < sy2; sy++) {
      for (let sx = sx1; sx < sx2; sx++) {
        const srcIdx = (sy * src.width + sx) * 4;
        const a = src.data[srcIdx + 3];
        if (a === 0) continue; // skip transparent
        const dx = destX + (sx - sx1);
        const dy = destY + (sy - sy1);
        this.putPixel(dx, dy, [
          src.data[srcIdx],
          src.data[srcIdx + 1],
          src.data[srcIdx + 2],
          a,
        ]);
      }
    }
  }

  // =========================================================================
  // PANEL - main GUI background with Minecraft 3D beveled border
  // =========================================================================
  panel(x: number, y: number, w: number, h: number): this {
    // Pixel-perfect MC Beta 1.7.3 GUI panel — extracted from furnace.png
    //
    // Legend from furnace.png pixel dump:
    //   y=0: .. .. BK BK BK ... BK BK .. .. ..
    //   y=1: .. BK WH WH WH ... WH WH BK .. ..
    //   y=2: BK WH WH WH WH ... WH WH BG BK ..
    //   y=3: BK WH WH WH BG ... BG DK DK BK
    //   y=4: BK WH WH BG BG ... BG DK DK BK
    //   ...
    //   b-4: BK WH WH BG BG ... BG DK DK BK
    //   b-3: .. BK BG DK DK ... DK DK DK BK
    //   b-2: .. .. BK DK DK ... DK DK BK ..
    //   b-1: .. .. .. BK BK ... BK BK .. ..

    const r = x + w - 1;  // right edge x
    const b = y + h - 1;  // bottom edge y

    // 1. Fill background (all interior)
    this.fillRect(x + 4, y + 4, r - 4, b - 4, BG);

    // 2. Row y+0: .. .. BK*all BK .. ..
    for (let px = x + 2; px <= r - 3; px++) this.putPixel(px, y, BK);

    // 3. Row y+1: .. BK WH*all BK ..
    this.putPixel(x + 1, y + 1, BK);
    for (let px = x + 2; px <= r - 3; px++) this.putPixel(px, y + 1, WH);
    this.putPixel(r - 2, y + 1, BK);

    // 4. Row y+2: BK WH WH*all BG BK
    this.putPixel(x, y + 2, BK);
    this.putPixel(x + 1, y + 2, WH);
    for (let px = x + 2; px <= r - 4; px++) this.putPixel(px, y + 2, WH);
    this.putPixel(r - 3, y + 2, WH);
    this.putPixel(r - 2, y + 2, BG);
    this.putPixel(r - 1, y + 2, BK);

    // 5. Row y+3: BK WH WH WH BG... BG DK DK BK
    this.putPixel(x, y + 3, BK);
    this.putPixel(x + 1, y + 3, WH);
    this.putPixel(x + 2, y + 3, WH);
    this.putPixel(x + 3, y + 3, WH);
    for (let px = x + 4; px <= r - 3; px++) this.putPixel(px, y + 3, BG);
    this.putPixel(r - 2, y + 3, DK);
    this.putPixel(r - 1, y + 3, DK);
    this.putPixel(r, y + 3, BK);

    // 6. Rows y+4 to b-5: BK WH WH BG... BG DK DK BK
    for (let py = y + 4; py <= b - 5; py++) {
      this.putPixel(x, py, BK);
      this.putPixel(x + 1, py, WH);
      this.putPixel(x + 2, py, WH);
      for (let px = x + 3; px <= r - 3; px++) this.putPixel(px, py, BG);
      this.putPixel(r - 2, py, DK);
      this.putPixel(r - 1, py, DK);
      this.putPixel(r, py, BK);
    }

    // 7. Row b-4: same as middle rows
    this.putPixel(x, b - 4, BK);
    this.putPixel(x + 1, b - 4, WH);
    this.putPixel(x + 2, b - 4, WH);
    for (let px = x + 3; px <= r - 3; px++) this.putPixel(px, b - 4, BG);
    this.putPixel(r - 2, b - 4, DK);
    this.putPixel(r - 1, b - 4, DK);
    this.putPixel(r, b - 4, BK);

    // 8. Row b-3: BK WH WH BG...BG DK DK DK BK  (furnace y=162)
    this.putPixel(x, b - 3, BK);
    this.putPixel(x + 1, b - 3, WH);
    this.putPixel(x + 2, b - 3, WH);
    for (let px = x + 3; px <= r - 4; px++) this.putPixel(px, b - 3, BG);
    this.putPixel(r - 3, b - 3, DK);
    this.putPixel(r - 2, b - 3, DK);
    this.putPixel(r - 1, b - 3, DK);
    this.putPixel(r, b - 3, BK);

    // 9. Row b-2: .. BK BG DK...DK DK DK BK  (furnace y=163)
    this.putPixel(x + 1, b - 2, BK);
    this.putPixel(x + 2, b - 2, BG);
    for (let px = x + 3; px <= r - 1; px++) this.putPixel(px, b - 2, DK);
    this.putPixel(r, b - 2, BK);

    // 10. Row b-1: .. .. BK DK...DK BK ..  (furnace y=164)
    this.putPixel(x + 2, b - 1, BK);
    for (let px = x + 3; px <= r - 2; px++) this.putPixel(px, b - 1, DK);
    this.putPixel(r - 1, b - 1, BK);

    // 11. Row b: .. .. .. BK...BK .. ..  (furnace y=165)
    for (let px = x + 3; px <= r - 2; px++) this.putPixel(px, b, BK);

    return this;
  }

  // =========================================================================
  // SLOT - standard 18x18 inventory slot
  // =========================================================================
  slot(x: number, y: number): this {
    for (let px = x; px < x + 17; px++) { this.putPixel(px, y, SD); }       // top border
    for (let py = y; py < y + 17; py++) { this.putPixel(x, py, SD); }       // left border
    for (let px = x; px < x + 18; px++) { this.putPixel(px, y + 17, WH); } // bottom border
    for (let py = y; py < y + 18; py++) { this.putPixel(x + 17, py, WH); } // right border
    this.putPixel(x + 17, y, SL); // top-right corner
    this.fillRect(x + 1, y + 1, x + 16, y + 16, SL); // inner fill
    return this;
  }

  slotRow(x: number, y: number, count: number): this {
    for (let i = 0; i < count; i++) { this.slot(x + i * 18, y); }
    return this;
  }

  slotGrid(x: number, y: number, cols: number, rows: number): this {
    for (let r = 0; r < rows; r++) { this.slotRow(x, y + r * 18, cols); }
    return this;
  }

  playerInventory(x: number, y: number): this {
    this.slotGrid(x, y, 9, 3);
    this.slotRow(x, y + 58, 9);
    return this;
  }

  // =========================================================================
  // ENERGY BAR
  // =========================================================================
  energyBar(x: number, y: number, w: number, h: number): this {
    for (let px = x; px < x + w - 1; px++) { this.putPixel(px, y, SD); }       // top
    for (let py = y; py < y + h - 1; py++) { this.putPixel(x, py, SD); }       // left
    for (let px = x; px < x + w; px++) { this.putPixel(px, y + h - 1, WH); }   // bottom
    for (let py = y; py < y + h; py++) { this.putPixel(x + w - 1, py, WH); }   // right
    this.putPixel(x + w - 1, y, SL);
    this.fillRect(x + 1, y + 1, x + w - 2, y + h - 2, BAR_BG);
    return this;
  }

  // =========================================================================
  // PROGRESS ARROW (supports 4 directions)
  // =========================================================================

  /**
   * Extract a rectangular region from a PNG into a [w×h] RGBA buffer.
   */
  private extractRegion(src: PNG, srcRect: [number, number, number, number]): { data: Uint8Array; w: number; h: number } {
    const [sx1, sy1, sx2, sy2] = srcRect;
    const w = sx2 - sx1, h = sy2 - sy1;
    const buf = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((sy1 + y) * src.width + (sx1 + x)) * 4;
        const di = (y * w + x) * 4;
        buf[di] = src.data[si]; buf[di + 1] = src.data[si + 1]; buf[di + 2] = src.data[si + 2]; buf[di + 3] = src.data[si + 3];
      }
    }
    return { data: buf, w, h };
  }

  /**
   * Rotate a pixel buffer by 90° CW increments and paste onto the image.
   * rotations: 0=right(default), 1=down, 2=left, 3=up
   */
  private pasteRotated(region: { data: Uint8Array; w: number; h: number }, destX: number, destY: number, rotations: number): void {
    const { data, w, h } = region;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const a = data[si + 3];
        if (a === 0) continue;
        let dx: number, dy: number;
        switch (rotations % 4) {
          case 0: dx = x; dy = y; break;                // right (original)
          case 1: dx = h - 1 - y; dy = x; break;        // down (90° CW)
          case 2: dx = w - 1 - x; dy = h - 1 - y; break;// left (180°)
          case 3: dx = y; dy = w - 1 - x; break;        // up (270° CW)
          default: dx = x; dy = y;
        }
        this.putPixel(destX + dx, destY + dy, [data[si], data[si + 1], data[si + 2], a]);
      }
    }
  }

  progressArrow(x: number, y: number, direction: 'right' | 'left' | 'up' | 'down' = 'right', spriteX = 176, spriteY = 14): this {
    const furnace = this.getFurnace();
    const rotMap = { right: 0, down: 1, left: 2, up: 3 };
    const rot = rotMap[direction];

    // Extract empty arrow (24x17) and filled arrow (24x17) from furnace.png
    const empty = this.extractRegion(furnace, [79, 34, 103, 51]);
    const filled = this.extractRegion(furnace, [176, 14, 200, 31]);

    // Paste rotated empty arrow in the main GUI area
    this.pasteRotated(empty, x, y, rot);
    // Paste rotated filled arrow in the sprite area (for animation overlay)
    this.pasteRotated(filled, spriteX, spriteY, rot);
    return this;
  }

  // =========================================================================
  // FLAME
  // =========================================================================
  flame(x: number, y: number, spriteX = 176, spriteY = 0): this {
    const furnace = this.getFurnace();
    // Empty flame in main area
    this.paste(furnace, [56, 36, 70, 50], x, y);
    // Filled flame in sprite area
    this.paste(furnace, [176, 0, 190, 14], spriteX, spriteY);
    return this;
  }

  // =========================================================================
  // BIG SLOT - 26x26
  // =========================================================================
  bigSlot(x: number, y: number): this {
    for (let px = x; px < x + 25; px++) { this.putPixel(px, y, SD); }       // top
    for (let py = y; py < y + 25; py++) { this.putPixel(x, py, SD); }       // left
    for (let px = x; px < x + 26; px++) { this.putPixel(px, y + 25, WH); } // bottom
    for (let py = y; py < y + 26; py++) { this.putPixel(x + 25, py, WH); } // right
    this.putPixel(x + 25, y, SL);
    this.fillRect(x + 1, y + 1, x + 24, y + 24, SL);
    return this;
  }

  // =========================================================================
  // TANK (fluid / gas)
  // =========================================================================
  private tankBar(x: number, y: number, w: number, h: number): void {
    for (let px = x; px < x + w - 1; px++) { this.putPixel(px, y, SD); }
    for (let py = y; py < y + h - 1; py++) { this.putPixel(x, py, SD); }
    for (let px = x; px < x + w; px++) { this.putPixel(px, y + h - 1, WH); }
    for (let py = y; py < y + h; py++) { this.putPixel(x + w - 1, py, WH); }
    this.putPixel(x + w - 1, y, SL);
    this.fillRect(x + 1, y + 1, x + w - 2, y + h - 2, TANK_BG);
  }

  private drawTankGauge(x: number, y: number, w: number, h: number): void {
    const totalLines = Math.floor(h / 5) - 1;
    if (totalLines < 1) return;
    const halfW = Math.floor(w / 2);
    for (let i = 1; i <= totalLines; i++) {
      const ly = y + Math.floor(h * i / (totalLines + 1));
      const lineW = (i % 5 === 0) ? w : halfW;
      for (let px = x; px < x + lineW; px++) {
        this.putPixel(px, ly, GAUGE);
      }
    }
  }

  fluidTank(x: number, y: number, w = 18, h = 54): this {
    this.tankBar(x, y, w, h);
    this.drawTankGauge(x + 1, y + 1, w - 2, h - 2);
    return this;
  }

  gasTank(x: number, y: number, w = 18, h = 54): this {
    this.tankBar(x, y, w, h);
    this.drawTankGauge(x + 1, y + 1, w - 2, h - 2);
    return this;
  }

  // =========================================================================
  // SCROLLBAR TAB LEFT — external tab on the LEFT edge, right side open
  // =========================================================================
  scrollbarTabLeft(x: number, y: number, w: number, h: number, spriteX = 176): this {
    const r = x + w - 1;
    const b = y + h - 1;

    // Same as furnace left corners, right edge open
    // y+0: .. .. BK...BK ..
    for (let px = x + 2; px <= r - 2; px++) this.putPixel(px, y, BK);
    // y+1: .. BK WH...WH WH (extend 1px)
    this.putPixel(x + 1, y + 1, BK);
    for (let px = x + 2; px <= r - 1; px++) this.putPixel(px, y + 1, WH);
    // y+2: BK WH WH...WH WH (extend 1px into panel)
    this.putPixel(x, y + 2, BK);
    for (let px = x + 1; px <= r; px++) this.putPixel(px, y + 2, WH);
    // y+3: BK WH WH WH BG...BG BG (extend 1px)
    this.putPixel(x, y + 3, BK);
    this.putPixel(x + 1, y + 3, WH);
    this.putPixel(x + 2, y + 3, WH);
    this.putPixel(x + 3, y + 3, WH);
    for (let px = x + 4; px <= r + 1; px++) this.putPixel(px, y + 3, BG);
    // y+4 to b-4: BK WH WH BG...BG BG (extend 1px)
    for (let py = y + 4; py <= b - 4; py++) {
      this.putPixel(x, py, BK);
      this.putPixel(x + 1, py, WH);
      this.putPixel(x + 2, py, WH);
      for (let px = x + 3; px <= r + 1; px++) this.putPixel(px, py, BG);
    }
    // b-3: BK WH WH BG...BG BG
    this.putPixel(x, b - 3, BK);
    this.putPixel(x + 1, b - 3, WH);
    this.putPixel(x + 2, b - 3, WH);
    for (let px = x + 3; px <= r + 1; px++) this.putPixel(px, b - 3, BG);
    // b-2: .. BK BG DK...DK
    this.putPixel(x + 1, b - 2, BK);
    this.putPixel(x + 2, b - 2, BG);
    for (let px = x + 3; px <= r - 1; px++) this.putPixel(px, b - 2, DK);
    // b-1: .. .. BK DK...DK
    this.putPixel(x + 2, b - 1, BK);
    for (let px = x + 3; px <= r - 2; px++) this.putPixel(px, b - 1, DK);
    // b: .. .. .. BK...BK
    for (let px = x + 3; px <= r - 3; px++) this.putPixel(px, b, BK);

    // Inner track
    const trackX = x + 4;
    const trackY = y + 4;
    const trackW = w - 7;
    const trackH = h - 8;
    for (let px = trackX; px < trackX + trackW - 1; px++) this.putPixel(px, trackY, SD);
    for (let py = trackY; py < trackY + trackH - 1; py++) this.putPixel(trackX, py, SD);
    for (let px = trackX; px < trackX + trackW; px++) this.putPixel(px, trackY + trackH - 1, WH);
    for (let py = trackY; py < trackY + trackH; py++) this.putPixel(trackX + trackW - 1, py, WH);
    this.putPixel(trackX + trackW - 1, trackY, SL);
    this.fillRect(trackX + 1, trackY + 1, trackX + trackW - 2, trackY + trackH - 2, SL);

    // Thumb sprite
    const thumbH = 15;
    this.fillRect(spriteX, 0, spriteX + trackW - 1, thumbH - 1, BG);
    for (let px = spriteX; px < spriteX + trackW; px++) this.putPixel(px, 0, WH);
    for (let py = 0; py < thumbH; py++) this.putPixel(spriteX, py, WH);
    for (let px = spriteX; px < spriteX + trackW; px++) this.putPixel(px, thumbH - 1, DK);
    for (let py = 0; py < thumbH; py++) this.putPixel(spriteX + trackW - 1, py, DK);

    return this;
  }

  // =========================================================================
  // SEARCH BOX — inset text field with dark interior
  // =========================================================================
  searchBox(x: number, y: number, w: number, h = 12, light = false): this {
    // Outer border (inset style, like slots)
    for (let px = x; px < x + w - 1; px++) { this.putPixel(px, y, SD); }       // top (dark)
    for (let py = y; py < y + h - 1; py++) { this.putPixel(x, py, SD); }       // left (dark)
    for (let px = x; px < x + w; px++) { this.putPixel(px, y + h - 1, WH); }   // bottom (light)
    for (let py = y; py < y + h; py++) { this.putPixel(x + w - 1, py, WH); }   // right (light)
    this.putPixel(x + w - 1, y, SL);
    // Interior
    const interior: Color = light ? [96, 96, 96, 255] : BK;
    this.fillRect(x + 1, y + 1, x + w - 2, y + h - 2, interior);
    return this;
  }

  // =========================================================================
  // SCROLLBAR — track with draggable thumb
  // =========================================================================
  scrollbar(x: number, y: number, w = 6, h = 108, spriteX = 176): this {
    // Track (inset style)
    for (let px = x; px < x + w - 1; px++) { this.putPixel(px, y, SD); }
    for (let py = y; py < y + h - 1; py++) { this.putPixel(x, py, SD); }
    for (let px = x; px < x + w; px++) { this.putPixel(px, y + h - 1, WH); }
    for (let py = y; py < y + h; py++) { this.putPixel(x + w - 1, py, WH); }
    this.putPixel(x + w - 1, y, SL);
    this.fillRect(x + 1, y + 1, x + w - 2, y + h - 2, SL);

    // Thumb sprite in sprite area (raised button, 15px tall)
    const thumbH = 15;
    const sy = y; // store at same Y as component in sprite area
    // Thumb background
    this.fillRect(spriteX, 0, spriteX + w - 1, thumbH - 1, BG);
    // Thumb highlight (top + left)
    for (let px = spriteX; px < spriteX + w; px++) { this.putPixel(px, 0, WH); }
    for (let py = 0; py < thumbH; py++) { this.putPixel(spriteX, py, WH); }
    // Thumb shadow (bottom + right)
    for (let px = spriteX; px < spriteX + w; px++) { this.putPixel(px, thumbH - 1, DK); }
    for (let py = 0; py < thumbH; py++) { this.putPixel(spriteX + w - 1, py, DK); }

    return this;
  }

  // =========================================================================
  // SCROLLBAR TAB — external tab-style scrollbar on the right edge
  // Extends OUTSIDE the main panel, with MC 3D beveled border like RetroNism tabs
  // =========================================================================
  scrollbarTab(x: number, y: number, w: number, h: number, spriteX = 176): this {
    // Pixel-perfect tab extending right from panel edge.
    // Left edge open (merges with panel). Right side has furnace-style rounded corners.
    // Uses same corner pattern as panel() but mirrored: no left border.
    const r = x + w - 1;  // right edge
    const b = y + h - 1;  // bottom edge

    // Row y+0: .. .. BK...BK .. ..  (left edge transparent)
    for (let px = x + 2; px <= r - 3; px++) this.putPixel(px, y, BK);

    // Row y+1: .. WH...WH BK ..
    for (let px = x + 1; px <= r - 3; px++) this.putPixel(px, y + 1, WH);
    this.putPixel(r - 2, y + 1, BK);

    // Row y+2: .. WH...WH BG BK
    for (let px = x + 1; px <= r - 3; px++) this.putPixel(px, y + 2, WH);
    this.putPixel(r - 2, y + 2, BG);
    this.putPixel(r - 1, y + 2, BK);

    // Row y+3: BG BG BG...BG DK DK BK
    for (let px = x; px <= r - 3; px++) this.putPixel(px, y + 3, BG);
    this.putPixel(r - 2, y + 3, DK);
    this.putPixel(r - 1, y + 3, DK);
    this.putPixel(r, y + 3, BK);

    // Rows y+4 to b-4: BG BG...BG DK DK BK
    for (let py = y + 4; py <= b - 4; py++) {
      for (let px = x; px <= r - 3; px++) this.putPixel(px, py, BG);
      this.putPixel(r - 2, py, DK);
      this.putPixel(r - 1, py, DK);
      this.putPixel(r, py, BK);
    }

    // Row b-3: BG BG...BG DK DK DK BK
    for (let px = x; px <= r - 4; px++) this.putPixel(px, b - 3, BG);
    this.putPixel(r - 3, b - 3, DK);
    this.putPixel(r - 2, b - 3, DK);
    this.putPixel(r - 1, b - 3, DK);
    this.putPixel(r, b - 3, BK);

    // Row b-2: .. DK...DK BK  (left edge transparent)
    for (let px = x + 1; px <= r - 1; px++) this.putPixel(px, b - 2, DK);
    this.putPixel(r, b - 2, BK);

    // Row b-1: .. .. DK...DK BK
    for (let px = x + 2; px <= r - 2; px++) this.putPixel(px, b - 1, DK);
    this.putPixel(r - 1, b - 1, BK);

    // Row b: .. .. .. BK...BK
    for (let px = x + 3; px <= r - 2; px++) this.putPixel(px, b, BK);

    // Inner track area
    const trackX = x + 3;
    const trackY = y + 4;
    const trackW = w - 7;
    const trackH = h - 8;
    for (let px = trackX; px < trackX + trackW - 1; px++) this.putPixel(px, trackY, SD);
    for (let py = trackY; py < trackY + trackH - 1; py++) this.putPixel(trackX, py, SD);
    for (let px = trackX; px < trackX + trackW; px++) this.putPixel(px, trackY + trackH - 1, WH);
    for (let py = trackY; py < trackY + trackH; py++) this.putPixel(trackX + trackW - 1, py, WH);
    this.putPixel(trackX + trackW - 1, trackY, SL);
    this.fillRect(trackX + 1, trackY + 1, trackX + trackW - 2, trackY + trackH - 2, SL);

    // Thumb sprite in sprite area
    const thumbH = 15;
    this.fillRect(spriteX, 0, spriteX + trackW - 1, thumbH - 1, BG);
    for (let px = spriteX; px < spriteX + trackW; px++) this.putPixel(px, 0, WH);
    for (let py = 0; py < thumbH; py++) this.putPixel(spriteX, py, WH);
    for (let px = spriteX; px < spriteX + trackW; px++) this.putPixel(px, thumbH - 1, DK);
    for (let py = 0; py < thumbH; py++) this.putPixel(spriteX + trackW - 1, py, DK);

    return this;
  }

  // =========================================================================
  // SEPARATOR
  // =========================================================================
  separator(x: number, y: number, w: number): this {
    for (let px = x; px < x + w; px++) {
      this.putPixel(px, y, SD);
      this.putPixel(px, y + 1, WH);
    }
    return this;
  }

  // =========================================================================
  // RECT
  // =========================================================================
  rect(x: number, y: number, w: number, h: number, color: Color): this {
    this.fillRect(x, y, x + w - 1, y + h - 1, color);
    return this;
  }

  // =========================================================================
  // SAVE
  // =========================================================================
  save(outputPath: string): string {
    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });

    const png = new PNG({ width: this.width, height: this.height });
    png.data = Buffer.from(this.data);
    const buffer = PNG.sync.write(png);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }
}

// =========================================================================
// PUBLIC API: generate GUI texture from components
// =========================================================================
export function generateGuiTexture(
  name: string,
  components: GuiComponent[],
  projectRoot: string,
  panelWidth = 176,
  panelHeight = 166,
): string {
  const gui = new GuiBuilder(projectRoot);
  gui.panel(0, 0, panelWidth, panelHeight);

  for (const comp of components) {
    switch (comp.type) {
      case 'slot':
        gui.slot(comp.x, comp.y);
        break;
      case 'big_slot':
        gui.bigSlot(comp.x, comp.y);
        break;
      case 'energy_bar':
        gui.energyBar(comp.x, comp.y, comp.w, comp.h);
        break;
      case 'progress_arrow':
        gui.progressArrow(comp.x, comp.y, comp.direction || 'right');
        break;
      case 'flame':
        gui.flame(comp.x, comp.y);
        break;
      case 'fluid_tank':
      case 'fluid_tank_small':
        gui.fluidTank(comp.x, comp.y, comp.w, comp.h);
        break;
      case 'gas_tank':
      case 'gas_tank_small':
        gui.gasTank(comp.x, comp.y, comp.w, comp.h);
        break;
      case 'separator':
        gui.separator(comp.x, comp.y, comp.w);
        break;
      case 'search_box':
        gui.searchBox(comp.x, comp.y, comp.w, comp.h, false);
        break;
      case 'search_box_light':
        gui.searchBox(comp.x, comp.y, comp.w, comp.h, true);
        break;
      case 'scrollbar':
        gui.scrollbar(comp.x, comp.y, comp.w, comp.h);
        break;
      case 'scrollbar_tab':
        gui.scrollbarTab(comp.x, comp.y, comp.w, comp.h);
        break;
      case 'scrollbar_tab_left':
        gui.scrollbarTabLeft(comp.x, comp.y, comp.w, comp.h);
        break;
    }
  }

  // Player inventory: centered horizontally, positioned relative to panel height
  const invX = Math.floor((panelWidth - 162) / 2);  // 162 = 9 slots × 18px
  const invY = panelHeight - 83;  // 83px from bottom = inventory area height (3 rows + gap + hotbar)
  gui.playerInventory(invX, invY);

  const outputPath = path.join(projectRoot, 'temp', 'merged', 'gui', `retronism_${name.toLowerCase()}.png`);
  gui.save(outputPath);
  return outputPath;
}
