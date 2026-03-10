from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import datetime
import requests
from curl_cffi import requests as cffi_requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import datetime, timedelta, timezone
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from typing import List
import json
from fastapi import Form
import httpx
import os
import math
import time
import re
from dotenv import load_dotenv
load_dotenv()
import random

# Zona horaria de Argentina (UTC-3, sin DST)
TZ_AR = timezone(timedelta(hours=-3))
def now_ar() -> datetime:
    return datetime.now(TZ_AR)
import tempfile
import edge_tts
from deep_translator import GoogleTranslator
from fastapi.responses import FileResponse, StreamingResponse
from yfinance import base

# --- YAHOO FINANCE CRUMB BYPASS ---
# yfinance está siendo bloqueado con 401 Invalid Crumb frecuently
# Usamos curl_cffi para imitar a un navegador real (Chrome)
class CffiSession(cffi_requests.Session):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.impersonate = "chrome120"
yf_session = CffiSession()

# Estado global para guardar el último precio de ROFEX
ROFEX_STATE = {}

ARG_STOCKS_WIDGET_2 = [
    "BMA", "BYMA", "CEPU", "GGAL", "PAMP", "YPFD", "TECO2", "LOMA",
    "ALUA", "BBAR", "EDN", "IRSA", "METR"
]

# Mapa de símbolo data912 → ticker en yfinance (sufijo .BA para BYMA)
ARG_YF_TICKERS = {
    "BMA": "BMA.BA", "BYMA": "BYMA.BA", "CEPU": "CEPU.BA",
    "GGAL": "GGAL.BA", "PAMP": "PAMP.BA", "YPFD": "YPFD.BA",
    "TECO2": "TECO2.BA", "LOMA": "LOMA.BA", "ALUA": "ALUA.BA",
    "BBAR": "BBAR.BA", "EDN": "EDN.BA", "IRSA": "IRSA.BA", "METR": "METR.BA",
}

# Caché de cierres anteriores: {"BMA": 13200.0, ...}
_prev_closes: dict = {}
_prev_closes_date: str = ""

app = FastAPI()

