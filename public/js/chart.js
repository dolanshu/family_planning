window.FP = window.FP || {};

(function (FP) {
  'use strict';

  const esc = FP.ui.esc;

  /** 纵向柱状图（趋势用）。points: [{label, value}] */
  function barChart(points) {
    if (!points || points.length === 0) {
      return '<div class="empty"><p>暂无数据</p></div>';
    }

    const width = 320;
    const height = 140;
    const pad = { top: 12, right: 6, bottom: 24, left: 6 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;

    const max = Math.max.apply(null, points.map((p) => p.value).concat([1]));
    const slot = innerW / points.length;
    const barW = Math.max(4, Math.min(26, slot * 0.55));

    let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">`;

    points.forEach((point, index) => {
      const barH = Math.max(2, Math.round((point.value / max) * innerH));
      const x = pad.left + slot * index + (slot - barW) / 2;
      const y = pad.top + innerH - barH;

      svg += `<rect x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${barH}" rx="4" fill="#4F7CFF" opacity="0.9"/>`;
      svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${pad.top + innerH + 16}" font-size="10" fill="currentColor" opacity="0.55" text-anchor="middle">${esc(point.label)}</text>`;
    });

    svg += '</svg>';
    return svg;
  }

  /** 横向条形图。rows: [{label, value}] */
  function hBars(rows) {
    if (!rows || rows.length === 0) {
      return '<div class="empty"><p>暂无数据</p></div>';
    }

    const max = Math.max.apply(null, rows.map((r) => r.value).concat([1]));

    return rows.map((row) => `
      <div class="bar-row">
        <span class="bar-label" title="${esc(row.label)}">${esc(row.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.round((row.value / max) * 100)}%"></span></span>
        <span class="bar-value">${esc(row.value)}</span>
      </div>
    `).join('');
  }

  FP.chart = { barChart, hBars };
})(window.FP);
