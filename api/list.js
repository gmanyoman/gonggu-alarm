// GET  /api/list?code=가족코드            → 공유 목록 읽기
// POST /api/list?code=가족코드  {action}  → 추가/삭제/통째로 저장
// 저장소: Vercel Storage의 Upstash Redis (환경변수는 연결하면 자동으로 들어옴)

const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  const r = await fetch(DB_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const validItem = (x) =>
  x && typeof x.name === 'string' && typeof x.path === 'string' && /^\/p\/[^/?#]+\.html$/.test(x.path);
const clean = (x) => ({ name: x.name.slice(0, 80), path: x.path });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!DB_URL || !DB_TOKEN) {
    return res.status(503).json({ error: '공유 저장소가 아직 연결 안 됐어요' });
  }
  const code = String(req.query.code || '');
  if (!/^[a-z0-9-]{6,40}$/.test(code)) return res.status(400).json({ error: '가족 코드가 이상해요' });
  const key = 'gonggu:list:' + code;

  try {
    const load = async () => {
      const v = await redis(['GET', key]);
      return v ? JSON.parse(v) : [];
    };

    if (req.method === 'GET') return res.json({ items: await load() });

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      body = body || {};
      let items = await load();

      if (body.action === 'add' && validItem(body.item)) {
        if (!items.some((x) => x.path === body.item.path)) items.unshift(clean(body.item));
      } else if (body.action === 'remove') {
        items = items.filter((x) => x.path !== body.path);
      } else if (body.action === 'replace' && Array.isArray(body.items)) {
        items = body.items.filter(validItem).map(clean);
      } else {
        return res.status(400).json({ error: '알 수 없는 요청' });
      }

      items = items.slice(0, 200);
      await redis(['SET', key, JSON.stringify(items)]);
      return res.json({ items });
    }

    return res.status(405).json({ error: 'GET/POST만 돼요' });
  } catch (e) {
    return res.status(500).json({ error: '저장소 오류: ' + e.message });
  }
}
