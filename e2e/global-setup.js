'use strict';

const baseURL = process.env.BASE_URL || 'http://localhost:3000';

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/auth/me`);
      if (res.status === 401) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => { setTimeout(resolve, 500); });
  }
  throw new Error(`E2E 目标服务 ${url} 在 ${timeoutMs}ms 内未就绪：${lastError?.message || ''}`);
}

module.exports = async function globalSetup() {
  console.log(`[e2e] 等待测试目标：${baseURL}`);
  await waitForServer(baseURL);
  console.log('[e2e] 目标服务已就绪');
};
