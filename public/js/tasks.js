window.FP = window.FP || {};

(function (FP) {
  'use strict';

  const api = FP.api;
  const ui = FP.ui;

  const STATUS_LABEL = { waiting: '等待', doing: '进行中', done: '完成' };
  const PRIORITY_OPTIONS = [
    { value: 0, label: '无' },
    { value: 1, label: '低' },
    { value: 2, label: '中' },
    { value: 3, label: '高' },
  ];
  const GROUP_TITLES = ['已逾期', '今天', '明天', '未来', '无日期'];

  let firstLoad = true;
  let suppressClick = false;

  function listEl() { return document.getElementById('task-list'); }
  function findTask(id) { return FP.state.tasks.find((t) => t.id === id); }

  function matchesStatusFilter(status) {
    const filter = FP.state.status;
    if (filter === 'all') return true;
    if (filter === 'open') return status !== 'done';
    return filter === status;
  }

  // ---------- 列表渲染 ----------

  function itemHTML(task) {
    const done = task.status === 'done';
    const due = ui.describeDue(task.dueDate);
    const isFamily = task.scope === 'family';
    const assignee = isFamily
      ? (task.assigneeId ? (FP.state.memberIndex[task.assigneeId] || '成员') : '全体')
      : '';

    return `
      <div class="task-row" data-id="${ui.esc(task.id)}">
        <button class="task-del" type="button" data-act="delete">删除</button>
        <div class="task-item${done ? ' is-done' : ''}" data-id="${ui.esc(task.id)}">
          <span class="task-prio" data-prio="${Number(task.priority) || 0}"></span>
          <button class="task-check" type="button" data-act="toggle" aria-label="切换完成">
            <span class="circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>
          </button>
          <div class="task-body">
            <div class="task-title">${ui.esc(task.title)}</div>
            <div class="task-meta">
              ${done
                ? '<span class="badge badge-status" data-status="done">完成</span>'
                : `<button class="badge badge-status" type="button" data-act="cycle" data-status="${ui.esc(task.status)}">${STATUS_LABEL[task.status]}</button>`}
              ${assignee ? `<span class="badge badge-assignee">${ui.esc(assignee)}</span>` : ''}
              ${due ? `<span class="task-due ${due.cls}">${ui.esc(due.label)}</span>` : ''}
              ${task.notes ? '<span class="task-note">≡ 备注</span>' : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function emptyHTML() {
    const box = document.getElementById('active-filters');
    const filtered = box && !box.classList.contains('hidden');
    return `
      <div class="empty">
        <div class="empty-icon">🗒️</div>
        <p>${filtered ? '没有符合条件的任务' : '还没有任务，点右下角 + 添加'}</p>
      </div>
    `;
  }

  function render() {
    const tasks = FP.state.tasks;
    const box = listEl();

    if (tasks.length === 0) {
      box.innerHTML = emptyHTML();
      return;
    }

    const groups = [[], [], [], [], []];
    tasks.forEach((task) => { groups[ui.dueGroup(task.dueDate)].push(task); });

    let html = '';
    groups.forEach((list, index) => {
      if (list.length === 0) return;
      html += `<div class="group-title">${GROUP_TITLES[index]}</div>`;
      html += list.map(itemHTML).join('');
    });

    box.innerHTML = html;
  }

  async function refresh() {
    if (firstLoad) {
      listEl().innerHTML = '<div class="skeleton"></div>'.repeat(4);
    }
    try {
      const data = await api.tasks.list(FP.filterView.toApiParams());
      FP.state.tasks = data.tasks;
      render();
    } catch (err) {
      ui.toast(err.message, 'error');
    } finally {
      firstLoad = false;
    }
  }

  // ---------- 作用域 / 状态切换 ----------

  function renderScopeTabs() {
    const box = document.getElementById('scope-tabs');
    const tabs = [{ key: 'personal', label: '个人' }].concat(
      FP.state.families.map((f) => ({ key: f.id, label: f.name })),
    );

    box.innerHTML = tabs.map((tab) => `
      <button class="chip${FP.state.scope === tab.key ? ' is-active' : ''}" type="button" data-scope="${ui.esc(tab.key)}">${ui.esc(tab.label)}</button>
    `).join('');

    box.querySelectorAll('[data-scope]').forEach((btn) => {
      btn.addEventListener('click', () => selectScope(btn.dataset.scope));
    });
  }

  async function selectScope(key) {
    FP.state.scope = key;
    FP.state.filters.assignee = '';
    try { window.localStorage.setItem('fp.scope', key); } catch (err) { /* 忽略 */ }

    if (key !== 'personal') {
      await FP.familyView.loadMembers(key);
    }

    renderScopeTabs();
    FP.filterView.renderSummary();
    refresh();
  }

  function wireStatusTabs() {
    const box = document.getElementById('status-tabs');
    box.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        FP.state.status = btn.dataset.status;
        box.querySelectorAll('[data-status]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
        refresh();
      });
    });
  }

  // ---------- 任务操作 ----------

  async function patch(id, body) {
    const item = listEl().querySelector(`.task-row[data-id="${id}"] .task-item`);
    const willLeave = Boolean(body.status) && !matchesStatusFilter(body.status);

    try {
      await api.tasks.update(id, body);
      if (item && willLeave) {
        item.classList.add('is-removing');
        setTimeout(refresh, 200);
      } else {
        refresh();
      }
    } catch (err) {
      ui.toast(err.message, 'error');
    }
  }

  async function toggleDone(id) {
    const task = findTask(id);
    if (!task) return;
    await patch(id, { status: task.status === 'done' ? 'waiting' : 'done' });
  }

  async function cycleStatus(id) {
    const task = findTask(id);
    if (!task) return;
    await patch(id, { status: task.status === 'doing' ? 'waiting' : 'doing' });
  }

  async function removeTask(id) {
    const ok = await ui.confirmSheet({
      title: '删除任务',
      message: '确定要删除这个任务吗？此操作不可撤销。',
      confirmText: '删除',
    });
    if (!ok) return;

    try {
      await api.tasks.remove(id);
      ui.toast('已删除');
      refresh();
    } catch (err) {
      ui.toast(err.message, 'error');
    }
  }

  // ---------- 新增 / 编辑弹层 ----------

  async function openEditor(task) {
    const isEdit = Boolean(task);
    const families = FP.state.families;
    const canUseFamily = families.length > 0;

    let scope = task
      ? task.scope
      : (FP.state.scope === 'personal' ? 'personal' : 'family');
    if (scope === 'family' && !canUseFamily) scope = 'personal';

    let familyId = task
      ? task.familyId
      : (FP.state.scope !== 'personal' ? FP.state.scope : (families[0] ? families[0].id : null));

    let status = task ? task.status : 'waiting';
    let priority = task ? Number(task.priority) || 0 : 0;
    let assigneeId = task ? task.assigneeId : null;
    const dueDate = task ? (task.dueDate || '') : '';

    let members = [];
    if (scope === 'family' && familyId) {
      members = await FP.familyView.loadMembers(familyId);
    }

    function assigneeHTML() {
      if (scope !== 'family') return '';
      return `
        <div class="field">
          <span class="field-label">指派给</span>
          <div class="seg" data-seg="assignee">
            <button class="chip${assigneeId ? '' : ' is-active'}" type="button" data-value="">全体（公共）</button>
            ${members.map((m) => `
              <button class="chip${assigneeId === m.id ? ' is-active' : ''}" type="button" data-value="${ui.esc(m.id)}">${ui.esc(m.username)}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    const bodyHTML = `
      <div class="field">
        <span class="field-label">标题</span>
        <input id="task-title" type="text" placeholder="要做什么？" value="${task ? ui.esc(task.title) : ''}">
      </div>

      <div class="field">
        <span class="field-label">备注</span>
        <textarea id="task-notes" placeholder="补充说明（可选）">${task ? ui.esc(task.notes || '') : ''}</textarea>
      </div>

      <div class="field">
        <span class="field-label">状态</span>
        <div class="seg" data-seg="status">
          ${Object.keys(STATUS_LABEL).map((s) => `
            <button class="chip${status === s ? ' is-active' : ''}" type="button" data-value="${s}">${STATUS_LABEL[s]}</button>
          `).join('')}
        </div>
      </div>

      <div class="field">
        <span class="field-label">归属</span>
        <div class="seg" data-seg="scope">
          <button class="chip${scope === 'personal' ? ' is-active' : ''}" type="button" data-value="personal">个人</button>
          <button class="chip${scope === 'family' ? ' is-active' : ''}" type="button" data-value="family"${canUseFamily ? '' : ' disabled style="opacity:.5"'}>家庭</button>
        </div>
      </div>

      <div class="field${scope === 'family' && families.length > 1 ? '' : ' hidden'}" id="task-family-field">
        <span class="field-label">选择家庭</span>
        <select id="task-family">
          ${families.map((f) => `
            <option value="${ui.esc(f.id)}"${f.id === familyId ? ' selected' : ''}>${ui.esc(f.name)}</option>
          `).join('')}
        </select>
      </div>

      <div id="task-assignee-slot">${assigneeHTML()}</div>

      <div class="field">
        <span class="field-label">到期日</span>
        <div class="seg" style="margin-bottom:8px">
          <button class="chip" type="button" data-quick="today">今天</button>
          <button class="chip" type="button" data-quick="tomorrow">明天</button>
          <button class="chip" type="button" data-quick="clear">清除</button>
        </div>
        <input id="task-due" type="date" value="${ui.esc(dueDate)}">
      </div>

      <div class="field">
        <span class="field-label">优先级</span>
        <div class="seg" data-seg="priority">
          ${PRIORITY_OPTIONS.map((p) => `
            <button class="chip${priority === p.value ? ' is-active' : ''}" type="button" data-value="${p.value}">${p.label}</button>
          `).join('')}
        </div>
      </div>
    `;

    const footerHTML = `
      ${isEdit ? '<button class="btn btn-danger" type="button" data-act="remove">删除</button>' : '<button class="btn btn-secondary" type="button" data-act="cancel">取消</button>'}
      <button class="btn btn-primary" type="button" data-act="save">保存</button>
    `;

    ui.openSheet({
      title: isEdit ? '编辑任务' : '新增任务',
      bodyHTML,
      footerHTML,
      onMount(sheet, close) {
        const slot = sheet.querySelector('#task-assignee-slot');
        const familyField = sheet.querySelector('#task-family-field');
        const dueInput = sheet.querySelector('#task-due');

        function handleSegClick(group) {
          group.addEventListener('click', async (event) => {
            const btn = event.target.closest('.chip');
            if (!btn || btn.disabled) return;
            const name = group.dataset.seg;
            const value = btn.dataset.value;

            group.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
            btn.classList.add('is-active');

            if (name === 'status') status = value;
            if (name === 'priority') priority = Number(value);

            if (name === 'assignee') {
              assigneeId = value || null;
              return;
            }

            if (name === 'scope') {
              scope = value;
              familyField.classList.toggle('hidden', !(scope === 'family' && families.length > 1));
              if (scope === 'family') {
                if (!familyId && families[0]) familyId = families[0].id;
                const select = sheet.querySelector('#task-family');
                if (select && familyId) select.value = familyId;
                members = familyId ? await FP.familyView.loadMembers(familyId) : [];
              } else {
                assigneeId = null;
              }
              slot.innerHTML = assigneeHTML();
              const newAssignee = slot.querySelector('[data-seg="assignee"]');
              if (newAssignee) handleSegClick(newAssignee);
            }
          });
        }

        sheet.querySelectorAll('[data-seg]').forEach((group) => handleSegClick(group));

        const familySelect = sheet.querySelector('#task-family');
        if (familySelect) {
          familySelect.addEventListener('change', async () => {
            familyId = familySelect.value;
            assigneeId = null;
            members = await FP.familyView.loadMembers(familyId);
            slot.innerHTML = assigneeHTML();
          });
        }

        sheet.querySelectorAll('[data-quick]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const kind = btn.dataset.quick;
            if (kind === 'today') dueInput.value = ui.today();
            if (kind === 'tomorrow') dueInput.value = ui.shiftDays(ui.today(), 1);
            if (kind === 'clear') dueInput.value = '';
          });
        });

        if (isEdit) {
          sheet.querySelector('[data-act="remove"]').addEventListener('click', async () => {
            close();
            await removeTask(task.id);
          });
        } else {
          sheet.querySelector('[data-act="cancel"]').addEventListener('click', close);
        }

        sheet.querySelector('[data-act="save"]').addEventListener('click', async () => {
          const title = sheet.querySelector('#task-title').value.trim();
          if (!title) { ui.toast('请填写任务标题', 'error'); return; }

          const payload = {
            title,
            notes: sheet.querySelector('#task-notes').value,
            status,
            priority,
            scope,
            familyId: scope === 'family' ? familyId : null,
            assigneeId: scope === 'family' ? (assigneeId || null) : null,
            dueDate: dueInput.value || null,
          };

          const saveBtn = sheet.querySelector('[data-act="save"]');
          saveBtn.disabled = true;
          saveBtn.textContent = '保存中…';

          try {
            if (isEdit) await api.tasks.update(task.id, payload);
            else await api.tasks.create(payload);
            close();
            ui.toast(isEdit ? '已保存' : '已添加');
            refresh();
          } catch (err) {
            ui.toast(err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
          }
        });

        setTimeout(() => sheet.querySelector('#task-title').focus(), 250);
      },
    });
  }

  // ---------- 事件绑定 ----------

  function bind() {
    const box = listEl();

    box.addEventListener('click', (event) => {
      if (suppressClick) { suppressClick = false; return; }

      const del = event.target.closest('[data-act="delete"]');
      if (del) {
        removeTask(del.closest('.task-row').dataset.id);
        return;
      }

      const check = event.target.closest('[data-act="toggle"]');
      if (check) {
        event.stopPropagation();
        toggleDone(check.closest('.task-item').dataset.id);
        return;
      }

      const badge = event.target.closest('[data-act="cycle"]');
      if (badge) {
        event.stopPropagation();
        cycleStatus(badge.closest('.task-item').dataset.id);
        return;
      }

      const item = event.target.closest('.task-item');
      if (!item) return;
      if (item.classList.contains('is-open')) { item.classList.remove('is-open'); return; }

      const task = findTask(item.dataset.id);
      if (task) openEditor(task);
    });

    // 左滑显示删除
    let startX = 0;
    let startY = 0;
    let active = null;

    box.addEventListener('touchstart', (event) => {
      active = event.target.closest('.task-item');
      if (!active) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });

    box.addEventListener('touchmove', (event) => {
      if (!active) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dx)) { active = null; return; }
      if (dx < -24) { active.classList.add('is-open'); suppressClick = true; } else if (dx > 24) {
        active.classList.remove('is-open');
      }
    }, { passive: true });

    box.addEventListener('touchend', () => { active = null; });

    // 长按显示删除（兼容桌面）
    let pressTimer = null;
    box.addEventListener('mousedown', (event) => {
      const item = event.target.closest('.task-item');
      if (!item) return;
      pressTimer = setTimeout(() => {
        item.classList.add('is-open');
        suppressClick = true;
      }, 480);
    });
    ['mouseup', 'mouseleave'].forEach((evt) => {
      box.addEventListener(evt, () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      });
    });
    box.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.task-item')) event.preventDefault();
    });

    document.getElementById('btn-add').addEventListener('click', () => openEditor(null));
    document.getElementById('btn-filter').addEventListener('click', () => FP.filterView.open());
  }

  FP.tasksView = {
    refresh,
    render,
    renderScopeTabs,
    wireStatusTabs,
    selectScope,
    openEditor,
    bind,
    resetFirstLoad: () => { firstLoad = true; },
  };
})(window.FP);
