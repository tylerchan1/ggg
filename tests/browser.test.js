import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const qrModule = new URL('qrcode.mjs', 'file://' + require.resolve('qrcode-generator'));
const binary = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css' };

async function runBrowser(callback, online = false) {
  const players = new Map();
  const sessions = new Map();
  let delaySubmission = false;
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/test/')) {
      const method = pathname.split('/').at(-1);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const args = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      let data;
      let error;
      const [path, code, , id] = args.ref ?? [];
      const key = code + '/' + id;
      if (method === 'get') data = path === 'teachers' ? { role: 'teacher' } : players.get(key);
      if (method === 'list') data = args.ref.length === 1
        ? [...sessions].filter(([, row]) => row.ownerId === args.owner)
        : [...players].filter(([stored]) => stored.startsWith(code + '/')).map(([, row]) => [row.studentId, row]);
      if (method === 'write') {
        if (path === 'classes' && !id) sessions.set(code, args.data);
        else if (!sessions.has(code)) error = 'permission-denied';
        else if (delaySubmission && args.data.status === 'submitted') error = 'unavailable';
        else players.set(key, { ...players.get(key), ...args.data });
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data, error }));
      return;
    }
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (file === 'config.js') {
      res.setHeader('Content-Type', mime.js);
      res.end(online ? "export const firebaseConfig={apiKey:'test', projectId:'test', appId:'test'};" : "export const firebaseConfig=null;");
      return;
    }
    if (!/^[a-z.-]+$/.test(file)) { res.writeHead(404).end(); return; }
    try {
      const bytes = await readFile(new URL('../' + file, import.meta.url));
      res.setHeader('Content-Type', mime[file.split('.').at(-1)] ?? 'text/plain');
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ executablePath: binary, args: ['--no-sandbox'] });
    await callback(browser, `http://127.0.0.1:${server.address().port}/`, value => { delaySubmission = value; });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

async function mockOnline(context) {
  const modules = {
    'firebase-app.js': 'export const initializeApp = (_config, role) => ({ role });',
    'firebase-auth.js': `
      const remember = (auth, user) => {
        auth.currentUser = user;
        localStorage.setItem('auth:' + auth.role, JSON.stringify(user));
        return { user };
      };
      export const getAuth = ({ role }) => ({
        role, currentUser: JSON.parse(localStorage.getItem('auth:' + role)),
        authStateReady: async () => {},
      });
      export const signInAnonymously = async auth => remember(auth, { uid: crypto.randomUUID(), isAnonymous: true });
      export const signInWithEmailAndPassword = async auth => remember(auth, { uid: 'teacher', isAnonymous: false });
      export const signOut = async auth => remember(auth, null);`,
    'firebase-firestore.js': `
      async function request(method, args) {
        const { data, error } = await (await fetch('/test/' + method, { method: 'POST', body: JSON.stringify(args) })).json();
        if (error) throw Object.assign(new Error(error), { code: error });
        return data;
      }
      const document = (id, data) => ({ id, exists: () => Boolean(data), data: () => data });
      export const getFirestore = app => app;
      export const doc = (_db, ...path) => path;
      export const collection = doc;
      export const where = (_key, _op, owner) => owner;
      export const query = (ref, owner) => ({ ref, owner });
      export const serverTimestamp = () => Date.now();
      export const getDocsFromServer = async args => ({
        docs: (await request('list', args)).map(([id, data]) => document(id, { ...data, createdAt: { toMillis: () => data.createdAt } })),
      });
      export const getDocFromServer = async ref => document(ref.at(-1), await request('get', { ref }));
      export const setDoc = (ref, data) => request('write', { ref, data });
      export const runTransaction = async (_db, body) => {
        const writes = [];
        const write = (ref, data) => { writes.push({ ref, data }); };
        const result = await body({ get: getDocFromServer, set: write, update: write });
        for (const item of writes) await request('write', item);
        return result;
      };
      export function onSnapshot(ref, _options, onChange, onError) {
        const refresh = async () => {
          try {
            onChange({ docs: (await request('list', { ref })).map(([id, data]) => document(id, data)), metadata: { fromCache: false } });
          } catch (error) { onError(error); }
        };
        addEventListener('test-realtime', refresh);
        refresh();
        return () => removeEventListener('test-realtime', refresh);
      }`,
  };
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({
    contentType: 'text/javascript',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: modules[new URL(route.request().url()).pathname.split('/').at(-1)],
  }));
  await context.route('https://cdn.jsdelivr.net/npm/qrcode-generator**', async route => route.fulfill({
    contentType: 'text/javascript',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: await readFile(fileURLToPath(qrModule), 'utf8'),
  }));
}

