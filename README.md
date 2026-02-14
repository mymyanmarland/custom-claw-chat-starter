# Custom UI + Chat Backend Starter (for Ko Paing/Claw workflow)

ဒီ starter က ကိုယ်စိတ်ကြိုက် UI ဆွဲပြီး chatbot app တည်ဆောက်ဖို့ အခြေခံ project ပါ။

## Included
- **Frontend**: minimal glass dark chat UI (login, history, model selector, streaming output)
- **Backend**: Express API (login, models, history, SSE stream)
- **LLM**: OpenRouter API + Ko Paing system prompt

## Structure
- `backend/server.js`
- `backend/.env.example`
- `frontend/index.html`
- `data/history.json` (auto-created)

## 1) Setup backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

`.env` values:
- `OPENROUTER_API_KEY=sk-or-...`
- `ADMIN_USER`, `ADMIN_PASS` for login
- `JWT_SECRET`

## 2) Run app (local)
```bash
cd backend
npm run dev
```
Then open: `http://localhost:8787`

## 3) Use
1. Login with ADMIN_USER/ADMIN_PASS
2. Select model
3. Chat + stream response
4. Clear history if needed

---

## Deploy online (use from anywhere)
### Option A: Render (easy)
1. Push this folder to GitHub (new repo)
2. On Render → New Web Service → connect repo
3. Root Directory: `backend`
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Add Environment Variables:
   - `OPENROUTER_API_KEY`
   - `JWT_SECRET`
   - `ADMIN_USER`
   - `ADMIN_PASS`
7. Deploy → get URL like `https://your-app.onrender.com`

### Option B: Railway / Fly.io
Same env vars + start command (`npm start` in `backend`).

---

## Next step (if you want)
I can wire this backend to OpenClaw sessions/tools directly (sessions_send/sessions_history flow) so your custom UI talks to your real Ko Paing agent session instead of plain OpenRouter chat.
## Option 2: Direct Ko Paing bridge (no Telegram UI)
Set backend env to OpenClaw mode:

```bash
LLM_MODE=openclaw
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<your-gateway-token>
OPENCLAW_AGENT_ID=main
OPENCLAW_SESSION_KEY=agent:main:main
```

Also enable Gateway OpenAI endpoint:

```bash
openclaw gateway call config.patch --params '{"patch":{"gateway":{"http":{"endpoints":{"chatCompletions":{"enabled":true}}}}}}'
```

Then restart backend. Your web UI will stream replies from the real Ko Paing main session.
