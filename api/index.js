'use strict';

const app = require('../backend/server');
const { initDb } = require('../backend/db');

let isDbInitialized = false;

module.exports = async (req, res) => {
  if (req.headers['x-matched-path']) {
    req.url = req.headers['x-matched-path'];
  }

  if (!isDbInitialized) {
    try {
      await initDb();
      isDbInitialized = true;
    } catch (err) {
      console.error('Database initialization error in api/index.js:', err);
    }
  }

  return app(req, res);
};
