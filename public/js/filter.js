window.FP = window.FP || {};

(function (FP) {
  'use strict';

  const ui = FP.ui;

  const PRIORITY_OPTIONS = [
    { value: 3, label: '高' },
    { value: 2, label: '中' },
    { value: 1, label: '低' },
    { value: 0, label: '无' },
  ];

  const DATE_PRESETS = [
    { key: 'all', label: '全部' },
    { key: 'overdue', label: '已逾期' },
    { key: 'today', label: '今天' },
    { key: 'week', label: '本周' },
    { key: 'month', label: '本月' },
    { key: 'custom', label: '自定义' },
  ];

  function emptyFilters() {
    return { assignee: '', dueFrom: '', dueTo: '', overdue: false, priority: [] };
  }

  function currentFamily() {
    const scope = FP.state.scope;
    if (scope === 'personal') return null;
    return FP.state.families.find((f) => f.id === scope) || null;
  }

  function weekRange() {
    const now = new Date();
    const weekday = (now.getDay() + 6) % 7; // 周一为 0
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { from: ui.toYMD(monday), to: ui.toYMD(sunday) };
  }

  function monthRange() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: ui.toYMD(first), to: ui.toYMD(last) };
  }

  function detectPreset(filters) {
    if (filters.overdue) return 'overdue';
    const today = ui.today();
    if (filters.dueFrom === today && filters.dueTo === today) return 'today';
    const week = weekRange();
    if (filters.dueFrom === week.from && filters.dueTo === week.to) return 'week';
    const month = monthRange();
    if (filters.dueFrom === month.from && filters.dueTo === month.to) return 'month';
    if (filters.dueFrom || filters.dueTo) return 'custom';
    return 'all';
  }

  function applyPreset(key) {
    const filters = FP.state.filters;
    filters.overdue = false;
    filters.dueFrom = '';
    filters.dueTo = '';

    if (key === 'overdue') filters.overdue = true;
    if (key === 'today') { filters.dueFrom = ui.today(); filters.dueTo = ui.today(); }
    if (key === 'week') { const r = weekRange(); filters.dueFrom = r.from; filters.dueTo = r.to; }
    if (key === 'month') { const r = monthRange(); filters.dueFrom = r.from; filters.dueTo = r.to; }
  }

  // ---------- URL 同步 ----------

  const SORT_FIELDS = ['priority', 'assignee', 'dueDate', 'status'];
  const DEFAULT_SORT_ORDER = { priority: 'desc', assignee: 'asc', dueDate: 'asc', status: 'asc' };

  function readUrl() {
    const params = new URLSearchParams(window.location.search);
    const priority = (params.get('priority') || '').split(',').filter(Boolean);

    const sortRaw = params.get('sort') || 'priority';
    const sort = SORT_FIELDS.includes(sortRaw) ? sortRaw : 'priority';
    const orderRaw = params.get('order');
    const order = (orderRaw === 'asc' || orderRaw === 'desc') ? orderRaw : DEFAULT_SORT_ORDER[sort];

    return {
      filters: {
        assignee: params.get('assignee') || '',
        dueFrom: params.get('dueFrom') || '',
        dueTo: params.get('dueTo') || '',
        overdue: params.get('overdue') === 'true',
        priority,
      },
      sort,
      order,
    };
  }

  function syncUrl() {
    const params = new URLSearchParams(window.location.search);
    const map = {
      assignee: FP.state.filters.assignee,
      dueFrom: FP.state.filters.dueFrom,
      dueTo: FP.state.filters.dueTo,
      overdue: FP.state.filters.overdue ? 'true' : '',
      priority: FP.state.filters.priority.join(','),
      sort: FP.state.sort,
      order: FP.state.order,
    };
    Object.keys(map).forEach((key) => {
      if (map[key]) params.set(key, map[key]);
      else params.delete(key);
    });
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }

  // ---------- 已生效筛选摘要 ----------

  function summaryItems() {
    const filters = FP.state.filters;
    const items = [];

    if (filters.assignee) {
      let label = '指派人：';
      if (filters.assignee === 'public') label += '全体（公共）';
      else if (filters.assignee === 'me') label += '我';
      else {
        const member = (FP.state.members || []).find((m) => m.id === filters.assignee);
        label += member ? member.username : filters.assignee;
      }
      items.push({ key: 'assignee', label });
    }

    const preset = detectPreset(filters);
    if (preset !== 'all') {
      const found = DATE_PRESETS.find((p) => p.key === preset);
      let label = found ? found.label : '日期';
      if (preset === 'custom') label = `${filters.dueFrom || '不限'} ~ ${filters.dueTo || '不限'}`;
      items.push({ key: 'date', label: `日期：${label}` });
    }

    if (filters.priority.length) {
      const labels = filters.priority
        .map((v) => (PRIORITY_OPTIONS.find((p) => String(p.value) === String(v)) || {}).label)
        .filter(Boolean);
      items.push({ key: 'priority', label: `优先级：${labels.join('、')}` });
    }

    return items;
  }

  function renderSummary() {
    const box = document.getElementById('active-filters');
    const items = summaryItems();

    if (items.length === 0) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }

    box.classList.remove('hidden');
    box.innerHTML = items.map((item) => `
      <button class="chip chip-chip-clear" type="button" data-clear="${item.key}">
        ${ui.esc(item.label)} ✕
      </button>
    `).join('') + '<button class="chip" type="button" data-clear="all">清除全部</button>';

    box.querySelectorAll('[data-clear]').forEach((btn) => {
      btn.addEventListener('click', () => clearFilter(btn.dataset.clear));
    });
  }

  function clearFilter(key) {
    if (key === 'all') FP.state.filters = emptyFilters();
    else if (key === 'assignee') FP.state.filters.assignee = '';
    else if (key === 'date') {
      FP.state.filters.dueFrom = '';
      FP.state.filters.dueTo = '';
      FP.state.filters.overdue = false;
    } else if (key === 'priority') FP.state.filters.priority = [];

    syncUrl();
    renderSummary();
    FP.tasksView.refresh();
  }

  // ---------- 筛选面板 ----------

  async function open() {
    const family = currentFamily();
    const filters = FP.state.filters;
    const preset = detectPreset(filters);

    let members = [];
    if (family) {
      try {
        members = await FP.familyView.loadMembers(family.id);
      } catch (err) {
        members = [];
      }
    }

    const bodyHTML = `
      ${family ? `
        <div class="field">
          <span class="field-label">指派人</span>
          <div class="seg" data-group="assignee">
            <button class="chip ${!filters.assignee ? 'is-active' : ''}" type="button" data-value="">全部</button>
            <button class="chip ${filters.assignee === 'public' ? 'is-active' : ''}" type="button" data-value="public">全体（公共）</button>
            <button class="chip ${filters.assignee === 'me' ? 'is-active' : ''}" type="button" data-value="me">我</button>
            ${members.map((m) => `
              <button class="chip ${filters.assignee === m.id ? 'is-active' : ''}" type="button" data-value="${ui.esc(m.id)}">${ui.esc(m.username)}</button>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="field">
        <span class="field-label">到期日</span>
        <div class="seg" data-group="preset">
          ${DATE_PRESETS.map((p) => `
            <button class="chip ${preset === p.key ? 'is-active' : ''}" type="button" data-value="${p.key}">${p.label}</button>
          `).join('')}
        </div>
      </div>

      <div class="field ${preset === 'custom' ? '' : 'hidden'}" id="filter-custom-range">
        <div class="field-row">
          <label class="field">
            <span class="field-label">开始</span>
            <input type="date" id="filter-from" value="${ui.esc(filters.dueFrom)}">
          </label>
          <label class="field">
            <span class="field-label">结束</span>
            <input type="date" id="filter-to" value="${ui.esc(filters.dueTo)}">
          </label>
        </div>
      </div>

      <div class="field">
        <span class="field-label">优先级（可多选）</span>
        <div class="seg" data-group="priority">
          ${PRIORITY_OPTIONS.map((p) => `
            <button class="chip ${filters.priority.map(String).includes(String(p.value)) ? 'is-active' : ''}" type="button" data-value="${p.value}">${p.label}</button>
          `).join('')}
        </div>
      </div>
    `;

    const draft = {
      assignee: filters.assignee,
      dueFrom: filters.dueFrom,
      dueTo: filters.dueTo,
      overdue: filters.overdue,
      priority: filters.priority.slice(),
    };

    ui.openSheet({
      title: '筛选',
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary" type="button" data-act="reset">重置</button>
        <button class="btn btn-primary" type="button" data-act="apply">查看结果</button>
      `,
      onMount(sheet, close) {
        sheet.querySelectorAll('[data-group]').forEach((group) => {
          group.addEventListener('click', (event) => {
            const btn = event.target.closest('.chip');
            if (!btn) return;
            const name = group.dataset.group;
            const value = btn.dataset.value;

            if (name === 'assignee') {
              draft.assignee = value;
              group.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
              btn.classList.add('is-active');
              return;
            }

            if (name === 'preset') {
              group.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
              btn.classList.add('is-active');
              const rangeBox = sheet.querySelector('#filter-custom-range');
              rangeBox.classList.toggle('hidden', value !== 'custom');
              if (value === 'overdue') { draft.overdue = true; draft.dueFrom = ''; draft.dueTo = ''; }
              else if (value === 'today') { draft.overdue = false; draft.dueFrom = ui.today(); draft.dueTo = ui.today(); }
              else if (value === 'week') { const r = weekRange(); draft.overdue = false; draft.dueFrom = r.from; draft.dueTo = r.to; }
              else if (value === 'month') { const r = monthRange(); draft.overdue = false; draft.dueFrom = r.from; draft.dueTo = r.to; }
              else if (value === 'all') { draft.overdue = false; draft.dueFrom = ''; draft.dueTo = ''; }
              return;
            }

            if (name === 'priority') {
              const list = draft.priority.map(String);
              const index = list.indexOf(value);
              if (index >= 0) { list.splice(index, 1); btn.classList.remove('is-active'); }
              else { list.push(value); btn.classList.add('is-active'); }
              draft.priority = list;
            }
          });
        });

        sheet.querySelector('[data-act="reset"]').addEventListener('click', () => {
          Object.assign(draft, emptyFilters());
          close();
          clearFilter('all');
        });

        sheet.querySelector('[data-act="apply"]').addEventListener('click', () => {
          if (sheet.querySelector('#filter-custom-range').classList.contains('hidden') === false) {
            draft.dueFrom = sheet.querySelector('#filter-from').value;
            draft.dueTo = sheet.querySelector('#filter-to').value;
            draft.overdue = false;
          }
          FP.state.filters = {
            assignee: draft.assignee,
            dueFrom: draft.dueFrom,
            dueTo: draft.dueTo,
            overdue: draft.overdue,
            priority: draft.priority.slice(),
          };
          close();
          syncUrl();
          renderSummary();
          FP.tasksView.refresh();
        });
      },
    });
  }

  /** 生成供 /api/tasks 使用的查询参数。 */
  function toApiParams() {
    const filters = FP.state.filters;
    const scope = FP.state.scope;
    return {
      status: FP.state.status,
      scope: scope === 'personal' ? 'personal' : 'family',
      familyId: scope === 'personal' ? '' : scope,
      assignee: filters.assignee,
      dueFrom: filters.dueFrom,
      dueTo: filters.dueTo,
      priority: filters.priority.join(','),
      overdue: filters.overdue ? 'true' : '',
      sort: FP.state.sort,
      order: FP.state.order,
    };
  }

  FP.filterView = {
    open,
    renderSummary,
    syncUrl,
    readUrl,
    emptyFilters,
    toApiParams,
    currentFamily,
  };
})(window.FP);
