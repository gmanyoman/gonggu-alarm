const KEY = 'gonggu-alarm:items';       // 공유 목록의 사본 (빨리 보여주기용)
const CACHE_KEY = 'gonggu-alarm:cache';
const FAMILY_KEY = 'gonggu-alarm:family';
const CODE_RE = /^[a-z0-9-]{6,40}$/;
let catalog = [];
let results = {};
let shared = null;                      // true: 공유 중 / false: 이 기기에만 저장 / null: 확인 중
const openSet = new Set();
let restOpen = false;

const store = {
  get(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let items = store.get(KEY, []);
const myItems = () => items;
const saveLocal = () => store.set(KEY, items);

// ---------- 가족 코드 ----------
// 주소 뒤 ?family=코드 가 같으면 같은 목록을 봄. 홈 화면에 추가할 때 주소째 저장돼서 코드가 유지됨.
function initFamily() {
  const u = new URL(location.href);
  let code = (u.searchParams.get('family') || '').toLowerCase();
  if (!CODE_RE.test(code)) code = store.get(FAMILY_KEY, '');
  if (!CODE_RE.test(code)) code = 'fam-' + Math.random().toString(36).slice(2, 10);
  store.set(FAMILY_KEY, code);
  if (u.searchParams.get('family') !== code) {
    u.searchParams.set('family', code);
    history.replaceState(null, '', u);
  }
  return code;
}
let family = initFamily();

async function listApi(method, body) {
  const r = await fetch('/api/list?code=' + encodeURIComponent(family), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || '저장 실패');
  return j.items;
}

async function syncList() {
  try {
    let srv = await listApi('GET');
    // 처음 공유 켜질 때: 이 기기에만 있던 목록을 공유 저장소로 옮김
    if (!srv.length && items.length) srv = await listApi('POST', { action: 'replace', items });
    items = srv;
    shared = true;
    saveLocal();
  } catch {
    shared = false;
  }
  renderShare();
  render();
}

function shareUrl() {
  return location.origin + location.pathname + '?family=' + family;
}

function renderShare() {
  const el = document.getElementById('share');
  if (shared === false) {
    el.className = 'share warn';
    el.innerHTML = `<div class="txt">⚠️ <b>공유 저장소가 아직 연결 안 됐어요.</b><br/>지금은 이 기기에만 저장돼요.</div>`;
    return;
  }
  el.className = 'share';
  el.innerHTML = `<button id="shareBtn">👨‍👩‍👧 가족에게 보내기</button>`;
  document.getElementById('shareBtn').onclick = async () => {
    const url = shareUrl();
    try {
      if (navigator.share) { await navigator.share({ title: '또미제리 살림 공구 알리미', text: '같이 보는 공구 목록', url }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); alert('링크를 복사했어요. 카톡으로 보내주세요!\n\n' + url); }
    catch { prompt('이 링크를 복사해서 보내주세요', url); }
  };
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const md = (s) => { const [, m, d] = s.split('-'); return `${+m}/${+d}`; };
const dday = (from, to) => Math.round((new Date(to) - new Date(from)) / 86400000);
// 오늘 날짜는 항상 '내 폰'에서 한국시간으로 계산 (서버 캐시 때문에 하루 밀리는 것 방지)
const todayKST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (s, n) => new Date(new Date(s + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const isManual = (path) => path.startsWith('manual:');

// 서버가 준 일정을 '오늘' 기준으로 다시 나눔
function view(r) {
  const t = todayKST();
  const all = [...(r.ongoing || []), ...(r.upcoming || []), ...(r.past || [])];
  const ongoing = all.filter((x) => x.start <= t && t <= x.end).sort((a, b) => a.end.localeCompare(b.end));
  const upcoming = all.filter((x) => x.start > t).sort((a, b) => a.start.localeCompare(b.start));
  const past = all.filter((x) => x.end < t).sort((a, b) => b.start.localeCompare(a.start));
  let prediction = r.prediction ? { ...r.prediction } : null;
  if (prediction) while (prediction.date <= t) prediction.date = addDays(prediction.date, prediction.gapDays || 30);
  return { t, ongoing, upcoming, past, prediction };
}

// ---------- 검색 / 추가 ----------
async function loadCatalog() {
  try {
    const r = await fetch('/api/products');
    const j = await r.json();
    catalog = j.products || [];
  } catch { catalog = []; }
}

const q = document.getElementById('q');
const sug = document.getElementById('suggest');

q.addEventListener('input', () => {
  const v = q.value.trim().replace(/\s+/g, ' ');
  if (!v) { sug.style.display = 'none'; return; }
  const words = v.split(' ');
  const mine = new Set(myItems().map((x) => x.path));
  const hits = catalog.filter((p) => words.every((w) => p.name.includes(w)) && !mine.has(p.path)).slice(0, 30);
  const manualPath = 'manual:' + v;
  const addBtn = mine.has(manualPath) ? '' :
    `<button class="add-manual" data-path="${esc(manualPath)}" data-name="${esc(v)}">＋ '${esc(v)}' 이름으로 추가</button>`;
  sug.innerHTML = hits.length
    ? hits.map((p) => `<button data-path="${esc(p.path)}" data-name="${esc(p.name)}">${esc(p.name)}</button>`).join('') + addBtn
    : `<div class="hint">${catalog.length ? '검색 목록엔 없어요 (2번 이상 공구한 제품만 검색돼요). 이름으로 추가하면 같이 볼 목록엔 들어가요.' : '제품 목록을 불러오는 중이에요…'}</div>` + addBtn;
  sug.style.display = 'block';
});
sug.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-path]');
  if (!b) return;
  addItem({ name: b.dataset.name, path: b.dataset.path });
});
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) sug.style.display = 'none'; });

