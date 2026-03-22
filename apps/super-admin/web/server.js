const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3003);
const PUBLIC_DIR = path.resolve(
  __dirname,
  process.env.SUPER_ADMIN_WEB_PUBLIC_DIR || './public',
);
const API_BASE_URL = normalizeBaseUrl(
  process.env.SUPER_ADMIN_API_BASE_URL,
  'http://localhost:3005/admin/api/super-admin',
);
const BROWSER_API_BASE_URL = normalizeBaseUrl(
  process.env.SUPER_ADMIN_BROWSER_API_BASE_URL,
  '/admin/api/super-admin',
);
const API_PROXY_PREFIX = '/admin/api/super-admin';
const CONTENT_TYPES = {
  '.css': 'text/css; charset=UTF-8',
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'super-admin-web',
      timestamp: Math.floor(Date.now() / 1000),
    });
  }

  if (pathname === '/_config.js') {
    return sendRuntimeConfig(res);
  }

  if (pathname.startsWith(API_PROXY_PREFIX)) {
    return proxyApi(req, res, requestUrl);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { message: 'Method Not Allowed' });
  }

  const routeFile = resolveRouteFile(pathname);
  if (!routeFile) {
    return sendJson(res, 404, { message: 'Not Found' });
  }

  return sendFile(res, routeFile, req.method === 'HEAD');
});

server.listen(PORT, () => {
  console.log(`ClickGarcom Super Admin Web running on http://localhost:${PORT}`);
});

function sendRuntimeConfig(res) {
  const payload = {
    apiBaseUrl: BROWSER_API_BASE_URL,
    loginPagePath: '/login.html',
    appHomePath: '/',
  };

  res.writeHead(200, {
    'Content-Type': 'application/javascript; charset=UTF-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end(`window.CLICKGARCOM_SUPER_ADMIN_CONFIG = Object.freeze(${JSON.stringify(payload)});`);
}

async function proxyApi(req, res, requestUrl) {
  try {
    const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, `${API_BASE_URL}/`);
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];

    const body = req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : await readRequestBody(req);

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    });

    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (!isHopByHopHeader(key)) {
        responseHeaders[key] = value;
      }
    });

    res.writeHead(upstream.status, responseHeaders);

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const payload = Buffer.from(await upstream.arrayBuffer());
    res.end(payload);
  } catch (error) {
    sendJson(res, 502, {
      message: `Falha ao comunicar com o Super Admin API: ${error.message}`,
    });
  }
}

function resolveRouteFile(pathname) {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const candidate = safeJoin(PUBLIC_DIR, normalizedPath);

  if (candidate && fileExists(candidate)) {
    return candidate;
  }

  if (pathname === '/login') {
    return safeJoin(PUBLIC_DIR, '/login.html');
  }

  if (!path.extname(pathname)) {
    return safeJoin(PUBLIC_DIR, '/index.html');
  }

  return null;
}

function sendFile(res, filename, headOnly) {
  fs.readFile(filename, (error, data) => {
    if (error) {
      sendJson(res, 404, { message: 'Not Found' });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html'
        ? 'no-store, no-cache, must-revalidate, proxy-revalidate'
        : 'public, max-age=300',
    });

    if (headOnly) {
      res.end();
      return;
    }

    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(payload));
}

function safeJoin(rootDir, requestPath) {
  const resolved = path.resolve(rootDir, `.${requestPath}`);
  if (!resolved.startsWith(rootDir)) {
    return null;
  }
  return resolved;
}

function fileExists(filename) {
  try {
    return fs.statSync(filename).isFile();
  } catch (_error) {
    return false;
  }
}

function normalizeBaseUrl(rawValue, fallback) {
  const value = String(rawValue || '').trim();
  return (value || fallback).replace(/\/+$/, '');
}

function isHopByHopHeader(name) {
  return [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ].includes(String(name || '').toLowerCase());
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}
