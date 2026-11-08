// Storage layer.
// - On Vercel (BLOB_READ_WRITE_TOKEN is set): uses Vercel Blob.
// - Locally (no token): saves into a ".data" folder in the project.
import fs from "node:fs/promises";
import path from "node:path";
import { ACCESS } from "./_lib.js";

const USE_LOCAL = !process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_DIR = path.join(process.cwd(), ".data");

function localPath(pathname) {
  const full = path.join(LOCAL_DIR, pathname);
  if (!full.startsWith(LOCAL_DIR)) throw new Error("Invalid path");
  return full;
}

// Save bytes. Returns the final pathname (a random suffix is added when asked).
export async function saveFile(pathname, body, { contentType, randomSuffix = false }) {
  if (USE_LOCAL) {
    let finalPath = pathname;
    if (randomSuffix) {
      const ext = path.extname(pathname);
      finalPath = pathname.slice(0, pathname.length - ext.length) + "-" + Math.random().toString(36).slice(2, 10) + ext;
    }
    const full = localPath(finalPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    await fs.writeFile(full + ".meta.json", JSON.stringify({ contentType }));
    return finalPath;
  }
  const { put } = await import("@vercel/blob");
  const blob = await put(pathname, body, {
    access: ACCESS,
    contentType,
    addRandomSuffix: randomSuffix,
    allowOverwrite: !randomSuffix,
  });
  return blob.pathname;
}

// Read bytes. Returns { buffer, contentType } or null if it doesn't exist.
export async function readFile(pathname) {
  if (USE_LOCAL) {
    try {
      const full = localPath(pathname);
      const buffer = await fs.readFile(full);
      const meta = JSON.parse(await fs.readFile(full + ".meta.json", "utf8").catch(() => "{}"));
      return { buffer, contentType: meta.contentType || "application/octet-stream" };
    } catch {
      return null;
    }
  }
  const { get } = await import("@vercel/blob");
  const result = await get(pathname, { access: ACCESS, useCache: false });
  if (!result || !result.stream) return null;
  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  return { buffer, contentType: result.blob.contentType || "application/octet-stream" };
}

export async function deleteFile(pathname) {
  if (USE_LOCAL) {
    const full = localPath(pathname);
    await fs.rm(full, { force: true });
    await fs.rm(full + ".meta.json", { force: true });
    return;
  }
  const { del } = await import("@vercel/blob");
  await del(pathname);
}
