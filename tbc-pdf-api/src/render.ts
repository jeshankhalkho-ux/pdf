import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type RGB } from 'pdf-lib';
import type { Doc, El, FontName } from './types.js';

export class DocError extends Error {}

const SIZES = { A4: [595.28, 841.89], A5: [419.53, 595.28], Letter: [612, 792] } as const;

const STD: Record<FontName, StandardFonts> = {
  sans: StandardFonts.Helvetica,
  'sans-bold': StandardFonts.HelveticaBold,
  'sans-italic': StandardFonts.HelveticaOblique,
  serif: StandardFonts.TimesRoman,
  'serif-bold': StandardFonts.TimesRomanBold,
  'serif-italic': StandardFonts.TimesRomanItalic,
  'serif-bold-italic': StandardFonts.TimesRomanBoldItalic,
  mono: StandardFonts.Courier,
  'mono-bold': StandardFonts.CourierBold,
};

const LIMITS = { pages: 20, els: 2000, text: 20000, image: 3 * 1024 * 1024 };

// Built-in PDF fonts only cover Latin-1 ("WinAnsi"). Swap common symbols for safe text.
const REPLACE: Record<string, string> = {
  '₹': 'Rs.', '→': '->', '←': '<-', '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x',
  '★': '*', '☆': '*', '−': '-', '‑': '-', '\u2009': ' ', '\u202f': ' ',
};

export interface Ctx {
  pdf: PDFDocument;
  font(name?: string): PDFFont;
  clean(text: unknown, name?: string): string;
  width(text: string, name: FontName, size: number): number;
  /** Wrap text to maxW points. Optional maxLines clips with "...". */
  wrap(text: unknown, name: FontName, size: number, maxW: number, maxLines?: number): string[];
}

