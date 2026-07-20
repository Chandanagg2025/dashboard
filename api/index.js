'use strict';

const app = require('../backend/server');
const { initDb } = require('../backend/db');

let isDbInitialized = false;

module.exports = async (req, res) => {
  if (!isDbInitialized) {
    await initDb();
    isDbInitialized = true;
  }
  return app(req, res);
};
