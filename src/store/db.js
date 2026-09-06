'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');

const SCHEMA_VERSION = 1;

function emptyState() {
  return { version: SCHEMA_VERSION, users: [], families: [], tasks: [] };
}

/** 补齐缺失字段，保证内存态结构始终完整。 */
function normalize(parsed) {
  const src = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    version: SCHEMA_VERSION,
    users: Array.isArray(src.users) ? src.users : [],
    families: Array.isArray(src.families) ? src.families : [],
    tasks: Array.isArray(src.tasks) ? src.tasks : [],
  };
}

class Store {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.state = emptyState();
    this._pending = false;
    // 内部写队列：永不 reject，保证失败后后续写入仍可继续
    this._tail = Promise.resolve();
    // 最近一次写入的 Promise：可能 reject，供路由 await 感知失败
    this._lastWrite = null;
  }

  /** 从磁盘载入状态；文件不存在时返回空结构，内容非法时抛错。 */
  async load() {
    let raw;
    try {
      raw = await fsp.readFile(this.filePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.state = emptyState();
        return this.state;
      }
      throw err;
    }

    this.state = raw.trim() === '' ? emptyState() : normalize(JSON.parse(raw));
    return this.state;
  }

  getState() {
    return this.state;
  }

  /**
   * 同步修改内存态并调度落盘。返回 fn 的返回值。
   * 多次调用会被合并，写入严格串行。
   */
  mutate(fn) {
    const result = fn(this.state);
    this._pending = true;

    const write = this._tail.then(() => (this._pending ? this._drain() : undefined));
    // 内部链条吞掉错误（仅记录），避免未处理 rejection 与队列中断
    this._tail = write.catch((err) => {
      console.error(`[store] 落盘失败（${this.filePath}）：`, err.message);
    });
    this._lastWrite = write;

    return result;
  }

  /** 等待最近一次变更落盘；失败时 reject（供路由返回 500）。 */
  commit() {
    return this._lastWrite || Promise.resolve();
  }

  /** 等待写入队列排空（测试与优雅退出用）。 */
  async whenIdle() {
    await this._tail;
  }

  async _drain() {
    while (this._pending) {
      this._pending = false;
      // eslint-disable-next-line no-await-in-loop
      await this._write();
    }
  }

  /** 原子写：tmp → fsync → 当前文件改名 .bak → tmp 改名正式文件。 */
  async _write() {
    const dir = path.dirname(this.filePath);
    await fsp.mkdir(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    const bakPath = `${this.filePath}.bak`;
    const payload = JSON.stringify(this.state, null, 2);

    const handle = await fsp.open(tmpPath, 'w');
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await fsp.access(this.filePath);
      await fsp.rename(this.filePath, bakPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    await fsp.rename(tmpPath, this.filePath);
  }
}

function createStore(filePath) {
  return new Store(filePath);
}

module.exports = { createStore, emptyState, normalize, SCHEMA_VERSION };
