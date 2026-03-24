const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async (req, res) => {
  // Set CORS headers on every response
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method Not Allowed' } });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY is not configured' } });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const responseBody = await forwardToAnthropic(body, apiKey);
    res.status(200).json(JSON.parse(responseBody));
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: { message: err.message } });
  }
};

function forwardToAnthropic(body, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(body),
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => { data += chunk; });
      proxyRes.on('end', () => {
        if (proxyRes.statusCode >= 400) {
          const err = new Error(extractErrorMessage(data));
          err.statusCode = proxyRes.statusCode;
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    proxyReq.on('error', err => reject(err));
    proxyReq.write(body);
    proxyReq.end();
  });
}

function extractErrorMessage(body) {
  try {
    return JSON.parse(body)?.error?.message || 'Anthropic API error';
  } catch {
    return 'Anthropic API error';
  }
}
