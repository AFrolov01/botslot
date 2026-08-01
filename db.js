const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    silver INTEGER NOT NULL DEFAULT 0,
    gold INTEGER NOT NULL DEFAULT 0,
    chrome INTEGER NOT NULL DEFAULT 0,
    pending_silver INTEGER NOT NULL DEFAULT 0,
    pending_gold INTEGER NOT NULL DEFAULT 0,
    pending_chrome INTEGER NOT NULL DEFAULT 0,
    pending_state TEXT NOT NULL DEFAULT 'idle', -- idle | revealed | gambled_win | gambled_lose
    last_free_claim_msk_date TEXT,              -- 'YYYY-MM-DD' в московской дате
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ---- helpers -------------------------------------------------------------

/** Текущая дата в MSK (UTC+3, без переходов на летнее время) в формате YYYY-MM-DD */
function todayMsk() {
  const now = new Date();
  const mskMs = now.getTime() + 3 * 60 * 60 * 1000; // сдвиг к UTC+3
  const msk = new Date(mskMs);
  return msk.toISOString().slice(0, 10);
}

function getOrCreateUser(telegramId, username, firstName) {
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  if (!user) {
    db.prepare(
      `INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)`
    ).run(telegramId, username || null, firstName || null);
    user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  } else if (username || firstName) {
    db.prepare('UPDATE users SET username = ?, first_name = ? WHERE telegram_id = ?')
      .run(username || user.username, firstName || user.first_name, telegramId);
  }
  return user;
}

function canClaimFree(telegramId) {
  const user = db.prepare('SELECT last_free_claim_msk_date FROM users WHERE telegram_id = ?').get(telegramId);
  return !user || user.last_free_claim_msk_date !== todayMsk();
}

function markFreeClaimed(telegramId) {
  db.prepare('UPDATE users SET last_free_claim_msk_date = ? WHERE telegram_id = ?')
    .run(todayMsk(), telegramId);
}

function setPending(telegramId, { silver = 0, gold = 0, chrome = 0 }, state = 'revealed') {
  db.prepare(
    `UPDATE users SET pending_silver = ?, pending_gold = ?, pending_chrome = ?, pending_state = ? WHERE telegram_id = ?`
  ).run(silver, gold, chrome, state, telegramId);
}

function doublePending(telegramId) {
  db.prepare(
    `UPDATE users SET pending_silver = pending_silver * 2, pending_gold = pending_gold * 2, pending_chrome = pending_chrome * 2, pending_state = 'gambled_win' WHERE telegram_id = ?`
  ).run(telegramId);
}

function burnPending(telegramId) {
  db.prepare(
    `UPDATE users SET pending_silver = 0, pending_gold = 0, pending_chrome = 0, pending_state = 'gambled_lose' WHERE telegram_id = ?`
  ).run(telegramId);
}

function claimPending(telegramId) {
  const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  if (!user) return null;
  db.prepare(
    `UPDATE users SET
       silver = silver + pending_silver,
       gold = gold + pending_gold,
       chrome = chrome + pending_chrome,
       pending_silver = 0, pending_gold = 0, pending_chrome = 0,
       pending_state = 'idle'
     WHERE telegram_id = ?`
  ).run(telegramId);
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

function spendSilver(telegramId, amount) {
  const user = db.prepare('SELECT silver FROM users WHERE telegram_id = ?').get(telegramId);
  if (!user || user.silver < amount) return false;
  db.prepare('UPDATE users SET silver = silver - ? WHERE telegram_id = ?').run(amount, telegramId);
  return true;
}

module.exports = {
  db,
  todayMsk,
  getOrCreateUser,
  canClaimFree,
  markFreeClaimed,
  setPending,
  doublePending,
  burnPending,
  claimPending,
  spendSilver,
};
