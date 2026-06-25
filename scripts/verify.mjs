import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const viewerHtmlPath = path.join(root, 'docs', 'letters', 'index.html');

class MockElement {
  constructor(id) {
    this.id = id;
    this._textContent = '';
    this._innerHTML = '';
    this.style = { display: '' };
    this.listeners = {};
  }
  get textContent() { return this._textContent; }
  set textContent(val) { this._textContent = val; }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) { this._innerHTML = val; }
  addEventListener(event, callback) {
    this.listeners[event] = callback;
  }
  querySelectorAll(selector) {
    return [];
  }
}

async function runTest() {
  console.log('Starting gaemi-letter privacy flow verification...');

  // 1. Read and verify static metadata
  const html = await fs.readFile(viewerHtmlPath, 'utf8');
  if (!html.includes('<title>개미레터 · 문서</title>')) {
    throw new Error('Verification failed: Static HTML title is not generic.');
  }
  if (!html.includes('<meta name="description" content="전달받은 링크로 여는 개미레터 문서입니다." />')) {
    throw new Error('Verification failed: Static HTML description is not generic.');
  }
  console.log('✓ Static meta tags are generic.');

  // Extract the viewer javascript block
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (matches.length < 2) {
    throw new Error('Verification failed: Could not find main script block in HTML.');
  }
  const originalScript = matches[1][1];

  // Modify script: mock decryptHtml to check password, and capture loadLetter promise
  let scriptCode = originalScript.replace(
    /async function decryptHtml\([\s\S]*?\n\}/,
    `async function decryptHtml(encryptedBody, password) {
      if (password === 'correct') return '<h2>Decrypted Heading</h2><p>Decrypted Content</p>';
      throw new Error('decryption failed');
    }`
  );

  scriptCode = scriptCode.replace(
    /loadLetter\(\)\.catch\(/,
    'globalThis.__loadPromise = loadLetter().catch('
  );

  // Helper to run sandbox test case
  async function testCase({ slug, mockFetch, testFn }) {
    const elements = {};
    const sandbox = {
      window: {
        __gaemiFirebaseConfig: { projectId: 'test-project', apiKey: 'test-key' }
      },
      document: {
        title: '개미레터 · 문서',
        documentElement: { dataset: {} },
        getElementById(id) {
          if (!elements[id]) {
            elements[id] = new MockElement(id);
          }
          return elements[id];
        },
        querySelectorAll(selector) {
          return [];
        }
      },
      location: {
        pathname: `/letters/${encodeURIComponent(slug)}`
      },
      fetch: mockFetch,
      TextEncoder,
      TextDecoder,
      console: {
        log: () => {},
        error: () => {}
      },
      globalThis: {}
    };

    sandbox.globalThis = sandbox;

    vm.runInNewContext(scriptCode, sandbox);
    await sandbox.__loadPromise;

    await testFn(sandbox, elements);
  }

  // 2. Test Public Letter Flow
  await testCase({
    slug: 'public-letter',
    mockFetch: async () => ({
      ok: true,
      json: async () => ({
        fields: {
          title: { stringValue: 'Public Letter Title' },
          description: { stringValue: 'Public Letter Description' },
          visibility: { stringValue: 'public' },
          bodyHtml: { stringValue: '<p>Public content</p>' }
        }
      })
    }),
    testFn: async (sandbox, elements) => {
      if (sandbox.document.title !== 'Public Letter Title · 개미레터') {
        throw new Error(`Public Title failed: ${sandbox.document.title}`);
      }
      if (elements.letterTitle.textContent !== 'Public Letter Title') {
        throw new Error(`Public Header Title failed: ${elements.letterTitle.textContent}`);
      }
      if (elements.letterDesc.textContent !== 'Public Letter Description') {
        throw new Error(`Public Description failed: ${elements.letterDesc.textContent}`);
      }
      if (!elements.letterMeta.innerHTML.includes('public')) {
        throw new Error('Public Meta should render and display visibility.');
      }
      console.log('✓ Public letter displays metadata and content correctly.');
    }
  });

  // 3. Test Password-Protected Letter Flow
  await testCase({
    slug: 'password-letter',
    mockFetch: async () => ({
      ok: true,
      json: async () => ({
        fields: {
          title: { stringValue: 'Protected Title' },
          description: { stringValue: 'Protected Description' },
          visibility: { stringValue: 'password' },
          encryptedBody: {
            mapValue: {
              fields: {
                salt: { stringValue: 'saltB64' },
                iv: { stringValue: 'ivB64' },
                ciphertext: { stringValue: 'cipherB64' }
              }
            }
          }
        }
      })
    }),
    testFn: async (sandbox, elements) => {
      // Prior to decryption, check that metadata is generic / hidden
      if (sandbox.document.title !== '개미레터 · 보호 문서') {
        throw new Error(`Protected title before unlock should be generic, got: ${sandbox.document.title}`);
      }
      if (elements.letterTitle.textContent !== '보호된 개미레터') {
        throw new Error(`Protected header title before unlock should be generic, got: ${elements.letterTitle.textContent}`);
      }
      if (elements.letterDesc.textContent !== '비밀번호가 필요한 개미레터입니다.') {
        throw new Error(`Protected description before unlock should be generic, got: ${elements.letterDesc.textContent}`);
      }
      if (elements.letterMeta.innerHTML !== '') {
        throw new Error('Protected letter meta should be empty before unlock.');
      }
      if (!elements.letterBody.innerHTML.includes('letterPassword')) {
        throw new Error('Protected letter body should render password prompt.');
      }
      if (elements.letterToc.style.display !== 'none') {
        throw new Error('TOC should be hidden before unlock.');
      }

      // Find prompt listener and simulate correct/incorrect entries
      const unlockButton = sandbox.document.getElementById('unlockButton');
      const letterPassword = sandbox.document.getElementById('letterPassword');
      const unlockStatus = sandbox.document.getElementById('unlockStatus');
      if (!unlockButton || !unlockButton.listeners.click) {
        throw new Error('Unlock button or click listener not found.');
      }

      // Enter WRONG password
      letterPassword.textContent = 'wrong-password'; // Set mock input value
      letterPassword.value = 'wrong-password';
      await unlockButton.listeners.click();

      if (unlockStatus.textContent !== '비밀번호가 맞지 않습니다.') {
        throw new Error(`Status should report failure on wrong password, got: ${unlockStatus.textContent}`);
      }
      // Metadata must still be hidden
      if (sandbox.document.title !== '개미레터 · 보호 문서') {
        throw new Error('Metadata leaked on wrong password.');
      }

      // Enter CORRECT password
      letterPassword.textContent = 'correct';
      letterPassword.value = 'correct';
      await unlockButton.listeners.click();

      if (unlockStatus.textContent !== '열림') {
        throw new Error(`Status should report success, got: ${unlockStatus.textContent}`);
      }
      // Metadata must now be revealed
      if (sandbox.document.title !== 'Protected Title · 개미레터') {
        throw new Error('Title not set after correct password.');
      }
      if (elements.letterTitle.textContent !== 'Protected Title') {
        throw new Error('Header title not set after correct password.');
      }
      if (elements.letterDesc.textContent !== 'Protected Description') {
        throw new Error('Description not set after correct password.');
      }
      if (!elements.letterMeta.innerHTML.includes('password')) {
        throw new Error('Meta not rendered after correct password.');
      }
      if (!elements.letterBody.innerHTML.includes('Decrypted Content')) {
        throw new Error('Body does not contain decrypted content.');
      }
      console.log('✓ Password protected letter hides metadata and reveals it only upon correct decryption.');
    }
  });

  // 4. Test Private Letter Flow
  await testCase({
    slug: 'private-letter',
    mockFetch: async () => ({
      ok: true,
      json: async () => ({
        fields: {
          title: { stringValue: 'Private Title' },
          description: { stringValue: 'Private Description' },
          visibility: { stringValue: 'private' },
          bodyHtml: { stringValue: '<p>Secret content</p>' }
        }
      })
    }),
    testFn: async (sandbox, elements) => {
      // Must fall back to error state
      if (elements.letterTitle.textContent !== '문서를 열 수 없습니다') {
        throw new Error('Private letter should fall back to error title.');
      }
      if (elements.letterDesc.textContent !== '링크가 잘못되었거나 접근 권한이 없습니다.') {
        throw new Error('Private letter should show access error description.');
      }
      if (sandbox.document.title !== '개미레터 · 문서') {
        throw new Error('Private letter title should remain generic.');
      }
      if (elements.letterMeta.innerHTML !== '') {
        throw new Error('Private letter metadata should be empty.');
      }
      if (elements.letterBody.innerHTML.includes('Secret content')) {
        throw new Error('Private letter content leaked.');
      }
      console.log('✓ Private letter falls back to error state without leaking metadata.');
    }
  });

  console.log('Verification finished successfully! All tests passed.');
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
