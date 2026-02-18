const DEFAULT_ORG = 'MicrosoftCloudEssentials-LearningHub';

function json(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
    ...init,
  });
}

function base64urlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlDecodeToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textEncoder() {
  return new TextEncoder();
}

async function hmacSha256(keyString, messageString) {
  const keyBytes = textEncoder().encode(keyString);
  const msgBytes = textEncoder().encode(messageString);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const sig = await crypto.subtle.sign('HMAC', key, msgBytes);
  return new Uint8Array(sig);
}

async function makeState({ stateSecret, returnTo }) {
  const payload = {
    v: 1,
    returnTo,
    exp: Date.now() + 10 * 60 * 1000, // 10 minutes
  };
  const payloadBytes = textEncoder().encode(JSON.stringify(payload));
  const payloadPart = base64urlEncode(payloadBytes);
  const sigBytes = await hmacSha256(stateSecret, payloadPart);
  const sigPart = base64urlEncode(sigBytes);
  return `${payloadPart}.${sigPart}`;
}

async function verifyState({ stateSecret, state }) {
  const [payloadPart, sigPart] = String(state || '').split('.');
  if (!payloadPart || !sigPart) return { ok: false, error: 'invalid_state' };

  const expectedSig = await hmacSha256(stateSecret, payloadPart);
  const actualSig = base64urlDecodeToBytes(sigPart);

  if (expectedSig.length !== actualSig.length) return { ok: false, error: 'invalid_state_sig' };
  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) mismatch |= expectedSig[i] ^ actualSig[i];
  if (mismatch !== 0) return { ok: false, error: 'invalid_state_sig' };

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecodeToBytes(payloadPart)));
  } catch {
    return { ok: false, error: 'invalid_state_payload' };
  }

  if (!payload?.returnTo || typeof payload.returnTo !== 'string') return { ok: false, error: 'invalid_state_payload' };
  if (typeof payload?.exp !== 'number' || Date.now() > payload.exp) return { ok: false, error: 'state_expired' };

  return { ok: true, payload };
}

function isOriginAllowed({ allowedOrigins, returnTo }) {
  let url;
  try {
    url = new URL(returnTo);
  } catch {
    return false;
  }

  // allow only http/https
  if (!(url.protocol === 'https:' || url.protocol === 'http:')) return false;

  if (!allowedOrigins?.length) return true;
  return allowedOrigins.includes(url.origin);
}

async function exchangeCodeForToken({ clientId, clientSecret, code, redirectUri }) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`token_exchange_failed_${res.status}`);
  if (data?.error) throw new Error(`token_exchange_${data.error}`);
  if (!data?.access_token) throw new Error('token_exchange_no_token');
  return { accessToken: data.access_token, tokenType: data.token_type, scope: data.scope };
}

async function githubJson(url, accessToken) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { res, data };
}

async function handleLogin(request, env) {
  const url = new URL(request.url);

  const returnTo = url.searchParams.get('returnTo') || '';
  const allowedOrigins = String(env.ALLOWED_RETURN_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!isOriginAllowed({ allowedOrigins, returnTo })) {
    return json({
      error: 'invalid_return_to',
      hint: 'Configure ALLOWED_RETURN_ORIGINS to include your GitHub Pages origin.',
    }, { status: 400 });
  }

  const clientId = env.GITHUB_CLIENT_ID;
  const stateSecret = env.STATE_SECRET;
  if (!clientId || !stateSecret) {
    return json({ error: 'server_not_configured' }, { status: 500 });
  }

  const state = await makeState({ stateSecret, returnTo });

  // Minimum needed to list private org repos: repo + read:org
  const scope = 'read:org repo';

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', `${url.origin}/callback`);
  authorizeUrl.searchParams.set('scope', scope);
  authorizeUrl.searchParams.set('state', state);

  return Response.redirect(authorizeUrl.toString(), 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const stateSecret = env.STATE_SECRET;
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  const org = String(env.ORG_NAME || DEFAULT_ORG);

  if (!code || !state) return json({ error: 'missing_code_or_state' }, { status: 400 });
  if (!stateSecret || !clientId || !clientSecret) return json({ error: 'server_not_configured' }, { status: 500 });

  const verified = await verifyState({ stateSecret, state });
  if (!verified.ok) return json({ error: verified.error }, { status: 400 });

  const returnTo = verified.payload.returnTo;

  const allowedOrigins = String(env.ALLOWED_RETURN_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!isOriginAllowed({ allowedOrigins, returnTo })) {
    return json({ error: 'invalid_return_to' }, { status: 400 });
  }

  let token;
  try {
    token = await exchangeCodeForToken({
      clientId,
      clientSecret,
      code,
      redirectUri: `${url.origin}/callback`,
    });
  } catch (err) {
    const dest = new URL(returnTo);
    dest.hash = `error=oauth_exchange_failed`;
    return Response.redirect(dest.toString(), 302);
  }

  // Verify org membership using the GitHub token
  const { res: membershipRes, data: membershipData } = await githubJson(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(org)}`,
    token.accessToken
  );

  if (!membershipRes.ok || membershipData?.state !== 'active') {
    const dest = new URL(returnTo);
    dest.hash = `error=not_authorized&org=${encodeURIComponent(org)}`;
    return Response.redirect(dest.toString(), 302);
  }

  // Redirect back with the GitHub access token in the fragment.
  // Fragment is not sent to servers and avoids leaking in request logs.
  const dest = new URL(returnTo);
  dest.hash = `access_token=${encodeURIComponent(token.accessToken)}&token_type=${encodeURIComponent(
    token.tokenType || 'bearer'
  )}&scope=${encodeURIComponent(token.scope || '')}&org=${encodeURIComponent(org)}`;

  return Response.redirect(dest.toString(), 302);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'org-catalog-auth' });
    }

    if (request.method === 'GET' && url.pathname === '/login') {
      return handleLogin(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/callback') {
      return handleCallback(request, env);
    }

    return json({ error: 'not_found' }, { status: 404 });
  },
};
