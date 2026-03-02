import requests
from bs4 import BeautifulSoup
import re

def get_movers(url):
    s = requests.Session()
    s.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
    try:
        s.get("https://finance.yahoo.com/") # get cookies
        r = s.get(url, timeout=10)
        
        # Method 1: finding symbols in JSON state
        symbols = set()
        for script in BeautifulSoup(r.text, 'html.parser').find_all('script'):
            text = script.string or ''
            if 'symbol' in text and 'regularMarketPrice' in text:
                # regex to find symbols like "symbol":"AAPL"
                matches = re.findall(r'"symbol":"([^"]+)"', text)
                symbols.update(matches)
        
        # Print first few matches if any
        l = list(symbols)
        # remove common indices or garbage
        valid = [sym for sym in l if re.match(r'^[A-Z-]{1,5}$', sym)]
        print(f"URL: {url}")
        print(f"Found {len(valid)} valid symbols: {valid[:10]}")
    except Exception as e:
        print(f"Error scraping {url}: {e}")

get_movers("https://finance.yahoo.com/markets/stocks/gainers/")
get_movers("https://finance.yahoo.com/markets/stocks/losers/")
