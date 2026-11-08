// Shared helpers for the API routes. Files starting with "_" are not exposed as routes.

// Must match the access type you chose when creating the Blob store ("private" recommended).
export const ACCESS = process.env.BLOB_ACCESS === "public" ? "public" : "private";

// Simple password check: the browser sends the password in the "x-app-password" header.
export function authorized(req, res) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    res.status(500).json({ error: "APP_PASSWORD is not set in Vercel environment variables" });
    return false;
  }
  if (req.headers["x-app-password"] !== password) {
    res.status(401).json({ error: "Wrong password" });
    return false;
  }
  return true;
}

// Reads the raw request body (used for file uploads).
export async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("File too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
