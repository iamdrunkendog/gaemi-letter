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
  const matches = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  if (matches.length < 1) {
    throw new Error('Verification failed: Could not find main script block in HTML.');
  }
  const originalScript = matches[0][1];

  // Modify script: mock decryptHtml to check password
  let scriptCode = originalScript.replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, '');
  scriptCode = scriptCode.replace(
    /async function decryptHtml\([\s\S]*?\n\}/,
    `async function decryptHtml(encryptedBody, password) {
      if (password === 'correct') return '<h2>Decrypted Heading</h2><p>Decrypted Content</p>';
      throw new Error('decryption failed');
    }`
  );

  // Helper to run sandbox test case
  async function testCase({ slug, mockGetDoc, testFn }) {
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
      // Firebase Mocking
      initializeApp: () => ({}),
      getAuth: () => {
        if (!sandbox.__auth) {
          sandbox.__auth = { currentUser: null };
        }
        return sandbox.__auth;
      },
      GoogleAuthProvider: class {},
      signInWithPopup: async (auth) => {
        const mockUser = { email: 'wramkim@gmail.com' };
        auth.currentUser = mockUser;
        if (sandbox.__authCallback) {
          sandbox.__authCallback(mockUser);
          await sandbox.window.__loadPromise;
        }
      },
      signOut: async (auth) => {
        auth.currentUser = null;
        if (sandbox.__authCallback) {
          sandbox.__authCallback(null);
          await sandbox.window.__loadPromise;
        }
      },
      onAuthStateChanged: (auth, cb) => {
        sandbox.__authCallback = cb;
        cb(auth.currentUser);
      },
      getFirestore: () => ({}),
      doc: (db, path, id) => ({ path, id }),
      getDoc: async (docRef) => {
        if (mockGetDoc) {
          return mockGetDoc(docRef, sandbox);
        }
        throw new Error('mockGetDoc not implemented');
      },
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
    await sandbox.window.__loadPromise;

    await testFn(sandbox, elements);
  }

  // 2. Test Public Letter Flow
  await testCase({
    slug: 'public-letter',
    mockGetDoc: async () => ({
      exists: () => true,
      data: () => ({
        title: 'Public Letter Title',
        description: 'Public Letter Description',
        visibility: 'public',
        bodyHtml: '<p>Public content</p>'
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
    mockGetDoc: async () => ({
      exists: () => true,
      data: () => ({
        title: 'Protected Title',
        description: 'Protected Description',
        visibility: 'password',
        encryptedBody: {
          salt: 'saltB64',
          iv: 'ivB64',
          ciphertext: 'cipherB64'
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
    mockGetDoc: async (docRef, sandbox) => {
      const auth = sandbox.getAuth();
      if (auth.currentUser && auth.currentUser.email === 'wramkim@gmail.com') {
        return {
          exists: () => true,
          data: () => ({
            title: 'Private Title',
            description: 'Private Description',
            visibility: 'private',
            bodyHtml: '<p>Secret content</p>'
          })
        };
      } else {
        const err = new Error('Permission denied');
        err.code = 'permission-denied';
        throw err;
      }
    },
    testFn: async (sandbox, elements) => {
      // 4a. Verify before auth (generic login-required / authorization-required view)
      if (sandbox.document.title !== '개미레터 · 문서') {
        throw new Error(`Private letter title before auth should be generic, got: ${sandbox.document.title}`);
      }
      if (elements.letterTitle.textContent !== '비공개 문서') {
        throw new Error(`Private header title before auth should be '비공개 문서', got: ${elements.letterTitle.textContent}`);
      }
      if (elements.letterDesc.textContent !== '이 문서를 보려면 관리자 계정으로 로그인해야 합니다.') {
        throw new Error(`Private description before auth should be login required, got: ${elements.letterDesc.textContent}`);
      }
      if (elements.letterMeta.innerHTML !== '') {
        throw new Error('Private letter meta should be empty before auth.');
      }
      if (!elements.letterBody.innerHTML.includes('loginButton')) {
        throw new Error('Private letter body should show login button.');
      }
      if (elements.letterBody.innerHTML.includes('Secret content')) {
        throw new Error('Private letter content leaked before auth.');
      }

      // Simulate clicking login button
      const loginBtn = sandbox.document.getElementById('loginButton');
      if (!loginBtn || !loginBtn.listeners.click) {
        throw new Error('Login button or click listener not found.');
      }

      // Let's call the click listener which triggers signInWithPopup and updates auth and re-loads
      await loginBtn.listeners.click();

      // 4b. Verify after auth (authenticated owner fetch succeeds and renders)
      if (sandbox.document.title !== 'Private Title · 개미레터') {
        throw new Error(`Private letter title after auth should be set, got: ${sandbox.document.title}`);
      }
      if (elements.letterTitle.textContent !== 'Private Title') {
        throw new Error(`Private header title after auth should be Private Title, got: ${elements.letterTitle.textContent}`);
      }
      if (elements.letterDesc.textContent !== 'Private Description') {
        throw new Error(`Private description after auth should be Private Description, got: ${elements.letterDesc.textContent}`);
      }
      if (!elements.letterMeta.innerHTML.includes('private')) {
        throw new Error('Private letter meta should show after auth.');
      }
      if (!elements.letterBody.innerHTML.includes('Secret content')) {
        throw new Error('Private letter content should render after auth.');
      }

      console.log('✓ Private letter hides metadata initially and renders correctly after successful auth.');
    }
  });

  // 5. Test Admin Console Links Visibility
  await testAdminPage();

  console.log('Verification finished successfully! All tests passed.');
}

async function testAdminPage() {
  const adminHtmlPath = path.join(root, 'docs', 'admin', 'index.html');
  const html = await fs.readFile(adminHtmlPath, 'utf8');

  // Verify that statically, they have style="display:none"
  if (!html.includes('class="admin-only" style="display:none"')) {
    throw new Error('Verification failed: Admin links do not statically have display:none.');
  }
  console.log('✓ Admin console links are statically hidden.');

  // Extract the javascript block
  const matches = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  if (matches.length < 1) {
    throw new Error('Verification failed: Could not find script block in admin HTML.');
  }
  const originalScript = matches[0][1];

  let scriptCode = originalScript.replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, '');

  const elements = {
    loginButton: new MockElement('loginButton'),
    logoutButton: new MockElement('logoutButton'),
    authState: new MockElement('authState'),
    adminNotice: new MockElement('adminNotice'),
    letterList: new MockElement('letterList'),
  };

  const adminOnlyLinks = [
    { style: { display: 'none' } },
    { style: { display: 'none' } }
  ];

  const sandbox = {
    window: {
      __gaemiFirebaseConfig: { projectId: 'test-project', apiKey: 'test-key' }
    },
    document: {
      title: '개미레터 · 관리자',
      getElementById(id) {
        if (!elements[id]) {
          elements[id] = new MockElement(id);
        }
        return elements[id];
      },
      querySelectorAll(selector) {
        if (selector === '.admin-only') {
          return adminOnlyLinks;
        }
        return [];
      }
    },
    // Firebase Mocking
    initializeApp: () => ({}),
    getAuth: () => ({ currentUser: null }),
    GoogleAuthProvider: class {},
    signInWithPopup: async () => {},
    signOut: async () => {},
    onAuthStateChanged: (auth, cb) => {
      sandbox.__authCallback = cb;
      cb(auth.currentUser);
    },
    getFirestore: () => ({}),
    collection: () => ({}),
    getDocs: async () => ({
      forEach: () => {}
    }),
    query: () => ({}),
    orderBy: () => ({}),
    doc: () => ({}),
    updateDoc: async () => {},
    deleteField: () => ({}),
    TextEncoder,
    TextDecoder,
    console: { log: () => {}, error: () => {} },
    globalThis: {}
  };

  sandbox.globalThis = sandbox;

  vm.runInNewContext(scriptCode, sandbox);

  // Before login:
  if (adminOnlyLinks[0].style.display !== 'none' || adminOnlyLinks[1].style.display !== 'none') {
    throw new Error('Admin links should be hidden before login');
  }

  // Simulate login
  const mockUser = { email: 'wramkim@gmail.com' };
  await sandbox.__authCallback(mockUser);

  // After login:
  if (adminOnlyLinks[0].style.display !== '' || adminOnlyLinks[1].style.display !== '') {
    throw new Error('Admin links should be visible after login');
  }

  // Simulate logout
  await sandbox.__authCallback(null);

  // After logout:
  if (adminOnlyLinks[0].style.display !== 'none' || adminOnlyLinks[1].style.display !== 'none') {
    throw new Error('Admin links should be hidden after logout');
  }

  console.log('✓ Admin page dynamic links visibility toggle works correctly.');
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
