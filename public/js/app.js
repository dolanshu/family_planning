window.FP = window.FP || {};

(function (FP) {
  'use strict';

  const api = FP.api;
  const ui = FP.ui;

  FP.state = {
    user: null,
    families: [],
    tasks: [],
    members: [],
    memberIndex: {},
    scope: 'personal',
    status: 'open',
    sort: 'priority',
    order: 'desc',
    filters: { assignee: '', dueFrom: '', dueTo: '', overdue: false, priority: [] },
  };

  const VIEWS = ['auth', 'main', 'family', 'report'];
  let uiReady = false;

  function showView(name) {
    VIEWS.forEach((view) => {
      const el = document.getElementById(`view-${view}`);
      if (el) el.classList.toggle('hidden', view !== name);
    });
  }

  function renderHeader() {
    const now = new Date();
    const ymd = ui.toYMD(now);
    document.getElementById('today-title').textContent =
      `${now.getMonth() + 1}月${now.getDate()}日 ${ui.weekdayLabel(ymd)}`;
    document.getElementById('greeting').textContent = `你好，${FP.state.user.username}`;
  }

  function restoreState() {
    const urlState = FP.filterView.readUrl();
    FP.state.filters = urlState.filters;
    FP.state.sort = urlState.sort;
    FP.state.order = urlState.order;

    let scope = 'personal';
    try { scope = window.localStorage.getItem('fp.scope') || 'personal'; } catch (err) { /* 忽略 */ }
    if (scope !== 'personal' && !FP.state.families.some((f) => f.id === scope)) scope = 'personal';
    FP.state.scope = scope;
  }

  async function enterMain() {
    showView('main');
    await FP.familyView.refreshFamilies();
    restoreState();
    renderHeader();

    if (!uiReady) {
      FP.tasksView.wireStatusTabs();
      FP.tasksView.bind();
      FP.reportView.init();
      wireMenu();
      wireOffline();
      document.getElementById('family-back').addEventListener('click', backToMain);
      document.getElementById('report-back').addEventListener('click', backToMain);
      uiReady = true;
    }

    if (FP.state.scope !== 'personal') {
      await FP.familyView.loadMembers(FP.state.scope);
    }

    FP.tasksView.renderScopeTabs();
    FP.tasksView.renderSortTabs();
    FP.filterView.renderSummary();
    await FP.tasksView.refresh();
  }

  function backToMain() {
    showView('main');
    FP.tasksView.refresh();
  }

  function wireMenu() {
    document.getElementById('btn-menu').addEventListener('click', () => {
      ui.openSheet({
        title: FP.state.user.username,
        bodyHTML: `
          <div class="menu-list">
            <button class="menu-item" type="button" data-act="report">统计报告</button>
            <button class="menu-item" type="button" data-act="family">家庭管理</button>
            <button class="menu-item is-danger" type="button" data-act="logout">退出登录</button>
          </div>
        `,
        onMount(sheet, close) {
          sheet.querySelector('[data-act="report"]').addEventListener('click', () => {
            close();
            showView('report');
            FP.reportView.open();
          });

          sheet.querySelector('[data-act="family"]').addEventListener('click', () => {
            close();
            showView('family');
            FP.familyView.render();
          });

          sheet.querySelector('[data-act="logout"]').addEventListener('click', async () => {
            close();
            try { await api.auth.logout(); } catch (err) { /* 忽略 */ }
            FP.state.user = null;
            FP.tasksView.resetFirstLoad();
            showView('auth');
          });
        },
      });
    });
  }

  function wireOffline() {
    const bar = document.createElement('div');
    bar.className = 'offline-bar hidden';
    bar.textContent = '当前处于离线状态，数据可能不是最新的';
    document.body.insertBefore(bar, document.body.firstChild);

    const update = () => bar.classList.toggle('hidden', navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  function initAuth() {
    FP.authView.init(async (user) => {
      FP.state.user = user;
      FP.tasksView.resetFirstLoad();
      await enterMain();
    });
  }

  async function bootstrap() {
    initAuth();
    try {
      const result = await api.auth.me();
      FP.state.user = result.user;
      await enterMain();
    } catch (err) {
      showView('auth');
    }
  }

  api.onUnauthorized(() => {
    if (!FP.state.user) return;
    FP.state.user = null;
    FP.tasksView.resetFirstLoad();
    showView('auth');
    ui.toast('登录已过期，请重新登录', 'error');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  FP.app = { showView, enterMain, renderHeader, backToMain };
})(window.FP);
