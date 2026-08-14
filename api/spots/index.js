import { randomUUID } from "node:crypto";
import { redis, INDEX_KEY, spotKey, listSpots } from "../_redis.js";

const LIGHTING_OPTIONS = ["밝음", "보통", "어두움"];

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const spots = await listSpots();
      res.status(200).json(spots);
    } catch (e) {
      res.status(500).json({ error: "spots_fetch_failed" });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const body = req.body || {};
      const name = String(body.name || "").trim();
      const area = String(body.area || "").trim();
      if (!name || !area) {
        res.status(400).json({ error: "name and area are required" });
        return;
      }

      const spot = {
        id: randomUUID(),
        name,
        area,
        tables: Math.min(8, Math.max(1, Number(body.tables) || 1)),
        roof: !!body.roof,
        restroom: !!body.restroom,
        lighting: LIGHTING_OPTIONS.includes(body.lighting) ? body.lighting : "보통",
        note: String(body.note || ""),
        tags: [],
        status: "open",
        lastReportAt: Date.now(),
      };

      await redis.set(spotKey(spot.id), spot);
      await redis.sadd(INDEX_KEY, spot.id);

      res.status(201).json(spot);
    } catch (e) {
      res.status(500).json({ error: "spot_create_failed" });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "method_not_allowed" });
}
