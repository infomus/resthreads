const PREVIEW_SERVICE = 'https://resthreadspreviewv2-a5cg23oqta-uc.a.run.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const url = String(body?.url || '').trim().slice(0, 500);
  if (!url) return res.status(400).json({ ok: false, error: 'invalid_url' });
  try {
    const response = await fetch(PREVIEW_SERVICE, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://resthreads.com' },
      body: JSON.stringify({ url }), signal: AbortSignal.timeout(18000),
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
