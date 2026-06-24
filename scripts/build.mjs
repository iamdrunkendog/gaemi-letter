import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'docs');
const style = await fs.readFile(path.join(root, 'src', 'assets', 'style.css'), 'utf8');
const firebaseConfig = await fs.readFile(path.join(root, 'src', 'firebase-config.json'), 'utf8');

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function antSvg() {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="6" r="2.3" stroke="var(--ac)" stroke-width="1.3"/><ellipse cx="10" cy="12" rx="3.2" ry="4" stroke="var(--ac)" stroke-width="1.3"/><path d="M8.6 4.2 6.8 2.6M11.4 4.2l1.8-1.6M7.7 10.3 3.5 8.2M12.3 10.3l4.2-2.1M7.4 12H3M12.6 12H17M7.8 13.6 3.8 16M12.2 13.6l4 2.4" stroke="var(--ac)" stroke-width="1.1" stroke-linecap="round"/></svg>`;
}

function layout({ title, description, body, extraHead = '' }) {
  return `<!doctype html>
<html lang="ko" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta name="twitter:card" content="summary" />
  <meta name="robots" content="noindex, nofollow, noarchive" />
  <style>${style}</style>
  ${extraHead}
</head>
<body>
<header class="site-header"><div class="header-inner">
  <a class="brand" href="/"><span class="ant-mark">${antSvg()}</span><span>개미레터</span></a>
  <div class="header-actions"><a class="pill-link" href="/">처음</a><button class="icon-button" id="themeToggle" title="테마 전환" aria-label="테마 전환">◐</button></div>
</div></header>
${body}
<footer class="site-footer"><div class="footer-inner"><span>개미가 정리해 보내는 작은 문서 배달함</span><span>Firestore → 개미레터</span></div></footer>
<script>
const root = document.documentElement;
const saved = localStorage.getItem('gaemi-letter-theme');
if (saved) root.dataset.theme = saved;
document.getElementById('themeToggle')?.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('gaemi-letter-theme', root.dataset.theme);
});
document.querySelectorAll('pre code').forEach(code => code.parentElement.setAttribute('tabindex','0'));
</script>
</body></html>`;
}

function firebaseConfigScript() {
  return `<script>window.__gaemiFirebaseConfig = ${firebaseConfig};</script>`;
}

function firebaseImportLines(extra = '') {
  return `import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, orderBy, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
const firebaseConfig = window.__gaemiFirebaseConfig;
${extra}`;
}


async function buildIndex() {
  const html = layout({
    title: '개미레터',
    description: '개미레터는 전달받은 링크로만 문서를 여는 비공개형 문서 배달함입니다.',
    body: `<main><section class="hero"><div class="eyebrow">Gaemi Letter</div><h1>전달받은 링크로만 열리는 개미레터</h1><p>문서 목록은 공개하지 않습니다. 개별 레터는 공유받은 전용 링크로만 접근할 수 있습니다.</p></section><section class="letter-grid"><div class="card"><div class="meta"><span class="visibility">link-only</span></div><h2>목록 비공개</h2><p>개미레터는 검색과 목록 탐색을 막고, 필요한 사람에게만 개별 링크를 전달하는 방식으로 운영합니다.</p><div class="card-footer"><span>링크를 받은 문서만 열어주세요.</span></div></div></section></main>`
  });
  await fs.writeFile(path.join(outDir, 'index.html'), html);
}

async function buildAdminPage() {
  const adminBody = `<main class="page"><section class="article-shell"><header class="article-head"><div class="eyebrow">Private Admin</div><h1>개미레터 관리자 목록</h1><p class="article-desc">형님 Google 계정으로 로그인하면 Firestore에 저장된 발행 목록을 볼 수 있습니다.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="copy-button" id="loginButton">Google로 로그인</button><button class="copy-button" id="logoutButton" style="display:none">로그아웃</button><span class="tag" id="authState">로그인 전</span></div></header><article class="article"><div id="adminNotice" class="table-wrap" style="padding:16px">로그인이 필요합니다.</div><div id="letterList"></div></article></section><aside class="toc"><strong>Admin</strong><a href="/">공개 랜딩</a><a href="https://console.firebase.google.com/project/gaemi-letter/firestore/databases/-default-/data" target="_blank" rel="noreferrer">Firestore Console</a></aside></main>