async function finish(page) {
  for (let i = 0; i < 7 && await page.locator('#accept').count(); i++) {
    const before = await page.locator('.date').textContent();
    await page.locator('#accept').click();
    await page.waitForFunction(previous => document.querySelector('.date')?.textContent !== previous
      || Boolean(document.querySelector('#report-title')), before);
  }
  await page.getByRole('heading', { name: '최종 사회 보고서' }).waitFor();
  await page.getByRole('button', { name: '인수인계서 작성하기' }).click();
}

test('좁은 모바일 화면에서 스와이프, 버튼, 새로고침과 로컬 저장을 확인한다',
  { skip: !binary && 'Chromium이 필요합니다.' }, async () => {
    await runBrowser(async (browser, url) => {
      const context = await browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.locator('#practice').click();
      assert.equal(await page.locator('.choices').textContent().then(text => /[+−][0-9]/.test(text)), false);
      assert.match(await page.locator('.date').textContent(), /2026년/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true);
      const rect = await page.locator('#swipe').boundingBox();
      const cdp = await context.newCDPSession(page);
      const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: x == null ? [] : [{ x, y: rect.y + 80 }],
      });
      const center = rect.x + rect.width / 2;
      await touch('touchStart', center);
      await touch('touchMove', center - 30);
      await touch('touchEnd');
      assert.match(await page.locator('.date').textContent(), /2026년/);
      await touch('touchStart', center);
      await touch('touchMove', center - 85);
      await page.locator('#reject.choice-active').waitFor();
      assert.equal(await page.locator('.meter-preview:not([hidden])').count(), 3);
      await touch('touchEnd');
      await page.getByText('2027년', { exact: false }).first().waitFor();
      assert.equal(await page.locator('.news').count(), 0);
      assert.equal(await page.locator('.meter-preview:not([hidden])').count(), 0);

      // Two clicks on one card must count once even before its animation finishes.
      await page.locator('#accept').evaluate(button => { button.click(); button.click(); });
      await page.getByText('2030년', { exact: false }).first().waitFor();
      await page.reload();
      assert.match(await page.locator('.date').textContent(), /정책 결정 3\/5/);
      assert.match(await page.locator('.news').textContent(), /사회혼란 \+5/);
      await page.locator('.news summary').click();
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('#restart').click();
      assert.match(await page.locator('.date').textContent(), /정책 결정 3\/5/);
      assert.equal(await page.locator('.news').getAttribute('open'), '');
      await finish(page);
      await page.getByLabel('앞으로 강화해야 할 교육').fill('디지털 리터러시');
      await page.reload();
      assert.equal(await page.getByLabel('앞으로 강화해야 할 교육').inputValue(), '디지털 리터러시');
      await page.getByLabel('그렇게 생각하는 이유').fill('정보의 출처를 확인하기 위해서입니다.');
      await page.getByRole('button', { name: '이 기기에 인수인계서 저장' }).click();
      await page.getByText('인수인계서가 이 기기에 저장되었습니다.').waitFor();
      await page.reload();
      await page.getByText('인수인계서가 이 기기에 저장되었습니다.').waitFor();
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#restart').click();
      await page.reload();
      assert.match(await page.locator('.date').textContent(), /정책 결정 1\/5/);
      assert.deepEqual(errors, []);
      await context.close();
    });
  });

