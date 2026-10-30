// GET /api/product?path=/p/주니-빨대컵.html
// 맘캘린더 제품 페이지 1개를 서버에서 대신 가져와서 일정만 뽑아 돌려줌
import { parseProductPage, summarize } from './_parse.js';

export default async function handler(req, res) {
  const path = String(req.query.path || '');
  if (!/^\/p\/[^/?#]+\.html$/.test(path)) {
    return res.status(400).json({ error: 'path는 /p/제품명.html 형태여야 해요' });
  }
  try {
    const r = await fetch('https://momcalendar.com' + encodeURI(decodeURI(path)), {
      headers: { 'User-Agent': 'gonggu-alarm (personal use, permitted by operator)' },
    });
    if (!r.ok) return res.status(r.status).json({ error: `맘캘린더 응답 ${r.status}` });
    const { name, items } = parseProductPage(await r.text());
    // 맘캘린더가 하루 1번 갱신 → 6시간 캐시로 요청 수 최소화
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    return res.json({ path, name, ...summarize(items) });
  } catch (e) {
    return res.status(502).json({ error: '가져오기 실패: ' + e.message });
  }
}
