window.FP = window.FP || {};

(function (FP) {
  'use strict';

  const unauthorizedHandlers = [];

  function onUnauthorized(fn) {
    unauthorizedHandlers.push(fn);
  }

  async function request(path, options) {
    const opts = options || {};
    let res;

    try {
      res = await fetch(path, Object.assign({
        credentials: 'same-origin',
      }, opts, {
        headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers),
      }));
    } catch (err) {
      throw new Error('网络异常，请检查连接');
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (err) { data = null; }
    }

    if (res.status === 401) {
      unauthorizedHandlers.forEach((fn) => fn());
      const message = (data && data.error && data.error.message) || '登录已过期，请重新登录';
      const error = new Error(message);
      error.status = 401;
      throw error;
    }

    if (!res.ok) {
      const message = (data && data.error && data.error.message) || `请求失败（${res.status}）`;
      const error = new Error(message);
      error.status = res.status;
      throw error;
    }

    return data;
  }

  function qs(params) {
    if (!params) return '';
    const usp = new URLSearchParams();
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null || value === '' || value === 'all') return;
      usp.set(key, value);
    });
    const str = usp.toString();
    return str ? `?${str}` : '';
  }

  const api = {
    onUnauthorized,
    qs,
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
    patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body || {}) }),
    del: (path) => request(path, { method: 'DELETE' }),

    auth: {
      me: () => api.get('/api/auth/me'),
      register: (username, password) => api.post('/api/auth/register', { username, password }),
      login: (username, password) => api.post('/api/auth/login', { username, password }),
      logout: () => api.post('/api/auth/logout'),
    },

    tasks: {
      list: (params) => api.get(`/api/tasks${qs(params)}`),
      create: (body) => api.post('/api/tasks', body),
      update: (id, patch) => api.patch(`/api/tasks/${encodeURIComponent(id)}`, patch),
      remove: (id) => api.del(`/api/tasks/${encodeURIComponent(id)}`),
    },

    families: {
      list: () => api.get('/api/families'),
      create: (name) => api.post('/api/families', { name }),
      join: (inviteCode) => api.post('/api/families/join', { inviteCode }),
      leave: (id) => api.post(`/api/families/${encodeURIComponent(id)}/leave`),
      members: (id) => api.get(`/api/families/${encodeURIComponent(id)}/members`),
      removeMember: (id, userId) =>
        api.del(`/api/families/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`),
      rename: (id, name) => api.patch(`/api/families/${encodeURIComponent(id)}`, { name }),
    },

    reports: {
      completed: (params) => api.get(`/api/reports/completed${qs(params)}`),
      exportUrl: (params, format) =>
        `/api/reports/completed${qs(Object.assign({}, params, { format }))}`,
    },
  };

  FP.api = api;
})(window.FP);
