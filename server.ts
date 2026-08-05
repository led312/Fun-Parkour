import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data', 'user.json');

interface UserRecord {
  phone: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

function readUsers(): UserRecord[] {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw || '{"users": []}');
    return Array.isArray(data.users) ? data.users : [];
  } catch {
    return [];
  }
}

function writeUsers(users: UserRecord[]): void {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users }, null, 2));
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
  const users = readUsers();
  if (users.some((u) => u.phone === phone)) {
    return res.status(409).json({ error: '该手机号已注册' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  users.push({
    phone,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  });
  writeUsers(users);
  res.json({ ok: true, phone });
});

app.post('/api/login', (req, res) => {
  const { phone, password } = req.body ?? {};
  if (typeof phone !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: '请输入手机号和密码' });
  }
  const user = readUsers().find((u) => u.phone === phone);
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
