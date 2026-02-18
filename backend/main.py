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
from google import genai
from google.genai import types
import edge_tts
from fastapi.staticfiles import StaticFiles

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

# Lista de activos para el Ticker (Widget 2)
TICKERS_TICKER = [
        "GLD", "SLV", "COPX", "USO", "URA",
        "EEM", "XLV", "XLB", "EWZ", "EWJ",
        "^GSPC", "^DJI", "^IXIC", "^RUT", "^MERV"
        ]

# Poné tus credenciales de Twilio acá arriba
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000")

async def download_audio(url: str, filename: str):
    """Descarga el audio de Twilio siguiendo las redirecciones necesarias."""
    # Agregamos follow_redirects=True para que pase del 307 al archivo final
    async with httpx.AsyncClient(follow_redirects=True) as http_client: 
        resp = await http_client.get(url, auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN))
        
        if resp.status_code == 200:
            with open(filename, "wb") as f:
                f.write(resp.content)
            return True
        else:
            print(f"❌ Error de Twilio: {resp.status_code} - {resp.text}")
            return False

def get_asset_data(ticker: str):
    """Consulta métricas técnicas y precio de un activo financiero."""
    print(f"🔍 [TOOL CALL] Consultando yfinance para: {ticker}") # Agregá esto
    try:
        # Forzamos a que si pide BTC, use BTC-USD que es lo que entiende yfinance
        if ticker.upper() == "BTC": ticker = "BTC-USD"
        
        asset = yf.Ticker(ticker)
        data = asset.info
        return {
            "symbol": ticker,
            "price": data.get("currentPrice", data.get("regularMarketPrice", "N/A")),
            "beta": data.get("beta", "N/A"),
            "change": f"{data.get('regularMarketChangePercent', 0):.2f}%"
        }
    except Exception as e:
        print(f"❌ Error en la herramienta: {e}")
        return {"error": "No se encontraron datos."}

def get_market_summary():
    """Devuelve los titulares de noticias más recientes del mercado."""
    # Usamos el stack que ya tenés funcionando en el Widget 3.
    return {"headlines": [news['headline'] for news in NEWS_STACK[:5]]}

client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))
AI_MODEL = "gemini-2.5-flash"
tools_config = [
    get_asset_data,     # Obtiene precios y betas (yfinance)
    get_market_summary  # Obtiene noticias (nuestro cache enriquecido)
]

if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")

async def generate_speech(text, filename="static/response.mp3"):
    """Convierte texto a audio con voz de analista senior."""
    # 'es-AR-ElenaNeural' da un tono profesional rioplatense perfecto para la UADE
    output_path = "static/response.mp3"
    communicate = edge_tts.Communicate(text, "es-AR-ElenaNeural")
    await communicate.save(filename)
    return filename

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

@app.post("/whatsapp")
async def receive_whatsapp(MediaUrl0: str = Form(None), From: str = Form(None)):
    print(f"\n--- 📥 NUEVO MENSAJE DE {From} ---")
    
    if MediaUrl0:
        audio_filename = f"input_{From}.ogg"
        print(f"🔗 URL del audio: {MediaUrl0}")
        
        # 1. Notificar al Dashboard
        await manager.broadcast_command("START_AI_MODE")
        print("📡 Dashboard notificado: START_AI_MODE")
        
        # 2. Descarga
        print("⏳ Descargando audio...")
        if await download_audio(MediaUrl0, audio_filename):
            print(f"✅ Audio descargado: {audio_filename}")
            
            try:
                # 3. Gemini procesa el audio
                print(f"🧠 Enviando a {AI_MODEL}...")
                with open(audio_filename, "rb") as f:
                    audio_data = f.read()
                    
                    response = client.models.generate_content(
                        model=AI_MODEL, # Flash para mínima latencia
                        contents=[
                            """Actúa como un analista del FinLab UADE. 
                            REGLA DE ORO: No inventes precios ni datos técnicos. 
                            Si te preguntan por un activo, USÁ SIEMPRE la herramienta 'get_asset_data'. 
                            Si la herramienta falla, decí que no tenés el dato en tiempo real.
                            Si te preguntan por el estado general del mercado, el sentimiento o 'qué está pasando', usá 'get_market_summary'.
                            REGLA: No te limites a leer los titulares. Analizá la tendencia general (si es alcista, bajista o de cautela) y respondé de forma profesional y breve.""",
                            types.Part.from_bytes(data=audio_data, mime_type='audio/ogg')
                        ],
                        config=types.GenerateContentConfig(
                            tools=tools_config,
                            # CAMBIO AQUÍ: Usamos 'disable=False' en lugar de 'enabled=True'
                            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=False)
                        )
                    )
                
                # 4. Verificar respuesta
                final_text = response.text if response.text else "La IA no generó texto (posible tool call interna)."
                print(f"🤖 IA Responde: {final_text}")

                # A. Generamos el audio de la respuesta
                print("🎙️ Generando voz...")
                audio_path = await generate_speech(final_text)
                await asyncio.sleep(0.5)
                await manager.broadcast_command("AI_RESPONSE_TEXT", {"text": final_text})
                audio_url = f"https://uade-led-backend.onrender.com/static/response.mp3?t={int(datetime.now().timestamp())}"
                await manager.broadcast_command("PLAY_AUDIO", {"url": audio_url})
                
                await manager.broadcast_command("AI_RESPONSE_TEXT", {"text": final_text})
                print("📡 Dashboard notificado: AI_RESPONSE_TEXT")
                
            except Exception as e:
                print(f"❌ Error en Gemini: {str(e)}")
            finally:
                if os.path.exists(audio_filename):
                    os.remove(audio_filename)
                    print("🧹 Archivo temporal borrado.")
        else:
            print("❌ Falló la descarga del audio. ¿La URL es accesible?")
            
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
    
    # Disparamos todas las consultas en paralelo
    tasks = [asyncio.to_thread(fetch_ticker_data, t) for t in tickers]
    results = await asyncio.gather(*tasks)
    
    return results

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
        
        # 1. Capturamos los 7 más recientes de la web
        articles = soup.find_all('li', class_='stream-item')[:8]
        
        new_entries = []
        
        for art in articles:
            try:
                title_tag = art.find('h3')
                if not title_tag: continue
                headline = title_tag.text.strip().upper()
                
                # --- LÓGICA DE CACHÉ DE TIEMPO ---
                # Buscamos si la noticia YA está en nuestro STACK actual
                existing_news = next((news for news in NEWS_STACK if news['headline'] == headline), None)
                
                if existing_news:
                    # Si ya la tenemos, usamos la versión que ya está en memoria
                    # Esto mantiene el "time" original que calculamos la primera vez
                    new_entries.append(existing_news)
                else:
                    # SI ES NUEVA: Recién acá calculamos todo
                    pub_div = art.find('div', class_='publishing yf-bmkwve')
                    if pub_div:
                        parts = list(pub_div.stripped_strings)
                        source = parts[0].upper() if len(parts) > 0 else "YF"
                        rel_time = parts[-1] if len(parts) > 1 else "0m ago"
                    else:
                        source, rel_time = "YF", "0m ago"

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

        # 2. Actualizamos el STACK global
        # Mantenemos el orden de lo último detectado arriba
        NEWS_STACK = new_entries
        
        return NEWS_STACK

    except Exception as e:
        print(f"Error General Scrape: {e}")
        return NEWS_STACK

@app.get("/test-ai")
async def test_ai_trigger():
    # Simulamos que algo activó la IA
    await manager.broadcast_command("START_AI_MODE")
    return {"status": "Comando enviado al LED"}

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)