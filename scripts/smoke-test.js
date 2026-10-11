const { spawn } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');

const port = 3100;
const base = `http://127.0.0.1:${port}`;
const root = path.resolve(__dirname, '..');

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntilUp() {
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(`${base}/api/health`);
      return;
    } catch {
      await sleep(150);
    }
  }
  throw new Error('Server did not start');
}

const post = (body) =>
  fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

const checks = [];
async function check(name, fn) {
  try {
    await fn();
    checks.push([name, true]);
    console.log(`  PASS  ${name}`);
  } catch (err) {
    checks.push([name, false]);
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

(async () => {
  await waitUntilUp();
  console.log(`Smoke test against ${base}`);

  await check('health reports ready with question count', async () => {
    const res = await fetch(`${base}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.backend, 'ready');
    assert.ok(body.questions > 0);
  });

  let questions = [];
  await check('questions come from the dataset', async () => {
    const body = await (await fetch(`${base}/api/questions`)).json();
    questions = body.questions;
    assert.ok(Array.isArray(questions) && questions.length > 0);
    assert.ok(questions.every((q) => typeof q === 'string' && q.length > 0));
  });

  await check('a stored question is answered', async () => {
    const res = await post({ question: questions[0] });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.matched, true);
    assert.ok(body.answer.length > 0);
  });

  await check('unknown question yields the original no-match reply', async () => {
    const body = await (await post({ question: 'zzzz qqqq' })).json();
    assert.equal(body.matched, false);
    assert.equal(body.answer, 'No relevant answer found.');
  });

  await check('embedded newlines cannot inject protocol commands', async () => {
    const res = await post({ question: 'zzzz\nQUIT\nPING' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).matched, false);
    const after = await post({ question: questions[0] });
    assert.equal((await after.json()).matched, true);
  });

  await check('invalid input is rejected', async () => {
    assert.equal((await post({ question: '   ' })).status, 400);
    assert.equal((await post({ question: 42 })).status, 400);
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ question: 'a'.repeat(501) })).status, 400);
  });

  await check('concurrent requests are all answered correctly', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => post({ question: questions[i % questions.length] }).then((r) => r.json()))
    );
    assert.ok(results.every((r) => r.matched === true));
  });

  await check('static frontend is served', async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Shahane GPT/);
  });

  server.kill('SIGINT');
  await sleep(1500);

  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(failed ? `\n${failed} check(s) failed.\n--- server log ---\n${log}` : `\nAll ${checks.length} checks passed.`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err.message);
  console.error(log);
  server.kill();
  process.exit(1);
});
