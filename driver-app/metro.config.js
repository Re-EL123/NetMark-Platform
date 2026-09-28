const { getDefaultConfig } = require("@expo/metro-config");
const https = require("https");

const API_HOST = "greenworldplatform.duckdns.org";

function proxyApiRequest(req, res) {
  const headers = { ...req.headers, host: API_HOST };
  delete headers.connection;
  delete headers.origin;
  delete headers.referer;

  const proxyReq = https.request(
    {
      hostname: API_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const responseHeaders = { ...proxyRes.headers };
      delete responseHeaders["content-security-policy"];
      delete responseHeaders["cross-origin-resource-policy"];
      delete responseHeaders["cross-origin-opener-policy"];
      res.writeHead(proxyRes.statusCode || 500, responseHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: false,
        message: `API proxy error: ${error.message}`,
      })
    );
  });

  req.pipe(proxyReq);
}

const config = getDefaultConfig(__dirname);
const previousEnhance = config.server.enhanceMiddleware;

config.server.enhanceMiddleware = (middleware, server) => {
  const metroMiddleware = previousEnhance
    ? previousEnhance(middleware, server)
    : middleware;

  return (req, res, next) => {
    if (req.url === "/api" || (req.url && req.url.startsWith("/api/"))) {
      proxyApiRequest(req, res);
      return;
    }

    return metroMiddleware(req, res, next);
  };
};

module.exports = config;
