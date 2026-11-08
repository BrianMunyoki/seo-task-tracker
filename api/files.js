// POST   /api/files?name=report.pdf    -> upload a file (raw body, max 4 MB)
// GET    /api/files?pathname=files/... -> download a file
// DELETE /api/files?pathname=files/... -> delete a file
import { authorized, readBody } from "./_lib.js";
import { saveFile, readFile, deleteFile } from "./_storage.js";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept bodies up to ~4.5 MB

export default async function handler(req, res) {
  if (!authorized(req, res)) return;

  const { name, pathname } = req.query;
  if (pathname && (!String(pathname).startsWith("files/") || String(pathname).includes(".."))) {
    return res.status(400).json({ error: "Invalid pathname" });
  }

  try {
    if (req.method === "POST") {
      if (!name) return res.status(400).json({ error: "Missing file name" });
      const body = await readBody(req, MAX_BYTES);
      const safeName = String(name).replace(/[^\w.\-]+/g, "_").slice(0, 100);
      const savedPath = await saveFile(`files/${safeName}`, body, {
        contentType: req.headers["content-type"] || "application/octet-stream",
        randomSuffix: true,
      });
      return res.status(200).json({ name: String(name), pathname: savedPath, size: body.length, uploadedAt: new Date().toISOString() });
    }

    if (req.method === "GET") {
      const file = await readFile(pathname);
      if (!file) return res.status(404).json({ error: "File not found" });
      res.setHeader("Content-Type", file.contentType);
      return res.status(200).send(file.buffer);
    }

    if (req.method === "DELETE") {
      await deleteFile(pathname);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    const status = err.message === "File too large" ? 413 : 500;
    return res.status(status).json({ error: err.message });
  }
}
