import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createCtx, renderDoc, validateDoc, DocError, type Ctx } from './render.js';
import { templates } from './templates.js';
import { signToken, verifyToken, type Payload } from './sign.js';
import type { Doc } from './types.js';

const app = new Hono();

const apiKey = () => process.env.API_KEY ?? '';
const secret = () => process.env.SIGNING_SECRET || apiKey();
const sha = (s: string) => createHash('sha256').update(s).digest();

function requireKey(c: Context) {
  const want = apiKey();
  if (!want) throw new HTTPException(500, { message: 'API_KEY env var is not set on the server' });
  const got = c.req.header('x-api-key') ?? c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!timingSafeEqual(sha(got), sha(want))) throw new HTTPException(401, { message: 'invalid or missing API key (send x-api-key header)' });
}

async function readBody(c: Context): Promise<Record<string, any>> {
  try {
    const b = await c.req.json();
    if (b && typeof b === 'object' && !Array.isArray(b)) return b;
  } catch { /* fall through */ }
  throw new HTTPException(400, { message: 'body must be a JSON object' });
}

async function buildDoc(p: { tpl?: string; data?: unknown; doc?: unknown }, ctx: Ctx): Promise<Doc> {
  if (p.tpl) {
    const t = templates[p.tpl];
    if (!t) throw new DocError(`unknown template "${p.tpl}". Available: ${Object.keys(templates).join(', ')}`);
    return t.build((p.data ?? {}) as Record<string, any>, ctx);
  }
  if (p.doc) { validateDoc(p.doc); return p.doc; }
  throw new DocError('send {"template": "...", "data": {...}} or {"doc": {...}}');
}

const safeName = (n: unknown) =>
  (String(n ?? 'document').replace(/\.pdf$/i, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'document') + '.pdf';

const pdfResponse = (bytes: Uint8Array, filename: string) =>
  new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });

function baseUrl(c: Context) {
  const env = process.env.PUBLIC_URL?.replace(/\/$/, '');
  if (env) return env;
  const u = new URL(c.req.url);
  return /^(localhost|127\.)/.test(u.hostname) ? u.origin : `https://${u.host}`;
}

/* ───────────── public ───────────── */

app.get('/', (c) =>
  c.json({
    ok: true,
    name: 'tbc-pdf-api',
    configured: Boolean(apiKey()),
    templates: Object.keys(templates),
    endpoints: {
      'POST /make': 'auth. {template,data | doc, filename?, ttl?} -> {url}. Give the url to bot.sendDocument()',
      'POST /render': 'auth. same body, returns the PDF bytes directly',
      'GET /templates': 'template list + example data',
      'GET /preview/:name': 'open a template with its example data in the browser',
    },
  }));

app.get('/templates', (c) =>
  c.json({
    ok: true,
    templates: Object.fromEntries(Object.entries(templates).map(([k, t]) => [k, { description: t.description, example: t.example }])),
  }));

app.get('/preview/:name', async (c) => {
  const t = templates[c.req.param('name')];
  if (!t) throw new HTTPException(404, { message: 'unknown template' });
  const ctx = await createCtx();
  return pdfResponse(await renderDoc(t.build(t.example, ctx), ctx), `${c.req.param('name')}-preview.pdf`);
});

/** The link Telegram fetches. Signed + expiring, so only /make can create valid ones. */
app.get('/f/:token/:filename?', async (c) => {
  const p = verifyToken(c.req.param('token'), secret());
  if (!p) throw new HTTPException(410, { message: 'link is invalid or expired' });
  const ctx = await createCtx();
  const doc = await buildDoc(p, ctx);
  return pdfResponse(await renderDoc(doc, ctx), safeName(p.fn ?? c.req.param('filename')));
});

/* ───────────── protected ───────────── */

app.post('/make', async (c) => {
  requireKey(c);
  const b = await readBody(c);
  const ttl = Math.min(Math.max(Number(b.ttl) || 600, 60), 3600);
  const payload: Payload = {
    ...(b.template ? { tpl: String(b.template), data: b.data ?? {} } : { doc: b.doc }),
    fn: safeName(b.filename ?? b.template),
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  // validate now so the bot gets a readable error instead of Telegram failing silently
  await buildDoc(payload, await createCtx());
  const token = signToken(payload, secret());
  if (token.length > 6000) throw new HTTPException(413, { message: 'payload too large for a link; use POST /render or send less data' });
  return c.json({ ok: true, url: `${baseUrl(c)}/f/${token}/${payload.fn}`, filename: payload.fn, expires_in: ttl });
});

app.post('/render', async (c) => {
  requireKey(c);
  const b = await readBody(c);
  const ctx = await createCtx();
  const doc = await buildDoc(b.template ? { tpl: String(b.template), data: b.data } : { doc: b.doc }, ctx);
  return pdfResponse(await renderDoc(doc, ctx), safeName(b.filename ?? b.template));
});

/* ───────────── errors ───────────── */

app.notFound((c) => c.json({ ok: false, error: 'not found' }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ ok: false, error: err.message }, err.status);
  if (err instanceof DocError) return c.json({ ok: false, error: err.message }, 400);
  console.error(err);
  return c.json({ ok: false, error: 'internal error while generating the PDF' }, 500);
});

export default app;