async function addItem(item) {
  if (!items.some((x) => x.path === item.path)) items.unshift(item);
  saveLocal();
  q.value = ''; sug.style.display = 'none';
  render();
  if (!isManual(item.path)) fetchOne(item.path).then(render);
  if (shared) {
    try { items = await listApi('POST', { action: 'add', item }); saveLocal(); render(); }
    catch { alert('공유 저장에 실패했어요. 잠시 뒤 다시 해주세요.'); }
  }
}
async function removeItem(path) {
  items = items.filter((x) => x.path !== path);
  saveLocal();
  delete results[path];
  render();
  if (shared) {
    try { items = await listApi('POST', { action: 'remove', path }); saveLocal(); render(); }
    catch { alert('공유 저장에 실패했어요. 잠시 뒤 다시 해주세요.'); }
  }
}

// ---------- 일정 가져오기 ----------
async function fetchOne(path) {
  if (isManual(path)) return;
  try {
    const r = await fetch('/api/product?path=' + encodeURIComponent(path));
    const j = await r.json();
    results[path] = r.ok ? j : { error: j.error || '불러오기 실패' };
  } catch (e) {
    results[path] = { error: '네트워크 오류' };
  }
  store.set(CACHE_KEY, results);
}
async function refreshAll() {
  const btn = document.getElementById('refresh');
  btn.classList.add('spin');
  const list = myItems().filter((x) => !isManual(x.path));
  // 동시에 3개씩만 요청 (맘캘린더 부담 줄이기)
  for (let i = 0; i < list.length; i += 3) {
    await Promise.all(list.slice(i, i + 3).map((x) => fetchOne(x.path)));
    render();
  }
  btn.classList.remove('spin');
}

// ---------- 화면 ----------
const sellerLink = (g) => g.link
  ? ` <a href="${esc(g.link)}" target="_blank" rel="noopener">${esc(g.seller || '셀러')} 인스타 →</a>`
  : (g.seller ? ` ${esc(g.seller)}` : '');
// 카드 한 줄: "11/9~11/12 간식당 인스타 →"
const line = (g) => `<div class="detail">${md(g.start)}~${md(g.end)}${sellerLink(g)}</div>`;

function statusOf(item) {
  if (isManual(item.path)) return { rank: 4, sortKey: item.name, when: '',
    html: `<div class="detail"><a href="https://momcalendar.com/" target="_blank" rel="noopener">맘캘린더에서 찾기 →</a></div>` };
  const r = results[item.path];
  if (!r) return { rank: 9, sortKey: '9', when: '', html: '' };
  if (r.error) return { rank: 8, sortKey: '8', when: '', html: `<div class="detail err">${esc(r.error)}</div>` };
  const v = view(r), t = v.t;
  if (v.ongoing.length) {
    const g = v.ongoing[0], e = dday(g.start, t);   // 열린 지 며칠 지났는지
    return { rank: 0, sortKey: g.end, g, when: e === 0 ? '오늘 오픈' : `${e}일 지남`,
      html: v.ongoing.map(line).join('') };
  }
  if (v.upcoming.length) {
    const g = v.upcoming[0], d = dday(t, g.start);
    return { rank: 1, sortKey: g.start, g, when: `${d}일 남음`,
      html: v.upcoming.slice(0, 3).map(line).join('') };
  }
  if (v.prediction) {
    return { rank: 2, sortKey: v.prediction.date, when: `${dday(t, v.prediction.date)}일 남음`,
      html: `<div class="detail">${md(v.prediction.date)}쯤 예상</div>` };
  }
  return { rank: 3, sortKey: 'z', when: '', html: '' };
}

