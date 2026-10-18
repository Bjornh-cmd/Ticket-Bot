const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { DatabaseSync } = require('node:sqlite');
const { getDataDir } = require('./runtimeEnv');

/**
 * Production-ready express-session store using Node's built-in SQLite.
 */
class SqliteSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    const dbPath =
      options.dbPath ||
      path.join(getDataDir(), 'sessions.sqlite');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
    `);
    this._cleanupTimer = setInterval(() => this._cleanup(), 15 * 60 * 1000);
    if (this._cleanupTimer.unref) this._cleanupTimer.unref();
  }

  _cleanup() {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expired < ?').run(Date.now());
    } catch {
      /* ignore */
    }
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT sess, expired FROM sessions WHERE sid = ?').get(sid);
      if (!row) return cb(null, null);
      if (Number(row.expired) < Date.now()) {
        this.destroy(sid, () => cb(null, null));
        return;
      }
      return cb(null, JSON.parse(row.sess));
    } catch (err) {
      return cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      const maxAge = sess?.cookie?.maxAge;
      const expired = Date.now() + (Number(maxAge) > 0 ? Number(maxAge) : 7 * 24 * 60 * 60 * 1000);
      this.db
        .prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)')
        .run(String(sid), JSON.stringify(sess), expired);
      return cb(null);
    } catch (err) {
      return cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(String(sid));
      return cb(null);
    } catch (err) {
      return cb(err);
    }
  }

  touch(sid, sess, cb) {
    return this.set(sid, sess, cb);
  }

  clear(cb) {
    try {
      this.db.prepare('DELETE FROM sessions').run();
      return cb(null);
    } catch (err) {
      return cb(err);
    }
  }

  length(cb) {
    try {
      const row = this.db.prepare('SELECT COUNT(*) AS c FROM sessions').get();
      return cb(null, Number(row?.c || 0));
    } catch (err) {
      return cb(err);
    }
  }
}

module.exports = { SqliteSessionStore };