# --- GESTOR DE WEBSOCKETS ---
class ConnectionManager:
    def __init__(self):
        # Guardamos las conexiones activas
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"📡 Terminal conectada al LED: {len(self.active_connections)}")
        # Replay del último AI mode si sigue vigente (< 35s)
        if _pending_ai_data and (time.time() - _pending_ai_ts) < 35:
            try:
                await websocket.send_json({"command": "START_AI_MODE", "payload": {}})
                await asyncio.sleep(0.05)
                await websocket.send_json({"command": "SHOW_COMPANY_DATA", "payload": _pending_ai_data})
                print("📡 Reenviado AI data pendiente a nueva conexión WS")
            except Exception as e:
                print(f"⚠️ Error en replay de AI data: {e}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast_command(self, command: str, payload: dict = None):
        """Envía una orden a todos los dashboards conectados"""
        message = {"command": command, "payload": payload or {}}
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.active_connections.remove(connection)

manager = ConnectionManager()

# --- ENDPOINT DEL WEBSOCKET ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    # Enviar estado actual al nuevo cliente para evitar esperar el ciclo de 20s
    for symbol, state in list(ROFEX_STATE.items()):
        try:
            if isinstance(state, dict) and "price" in state and "pct_change" in state:
                await websocket.send_json({
                    "command": "ROFEX_UPDATE",
                    "payload": {"symbol": symbol, "price": state["price"], "pct_change": state["pct_change"]}
                })
        except Exception:
            break
    try:
        while True:
            # Mantenemos la conexión abierta escuchando (aunque no manden nada)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("❌ Terminal desconectada")

# Permitir que el frontend se conecte sin problemas de seguridad (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Memoria global para el Widget 3
NEWS_STACK = []

# Lista de activos para el Ticker (Widget 2) - yfinance backup
TICKERS_TICKER = [
        "GLD", "SLV", "COPX", "USO", "URA",
        "EEM", "XLV", "XLB", "EWZ", "EWJ",
        "^GSPC", "^DJI", "^IXIC", "^RUT", "^MERV"
        ]

def _fetch_prev_closes_sync() -> dict:
    """Obtiene el cierre anterior de yfinance para los 13 stocks argentinos. Síncrono."""
    result = {}
    for sym, yf_ticker in ARG_YF_TICKERS.items():
        try:
            t_obj = yf.Ticker(yf_ticker, session=yf_session)
            fi = t_obj.fast_info
            prev = getattr(fi, 'regular_market_previous_close', None) or getattr(fi, 'previous_close', None)
            if prev and prev > 0:
                result[sym] = float(prev)
                print(f"📌 Cierre anterior {sym}: {prev:.2f}")
        except Exception as e:
            print(f"⚠️ No se pudo obtener cierre anterior de {yf_ticker}: {e}")
    return result


async def _ensure_prev_closes():
    """Actualiza _prev_closes si es un nuevo día o si está vacío."""
    global _prev_closes, _prev_closes_date
    today = now_ar().strftime("%Y-%m-%d")
    if _prev_closes_date == today and _prev_closes:
        return
    print("📅 Actualizando cierres anteriores desde yfinance...")
    closes = await asyncio.to_thread(_fetch_prev_closes_sync)
    if closes:
        _prev_closes = closes
        _prev_closes_date = today
        print(f"✅ Cierres anteriores cargados: {len(closes)} stocks")


# Nueva tarea en segundo plano para obtener cotizaciones de data912 (Tickers Widget 2)
async def data912_refresh_loop():
    """Fetches Argentine stocks from data912 every 20s and staggered-broadcasts it."""
    await asyncio.sleep(2)
    print("🔥 Iniciando polling de data912.com (Acciones Spot)...")
    
    while True:
        try:
            # Asegurar que tenemos los cierres anteriores del día
            await _ensure_prev_closes()

            async with httpx.AsyncClient(verify=False) as client:
                res = await client.get('https://data912.com/live/arg_stocks', timeout=15)
                if res.status_code == 200:
                    data = res.json()

                    found_updates = []
                    for item in data:
                        sym = item.get("symbol")
                        if sym in ARG_STOCKS_WIDGET_2:
                            # Usamos 'c' = último precio operado (mismo que muestra IOL)
                            price = float(item.get("c") or 0)

                            # Calculamos pct_change como IOL: (precio_actual - cierre_anterior) / cierre_anterior
                            # El cierre anterior viene de yfinance .BA que usa los datos de BYMA
                            prev_close = _prev_closes.get(sym)
                            if prev_close and prev_close > 0 and price > 0:
                                pct = (price - prev_close) / prev_close * 100
                            else:
                                # Fallback si yfinance no trajo el dato aún
                                pct = float(item.get("pct_change") or 0)

                            ui_symbol = f"{sym} - 48hs"
                            ROFEX_STATE[ui_symbol] = {"price": price, "pct_change": pct}
                            found_updates.append({"symbol": ui_symbol, "price": price, "pct_change": pct})
                    
                    # Emitir actualizaciones escalonadas con pequeño delay entre cada una
                    async def send_staggered(updates):
                        random.shuffle(updates)
                        for idx, payload in enumerate(updates):
                            if idx > 0:
                                await asyncio.sleep(random.uniform(0.1, 1.2))
                            await manager.broadcast_command("ROFEX_UPDATE", payload)
                            print(f"📊 [Data912] {payload['symbol']} → {payload['price']} ({payload['pct_change']:+.2f}%)")

                    asyncio.create_task(send_staggered(found_updates))
                    
        except Exception as e:
            print(f"⚠️ Error obteniendo datos de data912.com: {e}")
            
        await asyncio.sleep(20) # Data912 actualiza cada ~20 segundos

async def scout_prewarm_loop():
    """Pre-calienta y mantiene fresco el caché de scout para todos los tickers de rotación."""
    ROTATION = ["NVDA", "MSFT", "GOOG", "META", "TSLA", "AMZN", "AAPL"]
    await asyncio.sleep(5)  # Pequeña pausa al arrancar
    while True:
        print("🔥 Pre-calentando caché de scout...")
        for ticker in ROTATION:
            try:
                await fetch_company_data(ticker)
                print(f"✅ Scout caché listo: {ticker}")
            except Exception as e:
                print(f"⚠️ Error pre-calentando {ticker}: {e}")
            await asyncio.sleep(3)  # 3s entre tickers
        await asyncio.sleep(COMPANY_CACHE_TTL - 60)  # Refrescar 60s antes de que expire


@app.on_event("startup")
async def startup_event():
    # Guardamos el loop para que pyRofex pueda encolar corrutinas (broadcast)
    app.state.loop = asyncio.get_running_loop()

    # Iniciar scraper periódico de Top Movers (cada 20 min)
    asyncio.create_task(movers_refresh_loop())

    # Iniciar scraper diario del Calendario Económico (investing.com)
    asyncio.create_task(econ_calendar_refresh_loop())

    # Pre-calentar caché de scout para todos los tickers de rotación
    asyncio.create_task(scout_prewarm_loop())

    # Mantener caché de market-heatmap actualizado
    asyncio.create_task(heatmap_refresh_loop())

    # Iniciar polling background de Data912 en lugar de PyRofex
    asyncio.create_task(data912_refresh_loop())

# Poné tus credenciales de Twilio acá arriba
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000")

# --- SESIÓN GLOBAL YAHOO FINANCE (para scraping sin rate limit) ---
_yahoo_session = None
_yahoo_session_ts = 0
YAHOO_SESSION_TTL = 3600  # Refrescar cada hora

def get_yahoo_session():
    global _yahoo_session, _yahoo_session_ts
    now = time.time()
    if _yahoo_session is None or now - _yahoo_session_ts > YAHOO_SESSION_TTL:
        _yahoo_session = requests.Session()
        _yahoo_session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        })
        try:
            _yahoo_session.get('https://finance.yahoo.com/', timeout=10)
        except:
            pass
        _yahoo_session_ts = now
    return _yahoo_session

# --- CACHÉ TTL PARA DATOS DE EMPRESA ---
_company_cache = {}

# --- ESTADO GLOBAL DEL MODO AI ---
_ai_processing = False          # Lock para evitar procesamiento concurrente
_pending_ai_data: dict = None   # Último payload SHOW_COMPANY_DATA (para replay en reconexión)
_pending_ai_ts: float = 0       # Timestamp del último AI mode activado

# --- CACHÉ CALENDARIO ECONÓMICO (1 scrape por día) ---
_econ_calendar = {"events": [], "date": None}
COMPANY_CACHE_TTL = 600  # 10 minutos

def fetch_ticker_data(t):
    try:
        t_obj = yf.Ticker(t, session=yf_session)
        try:
            info = t_obj.info
            price = info.get('currentPrice') or info.get('regularMarketPrice')
            prev_close = info.get('regularMarketPreviousClose') or info.get('previousClose')
            if price is None or prev_close is None:
                raise ValueError("Missing data in info")
        except:
            fi = t_obj.fast_info
            price      = getattr(fi, 'last_price', None) or 0
            prev_close = getattr(fi, 'regular_market_previous_close', None) or getattr(fi, 'previous_close', None) or 0

        if price and prev_close:
            change_abs = price - prev_close
            change_pct = (change_abs / prev_close) * 100
        else:
            change_abs = 0.0
            change_pct = 0.0

        return {
            "symbol": t.replace("^", ""),
            "price": f"{price:.2f}",
            "change": f"{change_pct:+.2f}",
            "change_abs": f"{change_abs:+.2f}"
        }
    except:
        return {"symbol": t.replace("^", ""), "price": "0.00", "change": "0.00", "change_abs": "0.00"}

