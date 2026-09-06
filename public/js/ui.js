window.FP = window.FP || {};

(function (FP) {
  'use strict';

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
  }

  function toast(message, type) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = `toast${type === 'error' ? ' is-error' : ''}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  /**
   * 打开底部弹层。
   * @returns {{sheet: HTMLElement, close: Function}}
   */
  function openSheet(options) {
    const root = document.getElementById('sheet-root');
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';

    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-header"><h3>${esc(options.title || '')}</h3></div>
      <div class="sheet-body">${options.bodyHTML || ''}</div>
      ${options.footerHTML ? `<div class="sheet-footer">${options.footerHTML}</div>` : ''}
    `;

    root.appendChild(mask);
    root.appendChild(sheet);

    requestAnimationFrame(() => {
      mask.classList.add('is-open');
      sheet.classList.add('is-open');
    });

    function close() {
      mask.classList.remove('is-open');
      sheet.classList.remove('is-open');
      setTimeout(() => { mask.remove(); sheet.remove(); }, 220);
    }

    mask.addEventListener('click', close);
    if (options.onMount) options.onMount(sheet, close);

    return { sheet, close };
  }

  function confirmSheet(options) {
    return new Promise((resolve) => {
      openSheet({
        title: options.title || '确认',
        bodyHTML: `<p class="card-title" style="font-weight:400">${esc(options.message || '')}</p>`,
        footerHTML: `
          <button class="btn btn-secondary" data-act="cancel" type="button">取消</button>
          <button class="btn ${options.danger === false ? 'btn-primary' : 'btn-danger'}" data-act="ok" type="button">${esc(options.confirmText || '确定')}</button>
        `,
        onMount(sheet, close) {
          sheet.querySelector('[data-act="cancel"]').addEventListener('click', () => {
            close();
            resolve(false);
          });
          sheet.querySelector('[data-act="ok"]').addEventListener('click', () => {
            close();
            resolve(true);
          });
        },
      });
    });
  }

  // ---------- 日期工具（全部基于本地时区） ----------

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toYMD(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function today() { return toYMD(new Date()); }

  function parseYMD(ymd) {
    const parts = String(ymd).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function shiftDays(ymd, days) {
    const date = parseYMD(ymd);
    date.setDate(date.getDate() + days);
    return toYMD(date);
  }

  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function weekdayLabel(ymd) {
    return WEEKDAYS[parseYMD(ymd).getDay()];
  }

  /** 把到期日转成展示文案与样式类。 */
  function describeDue(dateStr) {
    if (!dateStr) return null;
    const t = today();
    const month = Number(dateStr.slice(5, 7));
    const day = Number(dateStr.slice(8, 10));
    const base = `${month}月${day}日`;

    if (dateStr < t) return { label: `${base} 已逾期`, cls: 'is-overdue' };
    if (dateStr === t) return { label: '今天', cls: 'is-today' };
    if (dateStr === shiftDays(t, 1)) return { label: '明天', cls: '' };
    return { label: `${base} ${weekdayLabel(dateStr)}`, cls: '' };
  }

  /** 到期日分组：已逾期 / 今天 / 明天 / 未来 / 无日期 */
  function dueGroup(dateStr) {
    const t = today();
    if (!dateStr) return 4;
    if (dateStr < t) return 0;
    if (dateStr === t) return 1;
    if (dateStr === shiftDays(t, 1)) return 2;
    return 3;
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  FP.ui = {
    esc, toast, openSheet, confirmSheet,
    pad2, toYMD, today, parseYMD, shiftDays, weekdayLabel, describeDue, dueGroup, formatDateTime,
  };
})(window.FP);
