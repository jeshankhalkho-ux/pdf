// Run: npm run smoke   (writes sample PDFs to ./out)
import { mkdirSync, writeFileSync } from 'node:fs';
import app from '../src/index.js';

process.env.API_KEY = 'test-key';
mkdirSync('out', { recursive: true });

const H = { 'content-type': 'application/json', 'x-api-key': 'test-key' };
let failed = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const isPdf = async (r: Response) => r.status === 200 && r.headers.get('content-type') === 'application/pdf' && (await r.clone().text()).startsWith('%PDF');
const save = async (r: Response, file: string) => writeFileSync(`out/${file}`, Buffer.from(await r.arrayBuffer()));

// 1. previews of every template
for (const name of ['invoice', 'certificate', 'report', 'rc']) {
  const r = await app.request(`/preview/${name}`);
  check(`preview ${name}`, await isPdf(r));
  await save(r, `${name}.pdf`);
}

// 2. auth + signed link flow
let r = await app.request('/make', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
check('make without key -> 401', r.status === 401);

r = await app.request('/make', { method: 'POST', headers: H, body: JSON.stringify({ template: 'nope' }) });
check('make unknown template -> 400', r.status === 400, (await r.json() as any).error);

r = await app.request('/make', { method: 'POST', headers: H, body: JSON.stringify({ template: 'invoice', data: { brand: 'Test Co', invoiceNo: 'T-1', items: [{ desc: 'Thing', qty: 2, price: 99.5 }] }, filename: 'my invoice #1' }) });
const made = await r.json() as any;
check('make -> url', made.ok && /\/f\/.+\/my_invoice_1\.pdf$/.test(made.url), made.url?.slice(0, 60) + '...');
const path = new URL(made.url).pathname;
r = await app.request(path);
check('open signed link', await isPdf(r) && r.headers.get('content-disposition')!.includes('my_invoice_1.pdf'));
r = await app.request(path.replace('/f/', '/f/x'));
check('tampered link -> 410', r.status === 410);

// 3. raw doc: every element type, rounded rect, image, symbols
const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const doc = {
  size: 'A5', title: 'Elements demo',
  pages: [{
    bg: '#f8fafc',
    els: [
      { t: 'rect', x: 20, y: 20, w: 380, h: 90, r: 14, fill: '#4f46e5' },
      { t: 'rect', x: 30, y: 30, w: 100, h: 30, r: 6, stroke: '#ffffff', sw: 1.5 },
      { t: 'circle', x: 350, y: 65, r: 28, fill: '#fbbf24', stroke: '#ffffff', sw: 2 },
      { t: 'text', x: 20, y: 40, w: 380, text: 'Price: ₹1,499 → paid ✓', size: 20, font: 'serif-bold', color: '#ffffff', align: 'center' },
      { t: 'text', x: 20, y: 130, w: 380, text: 'Hindi नमस्ते and emoji 😀 degrade to ?. A very long wrapped paragraph to prove wrapping works across several lines in the box width we gave it here.', size: 11, maxLines: 3 },
      { t: 'line', x1: 20, y1: 200, x2: 400, y2: 200, color: '#ef4444', w: 2, dash: [6, 3] },
      { t: 'image', x: 20, y: 215, w: 60, h: 60, src: px },
      { t: 'image', x: 100, y: 215, w: 60, h: 60, src: 'https://localhost/x.png' },
      { t: 'text', x: 20, y: 300, text: 'mono line', font: 'mono', size: 10 },
      { t: 'grad', x: 20, y: 320, w: 380, h: 44, colors: ['#071a34', '#0d2b52', '#1e5aa8'], dir: 'h', r: 10 },
      { t: 'grad', x: 20, y: 376, w: 380, h: 24, colors: ['transparent', '#f2b03d', 'transparent'], dir: 'h', r: 12 },
      { t: 'text', x: 20, y: 412, text: 'letter spaced', font: 'sans-bold', size: 18, track: 4, color: '#0d2b52' },
    ],
  }],
};
r = await app.request('/render', { method: 'POST', headers: H, body: JSON.stringify({ doc, filename: 'elements' }) });
check('render raw doc', await isPdf(r));
await save(r, 'elements.pdf');

r = await app.request('/render', { method: 'POST', headers: H, body: JSON.stringify({ doc: { pages: [{ els: [{ t: 'blob' }] }] } }) });
check('unknown element -> 400', r.status === 400, (await r.json() as any).error);

// 4. pagination
const items = Array.from({ length: 45 }, (_, i) => ({ desc: `Line item number ${i + 1} with a reasonably long description to test clipping behaviour`, sub: i % 3 ? '' : 'sub text', qty: i + 1, price: 1234.5 }));
r = await app.request('/render', { method: 'POST', headers: H, body: JSON.stringify({ template: 'invoice', data: { brand: 'Big Co', invoiceNo: 'BIG-1', items, taxPct: 18, notes: 'n '.repeat(60), payment: ['UPI: a@b'] }, filename: 'big-invoice' }) });
check('45-item invoice', await isPdf(r));
await save(r, 'invoice-big.pdf');

const rows: Record<string, string> = {};
for (let i = 1; i <= 60; i++) rows[`Field ${i}`] = i % 7 === 0 ? 'A long value that must wrap onto multiple lines because it is quite a lot longer than a single line can hold in this column. '.repeat(2) : `value ${i}`;
r = await app.request('/render', { method: 'POST', headers: H, body: JSON.stringify({ template: 'report', data: { title: 'Long report', rows, image: px }, filename: 'long-report' }) });
check('60-row report', await isPdf(r));
await save(r, 'report-long.pdf');

// 5. rc template: raw vehicle-API-shaped payload through the signed-link flow
r = await app.request('/make', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    template: 'rc',
    filename: 'RC_JH05ED4359',
    data: {
      registration_number: 'JH05ED4359', registration_date: '31/10/2025', owner_name: 'ANJALI KUMARI',
      vehicle_type: 'two_wheeler', fuel_type: 'petrol', cc: 109, seating_capacity: 2,
      chassis_number: 'ME4JK371JSG010589', engine_number: 'JK37EG1010703',
      rto_code: 'JH-05', rto_name: 'EAST SINGHBHUM (JAMSHEDPUR), Jharkhand',
    },
  }),
});
const rcMade = await r.json() as any;
check('make rc -> url', rcMade.ok && /RC_JH05ED4359\.pdf$/.test(rcMade.url), rcMade.url?.slice(0, 60) + '...');
if (rcMade.ok) {
  r = await app.request(new URL(rcMade.url).pathname);
  check('open rc link', await isPdf(r));
  await save(r, 'rc-from-make.pdf');
}

console.log(failed ? `\n${failed} FAILED` : '\nall good');
process.exit(failed ? 1 : 0);