${firebaseConfigScript()}
<script type="module">
${firebaseImportLines()}
const ownerEmail = 'wramkim@gmail.com';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const authState = document.getElementById('authState');
const notice = document.getElementById('adminNotice');
const list = document.getElementById('letterList');
function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function loadLetters(user) {
  if (!user || user.email !== ownerEmail) {
    notice.textContent = user ? '허용되지 않은 계정입니다: ' + user.email : '로그인이 필요합니다.';
    list.innerHTML = '';
    return;
  }
  notice.textContent = '목록을 불러오는 중...';
  try {
    const snap = await getDocs(query(collection(db, 'letters'), orderBy('date', 'desc')));
    const items = [];
    snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
    notice.textContent = items.length ? '총 ' + items.length + '개 레터' : '아직 등록된 레터가 없습니다.';
    list.innerHTML = items.map(item => '<a class="card" style="margin-bottom:14px" href="/letters/' + esc(item.slug || item.id) + '/"><div class="meta"><span>' + esc(item.date || '') + '</span><span class="visibility">' + esc(item.visibility || 'link-only') + '</span></div><h2>' + esc(item.title || item.id) + '</h2><p>' + esc(item.description || '') + '</p><div class="tags">' + (item.tags || []).map(t => '<span class="tag">#' + esc(t) + '</span>').join('') + '</div><div class="card-footer"><span>' + esc(item.slug || item.id) + '</span><span>열기 →</span></div></a>').join('');
  } catch (error) {
    notice.textContent = '목록을 불러오지 못했습니다: ' + error.message;
  }
}
loginButton.addEventListener('click', async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (error) { notice.textContent = '로그인 실패: ' + error.message + ' / Firebase Console에서 Authentication > Sign-in method > Google provider와 Authorized domains(gaemi-letter.web.app)를 확인해주세요.'; }
});
logoutButton.addEventListener('click', () => signOut(auth));
onAuthStateChanged(auth, user => {
  loginButton.style.display = user ? 'none' : '';
  logoutButton.style.display = user ? '' : 'none';
  authState.textContent = user ? user.email : '로그인 전';
  loadLetters(user);
});
</script>`;
  const html = layout({ title: '개미레터 관리자 · 개미레터', description: '개미레터 관리자 목록', body: adminBody });
  const adminDir = path.join(outDir, 'admin');
  await fs.mkdir(adminDir, { recursive: true });
  await fs.writeFile(path.join(adminDir, 'index.html'), html);
}

async function buildLetterViewer() {
  const body = `<main class="page"><section class="article-shell"><header class="article-head"><div class="eyebrow">Gaemi Letter</div><h1 id="letterTitle">개미레터를 불러오는 중</h1><p class="article-desc" id="letterDesc">Firestore에서 문서를 가져오고 있습니다.</p><div class="meta" id="letterMeta"></div><div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button class="copy-button" id="copyButton">공유 링크 복사</button><a class="pill-link" href="/">처음으로</a></div></header><article class="article" id="letterBody"><p>잠시만 기다려주세요.</p></article></section><aside class="toc" id="letterToc"><strong>Contents</strong></aside></main>
<script>window.__gaemiFirebaseConfig = ${firebaseConfig};</script>
<script>
const cfg = window.__gaemiFirebaseConfig;
const slug = decodeURIComponent(location.pathname.replace(new RegExp('^/letters/'), '').replace(new RegExp('/$'), ''));
const titleEl = document.getElementById('letterTitle');
const descEl = document.getElementById('letterDesc');
const metaEl = document.getElementById('letterMeta');
const bodyEl = document.getElementById('letterBody');
const tocEl = document.getElementById('letterToc');
function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(s='') { try { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(s)); } catch { return s; } }
function v(field) {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(v).filter(x => x !== undefined);
  if ('timestampValue' in field) return field.timestampValue;
  return undefined;
}
function buildToc() {
  const headings = [...bodyEl.querySelectorAll('h2, h3')].slice(0, 18);
  if (!headings.length) { tocEl.style.display = 'none'; return; }
  headings.forEach((h, i) => { if (!h.id) h.id = 'section-' + i; });
  tocEl.innerHTML = '<strong>Contents</strong>' + headings.map(h => '<a style="padding-left:' + (h.tagName === 'H3' ? '12px' : '0') + '" href="#' + esc(h.id) + '">' + esc(h.textContent) + '</a>').join('');
}
document.getElementById('copyButton').addEventListener('click', async event => {
  await navigator.clipboard.writeText(location.href);
  event.currentTarget.textContent = '복사됨';
});
async function loadLetter() {
  if (!slug) throw new Error('문서 slug가 없습니다.');
  const api = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(cfg.projectId) + '/databases/(default)/documents/letters/' + encodeURIComponent(slug) + '?key=' + encodeURIComponent(cfg.apiKey);
  const res = await fetch(api, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 404 ? '문서를 찾을 수 없습니다.' : '문서를 불러오지 못했습니다. HTTP ' + res.status);
  const raw = await res.json();
  const fields = raw.fields || {};
  const item = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, v(value)]));
  document.title = (item.title || '개미레터') + ' · 개미레터';
  titleEl.textContent = item.title || slug;
  descEl.textContent = item.description || '';
  const tags = item.tags || [];
  metaEl.innerHTML = '<span>' + esc(fmtDate(item.date || '')) + '</span><span>약 ' + esc(item.readMin || '?') + '분</span><span class="visibility">' + esc(item.visibility || 'link-only') + '</span>' + tags.map(t => '<span class="tag">#' + esc(t) + '</span>').join('');
  bodyEl.innerHTML = item.bodyHtml || '<p>본문이 비어 있습니다.</p>';
  buildToc();
}
loadLetter().catch(error => {
  titleEl.textContent = '문서를 열 수 없습니다';
  descEl.textContent = '링크가 잘못되었거나 접근 권한이 없습니다.';
  bodyEl.innerHTML = '<p>' + esc(error.message) + '</p>';
  tocEl.style.display = 'none';
});
</script>`;
  const html = layout({ title: '개미레터 · 문서', description: '전달받은 링크로 여는 개미레터 문서입니다.', body });
  const letterDir = path.join(outDir, 'letters');
  await fs.mkdir(letterDir, { recursive: true });
  await fs.writeFile(path.join(letterDir, 'index.html'), html);
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });
await buildIndex();
await buildAdminPage();
await buildLetterViewer();
await fs.writeFile(path.join(outDir, '.nojekyll'), '');
await fs.writeFile(path.join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log('Built backend-managed gaemi-letter viewer to docs/');
