import { createHash, createHmac, randomBytes } from 'node:crypto';

const PREVIEW_SERVICE = 'https://resthreadspreviewv2-a5cg23oqta-uc.a.run.app';

const clientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || '').trim();
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const signingSecret = process.env.RESTHREADS_PREVIEW_SIGNING_SECRET;
  if (!signingSecret) return res.status(503).json({ ok: false, error: 'preview_unavailable' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const url = String(body?.url || '').trim().slice(0, 500);
  if (!url) return res.status(400).json({ ok: false, error: 'invalid_url' });
  const originalClientIp = clientIp(req);
  if (!originalClientIp || originalClientIp.length > 100) {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }
  const upstreamBody = Buffer.from(JSON.stringify({ url }));
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString('hex');
  const bodyDigest = createHash('sha256').update(upstreamBody).digest('hex');
  const signature = createHmac('sha256', signingSecret)
    .update(`${timestamp}\n${nonce}\n${originalClientIp}\n${bodyDigest}`)
    .digest('hex');
  try {
    const response = await fetch(PREVIEW_SERVICE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ResThreads-Timestamp': timestamp,
        'X-ResThreads-Nonce': nonce,
        'X-ResThreads-Client-IP': originalClientIp,
        'X-ResThreads-Signature': signature,
      },
      body: upstreamBody,
      signal: AbortSignal.timeout(22000),
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch {
      console.error('preview service returned non-JSON', response.status, response.headers.get('content-type'));
      return res.status(502).json({ ok: false, error: 'preview_unavailable' });
    }
    return res.status(response.status).json(payload);
  } catch (error) {
    console.error('preview service unavailable', error?.message);
    return res.status(502).json({ ok: false, error: 'preview_unavailable' });
  }
}
