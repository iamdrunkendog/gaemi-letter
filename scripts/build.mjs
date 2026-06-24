import fs from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';

const root = process.cwd();
const srcDir = path.join(root, 'src', 'letters');
const outDir = path.join(root, 'docs');
const style = await fs.readFile(path.join(root, 'src', 'assets', 'style.css'), 'utf8');

marked.use({
  gfm: true,
  headerIds: true,
  mangle: false,
  renderer: {
    table(header, body) {
      return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
    }
  }
});

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { data: {}, content: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { data: {}, content: raw };
  const yaml = raw.slice(3, end).trim().split(/\r?\n/);
  const contentStart = raw.indexOf('\n', end + 1);
  const content = raw.slice(contentStart + 1).replace(/^\s*\n/, '');
  const data = {};
  let current = null;
  for (const line of yaml) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) {
      current = m[1];
      const value = m[2].trim();
      data[current] = value === '' ? [] : value;
    } else if (current && Array.isArray(data[current])) {
      const item = line.match(/^\s*-\s*(.*)$/);
      if (item) data[current].push(item[1].trim());
    }
  }
  return { data, content };
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(s) {
  try { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(s)); } catch { return s; }
}
function readingTime(text) {
  const chars = text.replace(/\s+/g, '').length;
  return Math.max(1, Math.ceil(chars / 650));
}
function antSvg() {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="6" r="2.3" stroke="var(--ac)" stroke-width="1.3"/><ellipse cx="10" cy="12" rx="3.2" ry="4" stroke="var(--ac)" stroke-width="1.3"/><path d="M8.6 4.2 6.8 2.6M11.4 4.2l1.8-1.6M7.7 10.3 3.5 8.2M12.3 10.3l4.2-2.1M7.4 12H3M12.6 12H17M7.8 13.6 3.8 16M12.2 13.6l4 2.4" stroke="var(--ac)" stroke-width="1.1" stroke-linecap="round"/></svg>`;
}
function layout({ title, description, body, canonical = '', extraHead = '' }) {
  return `<!doctype html>
<html lang="ko" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : ''}
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta name="twitter:card" content="summary" />
  <style>${style}</style>
  ${extraHead}
</head>
<body>
<header class="site-header"><div class="header-inner">
  <a class="brand" href="./"><span class="ant-mark">${antSvg()}</span><span>개미레터</span></a>
  <div class="header-actions"><a class="pill-link" href="./">목록</a><button class="icon-button" id="themeToggle" title="테마 전환" aria-label="테마 전환">◐</button></div>
</div></header>
${body}
<footer class="site-footer"><div class="footer-inner"><span>개미가 정리해 보내는 작은 문서 배달함</span><span>Markdown → 개미레터</span></div></footer>
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
function tocFromHtml(html) {
  const items = [...html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)].slice(0, 18).map(m => {
    const text = m[3].replace(/<[^>]+>/g, '');
    return `<a style="padding-left:${m[1] === '3' ? '12px' : '0'}" href="#${m[2]}">${text}</a>`;
  }).join('');
  return items ? `<aside class="toc"><strong>Contents</strong>${items}</aside>` : '';
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const files = (await fs.readdir(srcDir)).filter(f => f.endsWith('.md'));
const letters = [];
for (const file of files) {
  const raw = await fs.readFile(path.join(srcDir, file), 'utf8');
  const parsed = parseFrontmatter(raw);
  if (parsed.data.visibility === 'private') continue;
  const slug = parsed.data.slug || file.replace(/\.md$/, '');
  const html = marked(parsed.content);
  const title = parsed.data.title || slug;
  const desc = parsed.data.description || `${title} - 개미레터`;
  const date = parsed.data.date || '';
  const tags = Array.isArray(parsed.data.tags) ? parsed.data.tags : [];
  const readMin = readingTime(parsed.content);
  const outSub = path.join(outDir, 'letters', slug);
  await fs.mkdir(outSub, { recursive: true });
  const page = layout({
    title: `${title} · 개미레터`,
    description: desc,
    body: `<main class="page"><section class="article-shell"><header class="article-head"><div class="eyebrow">Gaemi Letter</div><h1>${escapeHtml(title)}</h1><p class="article-desc">${escapeHtml(desc)}</p><div class="meta"><span>${fmtDate(date)}</span><span>약 ${readMin}분</span><span class="visibility">${escapeHtml(parsed.data.visibility || 'public')}</span>${tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div><div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button class="copy-button" onclick="navigator.clipboard.writeText(location.href).then(()=>this.textContent='복사됨')">공유 링크 복사</button><a class="pill-link" href="./">목록으로</a></div></header><article class="article">${html}</article></section>${tocFromHtml(html)}</main>`
  });
  await fs.writeFile(path.join(outSub, 'index.html'), page);
  letters.push({ title, desc, date, tags, slug, visibility: parsed.data.visibility || 'public', readMin });
}
letters.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
const cards = letters.map(l => `<a class="card" href="letters/${l.slug}/"><div class="meta"><span>${fmtDate(l.date)}</span><span>약 ${l.readMin}분</span><span class="visibility">${escapeHtml(l.visibility)}</span></div><h2>${escapeHtml(l.title)}</h2><p>${escapeHtml(l.desc)}</p><div class="tags">${l.tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div><div class="card-footer"><span>열기</span><span>→</span></div></a>`).join('');
const index = layout({
  title: '개미레터',
  description: 'Markdown으로 작성한 조사와 정리 글을 읽기 좋게 배달하는 개미의 문서 페이지입니다.',
  body: `<main><section class="hero"><div class="eyebrow">Gaemi Letter</div><h1>개미가 정리해 보내는 작은 문서 배달함</h1><p>Markdown으로 작성한 조사, 분석, 체크리스트를 웹에서 읽기 좋게 보여주고 링크로 나눕니다.</p></section><section class="letter-grid">${cards || '<p>아직 공개된 레터가 없습니다.</p>'}</section></main>`
});
await fs.writeFile(path.join(outDir, 'index.html'), index);
await fs.writeFile(path.join(outDir, '.nojekyll'), '');
console.log(`Built ${letters.length} letters to docs/`);
