from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import datetime
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
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
import pyRofex
import ssl

# Bypass para el error de certificados SSL en entornos locales de Windows
ssl._create_default_https_context = ssl._create_unverified_context

# --- INICIALIZACIÓN DE ROFEX ---
try:
    pyRofex.initialize(
        user=os.environ.get("PYROFEX_USER"),
        password=os.environ.get("PYROFEX_PASSWORD"),
        account=os.environ.get("PYROFEX_ACCOUNT"),
        environment=pyRofex.Environment.REMARKET
    )
    print("✅ PyRofex Inicializado correctamente en REMARKET")
except Exception as e:
    print(f"❌ Error al inicializar PyRofex: {e}")

# Estado global para guardar el último precio de ROFEX
# Se inicializa de forma dinámica al pedir precios
ROFEX_STATE = {}

def get_rofex_initial_price(symbol: str):
    """Obtiene el último precio operado o de ajuste (cierre) desde la API REST de Rofex"""
    # Excluímos cauciones que no estén en formato de ticker válido
    if "PESOS" in symbol or "DOLARES" in symbol:
        return 0.0
        
    try:
        entries = [
            pyRofex.MarketDataEntry.LAST, 
            pyRofex.MarketDataEntry.SETTLEMENT_PRICE,
            pyRofex.MarketDataEntry.CLOSING_PRICE
        ]
        resp = pyRofex.get_market_data(ticker=symbol, entries=entries)
        if resp and resp.get("status") == "OK" and "marketData" in resp:
            md = resp["marketData"]
            
            # Prioridad 1: Último precio operado
            if md.get("LA") and md["LA"].get("price"):
                return md["LA"]["price"]
            
            # Prioridad 2: Precio de Ajuste (Settlement) - Muy común al Cierre/Fin de Semana
            if md.get("SE") and md["SE"].get("price"):
                return md["SE"]["price"]
                
            # Prioridad 3: Precio de Cierre
            if md.get("CL") and md["CL"].get("price"):
                return md["CL"]["price"]
                
    except Exception as e:
        print(f"⚠️ Error obteniendo precio base REST para {symbol}: {e}")
        
    return None

def market_data_handler(message):
    """Callback que pyRofex llama cada vez que llega un nuevo precio/punta por WS"""
    try:
        if message["type"] == "Md":
            data = message["marketData"]
            symbol = message["instrumentId"]["symbol"]
            
            # Buscamos el Last (precio operado) o Bids/Offers si es caución
            last_price = None
            if "LA" in data and data["LA"]:
                last_price = data["LA"]["price"]
            elif "BI" in data and data["BI"]:
                # Puntas compradora para cauciones
                last_price = data["BI"][0]["price"]
            
            if last_price is not None:
                ROFEX_STATE[symbol] = last_price
                print(f"📊 [Rofex WS] {symbol}: {last_price}")
                
                # Emitir al frontend usando el loop de asyncio de FastAPI
                if hasattr(app, "state") and hasattr(app.state, "loop"):
                    asyncio.run_coroutine_threadsafe(
                        manager.broadcast_command("ROFEX_UPDATE", {
                            "symbol": symbol,
                            "price": last_price
                        }),
                        app.state.loop
                    )
    except Exception as e:
        print(f"⚠️ Error en market_data_handler: {e}")

def error_handler(message):
    print(f"❌ Error pyRofex WS: {message}")

def exception_handler(e):
    print(f"❌ Excepción pyRofex WS: {e}")

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

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast_command(self, command: str, payload: dict = None):
        """Envía una orden a todos los dashboards conectados"""
        message = {"command": command, "payload": payload or {}}
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

# --- ENDPOINT DEL WEBSOCKET ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Mantenemos la conexión abierta escuchando (aunque no manden nada)
            data = await websocket.receive_text()
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

# Lista de activos argentinos a escuchar vía PyRofex
ROFEX_INSTRUMENTS = [
    # Futuros Dolar
    "DLR/FEB26", "DLR/MAR26", "DLR/ABR26", "DLR/MAY26", "DLR/JUN26",
    "DLR/JUL26", "DLR/AGO26", "DLR/SEP26",
    # Cauciones
    "PESOS - 1D", "PESOS - 3D", "PESOS - 7D", "PESOS - 30D",
    "DOLARES - 1D", "DOLARES - 3D", "DOLARES - 7D", "DOLARES - 30D",
    # Acciones Spot (BYMA CEDEARS/LIDERES vía RFX en Remarket)
    "BMA - 48hs", "BYMA - 48hs", "CEPU - 48hs", "GGAL - 48hs", 
    "PAMP - 48hs", "YPFD - 48hs", "TECO2 - 48hs", "LOMA - 48hs"
]

@app.on_event("startup")
async def startup_event():
    # Guardamos el loop para que pyRofex pueda encolar corrutinas (broadcast)
    app.state.loop = asyncio.get_running_loop()
    
    # Iniciar WebSocket de PyRofex
    try:
        pyRofex.init_websocket_connection(
            market_data_handler=market_data_handler,
            error_handler=error_handler,
            exception_handler=exception_handler
        )
        # Nos suscribimos a Last (LA), Bids (BI) y Offers (OF)
        entries = [pyRofex.MarketDataEntry.BIDS, pyRofex.MarketDataEntry.OFFERS, pyRofex.MarketDataEntry.LAST]
        pyRofex.market_data_subscription(tickers=ROFEX_INSTRUMENTS, entries=entries)
        print("✅ Suscrito a WS MarketData de Rofex:", ROFEX_INSTRUMENTS)
    except Exception as e:
        print(f"❌ Fallo al conectar WS Rofex: {e}")

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
COMPANY_CACHE_TTL = 600  # 10 minutos

