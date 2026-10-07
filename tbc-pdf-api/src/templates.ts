import type { Ctx } from './render.js';
import type { Doc, El, FontName, Page } from './types.js';
import { rc } from './rc.js';

type D = Record<string, any>;
export interface Template {
  description: string;
  example: D;
  build(data: D, ctx: Ctx): Doc;
}

const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

const str = (v: unknown, d = '') => (v === undefined || v === null ? d : String(v));
const num = (v: unknown, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const accentOf = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const money = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function tint(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return '#' + [m((n >> 16) & 255), m((n >> 8) & 255), m(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Largest font size (<= max) at which `text` fits in maxW. */
function fit(ctx: Ctx, text: string, font: FontName, max: number, maxW: number, min = 12) {
  let s = max;
  while (s > min && ctx.width(text, font, s) > maxW) s -= 1;
  return s;
}

/** Simple top-to-bottom page flow with automatic page breaks. */
class Flow {
  pages: Page[] = [];
  els: El[] = [];
  y = 0;
  constructor(private bottom: number, private head: (first: boolean, add: (...e: El[]) => void) => number) {}
  add = (...e: El[]) => { this.els.push(...e); };
  newPage() {
    const p: Page = { els: [] };
    this.pages.push(p);
    this.els = p.els;
    this.y = this.head(this.pages.length === 1, this.add);
  }
  /** Start a new page if `h` points don't fit. Returns true when it broke. */
  ensure(h: number) {
    if (this.y + h <= this.bottom) return false;
    this.newPage();
    return true;
  }
}

function footers(pages: Page[], W: number, H: number, left: string) {
  pages.forEach((p, i) => {
    p.els.push(
      { t: 'line', x1: 40, y1: H - 52, x2: W - 40, y2: H - 52, color: LINE, w: 1 },
      { t: 'text', x: 40, y: H - 42, w: W - 160, text: left, size: 9, color: MUTED, maxLines: 1 },
      { t: 'text', x: W - 120, y: H - 42, w: 80, text: `Page ${i + 1} / ${pages.length}`, size: 9, color: MUTED, align: 'right' },
    );
  });
}

/* ───────────────────────────── INVOICE ───────────────────────────── */

const invoice: Template = {
  description: 'Itemised invoice with tax, discount, notes and payment details. Paginates automatically.',
  example: {
    brand: 'Acme Studio', tagline: 'Web apps, bots & APIs', accent: '#4f46e5',
    invoiceNo: 'INV-0042', date: '07 Oct 2026', due: '14 Oct 2026', status: 'UNPAID',
    from: ['Acme Studio', 'Jamshedpur, Jharkhand', 'hello@acme.example'],
    to: ['Priya Sharma', 'Sharma Traders', 'Bistupur, Jamshedpur'],
    currency: 'Rs.', taxLabel: 'GST', taxPct: 18, discount: 500,
    items: [
      { desc: 'Telegram bot development', sub: 'Custom commands, admin panel', qty: 1, price: 12000 },
      { desc: 'Landing page design', sub: 'Responsive, 3 sections', qty: 1, price: 6500 },
      { desc: 'API integration', qty: 2, price: 1500 },
      { desc: 'Hosting setup (1 year)', qty: 1, price: 999.5 },
    ],
    notes: 'Payment due within 7 days. Late payments may delay support.',
    payment: ['UPI: acme@upi', 'A/C: 0000 0000 0000 (IFSC EXMP0000001)'],
    footer: 'Thank you for your business.',
  },
  build(d, ctx) {
    const W = 595.28, H = 841.89, M = 40, CW = W - 2 * M;
    const accent = accentOf(d.accent, '#4f46e5');
    const brand = str(d.brand, 'Your Company');
    const cur = str(d.currency, 'Rs.');
    const fmt = (v: number) => `${cur} ${money.format(v)}`;

    const items = list(d.items).slice(0, 300).map((it) => ({
      desc: str(it?.desc ?? it?.name, 'Item'), sub: str(it?.sub), qty: num(it?.qty, 1), price: num(it?.price),
    }));
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    const discount = Math.min(Math.max(num(d.discount), 0), subtotal);
    const taxPct = Math.max(num(d.taxPct), 0);
    const tax = ((subtotal - discount) * taxPct) / 100;
    const total = subtotal - discount + tax;

    const head = (first: boolean, add: (...e: El[]) => void) => {
      if (!first) {
        add(
          { t: 'text', x: M, y: 30, w: 300, text: brand, size: 12, font: 'sans-bold', color: accent, maxLines: 1 },
          { t: 'text', x: M, y: 30, w: CW, text: `Invoice ${str(d.invoiceNo)} (continued)`, size: 10, color: MUTED, align: 'right' },
          { t: 'line', x1: M, y1: 52, x2: W - M, y2: 52, color: LINE },
        );
        return tableHead(70, add);
      }
      const logo = str(d.logo);
      const nameX = logo ? 108 : M;
      add({ t: 'rect', x: 0, y: 0, w: W, h: 118, fill: accent });
      if (logo) add(
        { t: 'rect', x: M, y: 30, w: 58, h: 58, r: 8, fill: '#ffffff' },
        { t: 'image', x: M + 5, y: 35, w: 48, h: 48, src: logo },
      );
      add(
        { t: 'text', x: nameX, y: 38, w: 300, text: brand, size: 22, font: 'sans-bold', color: '#ffffff', maxLines: 1 },
        { t: 'text', x: nameX, y: 66, w: 300, text: str(d.tagline), size: 10, color: '#ffffff', opacity: 0.85, maxLines: 1 },
        { t: 'text', x: M, y: 30, w: CW, text: 'INVOICE', size: 30, font: 'sans-bold', color: '#ffffff', align: 'right' },
        { t: 'text', x: M, y: 74, w: CW, text: str(d.invoiceNo) ? `No. ${str(d.invoiceNo)}` : '', size: 11, color: '#ffffff', align: 'right' },
      );

      // info row
      const top = 142;
      const toL = ctx.wrap(list(d.to).map((v) => str(v)).join('\n'), 'sans', 10, 190);
      const fromL = ctx.wrap(list(d.from).map((v) => str(v)).join('\n'), 'sans', 10, 170);
      add({ t: 'text', x: M, y: top, text: 'BILL TO', size: 8, font: 'sans-bold', color: MUTED });
      add({ t: 'text', x: M, y: top + 15, w: 190, text: toL.join('\n'), size: 10, lh: 1.4, color: INK });
      add({ t: 'text', x: 250, y: top, text: 'FROM', size: 8, font: 'sans-bold', color: MUTED });
      add({ t: 'text', x: 250, y: top + 15, w: 170, text: fromL.join('\n'), size: 10, lh: 1.4, color: INK });
      let my = top;
      for (const [label, val] of [['ISSUE DATE', d.date], ['DUE DATE', d.due]] as const) {
        if (!str(val)) continue;
        add(
          { t: 'text', x: 425, y: my, text: label, size: 8, font: 'sans-bold', color: MUTED },
          { t: 'text', x: 425, y: my + 12, w: 130, text: str(val), size: 10.5, font: 'sans-bold', color: INK, maxLines: 1 },
        );
        my += 38;
      }
      const status = str(d.status).toUpperCase();
      if (status) {
        const sc = /PAID/.test(status) && !/UN/.test(status) ? '#16a34a' : /DUE|PENDING|UNPAID|OVERDUE/.test(status) ? '#dc2626' : accent;
        add(
          { t: 'rect', x: 425, y: my, w: 76, h: 20, r: 10, fill: tint(sc, 0.88), stroke: sc, sw: 0.8 },
          { t: 'text', x: 425, y: my + 5.5, w: 76, text: status, size: 8.5, font: 'sans-bold', color: sc, align: 'center', maxLines: 1 },
        );
        my += 26;
      }
      const bottom = Math.max(top + 15 + Math.min(toL.length, 8) * 14, top + 15 + Math.min(fromL.length, 8) * 14, my);
      return tableHead(bottom + 18, add);
    };

    const tableHead = (y: number, add: (...e: El[]) => void) => {
      add({ t: 'rect', x: M, y, w: CW, h: 26, fill: tint(accent, 0.88) });
      const th = (text: string, x: number, w: number, align: 'left' | 'right') =>
        add({ t: 'text', x, y: y + 9, w, text, size: 8.5, font: 'sans-bold', color: INK, align });
      th('DESCRIPTION', 50, 250, 'left'); th('QTY', 305, 50, 'right'); th('RATE', 362, 80, 'right'); th('AMOUNT', 452, 95, 'right');
      return y + 26;
    };

    const f = new Flow(H - 70, head);
    f.newPage();
    for (const it of items) {
      const h = it.sub ? 36 : 28;
      f.ensure(h);
      const y = f.y;
      f.add(
        { t: 'text', x: 50, y: y + 8, w: 250, text: it.desc, size: 10.5, color: INK, maxLines: 1 },
        { t: 'text', x: 305, y: y + 8, w: 50, text: String(it.qty), size: 10.5, color: INK, align: 'right' },
        { t: 'text', x: 362, y: y + 8, w: 80, text: money.format(it.price), size: 10.5, color: INK, align: 'right' },
        { t: 'text', x: 452, y: y + 8, w: 95, text: money.format(it.qty * it.price), size: 10.5, font: 'sans-bold', color: INK, align: 'right' },
        { t: 'line', x1: M, y1: y + h, x2: W - M, y2: y + h, color: LINE },
      );
      if (it.sub) f.add({ t: 'text', x: 50, y: y + 22, w: 250, text: it.sub, size: 8.5, color: MUTED, maxLines: 1 });
      f.y += h;
    }

    // totals + notes
    const rows: [string, string][] = [['Subtotal', fmt(subtotal)]];
    if (discount > 0) rows.push(['Discount', `- ${fmt(discount)}`]);
    if (taxPct > 0) rows.push([`${str(d.taxLabel, 'Tax')} (${taxPct}%)`, fmt(tax)]);
    const notesL = str(d.notes) ? ctx.wrap(d.notes, 'sans', 9.5, 270, 6) : [];
    const payL = list(d.payment).slice(0, 6).map((v) => str(v));
    const notesH = (notesL.length ? 16 + notesL.length * 13 + 10 : 0) + (payL.length ? 16 + payL.length * 13 : 0);
    const totalsH = rows.length * 22 + 48;
    f.ensure(Math.max(notesH, totalsH) + 16);

    let y = f.y + 16;
    const ty = y;
    for (const [label, val] of rows) {
      f.add(
        { t: 'text', x: 330, y, w: 110, text: label, size: 10, color: MUTED },
        { t: 'text', x: 440, y, w: 107, text: val, size: 10, color: INK, align: 'right' },
      );
      y += 22;
    }
    f.add(
      { t: 'rect', x: 330, y: y + 2, w: W - M - 330, h: 34, r: 6, fill: accent },
      { t: 'text', x: 342, y: y + 13, text: 'TOTAL', size: 11, font: 'sans-bold', color: '#ffffff' },
      { t: 'text', x: 400, y: y + 12, w: 147, text: fmt(total), size: 13, font: 'sans-bold', color: '#ffffff', align: 'right', maxLines: 1 },
    );

    let ny = ty;
    if (notesL.length) {
      f.add(
        { t: 'text', x: M, y: ny, text: 'NOTES', size: 8, font: 'sans-bold', color: MUTED },
        { t: 'text', x: M, y: ny + 14, w: 270, text: notesL.join('\n'), size: 9.5, lh: 1.37, color: INK },
      );
      ny += 16 + notesL.length * 13 + 10;
    }
    if (payL.length) {
      f.add(
        { t: 'text', x: M, y: ny, text: 'PAYMENT DETAILS', size: 8, font: 'sans-bold', color: MUTED },
        { t: 'text', x: M, y: ny + 14, w: 270, text: payL.join('\n'), size: 9.5, lh: 1.37, color: INK },
      );
    }

    footers(f.pages, W, H, str(d.footer, 'Thank you for your business.'));
    return { size: 'A4', title: `Invoice ${str(d.invoiceNo)}`.trim(), author: brand, pages: f.pages };
  },
};

/* ──────────────────────────── CERTIFICATE ──────────────────────────── */

const certificate: Template = {
  description: 'A4 landscape certificate with double border, seal and signature lines.',
  example: {
    title: 'Certificate of Achievement', name: 'Rahul Kumar',
    body: 'in recognition of outstanding performance and dedication in completing the Advanced Python Bootcamp with distinction.',
    issuer: 'Acme Academy', date: '07 October 2026', signer: 'A. Mehta', signerTitle: 'Program Director',
    seal: 'OFFICIAL', id: 'CERT-2026-00421', accent: '#b45309',
  },
  build(d, ctx) {
    const W = 841.89, H = 595.28, cx = W / 2;
    const accent = accentOf(d.accent, '#b45309');
    const title = str(d.title, 'Certificate of Achievement').toUpperCase();
    const name = str(d.name, 'Recipient Name');
    const els: El[] = [
      { t: 'rect', x: 24, y: 24, w: W - 48, h: H - 48, stroke: accent, sw: 4 },
      { t: 'rect', x: 36, y: 36, w: W - 72, h: H - 72, stroke: accent, sw: 1 },
    ];
    for (const [x, y] of [[36, 36], [W - 36, 36], [36, H - 36], [W - 36, H - 36]]) {
      els.push({ t: 'circle', x, y, r: 7, fill: accent }, { t: 'circle', x, y, r: 3, fill: '#fdfaf3' });
    }
    if (str(d.issuer)) els.push({ t: 'text', x: 0, y: 66, w: W, text: str(d.issuer).toUpperCase(), size: 12, font: 'sans-bold', color: MUTED, align: 'center' });
    els.push({ t: 'text', x: 0, y: 92, w: W, text: title, size: fit(ctx, title, 'serif-bold', 42, W - 180), font: 'serif-bold', color: accent, align: 'center' });
    els.push(
      { t: 'line', x1: cx - 150, y1: 156, x2: cx - 10, y2: 156, color: accent, w: 1 },
      { t: 'line', x1: cx + 10, y1: 156, x2: cx + 150, y2: 156, color: accent, w: 1 },
      { t: 'circle', x: cx, y: 156, r: 3.5, fill: accent },
      { t: 'text', x: 0, y: 182, w: W, text: 'This certificate is proudly presented to', size: 16, font: 'serif-italic', color: MUTED, align: 'center' },
      { t: 'text', x: 0, y: 214, w: W, text: name, size: fit(ctx, name, 'serif-bold-italic', 44, W - 200, 18), font: 'serif-bold-italic', color: INK, align: 'center' },
      { t: 'line', x1: cx - 210, y1: 272, x2: cx + 210, y2: 272, color: accent, w: 1 },
      { t: 'text', x: 110, y: 292, w: W - 220, text: str(d.body), size: 15, font: 'serif', color: '#374151', align: 'center', lh: 1.45, maxLines: 4 },
    );
    // seal
    const sy = 455;
    els.push(
      { t: 'circle', x: cx, y: sy, r: 46, fill: accent },
      { t: 'circle', x: cx, y: sy, r: 39, stroke: '#ffffff', sw: 1.5 },
      { t: 'circle', x: cx, y: sy, r: 32, stroke: '#ffffff', sw: 0.7 },
      { t: 'text', x: cx - 40, y: sy - 5, w: 80, text: str(d.seal, 'OFFICIAL').toUpperCase(), size: 9.5, font: 'sans-bold', color: '#ffffff', align: 'center', maxLines: 1 },
    );
    // signature (left) and date (right)
    els.push(
      { t: 'line', x1: 110, y1: 480, x2: 300, y2: 480, color: INK, w: 0.8 },
      { t: 'text', x: 110, y: 487, w: 190, text: str(d.signer), size: 13, font: 'serif-bold', color: INK, align: 'center', maxLines: 1 },
      { t: 'text', x: 110, y: 504, w: 190, text: str(d.signerTitle), size: 10.5, font: 'serif', color: MUTED, align: 'center', maxLines: 1 },
      { t: 'line', x1: W - 300, y1: 480, x2: W - 110, y2: 480, color: INK, w: 0.8 },
      { t: 'text', x: W - 300, y: 460, w: 190, text: str(d.date), size: 13, font: 'serif-bold', color: INK, align: 'center', maxLines: 1 },
      { t: 'text', x: W - 300, y: 487, w: 190, text: 'Date', size: 10.5, font: 'serif', color: MUTED, align: 'center' },
    );
    if (str(d.id)) els.push({ t: 'text', x: 0, y: H - 58, w: W, text: `Certificate ID: ${str(d.id)}`, size: 8.5, color: MUTED, align: 'center' });
    return { size: 'A4', landscape: true, title: `${title} - ${name}`, author: str(d.issuer), pages: [{ bg: '#fdfaf3', els }] };
  },
};

/* ───────────────────────────── REPORT ───────────────────────────── */

function rowsOf(v: unknown): [string, string][] {
  if (Array.isArray(v)) {
    return v.map((r): [string, string] =>
      Array.isArray(r) ? [str(r[0]), str(r[1])] : [str((r as D)?.label ?? (r as D)?.key), str((r as D)?.value)]);
  }
  if (v && typeof v === 'object') return Object.entries(v as D).map(([k, val]) => [k, str(typeof val === 'object' ? JSON.stringify(val) : val)]);
  return [];
}

const report: Template = {
  description: 'Key/value report (great for lookup results). Sections, zebra rows, optional photo/QR image, paginates.',
  example: {
    title: 'Vehicle Details Report', subtitle: 'Lookup result', accent: '#0f766e',
    sections: [
      { heading: 'Registration', rows: { 'Reg. number': 'JH05AB1234', 'Registered on': '12 Mar 2019', 'RTO': 'Jamshedpur' } },
      { heading: 'Vehicle', rows: [['Make / model', 'Maruti Suzuki Swift VXI'], ['Fuel', 'Petrol'], ['Colour', 'Pearl White'], ['Insurance valid till', '11 Mar 2027']] },
    ],
    footer: 'Generated from public data. Verify before relying on it.',
  },
  build(d, ctx) {
    const W = 595.28, H = 841.89, M = 40, CW = W - 2 * M;
    const accent = accentOf(d.accent, '#0f766e');
    const title = str(d.title, 'Report');
    const LABEL_W = 170, VAL_X = M + LABEL_W + 12, VAL_W = CW - LABEL_W - 12 - 8;

    const head = (first: boolean, add: (...e: El[]) => void) => {
      if (!first) {
        add(
          { t: 'text', x: M, y: 30, w: CW, text: `${title} (continued)`, size: 11, font: 'sans-bold', color: accent, maxLines: 1 },
          { t: 'line', x1: M, y1: 52, x2: W - M, y2: 52, color: LINE },
        );
        return 70;
      }
      const img = str(d.image);
      const tw = CW - (img ? 84 : 0);
      add({ t: 'rect', x: 0, y: 0, w: W, h: 104, fill: accent });
      if (img) add(
        { t: 'rect', x: W - M - 68, y: 18, w: 68, h: 68, r: 8, fill: '#ffffff' },
        { t: 'image', x: W - M - 64, y: 22, w: 60, h: 60, src: img },
      );
      add(
        { t: 'text', x: M, y: 30, w: tw, text: title, size: fit(ctx, title, 'sans-bold', 24, tw, 14), font: 'sans-bold', color: '#ffffff', maxLines: 1 },
        { t: 'text', x: M, y: 64, w: tw, text: str(d.subtitle), size: 11, color: '#ffffff', opacity: 0.85, maxLines: 1 },
      );
      return 128;
    };

    const f = new Flow(H - 70, head);
    f.newPage();

    const sections: { heading: string; rows: [string, string][] }[] = list(d.sections).length
      ? list(d.sections).map((s) => ({ heading: str(s?.heading), rows: rowsOf(s?.rows) }))
      : [{ heading: '', rows: rowsOf(d.rows) }];

    for (const s of sections.slice(0, 30)) {
      if (s.heading) {
        f.ensure(24 + 28);
        f.add(
          { t: 'text', x: M, y: f.y + 4, text: s.heading.toUpperCase(), size: 10, font: 'sans-bold', color: accent },
          { t: 'line', x1: M, y1: f.y + 21, x2: W - M, y2: f.y + 21, color: accent, w: 1.2 },
        );
        f.y += 28;
      }
      s.rows.slice(0, 200).forEach(([k, v], i) => {
        const lines = ctx.wrap(v || '-', 'sans', 10.5, VAL_W, 8);
        const h = Math.max(26, lines.length * 14 + 12);
        if (f.ensure(h)) i = 0;
        const y = f.y;
        if (i % 2 === 0) f.add({ t: 'rect', x: M, y, w: CW, h, fill: tint(accent, 0.95) });
        f.add(
          { t: 'text', x: M + 8, y: y + 7.5, w: LABEL_W - 8, text: k, size: 9.5, font: 'sans-bold', color: MUTED, maxLines: 2 },
          { t: 'text', x: VAL_X, y: y + 7, w: VAL_W, text: lines.join('\n'), size: 10.5, lh: 1.33, color: INK },
        );
        f.y += h;
      });
      f.y += 14;
    }

    footers(f.pages, W, H, str(d.footer, `Generated ${new Date().toISOString().slice(0, 10)}`));
    return { size: 'A4', title, pages: f.pages };
  },
};

export const templates: Record<string, Template> = { invoice, certificate, report, rc };
