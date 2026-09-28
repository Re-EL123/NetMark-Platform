const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3002;
const API_HOST = 'greenworldplatform.duckdns.org';
const ROOT = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

function proxyApiRequest(req, res) {
    const headers = { ...req.headers, host: API_HOST };
    delete headers.connection;

    const proxyReq = https.request(
        {
            hostname: API_HOST,
            port: 443,
            path: req.url,
            method: req.method,
            headers,
        },
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            proxyRes.pipe(res);
        }
    );

    proxyReq.on('error', (error) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            message: `API proxy error: ${error.message}`,
        }));
    });

    req.pipe(proxyReq);
}

function toRootPath(requestPath) {
    const safePath = decodeURIComponent(requestPath.split('?')[0])
        .replace(/^\/+/, '')
        .replace(/\\/g, '/');

    if (!safePath || safePath === '/') {
        return 'index.html';
    }

    return safePath;
}

function resolveStaticPath(requestPath) {
    const safePath = toRootPath(requestPath);
    const directPath = path.normalize(path.join(ROOT, safePath));

    if (!directPath.startsWith(ROOT)) {
        return null;
    }

    if (path.extname(safePath)) {
        return safePath;
    }

    const htmlPath = `${safePath}.html`;
    const htmlFilePath = path.normalize(path.join(ROOT, htmlPath));
    if (htmlFilePath.startsWith(ROOT) && fs.existsSync(htmlFilePath)) {
        return htmlPath;
    }

    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
        return safePath;
    }

    return 'index.html';
}

function serveStaticFile(req, res) {
    const resolvedPath = resolveStaticPath(req.url);

    if (!resolvedPath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const filePath = path.normalize(path.join(ROOT, resolvedPath));

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api')) {
        proxyApiRequest(req, res);
        return;
    }

    serveStaticFile(req, res);
});

server.listen(PORT, () => {
    console.log(`Customer panel running at http://localhost:${PORT}`);
    console.log(`API proxy enabled at http://localhost:${PORT}/api`);
});
