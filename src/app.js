'use strict';

const path = require('node:path');
const express = require('express');
const cookieSession = require('cookie-session');

const authRoutes = require('./routes/auth');
const familyRoutes = require('./routes/families');
const taskRoutes = require('./routes/tasks');
const reportRoutes = require('./routes/reports');
const { apiNotFound, errorHandler } = require('./middleware/error');

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 天

function createApp({ store, config }) {
  const app = express();

  app.set('store', store);
  app.set('config', config);

  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieSession({
    name: 'fp_session',
    keys: [config.sessionSecret],
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
  }));

  app.use('/api/auth', authRoutes);
  app.use('/api/families', familyRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/reports', reportRoutes);

  app.use('/api', apiNotFound);
  app.use(express.static(PUBLIC_DIR));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, PUBLIC_DIR, SESSION_MAX_AGE };
