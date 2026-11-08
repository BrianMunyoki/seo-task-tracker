// GET  /api/data  -> returns all tasks and sprints
// PUT  /api/data  -> saves all tasks and sprints
import { authorized } from "./_lib.js";
import { readFile, saveFile } from "./_storage.js";

const DATA_PATH = "data/tasks.json";

export default async function handler(req, res) {
  if (!authorized(req, res)) return;

  try {
    if (req.method === "GET") {
      const file = await readFile(DATA_PATH);
      if (!file) return res.status(200).json(null); // nothing saved yet
      return res.status(200).json(JSON.parse(file.buffer.toString("utf8")));
    }

    if (req.method === "PUT") {
      const data = req.body;
      if (!data || !Array.isArray(data.tasks)) return res.status(400).json({ error: "Invalid data" });
      data.savedAt = new Date().toISOString();
      await saveFile(DATA_PATH, JSON.stringify(data), { contentType: "application/json" });
      return res.status(200).json({ ok: true, savedAt: data.savedAt });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
