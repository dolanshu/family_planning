window.FP = window.FP || {};

(function (FP) {
  'use strict';

  const api = FP.api;
  const ui = FP.ui;

  let mode = 'login';
  let submitting = false;
  let onSuccess = null;

  function el(id) { return document.getElementById(id); }

  function showError(message) {
    const box = el('auth-error');
    box.textContent = message;
    box.classList.remove('hidden');
  }

  function clearError() { el('auth-error').classList.add('hidden'); }

  function setMode(next) {
    mode = next === 'register' ? 'register' : 'login';
    clearError();

    const isRegister = mode === 'register';
    el('auth-title').textContent = isRegister ? '注册' : '登录';
    el('auth-submit').textContent = isRegister ? '注册' : '登录';
    el('auth-confirm-field').classList.toggle('hidden', !isRegister);
    el('auth-password').setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
    el('auth-switch').textContent = isRegister ? '已有账号？去登录' : '还没有账号？立即注册';
  }

  function validate(username, password, confirm) {
    if (username.length < 3 || username.length > 20) return '用户名长度需为 3-20 个字符';
    if (!/^[\w一-龥-]+$/u.test(username)) return '用户名只能包含中英文、数字、下划线或连字符';
    if (password.length < 6) return '密码至少 6 位';
    if (mode === 'register' && password !== confirm) return '两次输入的密码不一致';
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    clearError();

    const username = el('auth-username').value.trim();
    const password = el('auth-password').value;
    const confirm = el('auth-confirm').value;

    const invalid = validate(username, password, confirm);
    if (invalid) { showError(invalid); return; }

    submitting = true;
    const submit = el('auth-submit');
    submit.disabled = true;
    submit.textContent = '处理中…';

    try {
      const result = mode === 'register'
        ? await api.auth.register(username, password)
        : await api.auth.login(username, password);

      el('auth-password').value = '';
      el('auth-confirm').value = '';
      if (onSuccess) onSuccess(result.user);
    } catch (err) {
      showError(err.message);
    } finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = mode === 'register' ? '注册' : '登录';
    }
  }

  function init(handler) {
    onSuccess = handler;
    setMode('login');
    el('auth-form').addEventListener('submit', handleSubmit);
    el('auth-switch').addEventListener('click', () => {
      setMode(mode === 'login' ? 'register' : 'login');
    });
  }

  FP.authView = { init, reset: () => setMode('login') };
})(window.FP);
