import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error(
    "Redis env vars missing: expected KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN"
  );
}

export const redis = new Redis({ url, token });

export const INDEX_KEY = "pyeonmaek:spot-ids";
export const spotKey = (id) => `pyeonmaek:spot:${id}`;

export const SEED_SPOTS = () => {
  const now = Date.now();
  return [
    {
      id: "seed-1",
      name: "GS25 연남중앙점",
      area: "마포구 연남동",
      tables: 3,
      roof: true,
      restroom: true,
      lighting: "밝음",
      lastReportAt: now - 8 * 60000,
      status: "open",
      tags: ["단골 많음", "안주 다양"],
      note: "저녁 7시 넘으면 자리 금방 참. 안주 코너 잘 되어있음.",
    },
    {
      id: "seed-2",
      name: "CU 합정역점",
      area: "마포구 합정동",
      tables: 2,
      roof: false,
      restroom: false,
      lighting: "보통",
      lastReportAt: now - 25 * 60000,
      status: "busy",
      tags: ["역 근처", "즉흥 모임"],
      note: "역 바로 앞이라 접근성 최고. 지붕은 없어서 비 오면 패스.",
    },
    {
      id: "seed-3",
      name: "세븐일레븐 망원포구점",
      area: "마포구 망원동",
      tables: 4,
      roof: true,
      restroom: true,
      lighting: "밝음",
      lastReportAt: now - 3 * 60000,
      status: "open",
      tags: ["넓음", "조용함"],
      note: "테이블이 넉넉해서 4명까지도 여유 있음.",
    },
    {
      id: "seed-4",
      name: "GS25 상수역점",
      area: "마포구 상수동",
      tables: 1,
      roof: false,
      restroom: false,
      lighting: "어두움",
      lastReportAt: now - 52 * 60000,
      status: "open",
      tags: [],
      note: "제보가 오래돼서 지금 상태는 확실치 않음.",
    },
  ];
};

export async function ensureSeeded() {
  const exists = await redis.exists(INDEX_KEY);
  if (exists) return;
  for (const spot of SEED_SPOTS()) {
    await redis.set(spotKey(spot.id), spot);
    await redis.sadd(INDEX_KEY, spot.id);
  }
}

export async function listSpots() {
  await ensureSeeded();
  const ids = await redis.smembers(INDEX_KEY);
  if (ids.length === 0) return [];
  const spots = await redis.mget(...ids.map(spotKey));
  return spots.filter(Boolean);
}
