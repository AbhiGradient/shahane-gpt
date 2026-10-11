# 💬 Shahane GPT

An offline chatbot with a modern glass-style web interface. Your original **C++ chatbot** still does the question matching; Node.js + Express only serve the page and talk to it.

```
Browser (HTML + CSS + JS)
        │  fetch  /api/chat  /api/questions  /api/health
        ▼
Node.js + Express   (127.0.0.1:3000)
        │  one persistent child process, line-based JSON over stdin/stdout
        ▼
bin/ShahaneBot.exe  (your C++ QABot, started with --server)
        │
        ▼
data/qa_database.txt  (unchanged)
```

No database server, no cloud, no CDN. Everything runs on your PC.

## 🧰 Required software

| Software | Why | Notes |
|---|---|---|
| **Node.js 18 or newer** | Runs the web server | https://nodejs.org |
| **MSYS2 UCRT64 g++** | Compiles the C++ chatbot | `pacman -S mingw-w64-ucrt-x86_64-gcc` in the MSYS2 UCRT64 shell |
| A modern browser | Chrome, Edge or Firefox | |

The build script looks for `C:\msys64\ucrt64\bin\g++.exe` first, then `g++` on your PATH. To use another compiler, set `CXX` to its full path.

## 🚀 First-time setup (needs internet once, for `npm install`)

Open **PowerShell** in the project folder:

```powershell
npm install
npm run build:cpp
```

Or both at once:

```powershell
npm run setup
```

## ▶️ Start

```powershell
npm start
```

Then open **http://localhost:3000**.

If `localhost` does not load, use **http://127.0.0.1:3000**.

## ⏹️ Stop

Press `Ctrl + C` in the terminal. The C++ process is shut down with the server.

## 🔌 Confirm it works offline

1. Finish setup above (this is the only step that needs internet).
2. Disconnect Wi-Fi or unplug Ethernet.
3. Run `npm start` and open http://localhost:3000.
4. The status pill shows **Local engine ready**, suggestion cards appear, and questions get answered.

The page loads no remote fonts, scripts, icons or images, and its Content-Security-Policy blocks any external request.

## 🔁 How the frontend talks to the C++ chatbot

* The browser calls `/api/health`, `/api/questions` and `/api/chat` on the same origin.
* Node starts **one** `ShahaneBot.exe --server --db <path>` process and keeps it alive, so the database is loaded once.
* Requests go through a queue, one at a time. Each question is sent as a single line (`ASK <text>`; newlines are flattened), and the C++ program replies with a single JSON line.
* If the process crashes or times out (5 s) it is restarted on the next request.
* The C++ matching algorithm (word-overlap score, first best match wins, at least one shared word required) is unchanged. Running the exe without `--server` still gives you the original interactive console bot.

### API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | `200` with `"backend": "ready"` only when the exe and database work, otherwise `503` with the reason |
| `GET /api/questions` | `{ "questions": [...] }` read from the C++ bot (`LIST` command) |
| `POST /api/chat` | Body `{ "question": "..." }` → `{ "answer": "...", "matched": true }` (max 500 characters) |

## ✅ Tests

```powershell
npm test
```

Starts the server on port 3100, then checks health, questions, answers, no-match handling, newline injection, validation, 20 concurrent requests and static files.

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| `Port 3000 is already in use` | Close the other program, or run `$env:PORT=3001; npm start` and open http://localhost:3001 |
| Status shows **Chatbot not built** | Run `npm run build:cpp`, then restart `npm start` |
| `No C++ compiler found` | Install MSYS2 g++ (see above) or set `$env:CXX="C:\path\to\g++.exe"` |
| Status shows **Database missing** | Make sure `data\qa_database.txt` exists |
| Status shows **Backend unavailable** | Check the terminal for `[chatbot]` messages. Rebuild with `npm run build:cpp` |
| `localhost` does not open | Try http://127.0.0.1:3000 |
| PowerShell blocks `npm` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use `npm.cmd` |
| Antivirus quarantines `bin\ShahaneBot.exe` | Restore it or rebuild with `npm run build:cpp` |

Edited `qa_database.txt`? Restart `npm start` so the C++ bot reloads it. Format: `Question|Answer`, one per line.

## 📁 Project layout

```
cpp/ShahaneBot.cpp        C++ chatbot (original + --server mode)
data/qa_database.txt      question/answer data (unchanged)
bin/                      compiled exe (created by npm run build:cpp)
server/                   Express app, config, C++ process manager
public/                   index.html, css/styles.css, js/*.js
scripts/                  build-cpp.js, smoke-test.js
.vscode/tasks.json        build / start / test tasks
```

## 🗂️ Files created, modified, removed

**Created:** `package.json`, `package-lock.json`, `.gitignore`, `README.md`, `server/config.js`, `server/engine.js`, `server/app.js`, `server/index.js`, `scripts/build-cpp.js`, `scripts/smoke-test.js`, `public/index.html`, `public/css/styles.css`, `public/js/api.js`, `public/js/dom.js`, `public/js/app.js`

**Moved/modified:**
* `ShahaneBot.cpp.cpp` → `cpp/ShahaneBot.cpp`. Added `findBestMatch` (the original scoring loop, extracted), a `serve()` JSON mode, `--db` / `--server` arguments and a quiet-load option. `askQuestion`, scoring, `startChat` and the interactive output are behaviorally unchanged.
* `qa_database.txt` → `data/qa_database.txt` (byte-identical).
* `.vscode/tasks.json` replaced with npm-based build/start/test tasks.

**Removed:** the prebuilt `ShahaneBot.cpp.exe` (rebuilt from source instead). 
