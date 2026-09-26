const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HTTP_PORT = 8080;
const HTTPS_PORT = 8443;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json'
};

function serveFile(req, res) {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(ROOT, reqPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIp();

// Start HTTP Server
const httpServer = http.createServer(serveFile);
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[HTTP]  Local:   http://localhost:${HTTP_PORT}`);
  console.log(`[HTTP]  Mobile:  http://${localIp}:${HTTP_PORT}`);
});

// Start HTTPS Server
try {
  const key = fs.readFileSync(path.join(ROOT, 'server.key'));
  const cert = fs.readFileSync(path.join(ROOT, 'server.cert'));
  const httpsServer = https.createServer({ key, cert }, serveFile);

  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`[HTTPS] Local:   https://localhost:${HTTPS_PORT}`);
    console.log(`[HTTPS] Mobile:  https://${localIp}:${HTTPS_PORT} (Recommended for mobile GPS)`);
  });
} catch (e) {
  console.log('HTTPS server not started:', e.message);
}
