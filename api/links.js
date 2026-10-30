// GET  /api/links?code=가족코드              → '자주 가는 곳' 링크 목록 읽기
// POST /api/links?code=가족코드  {action}    → 추가(add) / 삭제(remove)
// 저장소: api/list.js와 같은 Upstash Redis (가족 코드별로 따로 저장)

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

// http(s) 주소만 허용
function cleanUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href.slice(0, 500) : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!DB_URL || !DB_TOKEN) return res.status(503).json({ error: '공유 저장소가 아직 연결 안 됐어요' });

  const code = String(req.query.code || '');
  if (!/^[a-z0-9-]{6,40}$/.test(code)) return res.status(400).json({ error: '가족 코드가 이상해요' });
  const key = 'gonggu:links:' + code;

  try {
    const load = async () => {
      const v = await redis(['GET', key]);
      return v ? JSON.parse(v) : [];
    };

    if (req.method === 'GET') return res.json({ links: await load() });

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      body = body || {};
      let links = await load();

      if (body.action === 'add') {
        const url = cleanUrl(body.url);
        if (!url) return res.status(400).json({ error: '링크는 https:// 로 시작하는 주소여야 해요' });
        const name = String(body.name || '').trim().slice(0, 40) || new URL(url).hostname.replace(/^www\./, '');
        links = links.filter((l) => l.url !== url);
        links.push({ id: Date.now().toString(36), name, url });
      } else if (body.action === 'remove') {
        links = links.filter((l) => l.id !== body.id);
      } else {
        return res.status(400).json({ error: '알 수 없는 요청' });
      }

      links = links.slice(-50);
      await redis(['SET', key, JSON.stringify(links)]);
      return res.json({ links });
    }

    return res.status(405).json({ error: 'GET/POST만 돼요' });
  } catch (e) {
    return res.status(500).json({ error: '저장소 오류: ' + e.message });
  }
}