def fetch_ticker_data(t):
    try:
        asset = yf.Ticker(t)
        hist = asset.history(period="2d")
        if len(hist) < 2:
            price = asset.info.get('regularMarketPrice', 0)
            change = 0.0
        else:
            last_close = hist['Close'].iloc[-2]
            current_price = hist['Close'].iloc[-1]
            price = current_price
            change = ((current_price - last_close) / last_close) * 100
        
        return {
            "symbol": t.replace("^", ""), 
            "price": f"{price:.2f}",
            "change": f"{change:+.2f}"
        }
    except:
        return {"symbol": t.replace("^", ""), "price": "0.00", "change": "0.00"}

def parse_relative_time(relative_str):
    """
    Convierte strings relativos de Yahoo Finance ('58m ago', '1h ago', '2d ago')
    en un HH:MM para mostrar y un unix timestamp para ordenar correctamente.
    Retorna: (display_time: str, timestamp: int)
    """
    now = datetime.now()
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
                    scout_summary = re.sub(r'\*\*([^*]+)\*\*', r'\1', tldr)
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

@app.post("/whatsapp")
async def receive_whatsapp(Body: str = Form(None), From: str = Form(None)):
    print(f"\n--- 📥 NUEVO MENSAJE DE {From} ---")
    
    if Body and Body.strip():
        company_name = Body.strip()
        print(f"🔍 Buscando empresa: '{company_name}'")
        
        # 1. Notificar al Dashboard para activar animacion
        await manager.broadcast_command("START_AI_MODE")
        print("📡 Dashboard notificado: START_AI_MODE")
        
        # 2. Buscar y obtener datos financieros
        data = await fetch_company_data(company_name)
        
        if data:
            print(f"✅ Datos obtenidos para {data['ticker']}, enviando al dashboard")
            await manager.broadcast_command("SHOW_COMPANY_DATA", data)
            print("📡 Dashboard notificado: SHOW_COMPANY_DATA")
        else:
            # Si no encontramos la empresa, cancelamos el modo AI
            await asyncio.sleep(2)
            await manager.broadcast_command("STOP_AI_MODE")
            print("📡 Dashboard notificado: STOP_AI_MODE (empresa no encontrada)")
    
    return {"status": "ok"}

@app.get("/api/chart/{ticker}")
def get_chart_data(ticker: str):
    try:
        # Pedimos 1 día con intervalo de 5m para tener una línea definida
        data = yf.download(ticker, period="1d", interval="5m")
        
        if data.empty:
            print(f"⚠️ No hay datos para {ticker}")
            return []

        # Limpieza de MultiIndex (yfinance 2024-2026)
        # Si las columnas son tuplas (ej: ('Close', 'AAPL')), nos quedamos con el primer elemento
        data.columns = [col[0] if isinstance(col, tuple) else col for col in data.columns]
        
        # Convertimos el índice (Datetime) a una columna para iterar
        data = data.reset_index()
        
        # Identificamos la columna de tiempo (puede ser 'Datetime' o 'Date')
        time_col = 'Datetime' if 'Datetime' in data.columns else 'Date'
        
        # Construimos la lista asegurando milisegundos (* 1000)
        chart_data = [
            {
                "time": int(row[time_col].timestamp() * 1000),
                "value": float(row['Close'])
            }
            for _, row in data.iterrows()
        ]
        
        print(f"✅ {ticker}: {len(chart_data)} puntos enviados.")
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
    
    # Rellenar ROFEX_STATE base de forma asíncrona si no están
    for symbol in ROFEX_INSTRUMENTS:
        if symbol not in ROFEX_STATE:
            # Para no bloquear el loop, lanzamos threads cortos por cada símbolo vacío
            price = await asyncio.to_thread(get_rofex_initial_price, symbol)
            ROFEX_STATE[symbol] = price
            
    # Disparamos todas las consultas en paralelo para el Ticker global
    tasks = [asyncio.to_thread(fetch_ticker_data, t) for t in tickers]
    global_results = await asyncio.gather(*tasks)
    
    # Devolvemos el estado actual local y global juntos
    return {
        "global": global_results,
        "rofex": ROFEX_STATE
    }

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
                headline = title_tag.text.strip().upper()
                
                # --- LÓGICA DE CACHÉ DE TIEMPO ---
                pub_div = art.find('div', class_='publishing yf-bmkwve')
                if pub_div:
                    parts = list(pub_div.stripped_strings)
                    source = parts[0].upper() if len(parts) > 0 else "YF"
                    rel_time = parts[-1] if len(parts) > 1 else "0m ago"
                else:
                    source, rel_time = "YF", "0m ago"
                    
                # Filtro de fuentes
                if source == 'STOCKSTORY' or source == 'ASSOCIATED PRESS FINANCE':
                    continue

                # Buscamos si la noticia YA está en nuestro STACK actual
                existing_news = next((news for news in NEWS_STACK if news['headline'] == headline), None)
                
                if existing_news:
                    # Si ya la tenemos, usamos la versión que ya está en memoria
                    # Esto mantiene el "time" original que calculamos la primera vez
                    new_entries.append(existing_news)
                else:
                    # SI ES NUEVA: Recién acá calculamos todo
                    ticker_span = art.find('span', class_='symbol yf-1pdfbgz')
                    ticker = ticker_span.text.strip().replace("^", "") if ticker_span else "MKT"

                    # Creamos la nueva entrada con el tiempo fijo "congelado"
                    display_time, timestamp = parse_relative_time(rel_time)
                    new_entries.append({
                        "headline": headline,
                        "date": datetime.now().strftime("%d/%m/%y"),
                        "time": display_time,       # HH:MM para mostrar
                        "timestamp": timestamp,     # Unix timestamp para ordenar
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