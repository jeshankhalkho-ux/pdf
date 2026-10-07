// e-RC template - faithful port of deepseek_html_20261005_ff9eb7.html
// (layout numbers come from the verified pdfgen build in tbc_rc_bot/build_rc.py).
// All helper inputs are MILLIMETRES; text baselines are millimetres from the top.
import type { Ctx } from './render.js';
import type { Template } from './templates.js';
import type { El, FontName } from './types.js';
import { EMBLEM_JPEG } from './emblem.js';

const MM = 2.834645669;
const P = (mm: number) => mm * MM;

// palette (CSS :root of the design)
const NAVY = '#0d2b52';
const NAVY_DEEP = '#071a34';
const NAVY_MID = '#153f75';
const NAVY_LIGHT = '#1e5aa8';
const GOLD = '#f2b03d';
const GOLD_DEEP = '#c98a12';
const SAFFRON = '#ff8c1a';
const GREEN = '#0b6b3a';
const INK = '#0b2447';
const MUTED = '#4a5a73';
const LINE = '#dbe3ee';
const ROW_TINT = '#f6f9fd';
const CELL_TINT = '#eef4fb';
const GOLD_PALE = '#fff6e2';
const GOLD_PILL = '#ffe9bd';
const GOLD_BORDER = '#f0cf8a';
const GOLD_TEXT = '#7a5000';
const WHITE = '#ffffff';

// layout constants (mm)
const X0 = 13.0;
const CW = 184.0;
const PAD_T = 11.0;
const FIELD_H = 6.85;
const BLOCK_GAP = 3.7;
const BAR_H = 7.1;
const COL_W = 88.0;
const COL_GAP = 8.0;
const VAL_OFF = 45.0;

type D = Record<string, any>;
type Corners = [number, number, number, number];
type Field = [label: string, value: string, style: string, span: boolean];

const str = (v: unknown, d = '') => (v === undefined || v === null ? d : String(v));

