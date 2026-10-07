export type FontName =
  | 'sans' | 'sans-bold' | 'sans-italic'
  | 'serif' | 'serif-bold' | 'serif-italic' | 'serif-bold-italic'
  | 'mono' | 'mono-bold';

type Paint = { fill?: string; stroke?: string; sw?: number; opacity?: number };

/** Corner radii [top-left, top-right, bottom-right, bottom-left]. */
export type Corners = [number, number, number, number];

/** All coordinates are in points, origin = TOP-LEFT of the page (y grows downward). */
export type El =
  | ({ t: 'rect'; x: number; y: number; w: number; h: number; r?: number | Corners } & Paint)
  | ({
      t: 'grad'; x: number; y: number; w: number; h: number;
      /** colors sampled evenly along the gradient; #rrggbb, #rrggbbaa or "transparent" */
      colors: string[];
      dir?: 'h' | 'v';
      r?: number | Corners;
      steps?: number;
      opacity?: number;
    })
  | ({ t: 'circle'; x: number; y: number; r: number } & Paint)
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color?: string; w?: number; dash?: number[]; opacity?: number }
  | {
      t: 'text'; x: number; y: number; text: string;
      size?: number; font?: FontName; color?: string; opacity?: number;
      align?: 'left' | 'center' | 'right';
      /** box width: enables wrapping, and makes `align` relative to the box */
      w?: number;
      /** letter-spacing in points (applied after every character) */
      track?: number;
      /** line height multiplier (default 1.25) */
      lh?: number;
      /** clip to N lines, adding "..." */
      maxLines?: number;
    }
  | { t: 'image'; x: number; y: number; w: number; h: number; src: string };

export interface Page { bg?: string; els: El[] }

export interface Doc {
  size?: 'A4' | 'A5' | 'Letter' | [number, number];
  landscape?: boolean;
  title?: string;
  author?: string;
  pages: Page[];
}
