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
    """Convierte '25m ago' o '1h ago' en un HH:MM:SS real"""
    now = datetime.now()
    try:
        # Limpieza básica del string
        clean_str = relative_str.lower().replace('ago', '').strip()
        if 'm' in clean_str:
            mins = int(clean_str.split('m')[0])
            dt = now - timedelta(minutes=mins)
        elif 'h' in clean_str:
            hrs = int(clean_str.split('h')[0])
            dt = now - timedelta(hours=hrs)
        else:
            dt = now
        return dt.strftime("%H:%M:%S")
    except:
        return now.strftime("%H:%M:%S")

async def fetch_company_data(company_name: str):
    """Busca una empresa por nombre y obtiene sus datos financieros con yfinance."""
    
    # 1. Resolver el ticker via Yahoo Finance search API
    search_url = f"https://query2.finance.yahoo.com/v1/finance/search?q={company_name}&quotesCount=5&newsCount=0"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    
    ticker_symbol = None
    company_full_name = company_name
    
    async with httpx.AsyncClient(verify=False) as http_client:
        try:
            resp = await http_client.get(search_url, headers=headers)
            if resp.status_code == 200:
                result = resp.json()
                for quote in result.get("quotes", []):
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
    
    # 2. Obtener datos con yfinance
    try:
        ticker_obj = yf.Ticker(ticker_symbol)
        info = ticker_obj.info
        
        def safe(val):
            try:
                if val is None: return None
                if isinstance(val, float) and math.isnan(val): return None
                return val
            except:
                return None
        
        indicators = {
            "price":             safe(info.get("currentPrice") or info.get("regularMarketPrice")),
            "change_pct":        safe(info.get("regularMarketChangePercent")),
            "marketCap":         safe(info.get("marketCap")),
            "trailingPE":        safe(info.get("trailingPE")),
            "forwardPE":         safe(info.get("forwardPE")),
            "trailingEps":       safe(info.get("trailingEps")),
            "beta":              safe(info.get("beta")),
            "fiftyTwoWeekHigh":  safe(info.get("fiftyTwoWeekHigh")),
            "fiftyTwoWeekLow":   safe(info.get("fiftyTwoWeekLow")),
            "grossMargins":      safe(info.get("grossMargins")),
            "operatingMargins":  safe(info.get("operatingMargins")),
            "profitMargins":     safe(info.get("profitMargins")),
            "debtToEquity":      safe(info.get("debtToEquity")),
            "returnOnEquity":    safe(info.get("returnOnEquity")),
            "returnOnAssets":    safe(info.get("returnOnAssets")),
            "sector":            info.get("sector"),
            "exchange":          info.get("exchange"),
        }
        
        # 3. Income statement trimestral (ultimos 4 trimestres)
        income = []
        try:
            stmt = await asyncio.to_thread(lambda: ticker_obj.quarterly_income_stmt)
            if stmt is not None and not stmt.empty:
                row_map = {
                    "Total Revenue":    "revenue",
                    "Gross Profit":     "grossProfit",
                    "Operating Income": "operatingIncome",
                    "Pretax Income":    "pretaxIncome",
                    "Net Income":       "netIncome",
                }
                for col in stmt.columns[:4]:
                    period_label = col.strftime("%b %Y") if hasattr(col, "strftime") else str(col)
                    period_data = {"period": period_label}
                    for src_key, dst_key in row_map.items():
                        if src_key in stmt.index:
                            try:
                                val = float(stmt.loc[src_key, col])
                                period_data[dst_key] = None if math.isnan(val) else val
                            except:
                                period_data[dst_key] = None
                        else:
                            period_data[dst_key] = None
                    income.append(period_data)
        except Exception as e:
            print(f"⚠️ Error obteniendo income statement: {e}")
        
        return {
            "ticker": ticker_symbol,
            "name":   company_full_name,
            "indicators": indicators,
            "income": income,
        }
    
    except Exception as e:
        print(f"❌ Error yfinance para {ticker_symbol}: {e}")
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
                    new_entries.append({
                        "headline": headline,
                        "date": datetime.now().strftime("%d/%m/%y"),
                        "time": parse_relative_time(rel_time), # Solo se calcula una vez
                        "ticker": ticker,
                        "source": source
                    })
            except Exception as e:
                print(f"Error procesando artículo: {e}")
                continue

        # 2. Ordenamos cronológicamente (de más antiguo a más reciente) para la rotación del frontend
        # Asumiendo formato "HH:MM:SS"
        new_entries.sort(key=lambda x: datetime.strptime(x["time"], "%H:%M:%S"), reverse=True)

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