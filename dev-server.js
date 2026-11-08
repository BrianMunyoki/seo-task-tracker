// Local development server: `npm run dev` -> http://localhost:3000
// Serves the frontend and runs the /api functions the same way Vercel does.
// Data is saved in the ".data" folder.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = process.env.PORT || 3000;
process.env.APP_PASSWORD ||= "dev";

const ROOT = process.cwd();
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

// Adds the helpers Vercel gives API functions (req.query, req.body, res.status, res.json, res.send)
async function runApi(name, req, res, url) {
  let handler;
  try {
    handler = (await import(`./api/${name}.js`)).default;
  } catch {
    res.statusCode = 404;
    return res.end("Not found");
  }
  req.query = Object.fromEntries(url.searchParams);
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); return res; };
  res.send = (body) => { res.end(body); return res; };
  if ((req.headers["content-type"] || "").includes("application/json")) {
    let text = "";
    for await (const chunk of req) text += chunk;
    req.body = text ? JSON.parse(text) : null;
  }
  try {
    await handler(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.end(err.message);
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    return runApi(url.pathname.slice(5).replace(/[^\w-]/g, ""), req, res, url);
  }
  const file = path.join(ROOT, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}.data`)) {
    res.statusCode = 403;
    return res.end();
  }
  try {
    const content = await fs.readFile(file);
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}).listen(PORT, () => {
  console.log(`SEO Task Tracker running at http://localhost:${PORT}`);
  console.log(`Password: ${process.env.APP_PASSWORD}  (set APP_PASSWORD to change it)`);
  console.log(`Data folder: ${path.join(ROOT, ".data")}`);
});
