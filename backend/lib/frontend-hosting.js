const express = require('express');
const fs = require('fs');
const path = require('path');

const DEFAULT_FRONTEND_DIST_DIR = path.resolve(__dirname, '../../frontend/dist');
const SPA_RESERVED_PREFIXES = ['/api', '/files', '/healthz', '/readyz'];
const HASHED_ASSET_RE = /(?:^|\/)assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/;

const cacheControlForFrontendFile = (filePath, distDir = DEFAULT_FRONTEND_DIST_DIR) => {
  const relative = path.relative(path.resolve(distDir), path.resolve(filePath))
    .split(path.sep)
    .join('/');
  if (!relative || relative === 'index.html' || relative.endsWith('.html')) {
    return 'no-store, max-age=0';
  }
  if (HASHED_ASSET_RE.test(relative)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
};

const isReservedSpaPath = (pathname) => {
  const value = String(pathname || '').split('?')[0] || '/';
  return SPA_RESERVED_PREFIXES.some(
    (prefix) => value === prefix || value.startsWith(`${prefix}/`)
  );
};

const shouldServeSpaFallback = (req) => {
  const method = String(req?.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) return false;
  const pathname = String(req?.path || req?.url || '/').split('?')[0] || '/';
  if (isReservedSpaPath(pathname)) return false;
  if (path.extname(pathname)) return false;
  const accept = String(req?.headers?.accept || '').toLowerCase();
  return !accept || accept.includes('text/html') || accept.includes('*/*');
};

const installFrontendHosting = (app, options = {}) => {
  const distDir = path.resolve(options.distDir || process.env.FRONTEND_DIST_DIR || DEFAULT_FRONTEND_DIST_DIR);
  const indexFile = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexFile) || !fs.statSync(indexFile).isFile()) {
    return { enabled: false, distDir, indexFile };
  }

  app.use(express.static(distDir, {
    dotfiles: 'ignore',
    etag: true,
    fallthrough: true,
    index: false,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', cacheControlForFrontendFile(filePath, distDir));
    }
  }));

  app.use((req, res, next) => {
    if (!shouldServeSpaFallback(req)) return next();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.sendFile(indexFile, (error) => {
      if (!error) return;
      if (res.headersSent) return next(error);
      return next();
    });
  });

  return { enabled: true, distDir, indexFile };
};

module.exports = {
  DEFAULT_FRONTEND_DIST_DIR,
  SPA_RESERVED_PREFIXES,
  cacheControlForFrontendFile,
  installFrontendHosting,
  isReservedSpaPath,
  shouldServeSpaFallback
};
