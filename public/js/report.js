window.FP = window.FP || {};

(function (FP) {
  'use strict';

  const api = FP.api;
  const ui = FP.ui;

  const GROUP_BY = [
    { key: 'day', label: '日' },
    { key: 'week', label: '周' },
    { key: 'month', label: '月' },
    { key: 'year', label: '年' },
  ];
  const PRIORITY_LABEL = { 0: '无', 1: '低', 2: '中', 3: '高' };

  let groupBy = 'day';
  let anchor = null;      // 区间锚点日期
  let custom = null;      // 自定义区间 {from, to}
  let data = null;

  function isoWeekOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - weekday);
    const yearStart = new Date(d.getFullYear(), 0, 1).getTime();
    return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  }

  function computeRange() {
    const base = anchor ? ui.parseYMD(anchor) : new Date();

    if (groupBy === 'day') {
      const day = ui.toYMD(base);
      return { from: day, to: day, title: `${day} ${ui.weekdayLabel(day)}` };
    }

    if (groupBy === 'week') {
      const weekday = (base.getDay() + 6) % 7;
      const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - weekday);
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      return {
        from: ui.toYMD(monday),
        to: ui.toYMD(sunday),
        title: `${monday.getFullYear()} 第 ${isoWeekOf(monday)} 周`,
      };
    }

    if (groupBy === 'month') {
      const first = new Date(base.getFullYear(), base.getMonth(), 1);
      const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      return {
        from: ui.toYMD(first),
        to: ui.toYMD(last),
        title: `${base.getFullYear()} 年 ${base.getMonth() + 1} 月`,
      };
    }

    const year = base.getFullYear();
    return { from: `${year}-01-01`, to: `${year}-12-31`, title: `${year} 年` };
  }

  function currentRange() {
    return custom || computeRange();
  }

  function shiftRange(delta) {
    const base = anchor ? ui.parseYMD(anchor) : new Date();
    if (groupBy === 'day') base.setDate(base.getDate() + delta);
    else if (groupBy === 'week') base.setDate(base.getDate() + delta * 7);
    else if (groupBy === 'month') base.setMonth(base.getMonth() + delta);
    else base.setFullYear(base.getFullYear() + delta);

    anchor = ui.toYMD(base);
    custom = null;
    load();
  }

  function scopeParams() {
    const scope = FP.state.scope;
    return {
      scope: scope === 'personal' ? 'personal' : 'family',
      familyId: scope === 'personal' ? '' : scope,
      assignee: FP.state.filters.assignee,
    };
  }

  function requestParams() {
    const range = currentRange();
    return Object.assign({ from: range.from, to: range.to, groupBy }, scopeParams());
  }

  function shortenBucket(bucket) {
    if (groupBy === 'day') return bucket.slice(5);
    if (groupBy === 'week') return bucket.slice(5);
    if (groupBy === 'month') return `${bucket.slice(5)}月`;
    return bucket;
  }

  // ---------- 渲染 ----------

  function renderControls() {
    const range = currentRange();
    const box = document.getElementById('report-controls');

    box.innerHTML = `
      <div class="seg" data-seg="groupby" style="margin-bottom:12px">
        ${GROUP_BY.map((g) => `
          <button class="chip${groupBy === g.key ? ' is-active' : ''}" type="button" data-value="${g.key}">${g.label}</button>
        `).join('')}
      </div>

      <div class="report-head">
        <div class="report-range">${ui.esc(range.title || `${range.from} ~ ${range.to}`)}</div>
        <div class="report-nav">
          <button class="icon-btn" type="button" data-act="prev" aria-label="上一段">
            <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
          </button>
          <button class="icon-btn" type="button" data-act="next" aria-label="下一段">
            <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>

      <div class="field-row" style="margin-top:12px">
        <label class="field">
          <span class="field-label">开始</span>
          <input type="date" id="rep-from" value="${ui.esc(range.from)}">
        </label>
        <label class="field">
          <span class="field-label">结束</span>
          <input type="date" id="rep-to" value="${ui.esc(range.to)}">
        </label>
      </div>

      <button class="btn btn-secondary btn-block" type="button" data-act="apply">应用自定义区间</button>
    `;

    box.querySelectorAll('[data-seg="groupby"] .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        groupBy = btn.dataset.value;
        custom = null;
        anchor = null;
        load();
      });
    });

    box.querySelector('[data-act="prev"]').addEventListener('click', () => shiftRange(-1));
    box.querySelector('[data-act="next"]').addEventListener('click', () => shiftRange(1));
    box.querySelector('[data-act="apply"]').addEventListener('click', () => {
      const from = box.querySelector('#rep-from').value;
      const to = box.querySelector('#rep-to').value;
      if (!from || !to) { ui.toast('请选择开始与结束日期', 'error'); return; }
      if (from > to) { ui.toast('开始日期不能晚于结束日期', 'error'); return; }
      custom = { from, to };
      load();
    });
  }

  function renderReport() {
    const report = data;
    const percent = report.summary.completionRate === null
      ? '—'
      : `${Math.round(report.summary.completionRate * 100)}%`;

    document.getElementById('report-summary').innerHTML = `
      <div class="stat"><div class="stat-value">${report.summary.total}</div><div class="stat-label">完成任务</div></div>
      <div class="stat"><div class="stat-value">${report.summary.created}</div><div class="stat-label">区间新增</div></div>
      <div class="stat"><div class="stat-value">${percent}</div><div class="stat-label">完成率</div></div>
      <div class="stat"><div class="stat-value">${report.summary.avgHours === null ? '—' : report.summary.avgHours}</div><div class="stat-label">平均耗时（小时）</div></div>
    `;

    const trendBox = document.getElementById('report-trend');
    if (report.trend.length) {
      trendBox.classList.remove('hidden');
      trendBox.innerHTML = `
        <div class="card-pad">
          <div class="card-title">完成趋势</div>
          ${FP.chart.barChart(report.trend.map((t) => ({ label: shortenBucket(t.bucket), value: t.count })))}
        </div>
      `;
    } else {
      trendBox.classList.add('hidden');
    }

    const userBox = document.getElementById('report-byuser');
    userBox.classList.remove('hidden');
    userBox.innerHTML = `
      <div class="card-pad">
        <div class="card-title">按指派人</div>
        ${FP.chart.hBars(report.byUser.map((u) => ({ label: u.username, value: u.count })))}
      </div>
    `;

    const prioBox = document.getElementById('report-bypriority');
    prioBox.classList.remove('hidden');
    prioBox.innerHTML = `
      <div class="card-pad">
        <div class="card-title">按优先级</div>
        ${FP.chart.hBars(Object.keys(report.byPriority)
          .filter((k) => report.byPriority[k] > 0)
          .map((k) => ({ label: PRIORITY_LABEL[k] || k, value: report.byPriority[k] })))}
      </div>
    `;

    const itemBox = document.getElementById('report-items');
    if (report.items.length === 0) {
      itemBox.classList.add('hidden');
    } else {
      itemBox.classList.remove('hidden');
      itemBox.innerHTML = `
        <div class="card-pad">
          <div class="card-title">完成任务明细（${report.items.length}）</div>
          ${report.items.map((item) => `
            <div class="report-item">
              <span class="avatar">${ui.esc((item.assigneeName || '全')[0])}</span>
              <div class="report-item-main">
                <div class="report-item-title">${ui.esc(item.title)}</div>
                <div class="report-item-meta">
                  ${ui.esc(item.assigneeName)} · ${ui.esc(item.creatorName)} 创建 · ${ui.esc(ui.formatDateTime(item.completedAt))}
                  ${item.durationHours !== null ? ` · 耗时 ${item.durationHours}h` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (report.summary.total === 0) {
      itemBox.classList.remove('hidden');
      itemBox.innerHTML = '<div class="empty"><div class="empty-icon">📊</div><p>该时间段没有已完成的任务</p></div>';
    }
  }

  // ---------- 加载与导出 ----------

  async function load() {
    try {
      const result = await api.reports.completed(requestParams());
      data = result.report;
      renderControls();
      renderReport();
    } catch (err) {
      ui.toast(err.message, 'error');
    }
  }

  function exportCsv() {
    window.location.href = api.reports.exportUrl(requestParams(), 'csv');
  }

  async function exportJson() {
    try {
      const result = await api.reports.completed(requestParams());
      const range = currentRange();
      const blob = new Blob([JSON.stringify(result.report, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `todo-report-${range.from}_${range.to}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      ui.toast(err.message, 'error');
    }
  }

  function init() {
    document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
    document.getElementById('btn-export-json').addEventListener('click', exportJson);
  }

  FP.reportView = {
    init,
    open() {
      custom = null;
      anchor = null;
      load();
    },
  };
})(window.FP);
