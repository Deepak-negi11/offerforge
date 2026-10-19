# OfferForge

**Know every round. Get placed.**

OfferForge collects real interview questions from 68 companies and organises them the way interviews actually happen: by company, by hiring track (internship or full-time) and by round, from the online assessment to HR. Every question links back to the candidate post it came from, and you can solve it right on the page in a built-in code editor.

- 6,749 questions from 3,184 public candidate posts, 52% reported in 2025-26
- 68 companies: Big Tech, product companies, finance, hardware, Indian startups and service companies
- Internship and full-time tracks kept separate, round by round

## Features

- **Company pages.** Internship and Full-time tabs, a step-by-step view of each hiring process, and questions grouped by round (Online Assessment, Technical rounds, Machine Coding, LLD, System Design, Hiring Manager, HR).
- **Solve workspace.** The question on the left, a VS Code style editor (Monaco) on the right. Run Python and JavaScript in the browser, C++ and Java on a self-hosted runner. Add your own test cases and get pass or fail per test.
- **Written answers.** Behavioral, CS fundamentals and system design questions open a writing pad with a structure guide (for example STAR).
- **Question bank.** Filter every question by company, track, round, type, topic, difficulty and source. Filters live in the URL, so any view can be shared.
- **Topics.** Browse topics by area and see which companies ask them most, or compare companies side by side.
- **Accounts.** Sign in to bookmark questions, mark them solved and keep your code and notes across devices.
- **Sourced data.** Each question shows where it was reported, how many candidates reported it and when. Questions found only on prep sites are labelled as secondary.
- **Search** with ⌘K or `/`, dark and light themes, and layouts that work on phones.

## Tech stack

| Part | Built with |
|---|---|
| Web app | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Monaco Editor, Pyodide |
| API | Node.js 22+, Express 5, SQLite or Turso (libSQL) |
| Code runner | In-browser workers for Python and JavaScript; optional self-hosted [Piston](https://github.com/engineer-man/piston) for C++ and Java |
| Data pipeline | Python 3.11+, curl_cffi, Playwright, Firecrawl, Anthropic API |

## Getting started

Requirements: Node.js 22.13 or newer. Python and `uv` are only needed to refresh the data.

```bash
git clone https://github.com/Deepak-negi11/offerforge.git
cd offerforge

# API (accounts, bookmarks, saved code) on http://localhost:8787
cd server && npm install && npm run dev

# In a second terminal: the web app on http://localhost:5173
cd web && npm install && npm run dev
```

The web app proxies `/api` to the API, so open http://localhost:5173 and create an account to open company pages.

### Enable C++ and Java (optional)

Python and JavaScript work out of the box. For C++ and Java, run a local Piston container:

```bash
docker compose up -d piston
./scripts/setup-runner.sh
PISTON_URL=http://localhost:2000 npm --prefix server run dev
```

## Project structure

```
offerforge/
├── web/                 React app (pages, components, code runner workers)
│   └── public/data/     atlas.json, the built dataset the site loads
├── server/              Express API: auth, bookmarks, solved, drafts, runner proxy
├── scraper/             Python pipeline: discover → fetch → extract → build → verify
├── data/raw/            One JSON file per company, the source of truth for the dataset
├── scripts/             Helper scripts (code runner setup)
└── docker-compose.yml   Optional Piston runner
```

## How the data is built

Questions come from public, first-hand interview write-ups on GeeksforGeeks, LeetCode Discuss, Reddit, Glassdoor, Medium, LinkedIn, X and personal blogs. Each one is paraphrased, tagged with its company, track, round, type and topics, and linked to its source.

```bash
cd scraper
uv sync
export FIRECRAWL_API_KEY=...   # search and blocked-site fallback
export ANTHROPIC_API_KEY=...   # question extraction

uv run python -m atlas discover --company amazon       # find candidate posts
uv run python -m atlas extract  --company amazon --max-pages 25
uv run python -m atlas build                           # writes web/public/data/atlas.json
uv run python -m atlas verify --sample 100             # spot-check that sources load and match
```

Rules the pipeline enforces:

- A question without a source link is dropped at build time.
- During extraction the source link is the page that was actually fetched, attached in code, so a link can never be invented.
- Duplicate reports are merged, and the number of independent reports is shown on each question.
- Pages are fetched politely: robots.txt is respected, no logins and no CAPTCHA solving. For sites that block crawlers, only search-result snippets are used.

To add a company, add it to `COMPANIES` in `scraper/atlas/config.py`, then run `discover`, `extract` and `build` for it.

## Deploy

The API serves the built site. Accounts, bookmarks and saved code go to a local SQLite file, or to a hosted [Turso](https://turso.tech) database when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set.

**Free: Render + Turso (no card).**

1. In Turso, create a database and copy its URL (`libsql://...`) and an auth token.
2. In Render, choose New → Blueprint and pick this repo. `render.yaml` sets up a free web service.
3. Paste the two Turso values when Render asks, then deploy. The site gets an `https://<name>.onrender.com` address.

Free Render services sleep after 15 minutes without traffic, so the first visit after that takes about a minute. User data is safe because it lives in Turso.

**Platform with a volume (Railway, Render, Fly.io).** Point the platform at this repo; it builds the `Dockerfile`. Then:

1. Attach a persistent volume mounted at `/data`.
2. Set `TRUST_PROXY=1` (the platform's proxy sits in front of the app).
3. Leave `PORT` as the platform sets it, or use `8787`.

C++ and Java need a privileged Piston container, which these platforms don't allow, so only Python and JavaScript run there.

**Your own server (VPS), everything included.** Point your domain's DNS at the server, then:

```bash
git clone https://github.com/Deepak-negi11/offerforge.git && cd offerforge
DOMAIN=offerforge.example.com docker compose -f docker-compose.prod.yml up -d --build
```

To also run C++ and Java (x86/amd64 servers only, the runner image has no ARM build), add `COMPOSE_PROFILES=runner PISTON_URL=http://piston:2000` to that command, then run `./scripts/setup-runner.sh` once.

Caddy gets the HTTPS certificate automatically. Back up the `app-data` volume to keep your users' data.

**Without Docker.**

```bash
npm --prefix web ci && npm --prefix web run build
npm --prefix server ci --omit=dev
NODE_ENV=production DB_PATH=/var/lib/offerforge/atlas.db node server/src/index.js
```

Serve it over HTTPS (the session cookie is `Secure`). See `server/.env.example` for all settings.

Security notes: passwords are hashed with scrypt, sessions are random tokens stored as SHA-256 hashes, writes are protected against CSRF, and the server sends a strict Content Security Policy and rate-limits sign-in.

## Tests

```bash
npm --prefix server test
```

## Limitations

- Questions are self-reported by candidates and can be incomplete or out of date. Questions with several reports are more reliable; check the year on each one.
- Coverage follows what people post publicly, so some companies and internship tracks are thin.
- There are no official test cases. In the solve workspace you add the examples from the question as your own tests.
- Password reset and email verification are not built yet.

## Author

Developed with ❤️ by [Deepak](https://www.linkedin.com/in/deepak-negi-678261302/).

If OfferForge helps your prep, a ⭐ on the repo is appreciated.
