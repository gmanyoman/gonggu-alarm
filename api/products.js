// GET /api/products
// 맘캘린더 "공구 제품" 목록(1,500개+)을 가져와서 검색 자동완성용으로 돌려줌
import { parseProductList } from './_parse.js';

export default async function handler(req, res) {
  try {
    const r = await fetch('https://momcalendar.com/' + encodeURIComponent('공구제품') + '.html', {
      headers: { 'User-Agent': 'gonggu-alarm (personal use, permitted by operator)' },
    });
    if (!r.ok) return res.status(r.status).json({ error: `맘캘린더 응답 ${r.status}` });
    const list = parseProductList(await r.text());
    res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=86400');
    return res.json({ count: list.length, products: list });
  } catch (e) {
    return res.status(502).json({ error: '가져오기 실패: ' + e.message });
  }
}
