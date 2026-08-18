import { createHash, createHmac, randomBytes } from 'node:crypto';

const PREVIEW_SERVICE = 'https://resthreadspreviewv2-a5cg23oqta-uc.a.run.app';
const GCP_PROJECT_NUMBER = '406624698335';
const WORKLOAD_IDENTITY_POOL = 'vercel';
const WORKLOAD_IDENTITY_PROVIDER = 'vercel';
const SERVICE_ACCOUNT = 'resthreads-preview-invoker@campusthreads-4693b.iam.gserviceaccount.com';
const WORKLOAD_AUDIENCE = `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WORKLOAD_IDENTITY_POOL}/providers/${WORKLOAD_IDENTITY_PROVIDER}`;
const PREVIEW_SLUG = /^rt-[a-f0-9]{48}$/;

let cachedIdToken = { token: '', expiresAt: 0 };

export const config = { maxDuration: 30 };

const clientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || '').trim();
};

const setCorsHeaders = (req, res) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
};

const parseJwtExpiry = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number(payload.exp || 0) * 1000;
  } catch {
    return 0;
  }
};

const exchangeVercelIdentity = async (req) => {
  if (cachedIdToken.token && cachedIdToken.expiresAt > Date.now() + 60_000) {
    return cachedIdToken.token;
  }

  const vercelOidcToken = String(req.headers['x-vercel-oidc-token'] || '').trim();
  if (!vercelOidcToken) throw new Error('missing Vercel workload identity');

  const tokenExchange = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      audience: WORKLOAD_AUDIENCE,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      subject_token: vercelOidcToken,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const exchanged = await tokenExchange.json().catch(() => ({}));
  if (!tokenExchange.ok || !exchanged.access_token) {
    throw new Error(`workload identity exchange failed (${tokenExchange.status})`);
  }

  const identityResponse = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(SERVICE_ACCOUNT)}:generateIdToken`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${exchanged.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audience: PREVIEW_SERVICE, includeEmail: true }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  const identity = await identityResponse.json().catch(() => ({}));
  if (!identityResponse.ok || !identity.token) {
    throw new Error(`service identity exchange failed (${identityResponse.status})`);
  }

  cachedIdToken = { token: identity.token, expiresAt: parseJwtExpiry(identity.token) };
  return identity.token;
};

const sendUpstreamJson = async (response, res) => {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    console.error('preview service returned non-JSON', response.status, response.headers.get('content-type'));
    return res.status(502).json({ ok: false, error: 'preview_unavailable' });
  }
  return res.status(response.status).json(payload);
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const googleIdToken = await exchangeVercelIdentity(req);

    if (req.method === 'GET') {
      const slug = String(req.query?.slug || '').trim().toLowerCase();
      if (!PREVIEW_SLUG.test(slug)) {
        return res.status(400).json({ ok: false, error: 'invalid_preview' });
      }
      const response = await fetch(`${PREVIEW_SERVICE}?slug=${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${googleIdToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      return sendUpstreamJson(response, res);
    }

    const signingSecret = process.env.RESTHREADS_PREVIEW_SIGNING_SECRET;
    if (!signingSecret) return res.status(503).json({ ok: false, error: 'preview_unavailable' });
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
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
    const response = await fetch(PREVIEW_SERVICE, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${googleIdToken}`,
        'Content-Type': 'application/json',
        'X-ResThreads-Timestamp': timestamp,
        'X-ResThreads-Nonce': nonce,
        'X-ResThreads-Client-IP': originalClientIp,
        'X-ResThreads-Signature': signature,
      },
      body: upstreamBody,
      signal: AbortSignal.timeout(22_000),
    });
    return sendUpstreamJson(response, res);
  } catch (error) {
    console.error('preview service unavailable', error?.message);
    return res.status(502).json({ ok: false, error: 'preview_unavailable' });
  }
}
