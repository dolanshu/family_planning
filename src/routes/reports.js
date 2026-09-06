'use strict';

const express = require('express');

const { completedReport, toCsv } = require('../domain/reports');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/completed', (req, res) => {
  const query = req.query || {};
  const state = req.app.get('store').getState();

  const report = completedReport(state, req.user, {
    from: query.from,
    to: query.to,
    groupBy: query.groupBy,
    scope: query.scope,
    familyId: query.familyId,
    assignee: query.assignee,
    creator: query.creator,
  });

  if (query.format === 'csv') {
    const filename = `todo-report-${report.range.from}_${report.range.to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(toCsv(report));
  }

  return res.json({ report });
});

module.exports = router;
