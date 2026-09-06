'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createStore } = require('../src/store/db');

async function tmpFile() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fp-db-'));
  return path.join(dir, 'todo.json');
}

test('文件不存在时 load 返回空结构', async () => {
  const file = await tmpFile();
  const store = createStore(file);
  const state = await store.load();

  assert.deepStrictEqual(state, { version: 1, users: [], families: [], tasks: [] });
});

test('load 能解析已存在的文件', async () => {
  const file = await tmpFile();
  await fsp.writeFile(file, JSON.stringify({
    version: 1,
    users: [{ id: 'u_1', username: 'alice' }],
    families: [],
    tasks: [{ id: 't_1', title: '买牛奶' }],
  }));

  const store = createStore(file);
  const state = await store.load();

  assert.strictEqual(state.users.length, 1);
  assert.strictEqual(state.users[0].username, 'alice');
  assert.strictEqual(state.tasks[0].title, '买牛奶');
});

test('字段缺失时补齐为空数组', async () => {
  const file = await tmpFile();
  await fsp.writeFile(file, JSON.stringify({ version: 1, users: [{ id: 'u_1' }] }));

  const state = await createStore(file).load();

  assert.deepStrictEqual(state.families, []);
  assert.deepStrictEqual(state.tasks, []);
  assert.strictEqual(state.users.length, 1);
});

test('mutate 后内容落盘且可被重新解析', async () => {
  const file = await tmpFile();
  const store = createStore(file);
  await store.load();

  store.mutate((s) => { s.users.push({ id: 'u_1', username: 'bob' }); });
  await store.whenIdle();

  const raw = await fsp.readFile(file, 'utf8');
  assert.deepStrictEqual(JSON.parse(raw).users, [{ id: 'u_1', username: 'bob' }]);
});

test('并发 50 次 mutate 后文件完整且计数正确', async () => {
  const file = await tmpFile();
  const store = createStore(file);
  await store.load();

  for (let i = 0; i < 50; i += 1) {
    store.mutate((s) => { s.tasks.push({ id: `t_${i}`, title: `任务${i}` }); });
  }
  await store.whenIdle();

  const parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
  assert.strictEqual(parsed.tasks.length, 50);
  assert.strictEqual(parsed.tasks[49].title, '任务49');
});

test('写入生成 .bak 备份且不残留 .tmp', async () => {
  const file = await tmpFile();
  const store = createStore(file);
  await store.load();

  store.mutate((s) => { s.tasks.push({ id: 't_1' }); });
  await store.whenIdle();
  assert.strictEqual(await exists(`${file}.bak`), false, '首次写入不应产生 .bak');

  store.mutate((s) => { s.tasks.push({ id: 't_2' }); });
  await store.whenIdle();

  assert.strictEqual(await exists(`${file}.bak`), true, '第二次写入应产生 .bak');
  assert.strictEqual(await exists(`${file}.tmp`), false, '.tmp 不应残留');
});

test('.bak 保留的是上一版本内容', async () => {
  const file = await tmpFile();
  const store = createStore(file);
  await store.load();

  store.mutate((s) => { s.tasks.push({ id: 't_1' }); });
  await store.whenIdle();
  store.mutate((s) => { s.tasks.push({ id: 't_2' }); });
  await store.whenIdle();

  const bak = JSON.parse(await fsp.readFile(`${file}.bak`, 'utf8'));
  assert.strictEqual(bak.tasks.length, 1);
  assert.strictEqual(bak.tasks[0].id, 't_1');
});

test('文件内容非法时 load 抛错', async () => {
  const file = await tmpFile();
  await fsp.writeFile(file, '{ 这不是合法 JSON');

  await assert.rejects(() => createStore(file).load());
});

test('写盘失败时 commit 抛错，恢复权限后可继续写入', async () => {
  const file = await tmpFile();
  const store = createStore(file);
  await store.load();

  // 目录改为只读，模拟权限问题（挂载属主不匹配等）
  await fsp.chmod(path.dirname(file), 0o500);

  store.mutate((s) => { s.tasks.push({ id: 't_x' }); });
  await assert.rejects(() => store.commit(), /EACCES|permission/i);

  // 恢复权限后，写入队列应能继续工作（不被上一次失败卡死）
  await fsp.chmod(path.dirname(file), 0o700);
  store.mutate((s) => { s.tasks.push({ id: 't_y' }); });
  await store.commit();
  await store.whenIdle();

  const parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
  assert.strictEqual(parsed.tasks.length, 2);
});

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}
