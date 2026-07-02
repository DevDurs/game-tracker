// HTTP Basic Auth for the /admin panel and /api/admin/* routes. Single
// user, credentials from ADMIN_USERNAME / ADMIN_PASSWORD in the
// environment (.env). No sessions, no cookies, no user table — this is
// meant for one operator behind a Cloudflare Tunnel (HTTPS at the edge),
// not a multi-user system.
const crypto = require('crypto');

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Compare against something of matching length anyway so the
    // response time doesn't leak the correct credential length.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdminAuth(req, res, next) {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return res
      .status(500)
      .send('Admin panel is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env and restart.');
  }

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme !== 'Basic' || !encoded) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required.');
  }

  let decoded;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch (err) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Invalid credentials.');
  }

  const sepIndex = decoded.indexOf(':');
  const reqUser = sepIndex === -1 ? decoded : decoded.slice(0, sepIndex);
  const reqPass = sepIndex === -1 ? '' : decoded.slice(sepIndex + 1);

  const userOk = timingSafeEqualStr(reqUser, expectedUser);
  const passOk = timingSafeEqualStr(reqPass, expectedPass);

  if (!userOk || !passOk) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Invalid credentials.');
  }

  next();
}

module.exports = { requireAdminAuth };
