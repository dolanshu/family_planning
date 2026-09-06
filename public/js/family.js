window.FP = window.FP || {};

(function (FP) {
  'use strict';

  const api = FP.api;
  const ui = FP.ui;

  const memberCache = {};

  function applyIndex(members) {
    FP.state.members = members;
    members.forEach((m) => { FP.state.memberIndex[m.id] = m.username; });
  }

  async function loadMembers(familyId) {
    if (!familyId) return [];
    if (memberCache[familyId]) {
      applyIndex(memberCache[familyId]);
      return memberCache[familyId];
    }
    try {
      const data = await api.families.members(familyId);
      memberCache[familyId] = data.members;
      applyIndex(data.members);
      return data.members;
    } catch (err) {
      return [];
    }
  }

  function invalidate() {
    Object.keys(memberCache).forEach((key) => { delete memberCache[key]; });
  }

  async function refreshFamilies() {
    const data = await api.families.list();
    FP.state.families = data.families;
    return data.families;
  }

  function cardHTML(family, members, userId) {
    const isOwner = family.ownerId === userId;

    return `
      <div class="card family-card" data-family="${ui.esc(family.id)}">
        <div class="family-head">
          <span class="family-name">${ui.esc(family.name)}</span>
          <span class="family-role">${isOwner ? '创建者' : '成员'} · ${family.memberCount} 人</span>
        </div>

        <div class="family-code">
          <code>${ui.esc(family.inviteCode)}</code>
          <button class="btn btn-sm btn-secondary" type="button" data-act="copy" data-code="${ui.esc(family.inviteCode)}">复制</button>
        </div>

        <div class="member-list">
          ${members.map((m) => `
            <div class="member-row">
              <span class="avatar">${ui.esc(m.username[0])}</span>
              <span class="member-name">${ui.esc(m.username)}</span>
              ${m.id === family.ownerId ? '<span class="member-tag">创建者</span>' : ''}
              ${isOwner && m.id !== userId
                ? `<button class="btn btn-sm btn-danger" type="button" data-act="remove" data-user="${ui.esc(m.id)}">移除</button>`
                : ''}
            </div>
          `).join('')}
        </div>

        <div class="row-actions">
          ${isOwner ? `<button class="btn btn-sm btn-secondary" type="button" data-act="rename">重命名</button>` : ''}
          <button class="btn btn-sm btn-danger" type="button" data-act="leave">退出家庭</button>
        </div>
      </div>
    `;
  }

  async function render() {
    const box = document.getElementById('family-content');
    box.innerHTML = '<div class="skeleton"></div>';

    let families;
    try {
      families = await refreshFamilies();
    } catch (err) {
      box.innerHTML = `<div class="empty"><p>${ui.esc(err.message)}</p></div>`;
      return;
    }

    const cards = await Promise.all(families.map(async (family) => {
      const members = await loadMembers(family.id);
      return cardHTML(family, members, FP.state.user.id);
    }));

    box.innerHTML = `
      <div class="card card-pad">
        <div class="card-title">创建家庭</div>
        <div class="field">
          <input id="family-name" type="text" placeholder="家庭名称，如「张家」">
        </div>
        <button class="btn btn-primary btn-block" type="button" data-act="create">创建</button>
      </div>

      <div class="card card-pad">
        <div class="card-title">加入家庭</div>
        <div class="field">
          <input id="family-code" type="text" placeholder="输入 6 位邀请码" autocomplete="off">
        </div>
        <button class="btn btn-secondary btn-block" type="button" data-act="join">加入</button>
      </div>

      ${cards.join('') || '<div class="empty"><div class="empty-icon">🏠</div><p>还没有加入任何家庭</p></div>'}
    `;

    bind(box);
  }

  function bind(box) {
    box.querySelector('[data-act="create"]').addEventListener('click', async () => {
      const input = box.querySelector('#family-name');
      const name = input.value.trim();
      if (!name) { ui.toast('请输入家庭名称', 'error'); return; }

      try {
        const result = await api.families.create(name);
        invalidate();
        ui.toast(`已创建，邀请码 ${result.family.inviteCode}`);
        await render();
        await FP.tasksView.renderScopeTabs();
      } catch (err) {
        ui.toast(err.message, 'error');
      }
    });

    box.querySelector('[data-act="join"]').addEventListener('click', async () => {
      const input = box.querySelector('#family-code');
      const code = input.value.trim();
      if (!code) { ui.toast('请输入邀请码', 'error'); return; }

      try {
        const result = await api.families.join(code.toUpperCase());
        invalidate();
        ui.toast(`已加入「${result.family.name}」`);
        await render();
        await FP.tasksView.renderScopeTabs();
      } catch (err) {
        ui.toast(err.message, 'error');
      }
    });

    box.querySelectorAll('.family-card').forEach((card) => {
      const familyId = card.dataset.family;

      card.querySelector('[data-act="copy"]').addEventListener('click', async (event) => {
        const code = event.currentTarget.dataset.code;
        try {
          await navigator.clipboard.writeText(code);
          ui.toast('邀请码已复制');
        } catch (err) {
          ui.toast(`邀请码：${code}`, 'error');
        }
      });

      card.querySelector('[data-act="leave"]').addEventListener('click', async () => {
        const ok = await ui.confirmSheet({
          title: '退出家庭',
          message: '退出后将看不到该家庭的任务，你名下的指派会自动回到公共任务。',
          confirmText: '退出',
        });
        if (!ok) return;
        try {
          await api.families.leave(familyId);
          invalidate();
          ui.toast('已退出家庭');
          await render();
          await FP.tasksView.selectScope('personal');
        } catch (err) {
          ui.toast(err.message, 'error');
        }
      });

      const renameBtn = card.querySelector('[data-act="rename"]');
      if (renameBtn) {
        renameBtn.addEventListener('click', async () => {
          const family = FP.state.families.find((f) => f.id === familyId);
          const next = window.prompt('新的家庭名称', family ? family.name : '');
          if (!next || !next.trim()) return;
          try {
            await api.families.rename(familyId, next.trim());
            invalidate();
            await render();
            await FP.tasksView.renderScopeTabs();
          } catch (err) {
            ui.toast(err.message, 'error');
          }
        });
      }

      card.querySelectorAll('[data-act="remove"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const ok = await ui.confirmSheet({
            title: '移除成员',
            message: '移除后该成员将看不到本家庭的任务，其名下的指派会回到公共任务。',
            confirmText: '移除',
          });
          if (!ok) return;
          try {
            await api.families.removeMember(familyId, btn.dataset.user);
            invalidate();
            ui.toast('已移除成员');
            await render();
            await FP.tasksView.refresh();
          } catch (err) {
            ui.toast(err.message, 'error');
          }
        });
      });
    });
  }

  FP.familyView = {
    loadMembers,
    invalidate,
    refreshFamilies,
    render,
  };
})(window.FP);