export async function createCtx(): Promise<Ctx> {
  const pdf = await PDFDocument.create();
  const fonts = new Map<string, PDFFont>();
  const sets = new Map<string, Set<number>>();
  for (const [name, std] of Object.entries(STD)) {
    const f = await pdf.embedFont(std);
    fonts.set(name, f);
    sets.set(name, new Set(f.getCharacterSet()));
  }
  const font = (name?: string) => fonts.get(name ?? 'sans') ?? fonts.get('sans')!;

  const clean = (text: unknown, name = 'sans') => {
    const set = sets.get(name) ?? sets.get('sans')!;
    const src = String(text ?? '').slice(0, LIMITS.text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    let out = '';
    for (const ch of src) {
      const cp = ch.codePointAt(0)!;
      if (ch === '\n' || set.has(cp)) out += ch;
      else if (REPLACE[ch] !== undefined) out += REPLACE[ch];
      else if (cp === 0x200b || cp === 0x200d || cp === 0xfe0f) continue; // zero-width / emoji joiners
      else out += '?';
    }
    return out;
  };

  const width = (text: string, name: FontName, size: number) =>
    font(name).widthOfTextAtSize(clean(text, name), size);

  const wrap = (text: unknown, name: FontName, size: number, maxW: number, maxLines?: number) => {
    const f = font(name);
    const w = (s: string) => f.widthOfTextAtSize(s, size);
    const out: string[] = [];
    for (const para of clean(text, name).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const cand = line ? `${line} ${word}` : word;
        if (w(cand) <= maxW) { line = cand; continue; }
        if (line) { out.push(line); line = ''; }
        if (w(word) <= maxW) { line = word; continue; }
        let chunk = '';
        for (const ch of word) {
          if (chunk && w(chunk + ch) > maxW) { out.push(chunk); chunk = ch; } else chunk += ch;
        }
        line = chunk;
      }
      out.push(line);
    }
    if (maxLines && out.length > maxLines) {
      const kept = out.slice(0, maxLines);
      let last = kept[maxLines - 1];
      while (last && w(`${last}...`) > maxW) last = last.slice(0, -1);
      kept[maxLines - 1] = `${last.trimEnd()}...`;
      return kept;
    }
    return out;
  };

  return { pdf, font, clean, width, wrap };
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function parseRGBA(c: unknown, fallback = '#000000'): { r: number; g: number; b: number; a: number } {
  if (typeof c === 'string' && c.trim().toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const m = typeof c === 'string' ? /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c.trim()) : null;
  let h = m ? m[1] : fallback.replace('#', '');
  if (h.length === 3) h = [...h].map((x) => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
}

function color(c: unknown, fallback = '#000000'): RGB {
  const { r, g, b } = parseRGBA(c, fallback);
  return rgb(r, g, b);
}

/** Normalize `r` (number or [tl,tr,br,bl]) to four clamped corner radii. */
const cornersOf = (r: unknown, w: number, h: number): [number, number, number, number] => {
  const max = Math.max(Math.min(w, h) / 2, 0);
  const k = (v: unknown) => Math.min(Math.max(num(v), 0), max);
  return Array.isArray(r) ? [k(r[0]), k(r[1]), k(r[2]), k(r[3])] : [k(r), k(r), k(r), k(r)];
};

const roundedPathC = (w: number, h: number, [tl, tr, br, bl]: [number, number, number, number]) =>
  `M ${tl} 0 H ${w - tr}` +
  (tr > 0 ? ` A ${tr} ${tr} 0 0 1 ${w} ${tr}` : '') +
  ` V ${h - br}` +
  (br > 0 ? ` A ${br} ${br} 0 0 1 ${w - br} ${h}` : '') +
  ` H ${bl}` +
  (bl > 0 ? ` A ${bl} ${bl} 0 0 1 0 ${h - bl}` : '') +
  ` V ${tl}` +
  (tl > 0 ? ` A ${tl} ${tl} 0 0 1 ${tl} 0` : '') +
  ` Z`;

function blockedHost(h: string) {
  return (
    h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') ||
    h.includes(':') || h.startsWith('[') ||
    /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
  );
}

async function fetchImageBytes(src: string): Promise<Uint8Array | null> {
  try {
    const d = /^data:image\/(?:png|jpe?g);base64,(.+)$/i.exec(src);
    if (d) {
      const b = Buffer.from(d[1], 'base64');
      return b.length <= LIMITS.image ? b : null;
    }
    const u = new URL(src);
    if (u.protocol !== 'https:' || blockedHost(u.hostname)) return null;
    const res = await fetch(u, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!res.ok) return null;
    if (Number(res.headers.get('content-length') ?? 0) > LIMITS.image) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length <= LIMITS.image ? buf : null;
  } catch {
    return null;
  }
}

export function validateDoc(doc: unknown): asserts doc is Doc {
  const d = doc as Doc;
  if (!d || typeof d !== 'object' || !Array.isArray(d.pages) || d.pages.length === 0)
    throw new DocError('doc.pages must be a non-empty array');
  if (d.pages.length > LIMITS.pages) throw new DocError(`max ${LIMITS.pages} pages`);
  let n = 0;
  for (const p of d.pages) {
    if (!p || !Array.isArray(p.els)) throw new DocError('every page needs an "els" array');
    n += p.els.length;
  }
  if (n > LIMITS.els) throw new DocError(`max ${LIMITS.els} elements`);
  if (Array.isArray(d.size) && !(d.size.length === 2 && d.size.every((v) => num(v) >= 50 && num(v) <= 3000)))
    throw new DocError('doc.size must be "A4" | "A5" | "Letter" | [width, height] in points (50-3000)');
}

export async function renderDoc(doc: unknown, ctx: Ctx): Promise<Uint8Array> {
  validateDoc(doc);
  const { pdf } = ctx;
  let [W, H]: number[] = Array.isArray(doc.size) ? doc.size : [...SIZES[doc.size ?? 'A4']];
  if (doc.landscape) [W, H] = [H, W];

  if (doc.title) pdf.setTitle(String(doc.title).slice(0, 200));
  if (doc.author) pdf.setAuthor(String(doc.author).slice(0, 200));
  pdf.setProducer('tbc-pdf-api');
  pdf.setCreator('tbc-pdf-api');

  const images = new Map<string, PDFImage | null>();
  const getImage = async (src: string) => {
    if (images.has(src)) return images.get(src)!;
    const bytes = await fetchImageBytes(src);
    let img: PDFImage | null = null;
    try {
      if (bytes && bytes[0] === 0x89 && bytes[1] === 0x50) img = await pdf.embedPng(bytes);
      else if (bytes && bytes[0] === 0xff && bytes[1] === 0xd8) img = await pdf.embedJpg(bytes);
    } catch { img = null; } // unsupported/corrupt image: skip it, still deliver the PDF
    images.set(src, img);
    return img;
  };

  for (const pg of doc.pages) {
    const page = pdf.addPage([W, H]);
    if (pg.bg) page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: color(pg.bg, '#ffffff') });

    for (const e of pg.els as El[]) {
      switch (e.t) {
        case 'rect': {
          if (!e.fill && !e.stroke) break;
          const x = num(e.x), y = num(e.y), w = num(e.w), h = num(e.h);
          const rr = cornersOf(e.r, w, h);
          const square = rr.every((v) => v <= 0.01);
          const op = num(e.opacity, 1);
          const o: Record<string, unknown> = { opacity: op, borderOpacity: op, borderWidth: e.stroke ? num(e.sw, 1) : 0 };
          if (e.fill) o.color = color(e.fill);
          if (e.stroke) o.borderColor = color(e.stroke);
          if (!square) page.drawSvgPath(roundedPathC(w, h, rr), { x, y: H - y, ...o });
          else page.drawRectangle({ x, y: H - y - h, width: w, height: h, ...o });
          break;
        }
        case 'grad': {
          const x = num(e.x), y = num(e.y), w = num(e.w), h = num(e.h);
          const stops = (Array.isArray(e.colors) ? e.colors : []).slice(0, 32).map((c) => parseRGBA(c));
          if (stops.length < 2 || w <= 0 || h <= 0) break;
          const vertical = e.dir === 'v';
          const span = vertical ? h : w;
          if (span <= 0) break;
          const rr = cornersOf(e.r, w, h);
          // end bands carry the shape's corners along the gradient axis; corners on
          // the cross-axis edges are rounded inside those same end bands.
          let startC: [number, number, number, number], endC: [number, number, number, number];
          let startCap: number, endCap: number;
          if (vertical) {
            startC = [rr[0], rr[1], 0, 0]; startCap = Math.max(rr[0], rr[1]);
            endC = [0, 0, rr[2], rr[3]]; endCap = Math.max(rr[2], rr[3]);
          } else {
            startC = [rr[0], 0, 0, rr[3]]; startCap = Math.max(rr[0], rr[3]);
            endC = [0, rr[1], rr[2], 0]; endCap = Math.max(rr[1], rr[2]);
          }
          let cs = startCap, ce = endCap;
          if (cs + ce > span) { const k = span / (cs + ce); cs *= k; ce *= k; }
          let n = Math.round(num(e.steps, span / 1.2));
          n = Math.min(160, Math.max(4, n));
          const bands: { o: number; s: number; c: [number, number, number, number] }[] = [];
          if (cs > 0.01) bands.push({ o: 0, s: cs, c: startC });
          const midO = cs, midS = span - cs - ce;
          const m = Math.max(1, n - (cs > 0.01 ? 1 : 0) - (ce > 0.01 ? 1 : 0));
          for (let i = 0; i < m; i++) bands.push({ o: midO + (midS * i) / m, s: midS / m, c: [0, 0, 0, 0] });
          if (ce > 0.01) bands.push({ o: span - ce, s: ce, c: endC });
          const base = num(e.opacity, 1);
          // Overlap neighbouring bands slightly: abutting rects leave a hairline
          // seam (double antialiasing) at every boundary when rasterised.
          const EPS = 0.6;
          for (const b of bands) {
            if (b.s <= 0.01) continue;
            const t = (b.o + b.s / 2) / span;
            const p = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
            const i = Math.min(Math.floor(p), stops.length - 2);
            const f = p - i, A = stops[i], B = stops[i + 1];
            const col = rgb(A.r + (B.r - A.r) * f, A.g + (B.g - A.g) * f, A.b + (B.b - A.b) * f);
            const op = (A.a + (B.a - A.a) * f) * base;
            if (op <= 0.004) continue;
            // extend only the edges that are not the shape's outer boundary
            const o0 = Math.max(0, b.o - (b.o > 0.01 ? EPS : 0));
            const o1 = Math.min(span, b.o + b.s + (b.o + b.s < span - 0.01 ? EPS : 0));
            const bs = o1 - o0;
            if (bs <= 0) continue;
            const bx = vertical ? x : x + o0;
            const by = vertical ? y + o0 : y;
            const bw = vertical ? w : bs;
            const bh = vertical ? bs : h;
            if (b.c.some((v) => v > 0.01)) page.drawSvgPath(roundedPathC(bw, bh, b.c), { x: bx, y: H - by, color: col, opacity: op });
            else page.drawRectangle({ x: bx, y: H - by - bh, width: bw, height: bh, color: col, opacity: op });
          }
          break;
        }
        case 'circle': {
          if (!e.fill && !e.stroke) break;
          const op = num(e.opacity, 1);
          const o: Record<string, unknown> = { opacity: op, borderOpacity: op, borderWidth: e.stroke ? num(e.sw, 1) : 0 };
          if (e.fill) o.color = color(e.fill);
          if (e.stroke) o.borderColor = color(e.stroke);
          page.drawCircle({ x: num(e.x), y: H - num(e.y), size: Math.max(0, num(e.r)), ...o });
          break;
        }
        case 'line': {
          page.drawLine({
            start: { x: num(e.x1), y: H - num(e.y1) },
            end: { x: num(e.x2), y: H - num(e.y2) },
            thickness: num(e.w, 1),
            color: color(e.color),
            opacity: num(e.opacity, 1),
            ...(Array.isArray(e.dash) && e.dash.length ? { dashArray: e.dash.map((v) => num(v, 3)) } : {}),
          });
          break;
        }
        case 'text': {
          const name = (e.font ?? 'sans') as FontName;
          const f = ctx.font(name);
          const size = Math.min(Math.max(num(e.size, 12), 1), 300);
          const lh = size * num(e.lh, 1.25);
          const boxW = e.w !== undefined ? num(e.w, 0) : 0;
          const lines = boxW > 0
            ? ctx.wrap(e.text, name, size, boxW, e.maxLines)
            : ctx.clean(e.text, name).split('\n').slice(0, e.maxLines ?? Infinity);
          const col = color(e.color);
          const track = num(e.track, 0);
          lines.forEach((line, i) => {
            const chars = [...line];
            const tw = f.widthOfTextAtSize(line, size) + track * chars.length;
            const x0 = num(e.x);
            let x = x0;
            if (e.align === 'center') x = boxW > 0 ? x0 + (boxW - tw) / 2 : x0 - tw / 2;
            else if (e.align === 'right') x = boxW > 0 ? x0 + boxW - tw : x0 - tw;
            const y = H - num(e.y) - size * 0.78 - i * lh;
            const o = { size, font: f, color: col, opacity: num(e.opacity, 1) };
            if (track === 0 || chars.length === 0) page.drawText(line, { x, y, ...o });
            else for (const ch of chars) {
              if (ch !== ' ') page.drawText(ch, { x, y, ...o });
              x += f.widthOfTextAtSize(ch, size) + track;
            }
          });
          break;
        }
        case 'image': {
          const img = await getImage(String(e.src ?? ''));
          if (!img) break;
          const w = num(e.w), h = num(e.h);
          const s = Math.min(w / img.width, h / img.height);
          const dw = img.width * s, dh = img.height * s;
          page.drawImage(img, { x: num(e.x) + (w - dw) / 2, y: H - num(e.y) - (h + dh) / 2, width: dw, height: dh });
          break;
        }
        default:
          throw new DocError(`unknown element type "${(e as { t?: string }).t}" (use rect, grad, circle, line, text, image)`);
      }
    }
  }
  return pdf.save();
}