function historyOf(item) {
  const r = results[item.path];
  if (!r || r.error || isManual(item.path)) return '';
  const v = view(r);
  const rows = [...v.ongoing, ...v.upcoming, ...v.past]
    .map((g) => `<div class="hrow"><span>${esc(g.title)}${g.seller ? ` · ${esc(g.seller)}` : ''}</span><span>${md(g.start)}~${md(g.end)}</span></div>`)
    .join('');
  return `<div class="history">${rows || '<div class="hrow"><span>기록 없음</span></div>'}
    <a class="more" href="https://momcalendar.com${encodeURI(decodeURI(item.path))}" target="_blank" rel="noopener">맘캘린더에서 전체 보기 →</a></div>`;
}

function render() {
  const list = myItems();
  const el = document.getElementById('list');
  if (!list.length) {
    el.innerHTML = `<div class="empty">🛒<br/>위에서 자주 사는 물건을 검색해서 추가해 보세요.<br/>진행 중이거나 가장 빨리 열리는 공구부터 보여드려요.</div>`;
    return;
  }
  const rows = list.map((it) => ({ it, st: statusOf(it) }))
    .sort((a, b) => a.st.rank - b.st.rank || a.st.sortKey.localeCompare(b.st.sortKey));

  const card = ({ it, st }) => `
      <div class="card ${openSet.has(it.path) ? 'open' : ''}" data-path="${esc(it.path)}">
        <div class="card-top">
          <div class="card-main">
            <div class="row1"><div class="name">${esc(results[it.path]?.name || it.name)}</div>${st.when ? `<div class="when">${st.when}</div>` : ''}</div>
            ${st.html}
          </div>
          <button class="remove" data-remove="${esc(it.path)}" title="삭제">×</button>
        </div>
        ${historyOf(it)}
      </div>`;

  const groups = [
    ['g-live', '지금 살 수 있어요', 0],
    ['g-soon', '곧 열려요', 1],
    ['g-guess', '다음 공구 예상', 2],
  ];
  let html = groups.map(([cls, title, rank]) => {
    const g = rows.filter((x) => x.st.rank === rank);
    if (!g.length) return '';
    return `<section class="grp ${cls}"><div class="grp-title"><span class="dot"></span>${title}<span class="cnt">${g.length}</span></div>`
      + g.map(card).join('') + `</section>`;
  }).join('');

  // 일정 없는 물건·이름으로 추가한 물건은 맨 아래에 접어두기 (지울 수 있게)
  const rest = rows.filter((x) => x.st.rank > 2);
  if (rest.length) {
    html += `<details class="rest" ${restOpen ? 'open' : ''}><summary>일정 없는 물건 ${rest.length}개</summary>${rest.map(card).join('')}</details>`;
  }
  el.innerHTML = html;
  const d = el.querySelector('.rest');
  if (d) d.addEventListener('toggle', () => { restOpen = d.open; });
}

document.getElementById('list').addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const rm = e.target.closest('[data-remove]');
  if (rm) { if (confirm('목록에서 뺄까요?')) removeItem(rm.dataset.remove); return; }
  const card = e.target.closest('.card');
  if (!card) return;
  const p = card.dataset.path;
  openSet.has(p) ? openSet.delete(p) : openSet.add(p);
  card.classList.toggle('open');
});
document.getElementById('refresh').addEventListener('click', async () => { await syncList(); refreshAll(); });

// 앱을 다시 열 때(백그라운드 → 화면) 가족이 바꾼 목록 반영
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncList().then(() => {
    const missing = items.filter((x) => !isManual(x.path) && !results[x.path]);
    missing.forEach((x) => fetchOne(x.path).then(render));
  });
});

// ---------- 시작 ----------
results = store.get(CACHE_KEY, {});
renderShare();
render();
loadCatalog();
syncList().then(refreshAll);
