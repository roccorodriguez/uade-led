# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A real-time financial LED dashboard for UADE (Universidad Argentina de la Empresa). The display is fixed at **2048×192px** to match physical LED panel dimensions. It shows live global/local market data, news, and world clocks.

## Commands

### Backend (Python/FastAPI)
```bash
# From /backend, activate the venv first (Windows)
source ../.venv/Scripts/activate

# Run the dev server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (React/Vite)
```bash
# From /frontend
npm run dev      # dev server (uses .env.development → localhost:8000)
npm run build    # production build (uses .env.production → onrender.com)
npm run lint     # eslint
npm run preview  # preview the production build
```

## Architecture

### Monolithic Structure
Both backend and frontend are intentionally single-file:
- `backend/main.py` — the entire FastAPI backend (~700 lines)
- `frontend/src/App.jsx` — all React components in one file (~1200+ lines)

### Data Flow

```
WhatsApp → Twilio webhook (/whatsapp POST)
                ↓
          fetch_company_data() — Yahoo Finance scraping + Google AI
                ↓
          manager.broadcast_command() — FastAPI WebSocket
                ↓
          Frontend WebSocket listener → AI Mode overlay
```

```
PyRofex WS (Argentine market) → market_data_handler callback
                ↓
          ROFEX_STATE dict updated (thread-safe via asyncio.run_coroutine_threadsafe)
                ↓
          manager.broadcast_command("ROFEX_UPDATE") → Frontend
```

```
Frontend polls /api/prices (every 30s) + /api/market-news (every 30s)
Frontend polls /api/chart/{ticker} per chart cycle
```

### Widget Layout (2048px wide, 192px tall)

| Widget | Width | Content |
|--------|-------|---------|
| W1 | 512px | `FinancialChart` — ApexCharts area chart cycling through `TICKERS_ROTATION` (NVDA, MSFT, GOOG, META, TSLA, AMZN, AAPL) |
| W2 | 576px | Market Watch — Dólar Futuro (8 contracts), Cauciones TNA (peso/dollar), Acciones BYMA (48hs), fed by PyRofex + frontend simulation |
| W3 | 384px | `PremiumNewsFeed` — Yahoo Finance scraping, rotates headlines every 6s |
| W4 | 576px | World clocks — BS AS, NY, London, Tokyo, Beijing with SVG watchface + market-open indicator |

**AI Mode** (`CompanyDataDisplay`): a full-width overlay (z-50) triggered by WhatsApp that pushes all four widgets off screen, shows company KPIs, income statement, and Yahoo Scout AI summary for 30s then dismisses.

### Backend API Endpoints

- `GET /api/chart/{ticker}` — 1-day 5m OHLCV via yfinance
- `GET /api/prices` — global ETFs/indices (yfinance) + ROFEX state
- `GET /api/market-news` — Yahoo Finance scraping (8 headlines)
- `POST /whatsapp` — Twilio webhook (Form body: `Body`, `From`)
- `WS /ws` — WebSocket for real-time commands to frontend
- `GET /test-ai` — debug trigger for AI mode with Microsoft data

### WebSocket Commands (backend → frontend)
- `START_AI_MODE` — show loading overlay
- `SHOW_COMPANY_DATA` — render company card (auto-dismisses after 30s)
- `STOP_AI_MODE` — dismiss overlay
- `ROFEX_UPDATE` — `{symbol, price}` — update W2 price with flash animation

### Environment Variables

**backend/.env**
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
GOOGLE_API_KEY=...
PYROFEX_USER=...
PYROFEX_PASSWORD=...
PYROFEX_ACCOUNT=...
PYROFEX_ENVIRONMENT=REMARKET
```

**frontend/.env.development** → `http://localhost:8000` / `ws://localhost:8000`
**frontend/.env.production** → `https://uade-led-backend.onrender.com` / `wss://...`

### Key Implementation Details

- **PyRofex** runs in REMARKET (simulation) environment. Its WebSocket callback (`market_data_handler`) runs in a separate thread and uses `asyncio.run_coroutine_threadsafe` to broadcast to the FastAPI event loop stored at `app.state.loop`.
- **W2 mock simulation**: The frontend independently simulates price fluctuations for Rofex instruments every 800–2000ms as a visual fallback when real-time data isn't flowing.
- **SSL bypass**: `ssl._create_default_https_context = ssl._create_unverified_context` is set globally in `main.py` for Windows dev environments.
- **News caching**: `NEWS_STACK` is a global list that preserves timestamps when a known headline reappears (avoids time drift on re-scrapes).
- **Company data cache**: `_company_cache` with 10-minute TTL to avoid hammering Yahoo Finance on repeated WhatsApp queries.
- **`world_map.svg`** must be in `frontend/public/` for W4 background.

### Production
Backend is deployed on Render. Frontend is built with `npm run build` and the `dist/` folder is served separately.
