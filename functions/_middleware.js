// Cloudflare Pages middleware — HTTP Basic Auth gate for a private deployment.
//
// Runs on every request to the Pages site before any asset/route is served.
// The password lives in the Cloudflare Pages environment variable SITE_PASSWORD
// (set in the dashboard, never committed). Optional SITE_USERNAME (default
// "admin"). If SITE_PASSWORD is unset the gate is DISABLED (fail-open) so a
// deploy can never lock you out before you've configured the secret — set the
// env var to activate the password prompt.

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Compare over the max length so the loop count doesn't leak which string is
  // shorter; mismatched lengths still fail via the length XOR seed.
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const onRequest = async (context) => {
  const { request, env, next } = context;

  const password = env.SITE_PASSWORD;
  if (!password) return next(); // gate disabled until a password is configured

  const expectedUser = env.SITE_USERNAME || 'admin';
  const header = request.headers.get('Authorization') || '';

  if (header.startsWith('Basic ')) {
    let decoded = '';
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = '';
    }
    const sep = decoded.indexOf(':');
    if (sep !== -1) {
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      // Evaluate both comparisons regardless so auth timing doesn't reveal
      // whether the username alone was correct.
      const okUser = timingSafeEqual(user, expectedUser);
      const okPass = timingSafeEqual(pass, password);
      if (okUser && okPass) return next();
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="World Monitor (private)", charset="UTF-8"',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