def parse_relative_time(relative_str):
    """
    Convierte strings relativos de Yahoo Finance ('58m ago', '1h ago', '2d ago')
    en un HH:MM para mostrar y un unix timestamp para ordenar correctamente.
    Retorna: (display_time: str, timestamp: int)
    """
    now = now_ar()
    try:
        clean_str = relative_str.lower().replace('ago', '').strip()

        m = re.search(r'(\d+)\s*d', clean_str)
        if m:
            dt = now - timedelta(days=int(m.group(1)))
            return dt.strftime("%H:%M"), int(dt.timestamp())

        m = re.search(r'(\d+)\s*h', clean_str)
        if m:
            dt = now - timedelta(hours=int(m.group(1)))
            return dt.strftime("%H:%M"), int(dt.timestamp())

        m = re.search(r'(\d+)\s*m', clean_str)
        if m:
            dt = now - timedelta(minutes=int(m.group(1)))
            return dt.strftime("%H:%M"), int(dt.timestamp())

        return now.strftime("%H:%M"), int(now.timestamp())

    except:
        return now.strftime("%H:%M"), int(now.timestamp())

async def fetch_company_data(company_name: str):
    """Scraping directo de Yahoo Finance — sin rate limits de yfinance."""

    # --- Caché ---
    cache_key = company_name.lower().strip()
    now = time.time()
    if cache_key in _company_cache:
        cached_data, cached_ts = _company_cache[cache_key]
        if now - cached_ts < COMPANY_CACHE_TTL:
            print(f"📦 Cache hit para: {company_name}")
            return cached_data

    # 1. Resolver ticker via Yahoo Finance search API (no tiene rate limit)
    search_url = f"https://query2.finance.yahoo.com/v1/finance/search?q={company_name}&quotesCount=5&newsCount=0"
    ticker_symbol = None
    company_full_name = company_name

    async with httpx.AsyncClient(verify=False) as http_client:
        try:
            resp = await http_client.get(search_url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                for quote in resp.json().get("quotes", []):
                    if quote.get("quoteType") in ("EQUITY", "ETF"):
                        ticker_symbol = quote.get("symbol")
                        company_full_name = quote.get("longname") or quote.get("shortname") or company_name
                        break
        except Exception as e:
            print(f"⚠️ Error buscando ticker: {e}")

    if not ticker_symbol:
        print(f"❌ No se encontró ticker para: {company_name}")
        return None

    print(f"✅ Ticker encontrado: {ticker_symbol} ({company_full_name})")

    try:
        session = get_yahoo_session()

        # 2. Scrapear página del quote (misma técnica que widget de noticias)
        quote_url = f"https://finance.yahoo.com/quote/{ticker_symbol}/"
        quote_resp = await asyncio.to_thread(lambda: session.get(quote_url, timeout=15))
        soup = BeautifulSoup(quote_resp.text, 'html.parser')
        scripts = soup.find_all('script', type='application/json')

        quote_summary = None
        ai_analysis = None

        print(f"📄 Quote page status: {quote_resp.status_code} | HTML: {len(quote_resp.text)} chars | Scripts JSON: {len(scripts)}")
        for di, s in enumerate(scripts):
            t = s.string or s.get_text() or ''
            if 'quoteSummary' in t:
                idx = t.find('quoteSummary')
                ctx = t[max(0, idx-5):idx+30]
                print(f"  script[{di:02d}] {len(t):7d} chars | quoteSummary encontrado | contexto: ...{ctx}...")

        def parse_script_body(text):
            """Maneja dos formatos: {"body": "...json string..."} o el JSON directo."""
            outer = json.loads(text)
            if 'body' in outer and isinstance(outer['body'], str):
                return json.loads(outer['body'])
            return outer

        for script in scripts:
            text = script.string or script.get_text() or ''
            if not text:
                continue
            if 'quoteSummary' in text and quote_summary is None:
                try:
                    body = parse_script_body(text)
                    if body.get('quoteSummary', {}).get('result'):
                        quote_summary = body['quoteSummary']['result'][0]
                except Exception as e:
                    print(f"⚠️ Error parseando quoteSummary: {e}")
            if 'aiAnalysis' in text and ticker_symbol in text and ai_analysis is None:
                try:
                    body = parse_script_body(text)
                    result = body.get('finance', {}).get('result', {})
                    if ticker_symbol in result and 'aiAnalysis' in result[ticker_symbol]:
                        ai_analysis = result[ticker_symbol]['aiAnalysis']
                except Exception as e:
                    print(f"⚠️ Error parseando aiAnalysis: {e}")

        if not quote_summary:
            qs_count = sum(1 for s in scripts if (s.string or s.get_text()) and 'quoteSummary' in (s.string or s.get_text()))
            print(f"❌ No se pudo obtener quoteSummary para {ticker_symbol} (scripts con quoteSummary: {qs_count})")
            return None

        sd  = quote_summary.get('summaryDetail', {})
        fd  = quote_summary.get('financialData', {})
        dks = quote_summary.get('defaultKeyStatistics', {})
        pi  = quote_summary.get('price', {})
        sp  = quote_summary.get('summaryProfile', {})

        def raw(d, key):
            v = d.get(key)
            return v.get('raw') if isinstance(v, dict) else v

        def safe(val):
            try:
                if val is None: return None
                if isinstance(val, float) and math.isnan(val): return None
                return val
            except:
                return None

        chg_raw = raw(pi, 'regularMarketChangePercent')
        indicators = {
            "price":            safe(raw(fd, 'currentPrice') or raw(pi, 'regularMarketPrice')),
            "change_pct":       safe(chg_raw * 100 if chg_raw is not None else None),
            "marketCap":        safe(raw(sd, 'marketCap')),
            "trailingPE":       safe(raw(sd, 'trailingPE')),
            "forwardPE":        safe(raw(sd, 'forwardPE')),
            "trailingEps":      safe(raw(dks, 'trailingEps')),
            "beta":             safe(raw(sd, 'beta')),
            "fiftyTwoWeekHigh": safe(raw(sd, 'fiftyTwoWeekHigh')),
            "fiftyTwoWeekLow":  safe(raw(sd, 'fiftyTwoWeekLow')),
            "grossMargins":     safe(raw(fd, 'grossMargins')),
            "operatingMargins": safe(raw(fd, 'operatingMargins')),
            "profitMargins":    safe(raw(fd, 'profitMargins')),
            "debtToEquity":     safe(raw(fd, 'debtToEquity')),
            "returnOnEquity":   safe(raw(fd, 'returnOnEquity')),
            "returnOnAssets":   safe(raw(fd, 'returnOnAssets')),
            "sector":           sp.get('sector'),
            "exchange":         pi.get('exchangeName') or pi.get('exchange'),
            # defaultKeyStatistics
            "forwardEps":              safe(raw(dks, 'forwardEps')),
            "bookValue":               safe(raw(dks, 'bookValue')),
            "priceToBook":             safe(raw(dks, 'priceToBook')),
            "enterpriseValue":         safe(raw(dks, 'enterpriseValue')),
            "enterpriseToRevenue":     safe(raw(dks, 'enterpriseToRevenue')),
            "enterpriseToEbitda":      safe(raw(dks, 'enterpriseToEbitda')),
            "shortRatio":              safe(raw(dks, 'shortRatio')),
            "shortPercentOfFloat":     safe(raw(dks, 'shortPercentOfFloat')),
            "heldPercentInsiders":     safe(raw(dks, 'heldPercentInsiders')),
            "heldPercentInstitutions": safe(raw(dks, 'heldPercentInstitutions')),
            "weekChange52":            safe(raw(dks, '52WeekChange')),
            # summaryDetail
            "previousClose":        safe(raw(sd, 'previousClose')),
            "open":                 safe(raw(sd, 'open')),
            "dayHigh":              safe(raw(sd, 'dayHigh')),
            "dayLow":               safe(raw(sd, 'dayLow')),
            "bid":                  safe(raw(sd, 'bid')),
            "ask":                  safe(raw(sd, 'ask')),
            "volume":               safe(raw(sd, 'volume')),
            "averageVolume":        safe(raw(sd, 'averageVolume')),
            "dividendYield":        safe(raw(sd, 'trailingAnnualDividendYield')),
            "fiftyDayAverage":      safe(raw(sd, 'fiftyDayAverage')),
            "twoHundredDayAverage": safe(raw(sd, 'twoHundredDayAverage')),
        }

        # 3. Income statement trimestral via timeseries API (endpoint distinto, sin rate limit)
        income = []
        try:
            ts_url = f"https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{ticker_symbol}"
            ts_params = {
                'type': 'quarterlyTotalRevenue,quarterlyGrossProfit,quarterlyOperatingIncome,quarterlyPretaxIncome,quarterlyNetIncome',
                'period1': '1609459200',
                'period2': str(int(time.time()) + 86400),
            }
            ts_resp = await asyncio.to_thread(lambda: session.get(ts_url, params=ts_params, timeout=15))
            if ts_resp.status_code == 200:
                ts_by_type = {}
                for item in ts_resp.json().get('timeseries', {}).get('result', []):
                    t = item.get('meta', {}).get('type', [''])[0]
                    ts_by_type[t] = item.get(t, [])

                rev_list  = ts_by_type.get('quarterlyTotalRevenue',    [])[-4:]
                gp_list   = ts_by_type.get('quarterlyGrossProfit',     [])[-4:]
                oi_list   = ts_by_type.get('quarterlyOperatingIncome', [])[-4:]
                pt_list   = ts_by_type.get('quarterlyPretaxIncome',    [])[-4:]
                ni_list   = ts_by_type.get('quarterlyNetIncome',       [])[-4:]

                def get_val(lst, i):
                    if i < len(lst):
                        v = lst[i].get('reportedValue', {})
                        return safe(v.get('raw') if isinstance(v, dict) else v)
                    return None

                for i, rev in enumerate(rev_list):
                    period = rev.get('asOfDate', '')
                    try:
                        from datetime import datetime as _dt
                        d = _dt.strptime(period, '%Y-%m-%d')
                        period_label = f"Q{(d.month - 1) // 3 + 1} {d.year}"
                    except:
                        period_label = period
                    income.append({
                        "period":          period_label,
                        "revenue":         get_val(rev_list, i),
                        "grossProfit":     get_val(gp_list, i),
                        "operatingIncome": get_val(oi_list, i),
                        "pretaxIncome":    get_val(pt_list, i),
                        "netIncome":       get_val(ni_list, i),
                    })
        except Exception as e:
            print(f"⚠️ Error obteniendo income statement: {e}")

        # 4. Yahoo Scout — primer párrafo del análisis IA
        scout_summary = None
        if ai_analysis:
            try:
                ns_inner = ai_analysis.get('data', {}).get('news_summary', {}).get('news_summary', {})
                tldr = ns_inner.get('tldr') if isinstance(ns_inner, dict) else None
                if tldr:
                    clean = re.sub(r'\*\*([^*]+)\*\*', r'\1', tldr)
                    try:
                        scout_summary = await asyncio.to_thread(
                            lambda: GoogleTranslator(source='auto', target='es').translate(clean)
                        )
                    except Exception:
                        scout_summary = clean
            except:
                pass

        result = {
            "ticker":        ticker_symbol,
            "name":          company_full_name,
            "indicators":    indicators,
            "income":        income,
            "scout_summary": scout_summary,
        }

        _company_cache[cache_key] = (result, time.time())
        return result

    except Exception as e:
        print(f"❌ Error scraping Yahoo Finance para {ticker_symbol}: {e}")
        return None


@app.get("/api/tts")
async def text_to_speech(text: str, voice: str = "es-AR-ElenaNeural"):
    """Fallback: traduce texto al español y genera audio MP3 con voz neural argentina."""
    try:
        translated = await asyncio.to_thread(
            lambda: GoogleTranslator(source='auto', target='es').translate(text)
        )
        communicate = edge_tts.Communicate(text=translated, voice=voice, rate="+5%")
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
        audio_data = b"".join(audio_chunks)
        import io
        return StreamingResponse(io.BytesIO(audio_data), media_type="audio/mpeg",
                                 headers={"Cache-Control": "no-cache"})
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tts-company")
async def tts_company_summary(payload: dict):
    """Genera un resumen personalizado en español con Gemini Gemma 3 27B y lo convierte a voz."""
    try:
        from google import genai as google_genai

        ticker     = payload.get("ticker", "N/A")
        name       = payload.get("name", "N/A")
        ind        = payload.get("indicators", {})
        income     = payload.get("income", {})

        price       = ind.get("price")
        change_pct  = ind.get("change_pct")
        sector      = ind.get("sector", "N/A")
        market_cap  = ind.get("marketCap")
        trailing_pe = ind.get("trailingPE")
        forward_pe  = ind.get("forwardPE")
        beta        = ind.get("beta")
        roe         = ind.get("returnOnEquity")
        profit_m    = ind.get("profitMargins")
        debt_eq     = ind.get("debtToEquity")
        week52h     = ind.get("fiftyTwoWeekHigh")
        week52l     = ind.get("fiftyTwoWeekLow")
        div_yield   = ind.get("dividendYield")
        ev_ebitda   = ind.get("enterpriseToEbitda")

        def fmt(v, decimals=2):
            return round(v, decimals) if v is not None else "N/D"
        def fmt_pct(v):
            return f"{round(v*100, 2)}%" if v is not None else "N/D"
        def fmt_large(v):
            if v is None: return "N/D"
            if v >= 1e12: return f"{v/1e12:.2f}T"
            if v >= 1e9:  return f"{v/1e9:.2f}B"
            return f"{v/1e6:.0f}M"

        # Últimas filas de ingresos (income es una lista de dicts por período)
        last_income = income[-1] if isinstance(income, list) and income else {}
        last_rev = last_income.get("revenue")
        last_ni  = last_income.get("netIncome")

        prompt = f"""Sos un analista financiero de un panel LED de trading. Generá un resumen oral breve (máximo 5 oraciones) en de la siguiente acción, como si lo dijeras en vivo al público, pero sin ser muy informal. Sé directo, claro y natural. No uses emojis, listas ni formato markdown.

Acción: {ticker} — {name}
Sector: {sector}
Precio actual: ${fmt(price)} ({'+' if change_pct and change_pct>0 else ''}{fmt(change_pct)}% hoy)
Capitalización: {fmt_large(market_cap)}
P/E Trailing: {fmt(trailing_pe)} | P/E Forward: {fmt(forward_pe)}
Beta: {fmt(beta)}
ROE: {fmt_pct(roe)}
Margen neto: {fmt_pct(profit_m)}
Deuda/Capital: {fmt(debt_eq)}
Rango 52 semanas: ${fmt(week52l)} – ${fmt(week52h)}
EV/EBITDA: {fmt(ev_ebitda)}
Rendimiento dividendo: {fmt_pct(div_yield)}
Ingresos (últ. período): {fmt_large(last_rev)}
Beneficio neto (últ. período): {fmt_large(last_ni)}

Resumen oral:"""

        client = google_genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
        response = await asyncio.to_thread(
            lambda: client.models.generate_content(
                model="gemma-3-27b-it",
                contents=prompt
            )
        )
        summary_es = response.text.strip()
        print(f"🤖 Gemini summary: {summary_es[:120]}...")

        # Convertir a voz con Edge TTS
        communicate = edge_tts.Communicate(text=summary_es, voice="es-AR-ElenaNeural", rate="+5%")
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
        audio_data = b"".join(audio_chunks)

        import io
        return StreamingResponse(io.BytesIO(audio_data), media_type="audio/mpeg",
                                 headers={"Cache-Control": "no-cache"})

    except Exception as e:
        print(f"❌ Error en tts-company: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/whatsapp")
async def receive_whatsapp(Body: str = Form(None), From: str = Form(None)):
    global _ai_processing, _pending_ai_data, _pending_ai_ts
    print(f"\n--- 📥 NUEVO MENSAJE DE {From} ---")

    if not (Body and Body.strip()):
        return {"status": "ok"}

    # Evitar procesamiento concurrente (dos mensajes al mismo tiempo)
    if _ai_processing:
        print("⚠️ Ya hay un procesamiento en curso, ignorando mensaje duplicado")
        return {"status": "busy"}

    _ai_processing = True
    company_name = Body.strip()
    print(f"🔍 Buscando empresa: '{company_name}'")

    try:
        # 1. Notificar al Dashboard para activar animación de carga
        await manager.broadcast_command("START_AI_MODE")
        print("📡 Dashboard notificado: START_AI_MODE")

        # 2. Buscar datos financieros (con un reintento si falla)
        data = await fetch_company_data(company_name)
        if data is None:
            print("⚠️ Primer intento falló, reintentando en 3s...")
            await asyncio.sleep(3)
            data = await fetch_company_data(company_name)

        if data:
            print(f"✅ Datos obtenidos para {data['ticker']}, enviando al dashboard")
            _pending_ai_data = data
            _pending_ai_ts = time.time()
            await manager.broadcast_command("SHOW_COMPANY_DATA", data)
            print("📡 Dashboard notificado: SHOW_COMPANY_DATA")
            # Limpiar el pending después de 35s (coincide con el auto-dismiss del frontend)
            async def _clear_pending():
                await asyncio.sleep(35)
                global _pending_ai_data, _pending_ai_ts
                _pending_ai_data = None
                _pending_ai_ts = 0
            asyncio.create_task(_clear_pending())
        else:
            print("❌ No se pudo obtener datos tras dos intentos, cancelando AI mode")
            await asyncio.sleep(1)
            await manager.broadcast_command("STOP_AI_MODE")
            print("📡 Dashboard notificado: STOP_AI_MODE (empresa no encontrada)")
    finally:
        _ai_processing = False

    return {"status": "ok"}

@app.get("/api/chart/{ticker}")
def get_chart_data(ticker: str):
    try:
        # Download usando nuestro session patcheado implícitamente, y suppress errors to avoid crash
        data = yf.download(ticker, period="5d", interval="5m", ignore_tz=True, session=yf_session)
        
        if data.empty:
            print(f"⚠️ No hay datos para {ticker}")
            return []

        # Limpieza de MultiIndex (yfinance 2024-2026)
        # Si las columnas son tuplas (ej: ('Close', 'AAPL')), nos quedamos con el primer elemento
        data.columns = [col[0] if isinstance(col, tuple) else col for col in data.columns]
        
        # Calculamos las medias móviles sobre la columna Close
        data['SMA20'] = data['Close'].rolling(window=20).mean()
        data['SMA50'] = data['Close'].rolling(window=50).mean()
        
        # Convertimos el índice (Datetime) a una columna para iterar
        data = data.reset_index()
        
        # Identificamos la columna de tiempo (puede ser 'Datetime' o 'Date')
        time_col = 'Datetime' if 'Datetime' in data.columns else 'Date'
        
        # Filtramos solo los datos del último día de trading
        last_date = data[time_col].dt.date.iloc[-1]
        data_today = data[data[time_col].dt.date == last_date]
        
        # Construimos la lista con price, volume, sma20, sma50
        import math as _math
        chart_data = []
        for _, row in data_today.iterrows():
            sma20_val = float(row['SMA20']) if not _math.isnan(row['SMA20']) else None
            sma50_val = float(row['SMA50']) if not _math.isnan(row['SMA50']) else None
            chart_data.append({
                "time": int(row[time_col].timestamp() * 1000),
                "value": float(row['Close']),
                "volume": int(row['Volume']),
                "sma20": sma20_val,
                "sma50": sma50_val,
            })
        
        print(f"✅ {ticker}: {len(chart_data)} puntos enviados (con SMA20/SMA50/Volume).")
        return chart_data

    except Exception as e:
        print(f"❌ Error en Chart API: {e}")
        return []

# 2. Endpoint para Precios en Vivo (Widget 2)
@app.get("/api/prices")
async def get_prices():
    tickers = [
        "GLD", "SLV", "COPX", "USO", "URA",
        "EEM", "XLV", "XLB", "EWZ", "EWJ",
        "^GSPC", "^DJI", "^IXIC", "^RUT", "^MERV"
    ]
    
    # Ya no se hace polling inicial aquí, data912_refresh_loop llenará ROFEX_STATE.
    # Si alguna vez está vacío se mandan valores 0 o vacíos.
            
    # Disparamos todas las consultas en paralelo para el Ticker global
    tasks = [asyncio.to_thread(fetch_ticker_data, t) for t in tickers]
    global_results = await asyncio.gather(*tasks)
    
    # Devolvemos el estado actual local y global juntos
    return {
        "global": global_results,
        "rofex": ROFEX_STATE
    }

# 3. Endpoint para Heatmap (Widget 4 Alternativo)
_HEATMAP_TICKERS = {
    "commodities": ["CL=F", "GC=F", "SI=F", "HG=F", "ZS=F"],
    "indices": ["^GSPC", "^DJI", "^IXIC", "^VIX", "^MERV"],
}
_HEATMAP_NAME_MAP = {
    "CL=F": "PETRÓLEO WTI", "GC=F": "ORO", "SI=F": "PLATA", "HG=F": "COBRE", "ZS=F": "SOJA",
    "^GSPC": "S&P 500", "^DJI": "DOW JONES", "^IXIC": "NASDAQ", "^VIX": "VIX", "^MERV": "MERVAL"
}
_heatmap_cache = {"data": None, "ts": 0}
HEATMAP_CACHE_TTL = 30  # segundos


async def _refresh_heatmap_cache():
    def fetch_group(tickers):
        results = []
        for t in tickers:
            d = fetch_ticker_data(t)
            d['name'] = _HEATMAP_NAME_MAP.get(t, d['symbol'])
            results.append(d)
        return results

    comm_task = asyncio.to_thread(fetch_group, _HEATMAP_TICKERS["commodities"])
    idx_task = asyncio.to_thread(fetch_group, _HEATMAP_TICKERS["indices"])
    comm_results, idx_results = await asyncio.gather(comm_task, idx_task)
    _heatmap_cache["data"] = {"commodities": comm_results, "indices": idx_results}
    _heatmap_cache["ts"] = time.time()


async def heatmap_refresh_loop():
    """Mantiene el caché de market-heatmap actualizado cada 30s."""
    await _refresh_heatmap_cache()
    while True:
        await asyncio.sleep(HEATMAP_CACHE_TTL)
        await _refresh_heatmap_cache()


@app.get("/api/market-heatmap")
async def get_market_heatmap():
    if _heatmap_cache["data"] and time.time() - _heatmap_cache["ts"] < HEATMAP_CACHE_TTL:
        return _heatmap_cache["data"]
    await _refresh_heatmap_cache()
    return _heatmap_cache["data"]

# --- TOP MOVERS: caché de tickers scrapeados de Yahoo Finance ---
# Se actualiza cada 20 minutos vía background task
_movers_tickers = {"gainers": [], "losers": [], "last_scraped": 0}
TOP_MOVERS_REFRESH_INTERVAL = 20 * 60  # segundos

# Caché de la respuesta completa de top-movers (precios ya fetcheados)
_movers_response_cache = {"data": None, "ts": 0}
MOVERS_RESPONSE_CACHE_TTL = 180  # 3 minutos

async def scrape_movers_tickers():
    """Scrapea Yahoo Finance (screener API) para obtener top 5 gainers y losers del día.
    Actualiza el caché global _movers_tickers."""
    global _movers_tickers
    session = get_yahoo_session()

    def fetch_screener(scr_id):
        url = (
            f"https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved"
            f"?scrIds={scr_id}&formatted=false&count=5&lang=en-US&region=US"
        )
        try:
            resp = session.get(url, timeout=15)
            if resp.status_code == 200:
                quotes = (
                    resp.json()
                    .get("finance", {})
                    .get("result", [{}])[0]
                    .get("quotes", [])
                )
                return [q["symbol"] for q in quotes[:5] if q.get("symbol")]
            print(f"⚠️ Screener {scr_id} devolvió HTTP {resp.status_code}")
        except Exception as e:
            print(f"⚠️ Error screener {scr_id}: {e}")
        return []

    gainers, losers = await asyncio.gather(
        asyncio.to_thread(fetch_screener, "day_gainers"),
        asyncio.to_thread(fetch_screener, "day_losers"),
    )

    if gainers or losers:
        _movers_tickers = {"gainers": gainers, "losers": losers, "last_scraped": time.time()}
        print(f"✅ Top Movers actualizados — Gainers: {gainers} | Losers: {losers}")
    else:
        print("⚠️ Scraping de Top Movers sin resultados, se mantiene caché anterior")

async def _fetch_and_cache_movers():
    """Fetchea precios en vivo para los tickers cacheados y guarda la respuesta completa."""
    global _movers_response_cache
    gainers_syms = _movers_tickers["gainers"]
    losers_syms = _movers_tickers["losers"]
    if not gainers_syms and not losers_syms:
        return
    all_syms = gainers_syms + losers_syms
    tasks = [asyncio.to_thread(fetch_ticker_data, s) for s in all_syms]
    all_results = await asyncio.gather(*tasks)
    _movers_response_cache = {
        "data": {
            "gainers": list(all_results[:len(gainers_syms)]),
            "losers": list(all_results[len(gainers_syms):]),
        },
        "ts": time.time(),
    }


async def movers_refresh_loop():
    """Background task: refresca los tickers de Top Movers cada 20 minutos
    y pre-cachea la respuesta completa cada 3 minutos."""
    await scrape_movers_tickers()
    await _fetch_and_cache_movers()
    while True:
        # Refrescar precios cada 3 minutos
        for _ in range(int(TOP_MOVERS_REFRESH_INTERVAL / MOVERS_RESPONSE_CACHE_TTL)):
            await asyncio.sleep(MOVERS_RESPONSE_CACHE_TTL)
            await _fetch_and_cache_movers()
        # Refrescar la lista de tickers cada 20 minutos
        await scrape_movers_tickers()
        await _fetch_and_cache_movers()


@app.get("/api/top-movers")
async def get_top_movers():
    global _movers_response_cache
    # Responder desde caché si está fresco
    if _movers_response_cache["data"] and time.time() - _movers_response_cache["ts"] < MOVERS_RESPONSE_CACHE_TTL:
        return _movers_response_cache["data"]

    # Caché vencido o vacío: fetchear ahora y guardar
    gainers_syms = _movers_tickers["gainers"]
    losers_syms = _movers_tickers["losers"]
    if not gainers_syms and not losers_syms:
        await scrape_movers_tickers()
        gainers_syms = _movers_tickers["gainers"]
        losers_syms = _movers_tickers["losers"]
    if not gainers_syms and not losers_syms:
        return {"gainers": [], "losers": []}

    await _fetch_and_cache_movers()
    return _movers_response_cache["data"]


async def scrape_econ_calendar():
    """Scrapea investing.com para obtener los eventos económicos importantes del día.
    Filtra por: EE.UU., Eurozona, Japón, China, Brasil y Argentina.
    El resultado se cachea y sólo se refresca una vez por día."""
    global _econ_calendar
    today_str = now_ar().strftime("%Y-%m-%d")
    if _econ_calendar["date"] == today_str and _econ_calendar["events"]:
        return  # Ya tenemos datos del día de hoy

    # IDs de país en investing.com: US=5, EuroZone=72, JP=35, CN=37, BR=32, AR=29
    COUNTRY_IDS = ["5", "72", "35", "37", "32", "29"]

    def do_scrape():
        session = cffi_requests.Session(impersonate="chrome124")
        session.headers.update({
            "Accept": "text/plain, */*; q=0.01",
            "Accept-Language": "en-US,en;q=0.9",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://www.investing.com/economic-calendar/",
            "Origin": "https://www.investing.com",
        })

        # Visitar la página principal para obtener cookies de sesión
        try:
            session.get("https://www.investing.com/economic-calendar/", timeout=15)
        except Exception:
            pass

        # Pedimos la semana completa y luego filtramos client-side por fecha local.
        # Así evitamos el problema de timezone del servidor (con currentTab=today
        # el servidor resuelve "hoy" según su propio timezone y puede devolver ayer).
        post_data = [("country[]", cid) for cid in COUNTRY_IDS]
        post_data += [
            ("currentTab", "thisWeek"),
            ("limit_from", "0"),
        ]

        resp = session.post(
            "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData",
            data=post_data,
            timeout=20,
        )

        if resp.status_code != 200:
            print(f"[WARN] investing.com HTTP {resp.status_code}")
            return None

        try:
            html_data = resp.json().get("data", "")
        except Exception:
            html_data = resp.text

        soup = BeautifulSoup(html_data, "html.parser")
        events = []

        # Prefijo de fecha en el formato que usa investing.com en data-event-datetime
        today_prefix = now_ar().strftime("%Y/%m/%d")

        for row in soup.find_all("tr", class_="js-event-item"):
            # Filtrar solo eventos del día de hoy según la fecha local del servidor
            if not row.get("data-event-datetime", "").startswith(today_prefix):
                continue
            try:
                time_el      = row.find("td", class_="time")
                country_el   = row.find("td", class_="flagCur")
                sentiment_el = row.find("td", class_="sentiment")
                event_el     = row.find("td", class_="event")
                actual_el    = row.find("td", class_="actual")
                forecast_el  = row.find("td", class_="forecast")
                prev_el      = row.find("td", class_="prev")

                # Nombre del evento (prioridad: <a> dentro de la celda)
                if event_el:
                    a_tag = event_el.find("a")
                    event_name = (a_tag.text if a_tag else event_el.text).strip()
                else:
                    event_name = ""
                if not event_name:
                    continue

                # País desde el atributo title del span de bandera
                country_name = ""
                if country_el:
                    span = country_el.find("span")
                    if span:
                        country_name = span.get("title", "").strip()

                # Impacto: cantidad de íconos de toro rellenos
                impact = 0
                if sentiment_el:
                    all_icons = sentiment_el.find_all("i")
                    impact = sum(
                        1 for ic in all_icons
                        if "grayFullBullishIcon" in (ic.get("class") or [])
                    )

                events.append({
                    "time":     time_el.text.strip() if time_el else "",
                    "country":  country_name,
                    "event":    event_name,
                    "impact":   impact,
                    "actual":   actual_el.text.strip() if actual_el else "",
                    "forecast": forecast_el.text.strip() if forecast_el else "",
                    "prev":     prev_el.text.strip() if prev_el else "",
                })
            except Exception:
                continue

        # Ordenar: mayor impacto primero, luego por hora
        events.sort(key=lambda e: (-e["impact"], e.get("time", "")))
        print(f"[OK] Calendario economico: {len(events)} eventos para {today_str}")
        return events

    try:
        events = await asyncio.to_thread(do_scrape)
        if events is not None:
            _econ_calendar = {"events": events, "date": today_str}
        else:
            _econ_calendar = {"events": [], "date": today_str}
    except Exception as e:
        print(f"❌ Error scrapeando investing.com: {e}")
        _econ_calendar = {"events": [], "date": today_str}


async def econ_calendar_refresh_loop():
    """Background task: scrape una vez al día, revisando cada hora si cambió la fecha."""
    await scrape_econ_calendar()
    while True:
        await asyncio.sleep(3600)  # revisa cada hora
        await scrape_econ_calendar()


@app.get("/api/econ-calendar")
async def get_econ_calendar():
    if not _econ_calendar["date"]:
        await scrape_econ_calendar()
    return {"events": _econ_calendar["events"], "date": _econ_calendar["date"]}


@app.get("/api/econ-calendar/refresh")
async def force_econ_calendar_refresh():
    """Fuerza un re-scrape ignorando el caché (útil para debug)."""
    global _econ_calendar
    _econ_calendar = {"events": [], "date": None}
    await scrape_econ_calendar()
    return {"ok": True, "events": len(_econ_calendar["events"]), "date": _econ_calendar["date"]}


# --- YAHOO SCOUT WIDGET ENDPOINT ---
@app.get("/api/scout/{ticker}")
async def get_scout_data(ticker: str):
    data = await fetch_company_data(ticker)
    
    if data:
        return {
            "ticker": data.get("ticker", ticker),
            "name": data.get("name", ticker),
            "summary": data.get("scout_summary")
        }
    
    return {"error": "No data found"}


def _translate_headline(text: str) -> str:
    """Traduce un titular al español. Devuelve el original si falla."""
    try:
        return GoogleTranslator(source='auto', target='es').translate(text)
    except Exception as e:
        print(f"⚠️ Error traduciendo titular: {e}")
        return text

@app.get("/api/market-news")
def get_latest_scraping():
    global NEWS_STACK
    url = "https://finance.yahoo.com/topic/latest-news/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        res = requests.get(url, headers=headers)
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # 1. Obtenemos TODOS los items del stream disponibles en el HTML
        articles = soup.find_all('li', class_='stream-item')
        
        new_entries = []
        
        for art in articles:
            # Cortamos cuando tengamos exactamente 8 noticias VÁLIDAS
            if len(new_entries) >= 8:
                break
                
            try:
                title_tag = art.find('h3')
                if not title_tag: continue
                headline_raw = title_tag.text.strip()
                headline_en = headline_raw.upper()  # clave de cache (inglés)

                # --- LÓGICA DE CACHÉ DE TIEMPO ---
                pub_div = art.find('div', class_='publishing yf-bmkwve')
                if pub_div:
                    parts = list(pub_div.stripped_strings)
                    source = parts[0].upper() if len(parts) > 0 else "YF"
                    rel_time = parts[-1] if len(parts) > 1 else "0m ago"
                else:
                    source, rel_time = "YF", "0m ago"

                # Filtro de fuentes
                if source in ('STOCKSTORY', 'ASSOCIATED PRESS FINANCE', 'YAHOO PERSONAL FINANCE'):
                    continue

                # Buscamos si la noticia YA está en nuestro STACK (por titular en inglés)
                existing_news = next((news for news in NEWS_STACK if news.get('headline_en', news['headline']) == headline_en), None)

                if existing_news:
                    # Si ya la tenemos, usamos la versión que ya está en memoria
                    # Esto mantiene el "time" original y la traducción ya hecha
                    new_entries.append(existing_news)
                else:
                    # SI ES NUEVA: traducir al español y calcular tiempo
                    ticker_span = art.find('span', class_='symbol yf-1pdfbgz')
                    ticker = ticker_span.text.strip().replace("^", "") if ticker_span else "MKT"

                    headline_es = _translate_headline(headline_raw).upper()
                    display_time, timestamp = parse_relative_time(rel_time)
                    new_entries.append({
                        "headline_en": headline_en,  # inglés original (para cache matching)
                        "headline": headline_es,     # español (para mostrar en el widget)
                        "date": now_ar().strftime("%d/%m/%y"),
                        "time": display_time,
                        "timestamp": timestamp,
                        "ticker": ticker,
                        "source": source
                    })
            except Exception as e:
                print(f"Error procesando artículo: {e}")
                continue

        # 2. Ordenamos de más antiguo a más reciente por timestamp unix (evita bugs al cruzar medianoche)
        new_entries.sort(key=lambda x: x.get("timestamp", 0))

        # 3. Actualizamos el STACK global
        NEWS_STACK = new_entries
        
        return NEWS_STACK

    except Exception as e:
        print(f"Error General Scrape: {e}")
        return NEWS_STACK

@app.get("/test-ai")
async def test_ai_trigger():
    await manager.broadcast_command("START_AI_MODE")
    # Datos de prueba con Microsoft
    test_data = await fetch_company_data("Microsoft")
    if test_data:
        await manager.broadcast_command("SHOW_COMPANY_DATA", test_data)
    return {"status": "Comando enviado al LED"}

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)