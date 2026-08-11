import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'users.db');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'user.json');

interface UserRecord {
  phone: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// One-time import of legacy JSON user data
if (fs.existsSync(LEGACY_JSON_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(LEGACY_JSON_FILE, 'utf-8') || '{"users": []}');
    const users: UserRecord[] = Array.isArray(data.users) ? data.users : [];
    const insert = db.prepare(
      'INSERT OR IGNORE INTO users (phone, salt, password_hash, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const u of users) {
      insert.run(u.phone, u.salt, u.passwordHash, u.createdAt);
    }
    fs.renameSync(LEGACY_JSON_FILE, LEGACY_JSON_FILE + '.migrated');
  } catch (err) {
    console.error('Failed to import legacy user.json:', err);
  }
}

function findUserByPhone(phone: string): UserRecord | undefined {
  const row = db
    .prepare('SELECT phone, salt, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE phone = ?')
    .get(phone) as unknown as UserRecord | undefined;
  return row;
}

function insertUser(user: UserRecord): void {
  db.prepare('INSERT INTO users (phone, salt, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    user.phone,
    user.salt,
    user.passwordHash,
    user.createdAt
  );
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Chinese mainland mobile number, no SMS code required per requirements
const PHONE_RE = /^1[3-9]\d{9}$/;

const app = express();
app.use(express.json());

app.post('/api/register', (req, res) => {
  const { phone, password } = req.body ?? {};
  if (typeof phone !== 'string' || !PHONE_RE.test(phone)) {
    return res.status(400).json({ error: '手机号格式不正确' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: '密码至少需要 6 位' });
  }
  if (findUserByPhone(phone)) {
    return res.status(409).json({ error: '该手机号已注册' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  insertUser({
    phone,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  });
  res.json({ ok: true, phone });
});

app.post('/api/login', (req, res) => {
  const { phone, password } = req.body ?? {};
  if (typeof phone !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: '请输入手机号和密码' });
  }
  const user = findUserByPhone(phone);
  if (!user) {
    return res.status(401).json({ error: '该手机号未注册' });
  }
  const hash = Buffer.from(hashPassword(password, user.salt), 'hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  if (hash.length !== expected.length || !crypto.timingSafeEqual(hash, expected)) {
    return res.status(401).json({ error: '密码错误' });
  }
  res.json({ ok: true, phone });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Auth server listening on http://localhost:${PORT}`);
});
