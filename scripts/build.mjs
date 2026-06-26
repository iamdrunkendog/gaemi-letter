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

function loginSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 7.5V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 12h10m0 0-3.2-3.2M14 12l-3.2 3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function layout({ title, description, body, extraHead = '', bodyClass = '' }) {
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
<body class="${bodyClass}">
<header class="site-header"><div class="header-inner">
  <span class="brand"><img class="brand-avatar" src="/assets/profile.jpg" alt="개미" width="32" height="32" /><span>개미레터</span></span>
  <div class="header-actions"><a class="icon-button" href="/admin/" title="관리자 페이지" aria-label="관리자 페이지">${loginSvg()}</a><button class="icon-button" id="themeToggle" title="테마 전환" aria-label="테마 전환">◐</button></div>
</div></header>
${body}
<footer class="site-footer"><div class="footer-inner"><span>개미가 정리해 보내는 작은 문서 배달함</span><span>링크로만 전달되는 문서함</span></div></footer>
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

function firebaseImportLines() {
  return `import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, orderBy, doc, updateDoc, deleteField, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
const firebaseConfig = window.__gaemiFirebaseConfig;`;
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
  const adminBody = `<main class="page"><section class="article-shell"><header class="article-head"><div class="eyebrow">Private Admin</div><h1>개미레터 관리자 목록</h1><p class="article-desc">관리자 권한이 있는 Google 계정으로 로그인하면 문서 목록과 공개여부를 관리할 수 있습니다.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="copy-button" id="loginButton">Google로 로그인</button><button class="copy-button" id="logoutButton" style="display:none">로그아웃</button><span class="tag" id="authState">로그인 전</span></div></header><article class="article"><div id="adminNotice" class="table-wrap" style="padding:16px">로그인이 필요합니다.</div><div id="letterList"></div></article></section><aside class="toc"><strong>Admin</strong><a href="/">공개 랜딩</a><a href="https://console.firebase.google.com/project/gaemi-letter/authentication/users" target="_blank" rel="noreferrer" class="admin-only" style="display:none">Auth Users</a><a href="https://console.firebase.google.com/project/gaemi-letter/firestore/databases/-default-/data" target="_blank" rel="noreferrer" class="admin-only" style="display:none">Firestore Console</a></aside></main>
${firebaseConfigScript()}
<script type="module">
${firebaseImportLines()}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const authState = document.getElementById('authState');
const notice = document.getElementById('adminNotice');
const list = document.getElementById('letterList');
let currentItems = [];
function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function bytesToBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
async function keyFromPassword(password, saltB64, iterations = 210000) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: base64ToBytes(saltB64), iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptHtml(html, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const saltB64 = bytesToBase64(salt);
  const key = await keyFromPassword(password, saltB64);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(html));
  return { alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: 210000, salt: saltB64, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(cipher)) };
}
async function decryptHtml(encryptedBody, password) {
  const key = await keyFromPassword(password, encryptedBody.salt, encryptedBody.iterations || 210000);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(encryptedBody.iv) }, key, base64ToBytes(encryptedBody.ciphertext));
  return new TextDecoder().decode(plain);
}
function htmlToMarkdown(html) {
  if (typeof DOMParser === 'undefined') return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    
    const tag = node.tagName.toLowerCase();
    
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (rows.length === 0) return '';
      let tableMd = '\\n\\n';
      let headerColsCount = 0;
      
      rows.forEach((rowEl, rowIndex) => {
        const cells = Array.from(rowEl.querySelectorAll('th, td'));
        if (rowIndex === 0) {
          headerColsCount = cells.length;
        }
        const cellTexts = cells.map(cell => walk(cell).replace(/\\n/g, ' ').trim());
        tableMd += '| ' + cellTexts.join(' | ') + ' |\\n';
        if (rowIndex === 0) {
          tableMd += '| ' + Array(headerColsCount).fill('---').join(' | ') + ' |\\n';
        }
      });
      tableMd += '\\n';
      return tableMd;
    }
    
    let childrenMarkdown = '';
    for (const child of node.childNodes) {
      childrenMarkdown += walk(child);
    }
    
    switch (tag) {
      case 'h1': return '\\n\\n# ' + childrenMarkdown.trim() + '\\n\\n';
      case 'h2': return '\\n\\n## ' + childrenMarkdown.trim() + '\\n\\n';
      case 'h3': return '\\n\\n### ' + childrenMarkdown.trim() + '\\n\\n';
      case 'h4': return '\\n\\n#### ' + childrenMarkdown.trim() + '\\n\\n';
      case 'h5': return '\\n\\n##### ' + childrenMarkdown.trim() + '\\n\\n';
      case 'h6': return '\\n\\n###### ' + childrenMarkdown.trim() + '\\n\\n';
      case 'p': return '\\n\\n' + childrenMarkdown.trim() + '\\n\\n';
      case 'br': return '\\n';
      case 'strong':
      case 'b': return '**' + childrenMarkdown + '**';
      case 'em':
      case 'i': return '*' + childrenMarkdown + '*';
      case 'code': {
        if (node.parentNode && node.parentNode.tagName.toLowerCase() === 'pre') {
          return childrenMarkdown;
        }
        return '\`' + node.textContent + '\`';
      }
      case 'pre': {
        return '\\n\\n\`\`\`\\n' + node.textContent.trim() + '\\n\`\`\`\\n\\n';
      }
      case 'a': {
        const href = node.getAttribute('href') || '';
        return '[' + childrenMarkdown + '](' + href + ')';
      }
      case 'img': {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        return '![' + alt + '](' + src + ')';
      }
      case 'blockquote': {
        return '\\n\\n' + childrenMarkdown.trim().split('\\n').map(line => '> ' + line).join('\\n') + '\\n\\n';
      }
      case 'li': {
        const isOrdered = node.parentNode && node.parentNode.tagName.toLowerCase() === 'ol';
        if (isOrdered) {
          const index = Array.from(node.parentNode.children).indexOf(node) + 1;
          return '\\n' + index + '. ' + childrenMarkdown.trim();
        } else {
          return '\\n- ' + childrenMarkdown.trim();
        }
      }
      case 'ul':
      case 'ol': {
        return '\\n' + childrenMarkdown.trim() + '\\n';
      }
      case 'hr': return '\\n\\n---\\n\\n';
      default:
        return childrenMarkdown;
    }
  }
  
  let markdown = walk(doc.body);
  markdown = markdown.replace(/\\n{3,}/g, '\\n\\n').trim();
  return markdown;
}
function buildMarkdownExport(item, bodyMarkdown) {
  const frontmatterParts = [];
  frontmatterParts.push('---');
  frontmatterParts.push('title: ' + JSON.stringify(item.title || ''));
  frontmatterParts.push('date: ' + JSON.stringify(item.date || ''));
  frontmatterParts.push('slug: ' + JSON.stringify(item.slug || item.id));
  frontmatterParts.push('visibility: ' + JSON.stringify(item.visibility || 'public'));
  if (item.tags && item.tags.length > 0) {
    frontmatterParts.push('tags:');
    item.tags.forEach(t => frontmatterParts.push('  - ' + t));
  }
  if (item.description) {
    frontmatterParts.push('description: ' + JSON.stringify(item.description));
  }
  frontmatterParts.push('---');
  return frontmatterParts.join('\\n') + '\\n\\n' + bodyMarkdown;
}
function safeFileName(item) {
  const date = item.date || '';
  const slug = item.slug || item.id || '';
  let base = (date ? date + '-' : '') + slug;
  base = base.replace(/[\\/:*?"<>|]/g, '_');
  base = base.trim().replace(/\\s+/g, '_');
  return (base || 'letter') + '.md';
}
function downloadTextFile(text, fileName) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
async function exportMarkdown(id, rootEl) {
  const item = currentItems.find(x => x.id === id);
  const status = rootEl.querySelector('[data-role="status"]');
  status.textContent = '내보내는 중...';
  try {
    let markdown = '';
    if (item.bodyMarkdown) {
      markdown = item.bodyMarkdown;
    } else if (item.bodyHtml) {
      markdown = htmlToMarkdown(item.bodyHtml);
    } else if (item.encryptedBody) {
      const password = rootEl.querySelector('[data-role="password"]').value;
      if (!password) {
        throw new Error('비밀번호를 입력해야 합니다.');
      }
      const decryptedHtml = await decryptHtml(item.encryptedBody, password);
      markdown = htmlToMarkdown(decryptedHtml);
    } else {
      throw new Error('내보낼 본문 데이터가 없습니다.');
    }
    
    const fullMarkdown = buildMarkdownExport(item, markdown);
    const fileName = safeFileName(item);
    downloadTextFile(fullMarkdown, fileName);
    status.textContent = '내보내기 완료';
  } catch (error) {
    status.textContent = '오류: ' + error.message;
  }
}
function row(item) {
  const id = esc(item.id);
  const slug = esc(item.slug || item.id);
  const visibility = item.visibility || 'public';
  const canEncrypt = Boolean(item.bodyHtml || item.encryptedBody);
  return '<tr data-id="' + id + '"><td><span class="admin-date">' + esc(item.date || '') + '</span></td><td><div class="admin-title-wrap"><a class="admin-title-link" href="/letters/' + slug + '/" target="_blank" rel="noreferrer">' + esc(item.title || item.id) + '</a><span class="admin-slug">' + slug + '</span></div></td><td><select data-role="visibility"><option value="public" ' + (visibility === 'public' || visibility === 'link-only' ? 'selected' : '') + '>공개 (링크)</option><option value="private" ' + (visibility === 'private' ? 'selected' : '') + '>비공개</option><option value="password" ' + (visibility === 'password' ? 'selected' : '') + '>비밀번호</option></select></td><td><input data-role="password" type="password" placeholder="비밀번호" autocomplete="new-password"></td><td><div class="admin-desc">' + esc(item.description || '') + '</div><div class="admin-tags">' + (item.tags || []).map(t => '<span class="tag">#' + esc(t) + '</span>').join('') + '</div></td><td><div class="admin-actions"><button class="copy-button" data-role="save" ' + (canEncrypt ? '' : 'disabled') + '>저장</button><a class="pill-link" href="/letters/' + slug + '/" target="_blank" rel="noreferrer">열기</a><button class="copy-button" data-role="copy">복사</button><button class="copy-button" data-role="export">MD</button><span class="admin-status" data-role="status"></span></div></td></tr>';
}
async function saveItem(id, rootEl) {
  const item = currentItems.find(x => x.id === id);
  const visibility = rootEl.querySelector('[data-role="visibility"]').value;
  const password = rootEl.querySelector('[data-role="password"]').value;
  const status = rootEl.querySelector('[data-role="status"]');
  status.textContent = '저장 중...';
  const ref = doc(db, 'letters', id);
  const update = { visibility, updatedAt: new Date().toISOString() };
  if (visibility === 'password') {
    if (!item.encryptedBody) {
      if (!password) throw new Error('비밀번호를 입력해야 합니다.');
      if (!item.bodyHtml) throw new Error('암호화할 평문 본문이 없습니다.');
      update.encryptedBody = await encryptHtml(item.bodyHtml, password);
      update.bodyHtml = deleteField();
      update.bodyMarkdown = deleteField();
      update.passwordHint = '';
    } else if (password && item.bodyHtml) {
      update.encryptedBody = await encryptHtml(item.bodyHtml, password);
      update.bodyHtml = deleteField();
      update.bodyMarkdown = deleteField();
    }
  } else if ((visibility === 'public' || visibility === 'link-only' || visibility === 'private') && item.encryptedBody && !item.bodyHtml) {
    if (!password) throw new Error('암호화된 문서를 공개/비공개로 바꾸려면 현재 비밀번호를 입력해 복호화해야 합니다.');
    update.bodyHtml = await decryptHtml(item.encryptedBody, password);
    update.encryptedBody = deleteField();
  }
  await updateDoc(ref, update);
  status.textContent = '저장됨';
  await loadLetters(auth.currentUser);
}
async function loadLetters(user) {
  if (!user) {
    notice.textContent = '로그인이 필요합니다.';
    list.innerHTML = '';
    return;
  }
  notice.textContent = '목록을 불러오는 중...';
  try {
    const snap = await getDocs(query(collection(db, 'letters'), orderBy('date', 'desc')));
    currentItems = [];
    snap.forEach(docSnap => currentItems.push({ id: docSnap.id, ...docSnap.data() }));
    notice.textContent = currentItems.length ? '총 ' + currentItems.length + '개 레터' : '아직 등록된 레터가 없습니다.';
    list.innerHTML = '<div class="table-wrap"><table class="admin-table"><thead><tr><th>날짜</th><th>제목 / 슬러그</th><th>공개설정</th><th>비밀번호</th><th>설명 및 태그</th><th>관리</th></tr></thead><tbody>' + currentItems.map(row).join('') + '</tbody></table></div><p class="admin-note">💡 <b>안내:</b> 비밀번호 설정 시 본문은 브라우저에서 AES-GCM으로 암호화되고 Firestore 평문 본문은 삭제됩니다. 암호화 문서를 공개/비공개로 바꿀 때는 현재 비밀번호를 입력해야 복호화되어 저장됩니다.</p>';
    list.querySelectorAll('[data-role="save"]').forEach(button => button.addEventListener('click', async event => {
      const rootEl = event.currentTarget.closest('[data-id]');
      try { await saveItem(rootEl.dataset.id, rootEl); }
      catch (error) { rootEl.querySelector('[data-role="status"]').textContent = '오류: ' + error.message; }
    }));
    list.querySelectorAll('[data-role="copy"]').forEach(button => button.addEventListener('click', async event => {
      const rootEl = event.currentTarget.closest('[data-id]');
      const item = currentItems.find(x => x.id === rootEl.dataset.id);
      await navigator.clipboard.writeText(location.origin + '/letters/' + (item.slug || item.id) + '/');
      rootEl.querySelector('[data-role="status"]').textContent = '링크 복사됨';
    }));
    list.querySelectorAll('[data-role="export"]').forEach(button => button.addEventListener('click', async event => {
      const rootEl = event.currentTarget.closest('[data-id]');
      await exportMarkdown(rootEl.dataset.id, rootEl);
    }));
  } catch (error) {
    notice.textContent = '목록을 불러오지 못했습니다. 관리자 권한이 없거나 설정을 확인해야 합니다.';
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
  authState.textContent = user ? '로그인됨' : '로그인 전';
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = user ? '' : 'none');
  loadLetters(user);
});
</script>`;
  const html = layout({ title: '개미레터 관리자 · 개미레터', description: '개미레터 관리자 목록', body: adminBody });
  const adminDir = path.join(outDir, 'admin');
  await fs.mkdir(adminDir, { recursive: true });
  await fs.writeFile(path.join(adminDir, 'index.html'), html);
}

async function buildLetterViewer() {
  const body = `<main class="page"><section class="article-shell"><header class="article-head"><div class="eyebrow">Gaemi Letter</div><h1 id="letterTitle">개미레터를 불러오는 중</h1><p class="article-desc" id="letterDesc">Firestore에서 문서를 가져오고 있습니다.</p><div class="meta" id="letterMeta"></div><div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button class="copy-button" id="copyButton">공유 링크 복사</button></div></header><article class="article" id="letterBody"><p>잠시만 기다려주세요.</p></article></section><aside class="toc" id="letterToc"><strong>Contents</strong></aside></main>
<script>window.__gaemiFirebaseConfig = ${firebaseConfig};</script>
<script type="module">
${firebaseImportLines()}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const slug = decodeURIComponent(location.pathname.replace(new RegExp('^/letters/'), '').replace(new RegExp('/$'), ''));
const titleEl = document.getElementById('letterTitle');
const descEl = document.getElementById('letterDesc');
const metaEl = document.getElementById('letterMeta');
const bodyEl = document.getElementById('letterBody');
const tocEl = document.getElementById('letterToc');

function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(s='') { try { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(s)); } catch { return s; } }

function bytesToBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
async function keyFromPassword(password, saltB64, iterations = 210000) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: base64ToBytes(saltB64), iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}
async function decryptHtml(encryptedBody, password) {
  const key = await keyFromPassword(password, encryptedBody.salt, encryptedBody.iterations || 210000);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(encryptedBody.iv) }, key, base64ToBytes(encryptedBody.ciphertext));
  return new TextDecoder().decode(plain);
}
function buildToc() {
  const headings = [...bodyEl.querySelectorAll('h2, h3')].slice(0, 18);
  if (!headings.length) { tocEl.style.display = 'none'; return; }
  tocEl.style.display = '';
  headings.forEach((h, i) => { if (!h.id) h.id = 'section-' + i; });
  tocEl.innerHTML = '<strong>Contents</strong>' + headings.map(h => '<a style="padding-left:' + (h.tagName === 'H3' ? '12px' : '0') + '" href="#' + esc(h.id) + '">' + esc(h.textContent) + '</a>').join('');
}
function renderMeta(item) {
  const tags = item.tags || [];
  metaEl.innerHTML = '<span>' + esc(fmtDate(item.date || '')) + '</span><span>약 ' + esc(item.readMin || '?') + '분</span><span class="visibility">' + esc(item.visibility || 'public') + '</span>' + tags.map(t => '<span class="tag">#' + esc(t) + '</span>').join('');
}
function renderBody(html) {
  bodyEl.innerHTML = html || '<p>본문이 비어 있습니다.</p>';
  bodyEl.querySelectorAll('table').forEach(table => {
    if (!table.parentElement.classList.contains('table-wrap')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrap';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
  buildToc();
}
function renderPasswordPrompt(item, message = '') {
  tocEl.style.display = 'none';
  bodyEl.innerHTML = '<div class="table-wrap" style="padding:18px"><h2>비밀번호 입력</h2><p>전달받은 비밀번호를 입력하면 브라우저에서 본문을 복호화합니다.</p><label>비밀번호 <input id="letterPassword" type="password" autocomplete="current-password" style="max-width:320px"></label><div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="copy-button" id="unlockButton">열기</button><span class="tag" id="unlockStatus">' + esc(message) + '</span></div></div>';
  document.getElementById('unlockButton').addEventListener('click', async () => {
    const status = document.getElementById('unlockStatus');
    const password = document.getElementById('letterPassword').value;
    status.textContent = '확인 중...';
    try {
      const html = await decryptHtml(item.encryptedBody, password);
      status.textContent = '열림';
      document.title = (item.title || '개미레터') + ' · 개미레터';
      titleEl.textContent = item.title || slug;
      descEl.textContent = item.description || '';
      renderMeta(item);
      renderBody(html);
    } catch (error) {
      status.textContent = '비밀번호가 맞지 않습니다.';
    }
  });
}
document.getElementById('copyButton').addEventListener('click', async event => {
  await navigator.clipboard.writeText(location.href);
  event.currentTarget.textContent = '복사됨';
});

async function loadLetter(user) {
  if (!slug) throw new Error('문서 slug가 없습니다.');
  try {
    const docSnap = await getDoc(doc(db, 'letters', slug));
    if (!docSnap.exists()) {
      throw new Error('문서를 찾을 수 없거나 접근 권한이 없습니다.');
    }
    const item = docSnap.data();
    const visibility = item.visibility || 'public';
    if (visibility === 'password') {
      if (!item.encryptedBody) throw new Error('비밀번호 문서 설정이 잘못되었습니다.');
      document.title = '개미레터 · 보호 문서';
      titleEl.textContent = '보호된 개미레터';
      descEl.textContent = '비밀번호가 필요한 개미레터입니다.';
      metaEl.innerHTML = '';
      renderPasswordPrompt(item);
    } else {
      document.title = (item.title || '개미레터') + ' · 개미레터';
      titleEl.textContent = item.title || slug;
      descEl.textContent = item.description || '';
      renderMeta(item);
      renderBody(item.bodyHtml || '<p>본문이 비어 있습니다.</p>');
    }
  } catch (error) {
    if (!user) {
      document.title = '개미레터 · 문서';
      titleEl.textContent = '비공개 문서';
      descEl.textContent = '이 문서를 보려면 관리자 계정으로 로그인해야 합니다.';
      metaEl.innerHTML = '';
      bodyEl.innerHTML = '<div class="table-wrap" style="padding:18px;text-align:center"><button class="copy-button" id="loginButton">Google로 로그인</button></div>';
      tocEl.style.display = 'none';
      document.getElementById('loginButton')?.addEventListener('click', async () => {
        try {
          await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (err) {
          alert('로그인 실패: ' + err.message);
        }
      });
    } else {
      document.title = '개미레터 · 권한 없음';
      titleEl.textContent = '접근 권한이 없습니다';
      descEl.textContent = '관리자 계정이 아니거나 존재하지 않는 문서입니다.';
      metaEl.innerHTML = '';
      bodyEl.innerHTML = '<div class="table-wrap" style="padding:18px;text-align:center"><p>로그인한 계정: ' + esc(user.email) + '</p><button class="copy-button" id="logoutButton">로그아웃</button></div>';
      tocEl.style.display = 'none';
      document.getElementById('logoutButton')?.addEventListener('click', () => signOut(auth));
    }
  }
}

globalThis.loadLetter = loadLetter;

onAuthStateChanged(auth, user => {
  window.__loadPromise = loadLetter(user);
});
</script>`;
  const html = layout({ title: '개미레터 · 문서', description: '전달받은 링크로 여는 개미레터 문서입니다.', body, bodyClass: 'is-reader-page' });
  const letterDir = path.join(outDir, 'letters');
  await fs.mkdir(letterDir, { recursive: true });
  await fs.writeFile(path.join(letterDir, 'index.html'), html);
  await fs.writeFile(path.join(outDir, '404.html'), html);
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(path.join(outDir, 'assets'), { recursive: true });
await fs.copyFile(path.join('/Users/gaemikim/gaemilog', 'profile.jpg'), path.join(outDir, 'assets', 'profile.jpg'));
await buildIndex();
await buildAdminPage();
await buildLetterViewer();
await fs.writeFile(path.join(outDir, '.nojekyll'), '');
await fs.writeFile(path.join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
await fs.writeFile(path.join(outDir, 'CNAME'), 'letter.gaemi.kim\n');
console.log('Built backend-managed gaemi-letter viewer to docs/');
