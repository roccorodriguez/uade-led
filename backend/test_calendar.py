"""
Test: thisWeek + filtro client-side por data-event-datetime
  python test_calendar.py
"""
import requests
from datetime import datetime
from bs4 import BeautifulSoup

COUNTRY_IDS = ["5", "72", "35", "37", "32", "29"]
today_prefix = datetime.now().strftime("%Y/%m/%d")
print(f"Filtrando por fecha local: {today_prefix}")

s = requests.Session()
s.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/plain, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.investing.com/economic-calendar/",
    "Origin": "https://www.investing.com",
})
s.get("https://www.investing.com/economic-calendar/", timeout=15)

post = [("country[]", cid) for cid in COUNTRY_IDS]
post += [("currentTab", "thisWeek"), ("limit_from", "0")]

r = s.post(
    "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData",
    data=post, timeout=20,
)
print(f"Status: {r.status_code}")
html_data = r.json().get("data", "")
soup = BeautifulSoup(html_data, "html.parser")

all_rows = soup.find_all("tr", class_="js-event-item")
print(f"Total eventos esta semana: {len(all_rows)}")

# Mostrar todos los días disponibles en la respuesta
day_headers = [td.text.strip() for td in soup.find_all("td", class_="theDay")]
print(f"Dias disponibles: {day_headers}")

# Filtrar solo hoy
today_events = []
for row in all_rows:
    dt_attr = row.get("data-event-datetime", "")
    if not dt_attr.startswith(today_prefix):
        continue
    ev_el = row.find("td", class_="event")
    t_el  = row.find("td", class_="time")
    ev_text = ""
    if ev_el:
        a = ev_el.find("a")
        ev_text = (a.text if a else ev_el.text).strip()
    if ev_text:
        today_events.append((t_el.text.strip() if t_el else "?", ev_text))

print(f"\nEventos para {today_prefix}: {len(today_events)}")
for t, ev in today_events:
    print(f"  {t:6s} | {ev[:55]}")
