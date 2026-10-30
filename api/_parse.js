// 맘캘린더 페이지 HTML → 공구 일정 데이터로 바꾸는 파서
// (api 폴더 안 _로 시작하는 파일은 Vercel이 주소로 노출하지 않음)

const DATE_RE = /(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/;

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

const strip = (h) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const toDate = (s) => new Date(s + 'T00:00:00Z');
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const addDays = (s, n) => new Date(toDate(s).getTime() + n * 86400000).toISOString().slice(0, 10);

export function parseProductPage(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name = h1 ? strip(h1[1]).replace(/\s*공구$/, '') : '';

  // FAQ·관련공구 영역은 버림
  const main = html.split(/자주 묻는 질문/)[0];

  // 셀러 인스타 링크: 날짜가 들어있는 <a> 태그만 모아둠
  const links = [];
  for (const m of main.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = strip(m[2]);
    const d = t.match(DATE_RE);
    if (d) links.push({ text: t, start: d[1], end: d[2], href: decode(m[1]) });
  }

  // 텍스트로 펼치기: 굵은 글씨 끝은 \u0001(제목 구분), 블록 끝은 줄바꿈
  const text = decode(
    main
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(strong|b)>/gi, '\u0001')
      .replace(/<\/(a|p|div|li|h\d|section|article|ul)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
  const lines = text.split('\n').map((s) => s.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);

  const items = [];
  const seen = new Set();
  lines.forEach((line, i) => {
    const d = line.match(DATE_RE);
    if (!d) return;
    let pre = line.slice(0, d.index);
    if (!pre.replace(/[\u0001·\s]/g, '') && i > 0) pre = lines[i - 1];
    const parts = pre.split('\u0001');
    const title = parts[0].replace(/·\s*$/, '').trim();
    const seller = parts.slice(1).join(' ').replace(/·/g, '').trim();
    const [, start, end] = d;
    const key = `${title}|${seller}|${start}|${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    const link = links.find((l) => l.start === start && l.end === end && l.text.includes(title.slice(0, 6)));
    items.push({ title, seller, start, end, link: link ? link.href : null });
  });

  return { name, items };
}

// 진행중 / 예정 / 지난 공구 분류 + 다음 공구 시기 추정
export function summarize(items, today = todayKST()) {
  const ongoing = items.filter((x) => x.start <= today && today <= x.end).sort((a, b) => a.end.localeCompare(b.end));
  const upcoming = items.filter((x) => x.start > today).sort((a, b) => a.start.localeCompare(b.start));
  const past = items.filter((x) => x.end < today).sort((a, b) => b.start.localeCompare(a.start));

  // 과거 오픈일 간격의 중앙값으로 다음 시기 추정 (추측값)
  const starts = [...new Set(items.filter((x) => x.start <= today).map((x) => x.start))].sort();
  let prediction = null;
  if (starts.length >= 2) {
    const gaps = [];
    for (let i = 1; i < starts.length; i++) gaps.push(daysBetween(starts[i - 1], starts[i]));
    const recent = gaps.filter((g) => g > 0).slice(-8).sort((a, b) => a - b);
    if (recent.length) {
      const median = recent[Math.floor(recent.length / 2)];
      let date = addDays(starts[starts.length - 1], median);
      while (date <= today) date = addDays(date, median);
      prediction = { date, gapDays: median, basedOn: recent.length + 1 };
    }
  }
  return { today, ongoing, upcoming, past: past.slice(0, 8), prediction };
}

export function parseProductList(html) {
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href="((?:https:\/\/momcalendar\.com)?\/p\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const path = m[1].replace('https://momcalendar.com', '');
    const name = strip(m[2]);
    if (!name || seen.has(path)) continue;
    seen.add(path);
    out.push({ name, path });
  }
  return out;
}
