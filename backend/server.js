import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const LLM_MODE = (process.env.LLM_MODE || 'openrouter').toLowerCase();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || 'You are Ko Paing (ကိုပိုင်), a calm, warm Myanmar assistant. Reply in Burmese for user-facing messages. Be concise, supportive, and practical.';
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const OPENCLAW_AGENT_ID = process.env.OPENCLAW_AGENT_ID || 'main';
const OPENCLAW_SESSION_KEY = process.env.OPENCLAW_SESSION_KEY || 'agent:main:main';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, '{}');

const MODELS = LLM_MODE === 'openclaw'
  ? [`openclaw:${OPENCLAW_AGENT_ID}`]
  : [
      'openrouter/auto',
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-mini',
      'openai/gpt-4.1',
      'google/gemini-2.0-flash-001',
      'anthropic/claude-3.5-sonnet',
      'meta-llama/llama-3.3-70b-instruct',
      'mistralai/mistral-large',
      'deepseek/deepseek-chat'
    ];

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return {}; }
}

function writeHistory(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/health', (_, res) => res.json({ ok: true, mode: LLM_MODE }));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username });
});

app.get('/api/models', auth, (_, res) => {
  res.json({ models: MODELS });
});

app.get('/api/history', auth, (req, res) => {
  const db = readHistory();
  res.json({ messages: db[req.user.username] || [] });
});

app.delete('/api/history', auth, (req, res) => {
  const db = readHistory();
  db[req.user.username] = [];
  writeHistory(db);
  res.json({ ok: true });
});

app.post('/api/chat', auth, async (req, res) => {
  const { model, message } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
  const selectedModel = MODELS.includes(model) ? model : 'openrouter/auto';

  const db = readHistory();
  const messages = db[req.user.username] || [];
  messages.push({ role: 'user', content: message, ts: Date.now() });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let upstream;

    if (LLM_MODE === 'openclaw') {
      if (!OPENCLAW_GATEWAY_TOKEN) throw new Error('Server missing OPENCLAW_GATEWAY_TOKEN');
      upstream = await fetch(`${OPENCLAW_GATEWAY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENCLAW_GATEWAY_TOKEN}`,
          'Content-Type': 'application/json',
          'x-openclaw-agent-id': OPENCLAW_AGENT_ID,
          'x-openclaw-session-key': OPENCLAW_SESSION_KEY
        },
        body: JSON.stringify({
          model: `openclaw:${OPENCLAW_AGENT_ID}`,
          stream: true,
          user: req.user.username,
          messages: [
            { role: 'user', content: message }
          ]
        })
      });
    } else {
      const key = OPENROUTER_API_KEY;
      if (!key) throw new Error('Server missing OPENROUTER_API_KEY');

      upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'Custom Claw Chat Starter'
        },
        body: JSON.stringify({
          model: selectedModel,
          stream: true,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages.map(m => ({ role: m.role, content: m.content }))
          ]
        })
      });
    }

    if (!upstream.ok || !upstream.body) {
      throw new Error(`Upstream error ${upstream.status}`);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const json = JSON.parse(raw);
          const delta = json?.choices?.[0]?.delta?.content || '';
          if (delta) {
            assistantText += delta;
            res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
          }
        } catch {}
      }
    }

    messages.push({ role: 'assistant', content: assistantText, ts: Date.now(), model: selectedModel });
    db[req.user.username] = messages.slice(-80);
    writeHistory(db);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message || 'chat failed' })}\n\n`);
    res.end();
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
