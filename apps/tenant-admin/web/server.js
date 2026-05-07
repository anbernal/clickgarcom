const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3004);
const PUBLIC_DIR = path.resolve(
  __dirname,
  process.env.ADMIN_WEB_PUBLIC_DIR || './public',
);
const DISABLE_TEXT_ASSET_CACHE = String(
  process.env.ADMIN_WEB_DISABLE_TEXT_ASSET_CACHE || 'true',
).trim().toLowerCase() !== 'false';
const CONFIGURED_BASE_PATH = normalizePathPrefix(process.env.ADMIN_WEB_BASE_PATH || '');

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

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const requestBasePath = resolveRequestBasePath(req);
  const appPath = stripBasePath(pathname, requestBasePath);

  if (appPath === null) {
    return sendJson(res, 404, { message: 'Not Found' });
  }

  if (appPath === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'web-admin',
      timestamp: Math.floor(Date.now() / 1000),
    });
  }

  if (appPath === '/_config.js') {
    return sendRuntimeConfig(req, res, requestBasePath);
  }

  if (appPath === '/admin/api' || appPath.startsWith('/admin/api/')) {
    const appRequestUrl = new URL(appPath + requestUrl.search, requestUrl.origin);
    return proxyHttpRequest(req, res, resolveAdminApiProxyTarget(), appRequestUrl);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { message: 'Method Not Allowed' });
  }

  const routeFile = resolveRouteFile(appPath);
  if (!routeFile) {
    return sendJson(res, 404, { message: 'Not Found' });
  }

  return sendFile(req, res, routeFile, req.method === 'HEAD', requestBasePath);
});

server.listen(PORT, () => {
  console.log(`ClickGarcom Web Admin running on http://localhost:${PORT}`);
});

