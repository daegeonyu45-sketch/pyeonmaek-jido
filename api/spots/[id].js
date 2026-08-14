import { redis, spotKey } from "../_redis.js";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "PATCH") {
    try {
      const existing = await redis.get(spotKey(id));
      if (!existing) {
        res.status(404).json({ error: "spot_not_found" });
        return;
      }

      const body = req.body || {};
      const updated = {
        ...existing,
        status: body.status === "busy" ? "busy" : "open",
        lastReportAt: Date.now(),
      };

      await redis.set(spotKey(id), updated);
      res.status(200).json(updated);
    } catch (e) {
      res.status(500).json({ error: "spot_update_failed" });
    }
    return;
  }

  res.setHeader("Allow", "PATCH");
  res.status(405).json({ error: "method_not_allowed" });
}