function pretty(v: unknown): string {
  const s = str(v).replace(/_/g, ' ').trim();
  if (!s) return '';
  return s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/** Raw vehicle-API JSON (or already-mapped display keys) -> display dict. */
function mapData(d: D) {
  const ccNum = Number(d.cc);
  return {
    reg_no: str(d.reg_no ?? d.registration_number),
    reg_date: str(d.reg_date ?? d.registration_date),
    owner_name: str(d.owner_name),
    valid_upto: str(d.valid_upto ?? d.registration_valid_upto),
    vclass: str(d.vclass ?? d.vehicle_class),
    vtype: d.vtype !== undefined ? str(d.vtype) : pretty(d.vehicle_type),
    fuel: d.fuel !== undefined ? str(d.fuel) : pretty(d.fuel_type),
    cc: typeof d.cc === 'string' ? d.cc : Number.isFinite(ccNum) && ccNum > 0 ? `${ccNum} cc` : '-',
    seats: str(d.seats ?? d.seating_capacity),
    manufacturer: str(d.manufacturer ?? d.vehicle_make),
    model: str(d.model ?? d.vehicle_model),
    variant: str(d.variant),
    vvariant: str(d.vvariant ?? d.vehicle_variant),
    chassis: str(d.chassis ?? d.chassis_number),
    engine: str(d.engine ?? d.engine_number),
    address: str(d.address),
    financer: str(d.financer),
    ins_co: str(d.ins_co ?? d.insurance_company),
    ins_no: str(d.ins_no ?? d.insurance_policy_no),
    ins_upto: str(d.ins_upto ?? d.insurance_valid_upto),
    puc_no: str(d.puc_no),
    puc_upto: str(d.puc_upto ?? d.puc_valid_upto),
    rto_code: str(d.rto_code),
    rto_name: str(d.rto_name),
  };
}

/* ---- element helpers (mm in, El out) ---- */

type TextOpts = { font?: FontName; color?: string; align?: 'l' | 'c' | 'r'; trackPx?: number };

/** Text with the BASELINE at baseMm (mirrors the pdfgen build). */
const vt = (xMm: number, baseMm: number, text: string, size: number, o: TextOpts = {}): El => ({
  t: 'text',
  x: P(xMm),
  y: P(baseMm) - size * 0.78,
  text,
  size,
  font: o.font ?? 'sans',
  color: o.color ?? INK,
  align: o.align === 'c' ? 'center' : o.align === 'r' ? 'right' : 'left',
  track: (o.trackPx ?? 0) * 0.75,
});

const R = (
  x: number, y: number, w: number, h: number,
  o: { fill?: string; stroke?: string; sw?: number; opacity?: number; r?: number | Corners | number[] },
): El => ({
  t: 'rect',
  x: P(x), y: P(y), w: P(w), h: P(h),
  ...(o.fill ? { fill: o.fill } : {}),
  ...(o.stroke ? { stroke: o.stroke, sw: o.sw ?? 1 } : {}),
  ...(o.opacity !== undefined ? { opacity: o.opacity } : {}),
  ...(o.r !== undefined
    ? { r: Array.isArray(o.r) ? (o.r.map(P) as Corners) : P(o.r) }
    : {}),
});

const G = (
  x: number, y: number, w: number, h: number,
  colors: string[], dir: 'h' | 'v',
  o: { r?: number | Corners | number[]; steps?: number } = {},
): El => ({
  t: 'grad',
  x: P(x), y: P(y), w: P(w), h: P(h),
  colors, dir,
  ...(o.r !== undefined ? { r: Array.isArray(o.r) ? (o.r.map(P) as Corners) : P(o.r) } : {}),
  ...(o.steps !== undefined ? { steps: o.steps } : {}),
});

const C = (
  cx: number, cy: number, r: number,
  o: { fill?: string; stroke?: string; sw?: number; opacity?: number },
): El => ({
  t: 'circle',
  x: P(cx), y: P(cy), r: P(r),
  ...(o.fill ? { fill: o.fill } : {}),
  ...(o.stroke ? { stroke: o.stroke, sw: o.sw ?? 1 } : {}),
  ...(o.opacity !== undefined ? { opacity: o.opacity } : {}),
});

const L = (x1: number, y1: number, x2: number, y2: number, color: string, w: number): El => ({
  t: 'line', x1: P(x1), y1: P(y1), x2: P(x2), y2: P(y2), color, w,
});

/** Tracked text width in mm (letter-spacing added after every char, as in CSS). */
const twMm = (ctx: Ctx, text: string, font: FontName, size: number, trackPx = 0) =>
  (ctx.width(text, font, size) + trackPx * 0.75 * [...text].length) / MM;

export const rc: Template = {
  description:
    'Indian e-RC (Registration Certificate) with Parivahan masthead, tricolor accents, ' +
    'vehicle particulars grid and signed-URL delivery. Accepts raw vehicle-API JSON.',
  example: {
    registration_number: 'JH05ED4359',
    registration_date: '31/10/2025',
    owner_name: 'ANJALI KUMARI',
    registration_valid_upto: '04-06-2026 13:46:38',
    vehicle_class: 'M-Cycle/Scooter (2WN)',
    vehicle_type: 'two_wheeler',
    fuel_type: 'petrol',
    cc: 109.0,
    seating_capacity: 2,
    manufacturer: 'HONDA MOTORS',
    model: 'ACTIVA',
    variant: 'ACTIVA SMART (110 cc)',
    vehicle_variant: 'ACTIVA DLX',
    chassis_number: 'ME4JK371JSG010589',
    engine_number: 'JK37EG1010703',
    address: 'Purbi Singhbhum, 831017',
    financer: 'CHOLAMANDALAM INV & FIN CO LTD',
    insurance_company: 'Tata AIG General Insurance Co. Ltd.',
    insurance_policy_no: '61053679740000',
    insurance_valid_upto: '16/10/2030',
    puc_no: 'Newv4',
    puc_valid_upto: '30-10-2026',
    rto_code: 'JH-05',
    rto_name: 'EAST SINGHBHUM (JAMSHEDPUR), Jharkhand',
  },
  build(data, ctx) {
    const f = mapData(data ?? {});
    const els: El[] = [];
    const add = (...e: El[]) => { els.push(...e); };
    const title = 'Registration Certificate';

    /* ================= flag bar ================= */
    let y = PAD_T;
    const seg = CW / 3.0;
    add(
      R(X0, y, seg, 2, { fill: SAFFRON, r: [1, 0, 0, 1] }),
      R(X0 + seg, y, seg, 2, { fill: WHITE }),
      R(X0 + 2 * seg, y, seg, 2, { fill: GREEN, r: [0, 1, 1, 0] }),
    );
    y += 2 + 4;

    /* ================= masthead ================= */
    const mh_y = y, mh_h = 31.0;
    add(G(X0, mh_y, CW, mh_h, [NAVY_DEEP, NAVY, NAVY_LIGHT], 'h', { r: 3 }));
    // gold radial glow: circles tangent to the top-right corner and small enough
    // to fit the 31mm masthead height, so no clip is needed.
    add(
      C(X0 + CW - 15, mh_y + 15, 15, { fill: GOLD, opacity: 0.1 }),
      C(X0 + CW - 10, mh_y + 10, 10, { fill: GOLD, opacity: 0.09 }),
      C(X0 + CW - 5.5, mh_y + 5.5, 5.5, { fill: GOLD, opacity: 0.08 }),
    );

    // emblem: white circle + gold ring + emblem image
    const cx = X0 + 5 + 10.5, cy = mh_y + 5 + 10.5;
    add(
      C(cx, cy, 10.5, { fill: WHITE }),
      C(cx, cy, 10.5, { stroke: GOLD, sw: 1.13 }),
      { t: 'image', x: P(cx - 9), y: P(cy - 9), w: P(18), h: P(18), src: EMBLEM_JPEG },
    );

    // badge (e-RC)
    const bw = 25.0, bh = 11.2;
    const bx = X0 + CW - 5 - bw, by = mh_y + (mh_h - bh) / 2.0;
    add(
      R(bx, by, bw, bh, { fill: WHITE, opacity: 0.12, r: 2 }),
      R(bx, by, bw, bh, { stroke: WHITE, sw: 1.05, opacity: 0.55, r: 2 }),
      vt(bx + bw / 2, by + 5.4, 'e-RC', 11, { font: 'sans-bold', color: WHITE, align: 'c' }),
      vt(bx + bw / 2, by + 8.6, 'DIGITAL COPY', 5.8, { color: '#cfe1f7', align: 'c', trackPx: 1.4 }),
    );

    // mast text block (centred between emblem and badge)
    const tc = (X0 + 5 + 21 + 5 + bx) / 2.0;
    add(
      vt(tc, mh_y + 12.6, 'PARIVAHAN SEWA', 23, { font: 'sans-bold', color: WHITE, align: 'c', trackPx: 5 }),
      G(tc - 22, mh_y + 14.4, 44, 1.2, ['transparent', GOLD, '#ffe6a8', GOLD, 'transparent'], 'h', { r: 0.6 }),
      vt(tc, mh_y + 21.0, 'MINISTRY OF ROAD TRANSPORT & HIGHWAYS', 10.5,
        { font: 'sans-bold', color: '#dbe9fb', align: 'c', trackPx: 1.6 }),
      vt(tc, mh_y + 25.6, 'GOVERNMENT OF INDIA', 7.6,
        { font: 'sans-bold', color: GOLD, align: 'c', trackPx: 3.4 }),
    );

    // tricolor strip along the masthead bottom (inset so it never leaves the
    // 3mm rounded corners of the masthead)
    add(G(X0 + 3, mh_y + mh_h - 1.1, CW - 6, 1.1, [SAFFRON, GOLD, WHITE, GREEN], 'h', { steps: 110 }));
    y = mh_y + mh_h;

    /* ================= title ================= */
    const cxPage = X0 + CW / 2.0;
    y += 4.8;
    add(vt(cxPage, y + 5.6, 'REGISTRATION CERTIFICATE', 15.5,
      { font: 'sans-bold', color: NAVY, align: 'c', trackPx: 3.6 }));
    y += 7.6;
    add(G(cxPage - 35, y, 70, 0.9,
      ['transparent', GOLD_DEEP, NAVY, GOLD_DEEP, 'transparent'], 'h', { steps: 90 }));
    y += 0.9 + 1.9;
    add(vt(cxPage, y + 2.6,
      'Issued under Section 41 of the Motor Vehicles Act, 1988 & Central Motor Vehicles Rules, 1989',
      7.4, { color: MUTED, align: 'c', trackPx: 0.4 }));
    y += 3.4;

    /* ================= registration strip ================= */
    y += 3.5;
    const rs_h = 15.0;
    add(R(X0, y, CW, rs_h, { stroke: NAVY, sw: 1.13, r: 2.4 }));
    const c1 = X0, c2 = X0 + 46.0, c3 = X0 + 92.0;
    add(
      G(c1 + 0.6, y + 0.6, 46.0 - 1.2, rs_h - 1.2, [WHITE, CELL_TINT], 'v', { steps: 32 }),
      G(c2 + 0.6, y + 0.6, 46.0 - 1.2, rs_h - 1.2, [WHITE, CELL_TINT], 'v', { steps: 32 }),
      G(c3 + 0.6, y + 0.6, 92.0 - 1.2, rs_h - 1.2, [NAVY, NAVY_DEEP], 'v', { r: [0, 2.4, 2.4, 0], steps: 32 }),
      R(c2, y + 0.6, 0.5, rs_h - 1.2, { fill: NAVY }),
      R(c3, y + 0.6, 0.5, rs_h - 1.2, { fill: GOLD }),
      vt(c1 + 4, y + 5.6, 'REGISTRATION NUMBER', 6.8, { font: 'sans-bold', color: GOLD_DEEP, trackPx: 1.6 }),
      vt(c1 + 4, y + 11.4, f.reg_no, 12.5, { font: 'mono-bold', color: NAVY, trackPx: 0.9 }),
      vt(c2 + 4, y + 5.6, 'REGISTRATION DATE', 6.8, { font: 'sans-bold', color: GOLD_DEEP, trackPx: 1.6 }),
      vt(c2 + 4, y + 11.4, f.reg_date, 12.5, { font: 'mono-bold', color: NAVY, trackPx: 0.9 }),
      vt(c3 + 4, y + 5.6, 'OWNER NAME', 6.8, { font: 'sans-bold', color: GOLD, trackPx: 1.6 }),
      vt(c3 + 4, y + 11.4, f.owner_name, 13, { font: 'sans-bold', color: WHITE, trackPx: 1.4 }),
    );
    y += rs_h;

    /* ================= blocks ================= */
    const blockTitle = (yy: number, text: string) => {
      add(
        G(X0, yy, CW, BAR_H, [NAVY_DEEP, NAVY, NAVY_MID], 'h', { r: 1.6, steps: 130 }),
        G(X0 + 4, yy + (BAR_H - 4.2) / 2.0, 1.3, 4.2, [GOLD, SAFFRON], 'v', { r: 0.65 }),
        vt(X0 + 4 + 1.3 + 2.6, yy + 4.9, text, 8.6, { font: 'sans-bold', color: WHITE, trackPx: 1.9 }),
      );
      return yy + BAR_H + 2.4;
    };

    const grid = (yy: number, fields: Field[]) => {
      let ri = 0, ci = 0, idx = 0;
      for (const [label, value, style, span] of fields) {
        idx += 1;
        let fx: number, fw: number, place: number;
        if (span) {
          if (ci === 1) ri += 1;
          fx = X0; fw = CW; place = ri; ri += 1; ci = 0;
        } else {
          fx = ci === 0 ? X0 : X0 + COL_W + COL_GAP;
          fw = COL_W; place = ri; ci = 1 - ci;
          if (ci === 0) ri += 1;
        }
        const ry = yy + place * FIELD_H;
        if (idx % 2 === 1) add(R(fx, ry, fw, FIELD_H, { fill: ROW_TINT }));
        add(R(fx, ry + FIELD_H - 0.26, fw, 0.26, { fill: LINE }));
        add(vt(fx + 3, ry + 4.7, label.toUpperCase(), 7.7,
          { font: 'sans-bold', color: MUTED, trackPx: 0.6 }));
        const vx = fx + VAL_OFF;
        let vcol = INK, font: FontName = 'sans-bold', trackPx = 0;
        if (style === 'mono') { font = 'mono-bold'; vcol = NAVY_DEEP; trackPx = 1.0; }
        else if (style === 'strong') { vcol = NAVY_DEEP; }
        else if (style === 'hl') { font = 'mono-bold'; vcol = GOLD_TEXT; trackPx = 1.0; }
        if (style === 'hl') {
          const pw = twMm(ctx, value, 'mono-bold', 9.6, trackPx) + 4.5;
          add(
            G(vx - 2, ry + 1.55, pw, 4.4, [GOLD_PALE, GOLD_PILL], 'v', { r: 1.0, steps: 10 }),
            R(vx - 2, ry + 1.55, pw, 4.4, { stroke: GOLD_BORDER, sw: 0.75, r: 1.0 }),
          );
        }
        add(vt(vx, ry + 4.7, value, 9.6, { font, color: vcol, trackPx }));
      }
      return yy + ri * FIELD_H;
    };

    // ---- A. Vehicle Particulars ----
    y += BLOCK_GAP;
    y = blockTitle(y, 'A. VEHICLE PARTICULARS');
    y = grid(y, [
      ['Registration Number', f.reg_no, 'mono', false],
      ['Registration Date', f.reg_date, 'plain', false],
      ['Registration Valid Upto', f.valid_upto, 'plain', false],
      ['Vehicle Class', f.vclass, 'plain', false],
      ['Vehicle Type', f.vtype, 'plain', false],
      ['Fuel Type', f.fuel, 'plain', false],
      ['Cubic Capacity', f.cc, 'plain', false],
      ['Seating Capacity', f.seats, 'plain', false],
      ['Manufacturer', f.manufacturer, 'plain', false],
      ['Model', f.model, 'plain', false],
      ['Variant', f.variant, 'plain', false],
      ['Vehicle Variant', f.vvariant, 'plain', false],
    ]);

    // ---- B. Chassis & Engine ----
    y += BLOCK_GAP;
    y = blockTitle(y, 'B. CHASSIS & ENGINE DETAILS');
    y = grid(y, [
      ['Chassis No. (VIN)', f.chassis, 'hl', false],
      ['Engine Number', f.engine, 'hl', false],
    ]);

    // ---- C. Owner Details ----
    y += BLOCK_GAP;
    y = blockTitle(y, 'C. OWNER DETAILS');
    y = grid(y, [
      ['Owner Name', f.owner_name, 'strong', false],
      ['Address', f.address, 'plain', false],
      ['Financer', f.financer, 'plain', true],
    ]);

    // ---- D. Insurance & PUC ----
    y += BLOCK_GAP;
    y = blockTitle(y, 'D. INSURANCE & POLLUTION UNDER CONTROL');
    y = grid(y, [
      ['Insurance Company', f.ins_co, 'plain', true],
      ['Insurance Policy No.', f.ins_no, 'mono', false],
      ['Insurance Valid Upto', f.ins_upto, 'plain', false],
      ['PUC Certificate No.', f.puc_no, 'mono', false],
      ['PUC Valid Upto', f.puc_upto, 'plain', false],
    ]);

    // ---- E. Registering Authority ----
    y += BLOCK_GAP;
    y = blockTitle(y, 'E. REGISTERING AUTHORITY');
    y = grid(y, [
      ['RTO Code', f.rto_code, 'strong', false],
      ['RTO Name', f.rto_name, 'plain', true],
    ]);

    /* ================= signature ================= */
    y += 7.0;
    const sw = 64.0;
    const sx = X0 + (CW - sw) / 2.0;
    add(L(sx, y, sx + sw, y, NAVY, 1.05));
    y += 1.8 + 6.6;
    add(vt(sx + sw / 2.0, y + 3.4, 'Registering Authority', 9,
      { font: 'sans-bold', color: NAVY, align: 'c', trackPx: 0.9 }));
    y += 4.6;
    const shortRto = f.rto_name.split(',')[0].trim();
    add(vt(sx + sw / 2.0, y + 2.6, `RTO ${f.rto_code} \u00b7 ${shortRto}`, 6.9,
      { color: MUTED, align: 'c', trackPx: 0.4 }));
    y += 3.4;

    /* ================= footer ================= */
    y += 5.5;
    const ft_h = 7.7;
    if (y + ft_h > 297 - 9) y = 297 - 9 - ft_h;
    add(G(X0, y, CW, ft_h, [NAVY_DEEP, NAVY_MID], 'h', { r: 1.6, steps: 120 }));
    const fy = y + 4.5;
    const left1 = 'PARIVAHAN SEWA';
    const left2 = ' \u00b7 Ministry of Road Transport & Highways';
    const m1 = 'Registration No.: ';
    const m2 = f.reg_no;
    const right = 'Page 1 of 1';
    const lw = twMm(ctx, left1, 'sans-bold', 6.9, 0.5) + twMm(ctx, left2, 'sans', 6.9, 0.5);
    const mw = twMm(ctx, m1, 'sans', 6.9, 0.5) + twMm(ctx, m2, 'sans-bold', 6.9, 0.5);
    const rw = twMm(ctx, right, 'sans', 6.9, 0.5);
    let gap = (CW - 8 - lw - mw - rw) / 2.0;
    if (gap < 3) gap = 3;
    const xl = X0 + 4;
    const xm = xl + lw + gap;
    add(
      vt(xl, fy, left1, 6.9, { font: 'sans-bold', color: GOLD, trackPx: 0.5 }),
      vt(xl + twMm(ctx, left1, 'sans-bold', 6.9, 0.5), fy, left2, 6.9, { color: '#d5e4f6', trackPx: 0.5 }),
      vt(xm, fy, m1, 6.9, { color: '#d5e4f6', trackPx: 0.5 }),
      vt(xm + twMm(ctx, m1, 'sans', 6.9, 0.5), fy, m2, 6.9, { font: 'sans-bold', color: GOLD, trackPx: 0.5 }),
      vt(X0 + CW - 4, fy, right, 6.9, { color: '#d5e4f6', align: 'r', trackPx: 0.5 }),
    );

    return { size: 'A4', title, pages: [{ bg: WHITE, els }] };
  },
};