function sendRuntimeConfig(req, res, requestBasePath) {
  const requestOrigin = getRequestOrigin(req);
  const isPublicProxyRequest = detectPublicProxyRequest(req);
  const apiBaseUrl = resolveAdminApiBaseUrl(req, { isPublicProxyRequest, requestBasePath });
  const publicTablesApiBaseUrl = normalizeBaseUrl(
    process.env.ADMIN_PUBLIC_API_BASE_URL,
    isPublicProxyRequest
      ? new URL(buildPathWithBase(requestBasePath, '/admin/api/public/tables'), requestOrigin).toString()
      : `${apiBaseUrl}/public/tables`,
  );
  const kdsWsUrl = resolveKdsWebSocketUrl(req, { isPublicProxyRequest });
  const payload = {
    apiBaseUrl,
    publicTablesApiBaseUrl,
    kdsWsUrl,
    appBasePath: requestBasePath,
    loginPagePath: buildPathWithBase(requestBasePath, '/login.html'),
    appHomePath: buildPathWithBase(requestBasePath, '/'),
  };

  res.writeHead(200, {
    'Content-Type': 'application/javascript; charset=UTF-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end(`window.CLICKGARCOM_RUNTIME_CONFIG = Object.freeze(${JSON.stringify(payload)});`);
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

function sendFile(req, res, filename, headOnly, requestBasePath) {
  fs.readFile(filename, (error, data) => {
    if (error) {
      sendJson(res, 404, { message: 'Not Found' });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': resolveCacheControl(ext),
    });

    if (headOnly) {
      res.end();
      return;
    }

    if (path.extname(filename).toLowerCase() === '.html') {
      res.end(rewriteHtmlRootPaths(data.toString('utf8'), requestBasePath));
      return;
    }

    res.end(data);
  });
}

function resolveCacheControl(ext) {
  if (ext === '.html') {
    return 'no-store, no-cache, must-revalidate, proxy-revalidate';
  }

  if (DISABLE_TEXT_ASSET_CACHE && ['.js', '.css', '.json', '.svg'].includes(ext)) {
    return 'no-store, no-cache, must-revalidate, proxy-revalidate';
  }

  return 'public, max-age=300';
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(payload));
}

function proxyHttpRequest(clientReq, clientRes, targetBaseUrl, requestUrl) {
  const targetUrl = new URL(requestUrl.pathname + requestUrl.search, targetBaseUrl);
  const transport = targetUrl.protocol === 'https:' ? https : http;
  const proxyReq = transport.request(targetUrl, {
    method: clientReq.method,
    headers: buildProxyHeaders(clientReq.headers, targetUrl),
  }, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    delete headers['content-length'];
    delete headers['transfer-encoding'];
    headers['cache-control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
    clientRes.writeHead(proxyRes.statusCode || 502, headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', (error) => {
    sendJson(clientRes, 502, {
      message: 'Falha ao encaminhar requisicao para a API administrativa.',
      error: error.message,
    });
  });

  clientReq.pipe(proxyReq);
}

function buildProxyHeaders(headers, targetUrl) {
  const nextHeaders = { ...headers };
  nextHeaders.host = targetUrl.host;
  nextHeaders['x-forwarded-host'] = headers.host || targetUrl.host;
  nextHeaders['x-forwarded-proto'] = getRequestProtocolFromHeaders(headers);
  return nextHeaders;
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

function resolveAdminApiProxyTarget() {
  const configuredValue = String(process.env.ADMIN_API_PROXY_TARGET || '').trim();
  if (configuredValue) {
    return normalizeBaseUrl(configuredValue, '');
  }

  return 'http://node-admin:3002';
}

function resolveAdminApiBaseUrl(req, options = {}) {
  const configuredValue = String(process.env.ADMIN_API_BASE_URL || '').trim();
  if (configuredValue) {
    return normalizeBaseUrl(configuredValue, '');
  }

  if (options.isPublicProxyRequest) {
    return new URL(
      buildPathWithBase(options.requestBasePath || '', '/admin/api'),
      getRequestOrigin(req),
    ).toString().replace(/\/+$/, '');
  }

  return buildBrowserServiceUrl(req, {
    pathname: '/admin/api',
    port: process.env.ADMIN_API_BROWSER_PORT || '3002',
  });
}

function resolveKdsWebSocketUrl(req, options = {}) {
  const configuredValue = String(process.env.KDS_WS_URL || '').trim();
  if (configuredValue) {
    return configuredValue.replace(/\/+$/, '');
  }

  if (options.isPublicProxyRequest) {
    const origin = getRequestOrigin(req);
    const targetUrl = new URL('/ws/kds', origin);
    targetUrl.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
    return targetUrl.toString().replace(/\/+$/, '');
  }

  const origin = getRequestOrigin(req);
  return buildBrowserServiceUrl(req, {
    pathname: '/ws/kds',
    port: process.env.KDS_WS_BROWSER_PORT || '8080',
    protocol: origin.protocol === 'https:' ? 'wss:' : 'ws:',
  });
}

function buildBrowserServiceUrl(req, { pathname, port, protocol }) {
  const origin = getRequestOrigin(req);
  const targetUrl = new URL(pathname, origin);

  if (protocol) {
    targetUrl.protocol = protocol;
  }

  if (String(port || '').trim()) {
    targetUrl.port = String(port).trim();
  }

  return targetUrl.toString().replace(/\/+$/, '');
}

function getRequestOrigin(req) {
  const forwardedProto = getRequestProtocolFromHeaders(req.headers);
  const forwardedHost = getForwardedHeader(req.headers['x-forwarded-host']);
  const host = forwardedHost || req.headers.host || `localhost:${PORT}`;
  const protocol = forwardedProto || 'http';

  try {
    return new URL(`${protocol}://${host}`);
  } catch (_error) {
    return new URL(`http://localhost:${PORT}`);
  }
}

function getForwardedHeader(value) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return String(normalized || '').split(',')[0].trim();
}

function getRequestProtocolFromHeaders(headers) {
  return getForwardedHeader(headers['x-forwarded-proto']) || '';
}

function detectPublicProxyRequest(req) {
  const forwardedHost = getForwardedHeader(req.headers['x-forwarded-host']);
  const forwardedProto = getForwardedHeader(req.headers['x-forwarded-proto']);
  return Boolean(forwardedHost || forwardedProto);
}

function normalizePathPrefix(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  return prefixed.replace(/\/+$/, '');
}

function resolveRequestBasePath(req) {
  const forwardedPrefix = normalizePathPrefix(getForwardedHeader(req.headers['x-forwarded-prefix']));
  if (forwardedPrefix) {
    return forwardedPrefix;
  }

  if (CONFIGURED_BASE_PATH && detectPublicProxyRequest(req)) {
    return CONFIGURED_BASE_PATH;
  }

  return '';
}

function stripBasePath(pathname, basePath) {
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }
  return pathname;
}

function buildPathWithBase(basePath, pathname) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!basePath) return normalizedPath;
  if (normalizedPath === '/') return `${basePath}/`;
  return `${basePath}${normalizedPath}`;
}

function rewriteHtmlRootPaths(html, basePath) {
  if (!basePath) return html;
  return html.replace(
    /(href|src|action)=("|')\/(?!\/)/g,
    `$1=$2${basePath}/`,
  );
}