test('수업 생성부터 학생 제출과 교사 결과 표시까지 확인한다',
  { skip: !binary && 'Chromium이 필요합니다.' }, async () => {
    await runBrowser(async (browser, url, blockSubmission) => {
      const teacherContext = await browser.newContext();
      const studentContext = await browser.newContext({ reducedMotion: 'reduce' });
      const secondContext = await browser.newContext();
      await mockOnline(teacherContext);
      await mockOnline(studentContext);
      await mockOnline(secondContext);
      const teacher = await teacherContext.newPage();
      const student = await studentContext.newPage();
      const errors = [];
      for (const page of [teacher, student]) page.on('pageerror', error => errors.push(error.message));
      await teacher.goto(url + '?teacher=1');
      await teacher.getByLabel('교사 이메일').fill('teacher@example.com');
      await teacher.getByLabel('비밀번호').fill('test-password');
      await teacher.getByRole('button', { name: '로그인' }).click();
      await teacher.getByRole('button', { name: '새 수업 만들기' }).click();
      await teacher.locator('#join-qr svg').waitFor();
      const joinUrl = await teacher.getByLabel('학생 접속 주소').inputValue();
      const classCode = new URL(joinUrl).searchParams.get('code');
      assert.match(classCode, /^[A-F0-9]{8}$/);
      await student.goto(joinUrl);
      assert.equal(await student.getByLabel('수업 참여 코드').inputValue(), classCode);
      await student.getByLabel('이름 또는 별칭').fill('<학생 가>');
      await student.getByRole('button', { name: '수업 참여 · 2026년' }).click();
      await student.locator('#swipe').waitFor();
      await teacher.evaluate(() => dispatchEvent(new Event('test-realtime')));
      await teacher.waitForFunction(() => document.querySelector('.class-totals strong')?.textContent === '1');
      assert.equal(await teacher.locator('[data-player]').count(), 0);
      const second = await secondContext.newPage();
      await second.goto(joinUrl);
      await second.getByLabel('이름 또는 별칭').fill('학생 나');
      await second.getByRole('button', { name: '수업 참여 · 2026년' }).click();
      await second.locator('#swipe').waitFor();
      await teacher.evaluate(() => dispatchEvent(new Event('test-realtime')));
      await teacher.waitForFunction(() => document.querySelector('.class-totals strong')?.textContent === '2');
      const card = await student.locator('#swipe').boundingBox();
      await student.mouse.move(card.x + card.width / 2, card.y + 70);
      await student.mouse.down();
      await student.mouse.move(card.x + card.width / 2 + 90, card.y + 70, { steps: 3 });
      await student.locator('#accept.choice-active').waitFor();
      await student.mouse.up();
      await student.getByText('2027년', { exact: false }).first().waitFor();
      await finish(student);
      await student.getByLabel('앞으로 강화해야 할 교육').fill('디지털·생태 융합교육');
      await student.getByLabel('그렇게 생각하는 이유').fill('기술과 환경을 함께 고려해야 합니다.');
      blockSubmission(true);
      await student.getByRole('button', { name: '인수인계서 제출' }).click();
      await student.getByText('인수인계서는 수업 서버로 전송을 기다리고 있습니다.').waitFor();
      await student.getByRole('button', { name: '다시 전송하기' }).waitFor();
      blockSubmission(false);
      await student.getByRole('button', { name: '다시 전송하기' }).click();
      await student.getByText(/인수인계서가 전달되었습니다/).waitFor();
      await teacher.evaluate(() => dispatchEvent(new Event('test-realtime')));
      await teacher.getByRole('button', { name: /<학생 가>/ }).click({ timeout: 3000 });
      await teacher.getByRole('dialog').getByText('기술과 환경을 함께 고려해야 합니다.').waitFor();
      await teacher.getByRole('dialog').getByRole('heading', { name: '최종 사회 보고서' }).waitFor();
      assert.equal(await teacher.locator('.class-totals strong').allTextContents().then(values => values.join()), '2,1,1');
      await student.getByRole('link', { name: '수업 참여 화면으로 돌아가기' }).click();
      await student.getByLabel('이름 또는 별칭').fill('<학생 가>');
      await student.getByLabel('수업 참여 코드').fill(classCode);
      await student.getByRole('button', { name: '수업 참여 · 2026년' }).click();
      await student.getByText(/인수인계서가 전달되었습니다/).waitFor();
      await student.reload();
      await student.getByText(/인수인계서가 전달되었습니다/).waitFor();
      student.once('dialog', dialog => dialog.accept());
      await student.getByRole('button', { name: '↻ 처음부터' }).click();
      await student.reload();
      await student.getByText('정책 결정 1/5', { exact: true }).waitFor();
      assert.equal(new URL(student.url()).searchParams.get('code'), classCode);
      await finish(student);
      await student.getByLabel('앞으로 강화해야 할 교육').fill('새로운 답변');
      await student.getByLabel('그렇게 생각하는 이유').fill('재시작한 게임입니다.');
      await student.getByRole('button', { name: '인수인계서 제출' }).click();
      await student.getByText(/이미 제출한 인수인계서가 있어/).waitFor();
      await teacher.evaluate(() => dispatchEvent(new Event('test-realtime')));
      assert.equal(await teacher.locator('.response-card').count(), 1);
      assert.equal(await teacher.getByText('새로운 답변').count(), 0);
      assert.deepEqual(errors, []);
    }, true);
  });
