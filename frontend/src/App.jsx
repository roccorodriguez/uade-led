import React, { useState, useEffect, useRef, useReducer } from 'react';
import Chart from 'react-apexcharts';
import { TrendingUp } from 'lucide-react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL;
const WS_BASE = import.meta.env.VITE_WS_URL;

const TICKERS_ROTATION = ["NVDA", "MSFT", "GOOG", "META", "TSLA", "AMZN", "AAPL"];

// --- WIDGET 3: PREMIUM NEWS FEED COMPONENT ---
const PremiumNewsFeed = ({ news, activeIdx }) => {
  if (!news || news.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center font-sans backdrop-blur-md bg-[#111111]/40">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-5 h-5 text-blue-500/50 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-white/40">Recopilando datos...</span>
        </div>
      </div>
    );
  }

  const activeNews = news[activeIdx] || news[0];

  return (
    <div className="w-full h-full relative overflow-hidden font-sans" style={{
      background: 'radial-gradient(ellipse at 40% 35%, #1a1a1a 0%, #0e0e0e 55%, #080808 100%)',
    }}>

      {/* Vignette — profundidad en los bordes */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{
        background: 'radial-gradient(ellipse at 55% 50%, transparent 30%, rgba(0,0,0,0.5) 100%)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.6)',
      }} />

      <AnimatePresence mode="wait">
        <motion.div
          key={activeNews.id || activeIdx}
          initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, filter: 'blur(5px)' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 px-6 py-4 flex flex-col justify-center z-20"
        >
          <div className="flex justify-between items-center mb-3">
            <span className="text-[9px] font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded-sm" style={{
              background: 'rgba(7,9,18,0.85)',
              border: '1px solid rgba(120,130,180,0.18)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
              color: 'rgba(180,180,200,0.85)',
            }}>
              {activeNews.source || 'MERCADOS GLOBALES'}
            </span>
            <span className="text-[10px] font-medium tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {activeNews.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <h3 className="text-[15px] font-medium leading-[1.5] tracking-wide line-clamp-3" style={{
            color: 'rgba(255,255,255,0.92)',
            textShadow: '0 1px 6px rgba(0,0,0,0.8)',
          }}>
            {activeNews.headline}
          </h3>
        </motion.div>
      </AnimatePresence>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 w-full h-[2px] z-20" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <motion.div
          key={`progress-${activeIdx}`}
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 6, ease: "linear" }}
          className="h-full"
          style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.3), rgba(255,255,255,0.6), rgba(255,255,255,0.3))' }}
        />
      </div>
    </div>
  );
};

// --- WIDGET 1: GRÁFICO DINÁMICO UADE — singleton compartido entre instancias clone/original ---
const _chartState = {
  series: [
    { name: 'NVDA', type: 'area', data: [] },
    { name: 'SMA 20', type: 'line', data: [] },
    { name: 'SMA 50', type: 'line', data: [] },
  ],
  scalesOpacity: 0,
  lineClip: 0,
  priceInfo: null,
};
const _chartSubs = new Set();
const _chartUpdate = (patch) => { Object.assign(_chartState, patch); _chartSubs.forEach(fn => fn()); };
let _chartMasterMounted = false;

const FinancialChart = ({ ticker, onCycleComplete }) => {
  const [, forceRender] = useReducer(n => n + 1, 0);
  const isMaster = useRef(false);

  // Suscribir esta instancia a los cambios del singleton
  useEffect(() => {
    _chartSubs.add(forceRender);
    if (!_chartMasterMounted) {
      _chartMasterMounted = true;
      isMaster.current = true;
    }
    return () => {
      _chartSubs.delete(forceRender);
      if (isMaster.current) { _chartMasterMounted = false; isMaster.current = false; }
    };
  }, []);

  // Solo el master fetcha datos y corre la animación
  useEffect(() => {
    if (!isMaster.current) return;

    let cancelled = false;
    const controller = new AbortController();

    const runSequence = async () => {
      _chartUpdate({
        scalesOpacity: 0, lineClip: 0, priceInfo: null,
        series: [
          { name: ticker, type: 'area', data: [] },
          { name: 'SMA 20', type: 'line', data: [] },
          { name: 'SMA 50', type: 'line', data: [] },
        ],
      });

      try {
        const fetchTimeout = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(`${API_BASE}/api/chart/${ticker}`, { signal: controller.signal });
        clearTimeout(fetchTimeout);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        if (data && data.length > 0) {
          const lastPrice = data[data.length - 1].value;
          const firstPrice = data[0].value;
          const pctChange = ((lastPrice - firstPrice) / firstPrice * 100);
          const lastSma20 = data.filter(d => d.sma20 != null).slice(-1)[0]?.sma20 || null;
          const lastSma50 = data.filter(d => d.sma50 != null).slice(-1)[0]?.sma50 || null;

          _chartUpdate({
            series: [
              { name: ticker, type: 'area', data: data.map(d => [d.time, d.value]) },
              { name: 'SMA 20', type: 'line', data: data.filter(d => d.sma20 != null).map(d => [d.time, d.sma20]) },
              { name: 'SMA 50', type: 'line', data: data.filter(d => d.sma50 != null).map(d => [d.time, d.sma50]) },
            ],
            priceInfo: { price: lastPrice, change: pctChange, sma20: lastSma20, sma50: lastSma50 },
          });

          await new Promise(r => setTimeout(r, 500));
          if (cancelled) return;
          _chartUpdate({ scalesOpacity: 1 });

          await new Promise(r => setTimeout(r, 600));
          if (cancelled) return;
          _chartUpdate({ lineClip: 100 });

          await new Promise(r => setTimeout(r, 1600 + 3500));
          if (cancelled) return;

          // Fundir línea y escalas al mismo tiempo
          _chartUpdate({ lineClip: 0, scalesOpacity: 0 });

          // Esperar a que ambas transiciones completen (1500ms + buffer)
          await new Promise(r => setTimeout(r, 1700));
          if (cancelled) return;

          onCycleComplete();
        } else {
          await new Promise(r => setTimeout(r, 1000));
          if (!cancelled) onCycleComplete();
        }
      } catch (e) {
        console.warn(`[W1] Error/Timeout fetching ${ticker}:`, e);
        await new Promise(r => setTimeout(r, 2000));
        if (!cancelled) onCycleComplete();
      }
    };

    const safetyTimeout = setTimeout(() => {
      if (!cancelled) {
        console.error(`[W1] Safety timeout triggered for ${ticker} - forcing cycle advance`);
        onCycleComplete();
      }
    }, 15000);

    runSequence();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(safetyTimeout);
    };
  }, [ticker]);

  const { series, scalesOpacity, lineClip, priceInfo } = _chartState;

  // Bloomberg Terminal Style con SMAs + Volume
  const options = {
    chart: {
      type: 'line',
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: false },
      fontFamily: '"Courier New", Courier, monospace',
      offsetX: -8,
    },
    stroke: {
      curve: 'straight',
      width: [1.5, 1, 1],
      colors: ['#87CEEB', '#FFD700', '#00E5FF'],
      dashArray: [0, 0, 0],
    },
    fill: {
      type: ['gradient', 'solid', 'solid'],
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.9,
        opacityTo: 0.1,
        stops: [0, 100],
        colorStops: [
          [{ offset: 0, color: '#1e3a8a', opacity: 0.8 }, { offset: 100, color: '#000000', opacity: 0.2 }]
        ]
      },
      opacity: [1, 1, 1],
      colors: ['#1e3a8a', '#FFD700', '#00E5FF']
    },
    colors: ['#87CEEB', '#FFD700', '#00E5FF'],
    grid: {
      show: true,
      borderColor: '#333333',
      strokeDashArray: 0,
      position: 'back',
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
      padding: { left: 5, right: 0, top: 0, bottom: 0 }
    },
    xaxis: {
      type: 'datetime',
      labels: { show: true, style: { colors: '#cccccc', fontSize: '9px', fontWeight: 'bold' }, datetimeUTC: false, offsetY: -5 },
      axisBorder: { show: false },
      axisTicks: { show: true, color: '#666666' },
      tooltip: { enabled: false }
    },
    yaxis: [
      {
        seriesName: ticker,
        labels: { show: true, style: { colors: '#cccccc', fontSize: '10px', fontWeight: 'bold' }, formatter: v => v.toFixed(2), offsetX: -10 },
        opposite: true,
        axisBorder: { show: true, color: '#666666' },
        axisTicks: { show: true, color: '#666666' },
      },
      {
        seriesName: ticker,
        show: false,
      },
      {
        seriesName: ticker,
        show: false,
      }
    ],
    annotations: {
      yaxis: priceInfo ? [{
        y: priceInfo.price,
        borderColor: 'transparent',
        label: {
          borderColor: '#fff',
          style: {
            color: '#000',
            background: '#fff',
            fontSize: '10px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            padding: { left: 4, right: 4, top: 1, bottom: 1 }
          },
          text: priceInfo.price.toFixed(2),
          position: 'right',
          textAnchor: 'start',
          offsetX: 0,
          offsetY: 0
        }
      }] : []
    },
    tooltip: { enabled: false },
    dataLabels: { enabled: false },
    legend: { show: false }
  };

  return (
    <div className="w-full h-full relative font-mono flex flex-col" style={{
      background: 'radial-gradient(ellipse at 40% 35%, #1a1a1a 0%, #0e0e0e 55%, #080808 100%)',
    }}>

      {/* ── CONTENEDOR DEL GRÁFICO ── */}
      <div
        className="flex-1 relative mt-[1px]"
        style={{ opacity: scalesOpacity, transition: 'opacity 1500ms ease-in-out' }}
      >
        {/* CSS solo para el barrido de la serie */}
        <style>{`
          .apexcharts-series-group,
          .apexcharts-area-series,
          .apexcharts-line-series {
            transition: clip-path 1500ms ease-in-out !important;
            clip-path: inset(0 ${100 - lineClip}% 0 0);
          }
        `}
        </style>

        {/* GRÁFICO APEXCHARTS */}
        <Chart options={options} series={series} type="line" height="100%" width="100%" />

        {/* Vignette — oscurece bordes para dar profundidad al gráfico */}
        <div className="absolute inset-0 pointer-events-none z-10" style={{
          background: 'radial-gradient(ellipse at 58% 48%, transparent 28%, rgba(0,0,0,0.52) 100%)',
          boxShadow: 'inset 0 0 70px rgba(0,0,0,0.65)',
        }} />

        {/* DAY SESSION INFO BOX (LAST PRICE, VARIACIÓN, SMAs) */}
        <div className="absolute top-[8px] left-[8px] z-20 rounded-sm text-white text-[8px] p-1 w-36 font-bold" style={{
          background: 'rgba(7,9,18,0.90)',
          border: '1px solid rgba(120,130,180,0.18)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          <div className="text-center mb-[2px] tracking-wide text-[#aaaacc] pb-[2px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            Sesión de Hoy (<span className="text-white text-[10px]">{ticker}</span>)
          </div>
          <div className="flex justify-between items-center pt-[2px]">
            <span className="flex items-center gap-[3px] text-[#888]"><span className="w-1.5 h-1.5 bg-white inline-block"></span>Últ. Precio</span>
            <span className="text-white">{priceInfo ? priceInfo.price.toFixed(2) : '-'}</span>
          </div>
          <div className="flex justify-between items-center mt-[1px]">
            <span className="flex items-center gap-[3px] text-[#888]"><span className="w-1.5 h-1.5 bg-[#999] inline-block"></span>Variación %</span>
            <span className={priceInfo?.change >= 0 ? "text-emerald-400" : "text-red-400"}>
              {priceInfo ? `${priceInfo.change > 0 ? '+' : ''}${priceInfo.change.toFixed(2)}%` : '-'}
            </span>
          </div>
          <div className="flex justify-between items-center mt-[1px]">
            <span className="flex items-center gap-[3px] text-[#888]"><span className="w-1.5 h-1.5 bg-[#FFD700] inline-block"></span>SMA 20</span>
            <span className="text-[#FFD700]">{priceInfo?.sma20 ? priceInfo.sma20.toFixed(2) : '-'}</span>
          </div>
          <div className="flex justify-between items-center mt-[1px]">
            <span className="flex items-center gap-[3px] text-[#888]"><span className="w-1.5 h-1.5 bg-[#00E5FF] inline-block"></span>SMA 50</span>
            <span className="text-[#00E5FF]">{priceInfo?.sma50 ? priceInfo.sma50.toFixed(2) : '-'}</span>
          </div>
        </div>

      </div>
    </div>
  );
};


const MarqueeHeadline = ({ text, maxDuration, id }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [dist, setDist] = useState(0);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current && textRef.current) {
        // Distancia exacta: lo que sobra de texto menos el ancho de la columna
        const d = textRef.current.scrollWidth - containerRef.current.offsetWidth;
        setDist(d > 0 ? d : 0);
      }
    };
    // Medimos con un pequeño delay para que la fuente JetBrains Mono cargue
    const t = setTimeout(measure, 500);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [text]);

  const speed = 18; // px/s (Velocidad constante y profesional)
  const moveTime = dist / speed;

  // Sincronización: 1.5s quieto al inicio, el resto es movimiento y espera
  const pStart = (1.5 / maxDuration) * 100;
  const pEnd = ((1.5 + moveTime) / maxDuration) * 100;
  const animName = `sync-uade-${id}`;

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      {dist > 0 && maxDuration > 0 && (
        <style>{`
          @keyframes ${animName} {
            0%, ${pStart}% { transform: translateX(0); }
            ${pEnd}%, 100% { transform: translateX(-${dist}px); }
          }
        `}</style>
      )}
      <div
        ref={textRef}
        className="news-text-line"
        style={{
          animation: dist > 0 && maxDuration > 0
            ? `${animName} ${maxDuration}s linear 1 forwards`
            : 'none'
        }}
      >
        {text}
      </div>
    </div>
  );
};

const AnimatedTypingText = ({ text, isPos = true, speed = 35, className = "max-h-[115px]" }) => {
  const [displayedText, setDisplayedText] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    setDisplayedText('');
    if (!text) return;

    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.substring(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, speed); // Velocidad de tipeo

    return () => clearInterval(interval);
  }, [text, speed]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedText]);

  return (
    <div
      ref={containerRef}
      className={`${className} overflow-y-auto ai-scroll-container`}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`.ai-scroll-container::-webkit-scrollbar { display: none; }`}</style>
      <div className="relative pb-2">
        {displayedText}
        <span className={`inline-block w-[4px] h-[12px] ml-1 animate-pulse align-baseline ${isPos ? 'bg-emerald-400' : 'bg-red-400'}`} />
      </div>
    </div>
  );
};

const CompanyDataDisplay = ({ data, active }) => {
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    if (active) {
      setTimeLeft(30);
      const timer = setInterval(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [active, data?.ticker]);

  if (!active) return null;

  if (!data) {
    return (
      <motion.div
        className="absolute inset-0 z-50 flex items-center justify-center bg-[#111111] font-mono overflow-hidden h-[192px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Respiration / Breathing white glow effect */}
        <motion.div
          animate={{ opacity: [0.03, 0.15, 0.03], scale: [0.9, 1.05, 0.9] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute w-full h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.8)_0%,transparent_40%)] pointer-events-none"
        />

        <div className="z-10 flex flex-col items-center gap-3">
          <div className="text-white/60 text-[10px] uppercase tracking-[0.4em] font-bold animate-pulse">
            Procesando Información
          </div>
          <motion.div
            className="h-[1px] bg-white/40 shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            animate={{ width: ['0px', '150px', '0px'], opacity: [0, 1, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </motion.div>
    );
  }

  const { ticker, name, indicators, income, scout_summary } = data;
  const {
    price, change_pct, marketCap, trailingPE, forwardPE, trailingEps,
    beta, fiftyTwoWeekHigh, fiftyTwoWeekLow,
    grossMargins, operatingMargins, profitMargins,
    debtToEquity, returnOnEquity, returnOnAssets,
    sector, exchange,
    forwardEps, bookValue, priceToBook, enterpriseValue,
    enterpriseToRevenue, enterpriseToEbitda, shortRatio,
    shortPercentOfFloat, heldPercentInsiders, heldPercentInstitutions, weekChange52,
    previousClose, open, dayHigh, dayLow, bid, ask,
    volume, averageVolume, dividendYield, fiftyDayAverage, twoHundredDayAverage,
  } = indicators;

  const fmtNum = (v) => v != null ? v.toFixed(2) : 'N/A';
  const fmtPct = (v) => v != null ? `${(v * 100).toFixed(2)}%` : 'N/A';
  const fmtLarge = (v) => {
    if (v == null) return 'N/A';
    if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    return `${(v / 1e6).toFixed(0)}M`;
  };
  const fmtVol = (v) => {
    if (v == null) return 'N/A';
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    return `${(v / 1e3).toFixed(1)}K`;
  };
  const isPos = change_pct > 0;

  const kpis = [
    { label: 'CAP. BURS.', value: fmtLarge(marketCap) },
    { label: 'P/E TTM', value: fmtNum(trailingPE) },
    { label: 'BETA', value: fmtNum(beta) },
    { label: 'VAL. EMP.', value: fmtLarge(enterpriseValue) },
    { label: 'BPA TTM', value: fmtNum(trailingEps) },
    { label: 'VAR 52S', value: fmtPct(weekChange52) },
    { label: 'APERTURA', value: fmtNum(open) },
    { label: 'MÁX. DÍA', value: fmtNum(dayHigh) },
    { label: 'MÍN. DÍA', value: fmtNum(dayLow) },
    { label: 'REND. DIV.', value: fmtPct(dividendYield) },
    { label: 'VOLUMEN', value: fmtVol(volume) },
    { label: 'VOL. PROM.', value: fmtVol(averageVolume) },
    { label: 'P/E EST.', value: fmtNum(forwardPE) },
    { label: 'ROE', value: fmtPct(returnOnEquity) },
    { label: 'MARGEN NETO', value: fmtPct(profitMargins) },
    { label: 'DEUDA/CAP.', value: fmtNum(debtToEquity) },
    { label: 'EV/EBITDA', value: fmtNum(enterpriseToEbitda) },
    { label: 'PRECIO/CONT.', value: fmtNum(priceToBook) },
  ]; // 18 items (6 filas x 3 columnas)

  const incomeRows = [
    { label: 'INGRESOS TOT.', key: 'revenue' },
    { label: 'BENEF. BRUTO', key: 'grossProfit' },
    { label: 'INGR. OPER.', key: 'operatingIncome' },
    { label: 'ANTES IMPUEST.', key: 'pretaxIncome' },
    { label: 'INGRESO NETO', key: 'netIncome' },
  ];

  return (
    <motion.div
      className="absolute inset-0 z-50 flex bg-[#111111] font-mono overflow-hidden h-[192px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* ── COL 1: Identidad de Empresa (320px) ── */}
      <div
        className="flex flex-col justify-center px-6 border-r border-[#222] shrink-0 bg-[#111111]"
        style={{ width: '320px' }}
      >
        <div className="text-[36px] font-bold text-white leading-none tracking-widest truncate">{ticker}</div>
        <div className="text-[13px] text-[#999] mt-2 leading-tight truncate">{name}</div>
        <div className="text-[10px] text-[#555] mt-1 uppercase tracking-wider truncate">{sector} · {exchange}</div>
        <div className="mt-5 flex items-baseline gap-3">
          <span className="text-[32px] font-bold text-white leading-none">${fmtNum(price)}</span>
          <span className={`text-[15px] font-bold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPos ? '+' : ''}{fmtNum(change_pct)}%
          </span>
        </div>
      </div>

      {/* ── COL 2: KPIs grid comprimido (580px) ── */}
      <div
        className="flex flex-col justify-center px-8 border-r border-[#222] shrink-0 overflow-hidden"
        style={{ width: '580px' }}
      >
        <div
          className="grid gap-x-6 gap-y-[5px]"
          style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
        >
          {kpis.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center overflow-hidden border-b border-[#111] pb-[2px]">
              <span className="text-[8.5px] text-[#666] uppercase tracking-wider leading-none truncate shrink-0 pr-2">{label}</span>
              <span className="text-[12px] font-bold text-[#eaeaea] leading-tight truncate text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── COL 3: Yahoo Scout Animated Text (Flexible width) ── */}
      <div className={`flex-1 flex flex-col justify-center px-8 border-r border-[#222] relative overflow-hidden bg-[#111111] ${isPos ? 'shadow-[inset_0_0_80px_rgba(52,211,153,0.02)]' : 'shadow-[inset_0_0_80px_rgba(248,113,113,0.02)]'}`}>
        <div className={`absolute top-4 left-6 flex items-center gap-[6px] shrink-0 px-2.5 py-[4px] border rounded-[2px] glow-pulse ${isPos ? 'bg-emerald-400/10 border-emerald-400/30 shadow-[0_0_15px_rgba(52,211,153,0.15)]' : 'bg-red-400/10 border-red-400/30 shadow-[0_0_15px_rgba(248,113,113,0.15)]'}`}>
          <span className={`w-[6px] h-[6px] rounded-full animate-pulse ${isPos ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-red-400 shadow-[0_0_8px_#f87171]'}`} />
          <span className={`text-[11px] font-bold uppercase tracking-[0.25em] ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>Volviendo en 00:{timeLeft.toString().padStart(2, '0')}</span>
        </div>

        {scout_summary ? (
          <div className="mt-12 text-[15px] leading-[1.6] text-[#e0e0e0] font-sans pr-4 tracking-wide font-medium">
            <AnimatedTypingText text={scout_summary} isPos={isPos} />
          </div>
        ) : (
          <div className="mt-12 text-[14px] text-[#444] italic uppercase tracking-widest animate-pulse">
            Analizando datos de mercado...
          </div>
        )}
      </div>

      {/* ── COL 4: Income Statement (580px) ── */}
      <div
        className="flex flex-col justify-center px-6 shrink-0 bg-[#141414]"
        style={{ width: '580px' }}
      >
        <div className="flex items-center text-[9px] uppercase tracking-widest mb-[6px] pb-[5px] border-b border-[#333]">
          <div className="w-[120px] text-[#555] shrink-0">ESTADO RESULT.</div>
          {income.map((q, i) => (
            <div key={i} className="flex-1 text-right text-[#777]">{q.period}</div>
          ))}
        </div>
        {incomeRows.map(({ label, key }, rowIdx) => (
          <div
            key={key}
            className="flex items-center py-[5px]"
            style={{ backgroundColor: rowIdx % 2 === 0 ? '#161616' : 'transparent' }}
          >
            <div className="w-[120px] text-[9px] text-[#888] uppercase tracking-wider shrink-0">{label}</div>
            {income.map((q, i) => (
              <div key={i} className="flex-1 text-right text-[12px] font-bold text-[#d0d0d0]">
                {q[key] != null ? `${(q[key] / 1e9).toFixed(2)}B` : 'N/A'}
              </div>
            ))}
          </div>
        ))}
      </div>
    </motion.div>
  );
};

// Caché a nivel de módulo — persiste entre mount/unmount del componente
const _scoutCache = {};
let _scoutGlobalIdx = 0;

// --- WIDGET 3 ALTERNATIVO: YAHOO SCOUT INTELLIGENCE (384px) ---
const YahooScoutWidget = () => {
  const [localIdx, setLocalIdx] = useState(_scoutGlobalIdx);
  const [data, setData] = useState(() => _scoutCache[TICKERS_ROTATION[_scoutGlobalIdx]] || null);
  const ticker = TICKERS_ROTATION[localIdx];
  const localIdxRef = useRef(localIdx);

  // Bucle independiente: Cambiar de acción cada 25 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalIdx(prev => {
        const next = (prev + 1) % TICKERS_ROTATION.length;
        _scoutGlobalIdx = next; // Persistir globalmente
        localIdxRef.current = next;
        return next;
      });
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  // Fetch data cuando cambia el ticker local (usa caché de módulo si está disponible)
  useEffect(() => {
    localIdxRef.current = localIdx;
    if (_scoutCache[ticker]) {
      setData(_scoutCache[ticker]);
      return;
    }
    let active = true;
    setData(null);
    const fetchScout = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/scout/${ticker}`);
        const result = await res.json();
        if (active && result && result.summary) {
          _scoutCache[ticker] = result;
          setData(result);
        }
      } catch (e) {
        console.error("Error fetching scout data", e);
      }
    };
    fetchScout();
    return () => { active = false; };
  }, [ticker]);

  return (
    <div className="w-full h-full p-4 flex flex-col font-mono text-white/90 relative overflow-hidden" style={{
      background: 'radial-gradient(ellipse at 40% 35%, #1a1a1a 0%, #0e0e0e 55%, #080808 100%)',
    }}>
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse at 55% 50%, transparent 30%, rgba(0,0,0,0.5) 100%)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.6)',
      }} />
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {!data ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-white/30 text-[10px] uppercase tracking-widest">
            <svg className="w-4 h-4 text-emerald-400/50 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            ANALIZANDO {ticker}...
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-2 pb-2 shrink-0" style={{ borderBottom: '1px solid rgba(52,211,153,0.15)' }}>
              <span className="text-[14px] font-bold text-white/90 tracking-wider" title={data.name}>
                {data.ticker}
              </span>
              <span className="text-[9px] text-emerald-400 uppercase tracking-widest px-2 py-0.5 rounded -translate-y-[2px]" style={{
                background: 'rgba(7,9,18,0.85)',
                border: '1px solid rgba(52,211,153,0.2)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}>
                RESUMEN IA
              </span>
            </div>
            <div className="flex-1 overflow-hidden mt-1 text-[15px] leading-[1.6] text-[#e0e0e0] font-sans pr-1 tracking-wide font-medium flex flex-col">
              <AnimatedTypingText text={data.summary} isPos={true} speed={40} className="flex-1 h-full" />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// --- WIDGET 2 ALTERNATIVO: TOP MOVERS (576px) ---
const TopMovers = () => {
  const [data, setData] = useState({ gainers: [], losers: [] });

  useEffect(() => {
    let active = true;
    const fetchMovers = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/top-movers`);
        const result = await res.json();
        if (active && result) {
          if (result.gainers) {
            result.gainers.sort((a, b) => parseFloat(b.change) - parseFloat(a.change));
          }
          if (result.losers) {
            result.losers.sort((a, b) => parseFloat(a.change) - parseFloat(b.change));
          }
          setData(result);
        }
      } catch (e) {
        console.error("Top Movers fetch error", e);
      }
    };
    fetchMovers();
    const interval = setInterval(fetchMovers, 15000); // 15s refresh
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Calcular max cambios para magnitud relativa
  const maxGain = data.gainers.length > 0 ? Math.max(...data.gainers.map(g => Math.abs(parseFloat(g.change)))) : 1;
  const maxLoss = data.losers.length > 0 ? Math.max(...data.losers.map(l => Math.abs(parseFloat(l.change)))) : 1;

  const renderBar = (item, isGain, maxVal, index = 0) => {
    if (!item) return <div className="flex-1 flex items-center px-3" />;

    const change = Math.abs(parseFloat(item.change));
    // Calculamos el % de la barra relativo al máximo de ese lado (min 5% para que se vea algo)
    const pct = Math.min(100, Math.max(2, (change / (maxVal || 1)) * 100));

    // Tonalidades idénticas al Widget 4, pero con un color de fondo más denso para que "llene" más
    const color = isGain ? '#34d399' : '#f87171';
    const bgOpacity = isGain ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)';

    return (
      <div key={item.symbol} className="flex-1 flex flex-col justify-center px-4 relative overflow-hidden group hover:bg-white/[0.04] transition-colors duration-300">
        {/* Fondo de la barra restaurado al 100% del ancho del recuadro */}
        <div
          className="absolute top-[2px] bottom-[2px] left-0 transition-all duration-1000 ease-out rounded-r-sm shadow-sm overflow-hidden"
          style={{
            width: `${pct}%`,
            backgroundColor: bgOpacity,
            borderRight: `2px solid ${color}`
          }}
        >
          {/* Luz dinámica que viaja por la barra */}
          <div
            className="absolute top-0 bottom-0 left-0 w-[50px] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent mix-blend-overlay"
            style={{
              animation: `shimmer-bar 2.5s infinite linear`,
              animationDelay: `${index * 0.4}s`
            }}
          />
        </div>

        {/* Contenido (Z-10 para estar sobre la barra) */}
        <div className="relative z-10 flex justify-between items-center w-full h-full">
          <div className="flex flex-col z-10">
            <span className="text-[14px] font-bold text-[#e2e8f0] tracking-wide">{item.symbol}</span>
          </div>

          {/* Capa de difuminado (gradient) atrás del texto para que el borde brillante nunca corte visualmente los números */}
          <div className="absolute right-[-16px] pl-16 pr-4 h-full flex items-center gap-2 bg-gradient-to-l from-[#0e0e0e] via-[#0e0e0e]/90 to-transparent z-20">
            <span className="text-[12px] font-mono font-semibold drop-shadow-md" style={{ color: color }}>
              {item.change}%
            </span>
            <span className="text-[11px] font-mono text-zinc-500">
              ${parseFloat(item.price).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex font-sans border-r border-[#111] relative overflow-hidden" style={{
      background: 'radial-gradient(ellipse at 50% 35%, #1a1a1a 0%, #0e0e0e 55%, #080808 100%)',
    }}>
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{
        background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.52) 100%)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.65)',
      }} />
      <style>{`
        @keyframes shimmer-bar {
          0%   { transform: translateX(-100%) skewX(-15deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(1200%) skewX(-15deg); opacity: 0; }
        }
      `}</style>
      {/* Columna Izquierda: Gainers */}
      <div className="flex-1 flex flex-col border-r border-white/[0.05] relative z-20">
        <div className="h-[24px] flex items-center px-2 border-b border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent">
          <span className="text-[9px] tracking-[0.15em] font-bold uppercase opacity-75" style={{ color: '#34d399' }}>Mayores Alzas</span>
        </div>
        <div className="flex-1 flex flex-col">
          {data.gainers.length > 0
            ? data.gainers.map((item, i) => (
              <div key={`g-${i}`} className={`flex-1 flex border-b border-white/[0.02] ${i === data.gainers.length - 1 ? 'border-b-0' : ''}`}>
                {renderBar(item, true, maxGain, i)}
              </div>
            ))
            : <div className="flex-1 flex items-center justify-center text-[10px] text-zinc-600 uppercase tracking-widest animate-pulse">Escaneando...</div>
          }
        </div>
      </div>

      {/* Columna Derecha: Losers */}
      <div className="flex-1 flex flex-col relative z-20">
        <div className="h-[24px] flex items-center px-2 border-b border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent">
          <span className="text-[9px] tracking-[0.15em] font-bold uppercase opacity-75" style={{ color: '#f87171' }}>Mayores Bajas</span>
        </div>
        <div className="flex-1 flex flex-col">
          {data.losers.length > 0
            ? data.losers.map((item, i) => (
              <div key={`l-${i}`} className={`flex-1 flex border-b border-white/[0.02] ${i === data.losers.length - 1 ? 'border-b-0' : ''}`}>
                {renderBar(item, false, maxLoss, i)}
              </div>
            ))
            : <div className="flex-1 flex items-center justify-center text-[10px] text-zinc-600 uppercase tracking-widest animate-pulse">Escaneando...</div>
          }
        </div>
      </div>
    </div>
  );
};

// --- WIDGET 2 TICKERS: BUBBLE SWARM (shared physics singleton) ---
const _bubbleGetWeightAndSize = (sym) => {
  const base = { r: 28, mass: 1 };
  if (sym.includes('GGAL') || sym.includes('YPFD')) return { r: 62, mass: 4 };
  if (sym.includes('PAMP') || sym.includes('BMA') || sym.includes('BBAR')) return { r: 50, mass: 2.5 };
  if (sym.includes('CEPU') || sym.includes('LOMA') || sym.includes('TECO2')) return { r: 38, mass: 1.5 };
  if (sym.includes('BYMA')) return { r: 48, mass: 2 };
  if (sym.includes('IRSA') || sym.includes('ALUA')) return { r: 34, mass: 1.2 };
  return base;
};
const _bubbleInitialValues = {
  "BMA - 48hs": 10380.00, "BYMA - 48hs": 306.25, "CEPU - 48hs": 2157.00, "GGAL - 48hs": 6170.00,
  "PAMP - 48hs": 4695.00, "YPFD - 48hs": 55100.00, "TECO2 - 48hs": 3245.00, "LOMA - 48hs": 2915.00,
  "ALUA - 48hs": 850.00, "BBAR - 48hs": 6885.00, "EDN - 48hs": 1876.00,
  "IRSA - 48hs": 2140.00, "METR - 48hs": 1820.00,
};

const _bubbleFixedPositions = {
  "YPFD": { x: 130, y: 70 },
  "ALUA": { x: 70, y: 130 },
  "TECO2": { x: 150, y: 150 },
  "PAMP": { x: 230, y: 60 },
  "BMA": { x: 220, y: 140 },
  "METR": { x: 300, y: 30 },
  "LOMA": { x: 310, y: 90 },
  "EDN": { x: 290, y: 150 },
  "GGAL": { x: 400, y: 60 },
  "BBAR": { x: 370, y: 140 },
  "BYMA": { x: 460, y: 130 },
  "CEPU": { x: 490, y: 60 },
  "IRSA": { x: 530, y: 100 },
};
// Singleton: nodos y refs de DOM compartidos entre todas las instancias del componente
const _sharedNodes = { list: [] };
const _sharedDomRefs = {}; // { [nodeId]: Set<HTMLElement> }
let _physicsLoopId = null;

const BubbleSwarm = ({ data, flashMap }) => {
  const instanceRefs = useRef({}); // { [nodeId]: el } — solo para esta instancia
  const labelRef = useRef(null);
  const [initialized, setInitialized] = useState(_sharedNodes.list.length > 0);

  // 1. Inicializar nodos compartidos (solo la primera instancia que monte)
  useEffect(() => {
    if (_sharedNodes.list.length === 0) {
      const width = 576, height = 192;
      _sharedNodes.list = Object.keys(_bubbleInitialValues).map((sym) => {
        const specs = _bubbleGetWeightAndSize(sym);
        const label = sym.split(' ')[0];
        const pos = _bubbleFixedPositions[label] || { x: width / 2, y: height / 2 };
        return {
          id: sym, label: label,
          x: pos.x, y: pos.y,
          tgtX: pos.x, tgtY: pos.y,
          vx: 0, vy: 0,
          r: specs.r, mass: specs.mass,
          val: _bubbleInitialValues[sym], change: 0, flash: 0,
        };
      });
    }
    setInitialized(true);

    // Cleanup: dar de baja los DOM refs de esta instancia al desmontar
    return () => {
      Object.entries(instanceRefs.current).forEach(([id, el]) => {
        _sharedDomRefs[id]?.delete(el);
      });
      instanceRefs.current = {};
    };
  }, []);

  // 2. Actualizar datos (muta el singleton compartido)
  useEffect(() => {
    _sharedNodes.list.forEach(node => {
      const currentVal = data[node.id];
      if (currentVal && typeof currentVal === 'object' && currentVal.c !== undefined && currentVal.pc !== undefined) {
        node.val = currentVal.c;
        node.change = currentVal.pc; // pct_change real de data912
        if (flashMap[`rofex_${node.id}`]) node.flash = 1.0;
      }
      // No fallback: si no llegó el websocket aún, mantenemos change en 0
    });
  }, [data, flashMap]);

  // 3. Loop de física — un único loop global, actualiza TODOS los DOM refs registrados
  useEffect(() => {
    if (!initialized) return;
    if (_physicsLoopId !== null) return; // Ya está corriendo

    const width = 576, height = 192;
    let lastTime = performance.now();

    const tick = (time) => {
      const dt = Math.min((time - lastTime) / 16.666, 3);
      lastTime = time;
      const nodes = _sharedNodes.list;
      const centerX = width / 2, centerY = height / 2;

      nodes.forEach(node => {
        node.vx *= Math.pow(0.92, dt);
        node.vy *= Math.pow(0.92, dt);
        // Gently pull them to their assigned structural targets to maintain layout
        node.vx += (node.tgtX - node.x) * 0.002 * dt;
        node.vy += (node.tgtY - node.y) * 0.002 * dt;
        if (node.flash > 0) node.flash = Math.max(0, node.flash - 0.02 * dt);
      });

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.r + b.r + 3;
          if (dist < minDist && dist > 0) {
            const angle = Math.atan2(dy, dx);
            const force = (minDist - dist) * 0.02 * dt;
            const mRatioA = b.mass / (a.mass + b.mass);
            const mRatioB = a.mass / (a.mass + b.mass);
            const pushX = Math.cos(angle) * force, pushY = Math.sin(angle) * force;
            a.vx -= pushX * mRatioA; a.vy -= pushY * mRatioA;
            b.vx += pushX * mRatioB; b.vy += pushY * mRatioB;
          }
        }
      }

      nodes.forEach(node => {
        if (node.x - node.r < 0) { node.x = node.r; node.vx *= -0.5; }
        if (node.x + node.r > width) { node.x = width - node.r; node.vx *= -0.5; }
        if (node.y - node.r < -10) { node.y = node.r - 10; node.vy *= -0.3; }
        if (node.y + node.r > height + 10) { node.y = height + 10 - node.r; node.vy *= -0.3; }
        node.x += node.vx * dt;
        node.y += node.vy * dt;
      });

      // Actualizar TODAS las instancias DOM registradas para cada nodo
      nodes.forEach(node => {
        const els = _sharedDomRefs[node.id];
        if (!els || els.size === 0) return;
        const isPos = node.change >= 0;
        const baseColor = isPos ? 'rgba(52,211,153,0.85)' : 'rgba(248,113,113,0.85)';
        const glowAlpha = 0.12 + node.flash * 0.3;
        const glowColor = isPos
          ? `rgba(52,211,153,${glowAlpha})`
          : `rgba(248,113,113,${glowAlpha})`;
        const transform = `translate3d(${node.x - node.r}px, ${node.y - node.r}px, 0) scale(${1 + node.flash * 0.08})`;
        const colorRgb = isPos ? '52,211,153' : '248,113,113';
        const bgGradient = `radial-gradient(ellipse at 50% 45%, rgba(${colorRgb}, 0.22) 0%, rgba(${colorRgb}, 0.07) 55%, rgba(0,0,0,0.65) 100%), #0d0d0d`;
        const shadow = [
          `0 4px 14px rgba(0,0,0,0.9)`,
          `0 0 ${6 + node.flash * 16}px ${glowColor}`,
          `inset 0 -4px 10px rgba(0,0,0,0.85)`,
        ].join(', ');
        els.forEach(el => {
          if (!el) return;
          el.style.transform = transform;
          el.style.borderColor = baseColor;
          el.style.boxShadow = shadow;
          el.style.background = bgGradient;
          const span = el.querySelector('.bubble-pct');
          if (span) {
            span.style.color = baseColor;
            span.style.textShadow = 'none';
            span.textContent = `${isPos ? '+' : ''}${node.change.toFixed(1)}%`;
          }
        });
      });

      // El label "Argentina" siempre queda fijo arriba (no necesita actualización dinámica)

      _physicsLoopId = requestAnimationFrame(tick);
    };

    _physicsLoopId = requestAnimationFrame(tick);
    return () => {
      if (_physicsLoopId !== null) { cancelAnimationFrame(_physicsLoopId); _physicsLoopId = null; }
    };
  }, [initialized]);

  const setNodeRef = (id, el) => {
    if (!_sharedDomRefs[id]) _sharedDomRefs[id] = new Set();
    const prev = instanceRefs.current[id];
    if (prev) _sharedDomRefs[id].delete(prev);
    if (el) {
      _sharedDomRefs[id].add(el);
      instanceRefs.current[id] = el;
    } else {
      delete instanceRefs.current[id];
    }
  };

  return (
    <div className="w-full h-full relative overflow-hidden" style={{
      background: 'radial-gradient(ellipse at 50% -20%, #1a1a1a 0%, #0e0e0e 50%, #080808 100%)',
    }}>

      {/* Ambient light floor reflection */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'linear-gradient(180deg, rgba(52,211,153,0.03) 0%, transparent 45%, rgba(248,113,113,0.02) 100%)',
      }} />

      {/* "ARGENTINA" header label */}
      <div ref={labelRef} className="absolute pointer-events-none" style={{
        top: '7px', left: '12px', zIndex: 2,
        fontSize: '8px', fontWeight: 800, letterSpacing: '0.26em',
        color: 'rgba(140,150,200,0.45)',
        textTransform: 'uppercase',
        textShadow: '0 0 10px rgba(100,120,255,0.25)',
      }}>
        ARGENTINA
      </div>

      {/* 3D Sphere Bubbles */}
      {initialized && _sharedNodes.list.map(node => (
        <div
          key={node.id}
          ref={el => setNodeRef(node.id, el)}
          className="absolute top-0 left-0 rounded-full flex flex-col items-center justify-center will-change-transform overflow-hidden"
          style={{
            width: node.r * 2, height: node.r * 2,
            transform: `translate3d(${node.x - node.r}px, ${node.y - node.r}px, 0)`,
            background: 'radial-gradient(ellipse at 50% 45%, rgba(52,211,153,0.32) 0%, rgba(52,211,153,0.10) 55%, rgba(0,0,0,0.65) 100%), #0d0d0d',
            border: '1px solid rgba(52,211,153,0.6)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.9), 0 0 6px rgba(52,211,153,0.12), inset 0 -4px 10px rgba(0,0,0,0.85)',
            zIndex: 10,
          }}
        >
          {/* Bottom depth gradient */}
          <div className="absolute pointer-events-none" style={{
            bottom: 0, left: 0, right: 0,
            height: '44%',
            background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.65))',
            borderRadius: '0 0 50% 50%',
            zIndex: 2,
          }} />
          {/* Ticker label */}
          <span className="text-white font-bold leading-none" style={{
            fontSize: `${node.r * 0.45}px`,
            textShadow: '0 1px 4px rgba(0,0,0,0.98), 0 0 10px rgba(0,0,0,0.5)',
            position: 'relative', zIndex: 3,
          }}>
            {node.label}
          </span>
          {/* % change */}
          <span className="bubble-pct font-mono leading-none mt-[2px]" style={{
            fontSize: `${node.r * 0.3}px`,
            color: 'rgba(52,211,153,1)',
            textShadow: 'none',
            position: 'relative', zIndex: 3,
          }}>
            +0.0%
          </span>
        </div>
      ))}
    </div>
  );
};


// --- WIDGET 4 ALTERNATIVO: MARKET HEATMAP (576px) ---
const MarketHeatmap = () => {
  const [data, setData] = useState({ commodities: [], indices: [] });
  const [flashMap, setFlashMap] = useState({});

  useEffect(() => {
    let active = true;
    let isFirstLoad = true;
    const staggerTimers = [];

    const fetchHeatmap = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/market-heatmap`);
        const result = await res.json();

        if (!active || !result || !result.commodities || !result.indices) return;

        if (isFirstLoad) {
          // Primera carga: todo de golpe, sin stagger
          setData(result);
          isFirstLoad = false;
          return;
        }

        // Siguientes actualizaciones: stagger por ítem
        const allItems = [
          ...result.commodities.map((item, i) => ({ item, type: 'commodities', idx: i, prefix: 'comm' })),
          ...result.indices.map((item, i) => ({ item, type: 'indices', idx: i, prefix: 'idx' })),
        ];

        allItems.forEach(({ item, type, idx, prefix }) => {
          const delay = Math.random() * 26000; // Spread updates smoothly over the 28s polling window
          const timer = setTimeout(() => {
            if (!active) return;
            setData(prev => {
              const arr = prev[type];
              if (!arr || !arr[idx]) return prev;
              const oldItem = arr[idx];
              const changed = item.price !== oldItem.price;

              if (changed) {
                const direction = parseFloat(item.price) > parseFloat(oldItem.price) ? 'up' : 'down';
                const key = `${prefix}_${item.symbol}`;
                setFlashMap(fm => ({ ...fm, [key]: direction }));
                setTimeout(() => {
                  setFlashMap(current => {
                    const copy = { ...current };
                    delete copy[key];
                    return copy;
                  });
                }, 800);
              }

              const newArr = [...arr];
              newArr[idx] = item;
              return { ...prev, [type]: newArr };
            });
          }, delay);
          staggerTimers.push(timer);
        });
      } catch (e) {
        console.error("Heatmap fetch error", e);
      }
    };

    fetchHeatmap();
    // Poll every 28s -> ensures all stagger timers finish before next poll prevents duplicate flashes
    const interval = setInterval(fetchHeatmap, 28000);
    return () => {
      active = false;
      clearInterval(interval);
      staggerTimers.forEach(clearTimeout);
    };
  }, []);

  const renderCell = (item, prefix) => {
    const cellBg = 'radial-gradient(ellipse at 40% 30%, #232323 0%, #141414 60%, #0e0e0e 100%)';
    const cellShadow = 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -2px 6px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.6)';

    if (!item) return <div className="flex-1" style={{ background: cellBg, boxShadow: cellShadow }} />;

    const changePct = parseFloat(item.change) || 0;
    const changeAbs = parseFloat(item.change_abs || '0');
    const isPos = changePct >= 0;

    const valColor = isPos ? '#34d399' : '#f87171';
    const flash = flashMap[`${prefix}_${item.symbol}`];

    return (
      <div
        key={item.symbol}
        className={`flex-1 flex flex-col justify-between p-2 relative overflow-hidden transition-all duration-300 ${flash === 'up' ? 'ring-1 ring-inset ring-[#34d399] z-10 brightness-125' : flash === 'down' ? 'ring-1 ring-inset ring-[#f87171] z-10 brightness-125' : ''}`}
        style={{ background: cellBg, boxShadow: cellShadow }}
      >
        {/* Top: Name */}
        <div className="w-full text-left">
          <span className="text-[11px] font-bold tracking-wider text-[#cbd5e1] uppercase line-clamp-1 leading-tight">
            {item.name}
          </span>
        </div>

        {/* Bottom: Price and Changes */}
        <div className="w-full flex flex-col items-end justify-end mt-1">
          <span className="text-[15px] font-mono text-right font-bold leading-none mb-1 tracking-tight text-[#e2e8f0]">
            {parseFloat(item.price).toFixed(2)}
          </span>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[11px] font-mono font-bold leading-none" style={{ color: valColor }}>
              {isPos ? '+' : ''}{changePct.toFixed(2)}%
            </span>
            <span className="text-[10px] font-mono font-medium leading-none opacity-80" style={{ color: valColor }}>
              {isPos ? '+' : ''}{changeAbs.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col divide-y divide-[#252525] font-sans relative overflow-hidden" style={{
      background: '#111111',
    }}>
      {data.commodities.length === 0 && data.indices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-zinc-600 uppercase tracking-widest animate-pulse h-full">Escaneando mercados globales...</div>
      ) : (
        <>
          {/* Fila 1: Commodities */}
          <div className="flex-1 flex w-full divide-x divide-[#252525]">
            {data.commodities.length > 0 ? data.commodities.map((item) => renderCell(item, 'comm')) : Array(5).fill(0).map((_, i) => renderCell(null, 'comm'))}
          </div>
          {/* Fila 2: Indices */}
          <div className="flex-1 flex w-full divide-x divide-[#252525]">
            {data.indices.length > 0 ? data.indices.map((item) => renderCell(item, 'idx')) : Array(5).fill(0).map((_, i) => renderCell(null, 'idx'))}
          </div>
        </>
      )}
    </div>
  );
};

// --- APP PRINCIPAL ---
export default function App() {
  const [currentView, setCurrentView] = useState('LOCAL');      // 'LOCAL' | 'GLOBAL' for W4
  const [currentViewW2, setCurrentViewW2] = useState('TICKERS'); // 'TICKERS' | 'MOVERS' for W2
  const [currentViewW3, setCurrentViewW3] = useState('NEWS');    // 'NEWS' | 'SCOUT' for W3

  const [isRotating, setIsRotating] = useState(false);
  const containerRef = useRef(null);
  const [isFadingBlack, setIsFadingBlack] = useState(false);

  const [prices, setPrices] = useState([]);

  const [rofexPrices, setRofexPrices] = useState({});
  const [news, setNews] = useState([]);
  const [flashMap, setFlashMap] = useState({});
  const prevPricesRef = useRef([]);
  const [idx, setIdx] = useState(0);
  const [masterTime, setMasterTime] = useState(new Date()); // Keep just for specific needs, though removed from Clocks

  // RESTORED VARIABLES:
  const socketRef = useRef(null);
  const [isAiActive, setIsAiActive] = useState(false);
  const [companyData, setCompanyData] = useState(null);
  const [newsIdx, setNewsIdx] = useState(0);
  const aiDismissTimer = useRef(null);

  const isRotatingRef = useRef(isRotating);

  useEffect(() => {
    isRotatingRef.current = isRotating;
  }, [isRotating]);

  const newsRef = useRef(news);

  useEffect(() => {
    newsRef.current = news;
  }, [news]);

  // Pre-fetch de scout para todos los tickers al arrancar la app (antes de que SCOUT view sea visible)
  useEffect(() => {
    TICKERS_ROTATION.forEach((t, i) => {
      setTimeout(async () => {
        if (_scoutCache[t]) return;
        try {
          const res = await fetch(`${API_BASE}/api/scout/${t}`);
          const result = await res.json();
          if (result && result.summary) _scoutCache[t] = result;
        } catch (e) { }
      }, i * 4000); // stagger: 0s, 4s, 8s, 12s, 16s, 20s, 24s
    });
  }, []);

  // Rotación de noticias: avanza cada 6s independientemente del estado de rotación del display
  useEffect(() => {
    const interval = setInterval(() => {
      setNewsIdx(prev => {
        const currentLength = newsRef.current.length;
        if (currentLength === 0) return 0;
        return (prev + 1) % currentLength;
      });
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const staggerTimers = [];

    const upd = async () => {
      try {
        const responseData = await fetch(`${API_BASE}/api/prices`).then(r => r.json());
        if (!responseData || !responseData.global) return;

        const newPrices = responseData.global;
        // Cargamos el estado inicial de Rofex
        if (responseData.rofex) {
          setRofexPrices(current => {
            if (Object.keys(current).length === 0) {
              return responseData.rofex;
            }
            return current;
          });
        }

        const prev = prevPricesRef.current;
        const isFirstLoad = prev.length === 0;

        if (isFirstLoad) {
          // Primera carga: todo instantáneo, sin flash
          setPrices(newPrices);
        } else {
          // Actualizaciones siguientes: escalonar cada ticker con delay aleatorio a lo largo de 26s
          newPrices.forEach((p, i) => {
            const delay = Math.random() * 26000;
            const timer = setTimeout(() => {
              const oldPrice = prev[i];
              const changed = oldPrice && parseFloat(p.price) !== parseFloat(oldPrice.price);
              const direction = changed
                ? (parseFloat(p.price) > parseFloat(oldPrice.price) ? 'up' : 'down')
                : null;

              // Actualizar solo este ticker
              setPrices(current => {
                const updated = [...current];
                updated[i] = p;
                return updated;
              });

              // Aplicar flash si cambió
              if (direction) {
                setFlashMap(fm => ({ ...fm, [i]: direction }));
                setTimeout(() => setFlashMap(fm => {
                  const copy = { ...fm };
                  delete copy[i];
                  return copy;
                }), 800);
              }
            }, delay);
            staggerTimers.push(timer);
          });
        }
        prevPricesRef.current = newPrices;

        // Noticias (sin stagger)
        const n = await fetch(`${API_BASE}/api/market-news`).then(r => r.json());
        if (Array.isArray(n)) {
          // Filtramos las fuentes que no queremos mostrar de momento
          const filteredNews = n.filter(item =>
            item.source !== 'StockStory' &&
            item.source !== 'Associated Press Finance'
          );
          setNews(filteredNews);
        }
      } catch (e) {
        console.error("Error cargando datos:", e);
      }
    };
    upd();
    const t = setInterval(upd, 30000);
    return () => {
      clearInterval(t);
      staggerTimers.forEach(clearTimeout);
    };
  }, []);

  // --- LOGICA DE ROTACION AUTOMATICA (TICKER HORIZONTAL) PURE CSS ---
  useEffect(() => {
    let active = true;

    const cycle = async () => {
      while (active && isRotating) {
        if (!active || !isRotating) break;

        // Apply 45s CSS transition to the right (x: 2048px)
        if (containerRef.current) {
          containerRef.current.style.transition = 'transform 45s linear';
          containerRef.current.style.transform = 'translate3d(2048px, 0, 0)';
        }

        // Wait for 45s for the CSS animation to complete
        await new Promise(r => setTimeout(r, 45000));

        if (!active || !isRotating) break;

        // Swap the views exactly when the container is off-screen
        setCurrentView(prev => prev === 'LOCAL' ? 'GLOBAL' : 'LOCAL');
        setCurrentViewW2(prev => prev === 'TICKERS' ? 'MOVERS' : 'TICKERS');
        setCurrentViewW3(prev => prev === 'NEWS' ? 'SCOUT' : 'NEWS');

        // Snap back instantly to 0px (remove transition)
        if (containerRef.current) {
          containerRef.current.style.transition = 'none';
          containerRef.current.style.transform = 'translate3d(0px, 0, 0)';
          // Force reflow so the browser applies the jump instantly
          void containerRef.current.offsetWidth;
        }

        // Small pause before spinning again
        await new Promise(r => setTimeout(r, 1000));
      }
    };

    if (isRotating) {
      cycle();
    } else {
      if (containerRef.current) {
        containerRef.current.style.transition = 'none';
        containerRef.current.style.transform = 'translate3d(0px, 0, 0)';
      }
    }

    return () => {
      active = false;
    };
  }, [isRotating]);

  const handleToggleRotation = () => {
    if (isRotating) {
      // Detener rotacion
      setIsFadingBlack(true);
      setTimeout(() => {
        setIsRotating(false);
        setCurrentView('LOCAL');
        setCurrentViewW2('TICKERS');
        setCurrentViewW3('NEWS');
        setIsFadingBlack(false);
      }, 800); // Fades in black 800ms
    } else {
      // Iniciar rotacion
      setIsRotating(true);
    }
  };

  // Reloj maestro: resetea TODAS las headlines juntas cada ciclo
  // +4s de pausa al final para que se queden quietas antes de reiniciar
  // (La lógica anterior fue removida para simplificar el renderizado)

  useEffect(() => {
    let socket;
    let isMounted = true; // Control para no actuar si el componente se desmontó

    const connect = () => {
      socket = new WebSocket(`${WS_BASE}/ws`);

      socket.onopen = () => {
        if (isMounted) console.log("✅ Conectado al Backend (Real-Time)");
      };

      socket.onmessage = (event) => {
        if (!isMounted) return;
        const data = JSON.parse(event.data);
        console.log("📥 Comando recibido:", data.command);

        if (data.command === "START_AI_MODE") {
          setIsAiActive(true);
          // Cancelar cualquier timer de cierre anterior
          if (aiDismissTimer.current) clearTimeout(aiDismissTimer.current);
        }

        if (data.command === "SHOW_COMPANY_DATA") {
          if (aiDismissTimer.current) clearTimeout(aiDismissTimer.current);
          // Garantizar AI mode activo aunque se haya perdido START_AI_MODE (ej. reconexión WS)
          setIsAiActive(true);

          const pendingPayload = data.payload;

          // Mostrar la tarjeta y arrancar el auto-dismiss
          const revealCard = () => {
            setCompanyData(pendingPayload);
            aiDismissTimer.current = setTimeout(() => {
              setIsAiActive(false);
              setCompanyData(null);
              window.speechSynthesis?.cancel();
            }, 30000);
          };

          // --- TTS: mantener "PROCESANDO" hasta que llegue el audio ---
          if (pendingPayload) {
            // Fallback: si el TTS tarda más de 15s, mostrar la tarjeta igual
            const fallbackTimer = setTimeout(revealCard, 15000);

            (async () => {
              try {
                const resp = await fetch(`${API_BASE}/api/tts-company`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(pendingPayload),
                });
                clearTimeout(fallbackTimer);
                if (resp.ok) {
                  const blob = await resp.blob();
                  const audioUrl = URL.createObjectURL(blob);
                  const audio = new Audio(audioUrl);
                  revealCard();   // Mostrar tarjeta justo cuando el audio está listo
                  audio.play();
                  window._ttsAudio = audio;
                } else {
                  revealCard();
                }
              } catch (e) {
                clearTimeout(fallbackTimer);
                console.warn("TTS error:", e);
                revealCard();
              }
            })();
          } else {
            revealCard();
          }
        }

        if (data.command === "STOP_AI_MODE") {
          setIsAiActive(false);
          setCompanyData(null);
          if (aiDismissTimer.current) clearTimeout(aiDismissTimer.current);
          window.speechSynthesis?.cancel();
          if (window._ttsAudio) { window._ttsAudio.pause(); window._ttsAudio = null; }
        }

        // Manejador del WebSocket de Cotizaciones ROFEX (Mercado Local)
        if (data.command === "ROFEX_UPDATE") {
          const { symbol, price, pct_change } = data.payload;
          setRofexPrices(prev => {
            // Guardamos el objeto entero para que el scatter plot pueda usar pct_change diréctamente
            const oldPriceObj = prev[symbol];
            const oldPrice = oldPriceObj ? (typeof oldPriceObj === 'object' ? oldPriceObj.c : oldPriceObj) : null;

            // Si el precio cambió, aplicamos efecto de flash verde/rojo
            if (oldPrice && price !== oldPrice) {
              const direction = price > oldPrice ? 'up' : 'down';
              const flashKey = `rofex_${symbol}`;
              setFlashMap(fm => ({ ...fm, [flashKey]: direction }));
              setTimeout(() => setFlashMap(fm => {
                const copy = { ...fm };
                delete copy[flashKey];
                return copy;
              }), 800);
            }

            return { ...prev, [symbol]: { c: price, pc: pct_change } };
          });
        }
      };

      socket.onclose = () => {
        if (isMounted) {
          // Solo logueamos si realmente queremos reintentar, no por errores de montaje
          setTimeout(() => isMounted && connect(), 3000);
        }
      };

      socket.onerror = () => {
        // Dejamos que el onclose maneje la lógica para no duplicar errores en consola
        socket.close();
      };
    };

    connect();

    return () => {
      isMounted = false; // Marcamos como desmontado
      if (socket) socket.close();
    };
  }, []);

  // Eliminar simulación de tick falso de fin de semana

  // --- LÓGICA DE SENTIMIENTO (Se mantiene igual) ---
  const pricesArray = Array.isArray(prices) ? prices : [];
  const positiveCount = pricesArray.filter(p => p && p.change && parseFloat(p.change) > 0).length;
  const totalCount = pricesArray.length || 1;
  const ratio = positiveCount / totalCount;

  const renderDashboardContent = (keySuffix, { isAiActive, companyData, currentView, currentViewW2, currentViewW3, newsIdx } = {}) => (
    <div key={keySuffix} className="w-[2048px] h-[192px] bg-[#111111] text-white flex overflow-hidden font-mono select-none relative shrink-0">

      {/* AI DATA OVERLAY (Mounted inside the rotating wrapper when data is ready) */}
      <AnimatePresence>
        {isAiActive && companyData && <CompanyDataDisplay data={companyData} active={isAiActive} />}
      </AnimatePresence>

      {/* W1: CHART (512px) */}
      <motion.div
        animate={{ y: isAiActive ? -200 : 0 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1], delay: isAiActive ? 0 : 0.3 }}
        className="w-[512px] h-full border-r border-[#333] relative shrink-0 overflow-hidden bg-[#111111]"
      >
        <div className="absolute inset-0 w-full h-full">
          <FinancialChart
            ticker={TICKERS_ROTATION[idx]}
            onCycleComplete={() => setIdx(i => (i + 1) % TICKERS_ROTATION.length)}
          />
        </div>
      </motion.div>

      {/* W2: MARKET WATCH (576px) */}
      <motion.div
        animate={{ y: isAiActive ? 200 : 0 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1], delay: isAiActive ? 0 : 0.3 }}
        className="w-[576px] h-full border-r border-white/5 shrink-0 bg-[#151515] flex flex-col shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]">

        <div className="relative w-full h-full">
          <AnimatePresence mode="wait">
            {currentViewW2 === 'TICKERS' ? (
              <motion.div
                key="market-watch"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -50, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="absolute inset-0 w-full h-full flex"
              >
                <BubbleSwarm data={rofexPrices} flashMap={flashMap} />
              </motion.div>
            ) : (
              <motion.div
                key="top-movers"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -50, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="absolute inset-0 w-full h-full"
              >
                <TopMovers />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* W3: NEWS / ECO CALENDAR (384px) */}
      <motion.div
        animate={{ y: isAiActive ? -200 : 0 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1], delay: isAiActive ? 0 : 0.3 }}
        className="w-[384px] h-[192px] border-r border-white/5 shrink-0 bg-[#151515] font-sans overflow-hidden relative shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]"
      >
        <AnimatePresence mode="wait">
          {currentViewW3 === 'NEWS' ? (
            <motion.div
              key="news-view"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col"
            >
              {/* Header noticias */}
              <div className="w-full px-5 py-2.5 border-b border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent flex justify-between items-center z-10 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-zinc-400 -translate-y-[0.5px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2.5 2.5 0 00-2.5-2.5H14" />
                  </svg>
                  <span className="text-white/80 text-[10px] font-semibold tracking-[0.2em]">ÚLTIMAS NOTICIAS</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-sm bg-red-500/10 border border-red-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                  <span className="text-red-400 text-[8px] font-bold tracking-[0.15em] -translate-y-[0.5px]">EN VIVO</span>
                </div>
              </div>
              {/* Contenido noticias */}
              <div className="flex-1 overflow-hidden relative">
                <PremiumNewsFeed news={news} activeIdx={newsIdx} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="scout-view"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col"
            >
              {/* El header fue removido para dar más espacio al texto */}
              {/* Contenido scout */}
              <div className="flex-1 overflow-hidden relative">
                <YahooScoutWidget />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* W4: WORLD CLOCKS / HEATMAP (576px) */}
      <motion.div
        animate={{ y: isAiActive ? 200 : 0 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1], delay: isAiActive ? 0 : 0.3 }}
        className="w-[576px] h-full flex items-center justify-center shrink-0 border-l border-r border-gray-900 relative overflow-hidden"
        style={{ background: '#111111' }}
      >

        <AnimatePresence mode="wait">
          {currentView === 'LOCAL' ? (
            <motion.div
              key="local-clocks"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="absolute inset-0 w-full h-full flex items-center justify-around px-3 z-20"
              style={{ background: 'radial-gradient(ellipse at 50% 40%, #1a1a1a 0%, #0e0e0e 55%, #080808 100%)' }}
            >
              {/* Vignette — solo para la vista de relojes */}
              <div className="absolute inset-0 pointer-events-none z-0" style={{
                background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.55) 100%)',
                boxShadow: 'inset 0 0 70px rgba(0,0,0,0.65)',
              }} />
              {/* Mapa del mundo de fondo (SVG realista) */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.08]"
                style={{
                  backgroundImage: 'url(/world_map.svg)',
                  backgroundSize: '80% auto',
                  backgroundPosition: 'center 20%',
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <Clock city="BS AS" zone="America/Argentina/Buenos_Aires" />
              <Clock city="NY" zone="America/New_York" />
              <Clock city="LONDON" zone="Europe/London" />
              <Clock city="TOKIO" zone="Asia/Tokyo" />
              <Clock city="BEIJING" zone="Asia/Shanghai" />
            </motion.div>
          ) : (
            <motion.div
              key="global-heatmap"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="absolute inset-0 w-full h-full"
            >
              <MarketHeatmap />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );

  return (
    <div className="flex flex-col bg-[#111111] overflow-hidden h-screen items-center">
      {/* Contenedor relativo para alinear perfectamente los botones con el ancho del LED */}
      <div className="relative w-[2048px] h-full">
        <div className="w-[2048px] h-[192px] relative overflow-hidden">
          <div
            ref={containerRef}
            className="absolute flex h-full transform-gpu"
            style={{ left: '-2048px', width: '4096px', willChange: 'transform' }}
          >
            {renderDashboardContent('clone', { isAiActive, companyData, currentView, currentViewW2, currentViewW3, newsIdx })}
            {renderDashboardContent('original', { isAiActive, companyData, currentView, currentViewW2, currentViewW3, newsIdx })}
          </div>
        </div>

        {/* AI LOADING OVERLAY (Mounted outside the rotating wrapper to stay fixed while loading) */}
        <AnimatePresence>
          {isAiActive && !companyData && <CompanyDataDisplay data={companyData} active={isAiActive} />}
        </AnimatePresence>

        {/* FADE TO BLACK OVERLAY */}
        <AnimatePresence>
          {isFadingBlack && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="fixed inset-0 bg-black z-50 pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* ROTATION CONTROL BUTTON (Below W1) */}
        <div className="absolute top-[216px] left-[256px] -translate-x-1/2 flex items-center justify-center">
          <button
            onClick={handleToggleRotation}
            className={`px-5 py-2 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 shadow-lg ${isRotating ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'}`}
          >
            {isRotating ? 'DETENER ROTACIÓN' : 'INICIAR ROTACIÓN'}
          </button>
        </div>

        {/* VIEW SWITCHER TABS (Bottom Bar, attached to W2) */}
        <div className={`absolute top-[216px] left-[800px] -translate-x-1/2 flex items-center gap-3 transition-opacity duration-500 ${isRotating ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
          <button
            onClick={() => setCurrentViewW2('TICKERS')}
            disabled={isRotating}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentViewW2 === 'TICKERS' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            Monitor Mercado
          </button>
          <button
            onClick={() => setCurrentViewW2('MOVERS')}
            disabled={isRotating}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentViewW2 === 'MOVERS' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            Movimientos
          </button>
        </div>

        {/* VIEW SWITCHER TABS (Bottom Bar, attached to W3) */}
        <div className={`absolute top-[216px] left-[1280px] -translate-x-1/2 flex items-center gap-3 transition-opacity duration-500 ${isRotating ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
          <button
            onClick={() => setCurrentViewW3('NEWS')}
            disabled={isRotating}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentViewW3 === 'NEWS' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            Titulares
          </button>
          <button
            onClick={() => setCurrentViewW3('SCOUT')}
            disabled={isRotating}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentViewW3 === 'SCOUT' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            RESUMEN IA
          </button>
        </div>

        {/* VIEW SWITCHER TABS (Bottom Bar, attached to W4) */}
        <div className={`absolute top-[216px] right-[288px] translate-x-1/2 flex items-center gap-3 transition-opacity duration-500 ${isRotating ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
          <button
            onClick={() => setCurrentView('LOCAL')}
            disabled={isRotating}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentView === 'LOCAL' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            Reloj Mundial
          </button>
          <button
            onClick={() => setCurrentView('GLOBAL')}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentView === 'GLOBAL' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            Mercados Globales
          </button>
        </div>
      </div>
    </div>
  );
}


const CLOCK_FLAGS = {
  'BS AS': '🇦🇷', 'NY': '🇺🇸', 'LONDON': '🇬🇧', 'TOKIO': '🇯🇵', 'BEIJING': '🇨🇳',
};

const CLOCK_MARKET_HOURS = {
  'BS AS': { sessions: [[11 * 60, 17 * 60]] },
  'NY': { sessions: [[9 * 60 + 30, 16 * 60]] },
  'LONDON': { sessions: [[8 * 60, 16 * 60 + 30]] },
  'TOKIO': { sessions: [[9 * 60, 11 * 60 + 30], [12 * 60 + 30, 15 * 60 + 30]] },
  'BEIJING': { sessions: [[9 * 60 + 30, 11 * 60 + 30], [13 * 60, 15 * 60]] },
};

const Clock = ({ city, zone }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const pulse = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(pulse);
  }, []);

  const timeInZone = new Date(time.toLocaleString('en-US', { timeZone: zone }));
  const hrs = timeInZone.getHours();
  const mins = timeInZone.getMinutes();
  const secs = timeInZone.getSeconds();

  const rawHourDeg = (hrs % 12) * 30 + mins * 0.5 + secs * (0.5 / 60);
  const rawMinDeg = mins * 6 + secs * 0.1;
  const rawSecDeg = secs * 6;

  // Accumulated rotation — always increases so CSS transitions never animate backwards
  const prevRawRef = useRef({ h: rawHourDeg, m: rawMinDeg, s: rawSecDeg });
  const accRef = useRef({ h: rawHourDeg, m: rawMinDeg, s: rawSecDeg });
  const [degs, setDegs] = useState({ h: rawHourDeg, m: rawMinDeg, s: rawSecDeg });

  useEffect(() => {
    const prev = prevRawRef.current;
    if (rawHourDeg === prev.h && rawMinDeg === prev.m && rawSecDeg === prev.s) return;

    const getDelta = (oldAngle, newAngle) => {
      let d = newAngle - oldAngle;
      if (d < -180) d += 360;
      else if (d > 180) d -= 360;
      return d;
    };

    accRef.current = {
      h: accRef.current.h + getDelta(prev.h, rawHourDeg),
      m: accRef.current.m + getDelta(prev.m, rawMinDeg),
      s: accRef.current.s + getDelta(prev.s, rawSecDeg),
    };
    prevRawRef.current = { h: rawHourDeg, m: rawMinDeg, s: rawSecDeg };
    setDegs(accRef.current);
  }, [rawHourDeg, rawMinDeg, rawSecDeg]);

  const dayOfWeek = timeInZone.getDay();
  const minuteOfDay = hrs * 60 + mins;
  const schedule = CLOCK_MARKET_HOURS[city];
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isActive = isWeekday && schedule &&
    schedule.sessions.some(([open, close]) => minuteOfDay >= open && minuteOfDay < close);

  const sessionProgress = (() => {
    if (!isActive || !schedule) return null;
    for (const [open, close] of schedule.sessions) {
      if (minuteOfDay >= open && minuteOfDay < close)
        return (minuteOfDay - open) / (close - open);
    }
    return null;
  })();

  const utcOffset = (() => {
    const utcTime = new Date(time.toLocaleString('en-US', { timeZone: 'UTC' }));
    const diff = Math.round((timeInZone - utcTime) / 3600000);
    return diff >= 0 ? `UTC+${diff}` : `UTC${diff}`;
  })();

  const S = 160;
  const C = S / 2;
  const R = 66;
  const uid = city.replace(/\s/g, '');
  const accent = isActive ? '#00e5a0' : '#ff4455';

  const sessionArcPath = (() => {
    const pct = sessionProgress;
    if (!pct || pct <= 0) return null;
    const p = Math.min(pct, 0.9999);
    const toRad = a => a * Math.PI / 180;
    const r = R + 7;
    const x1 = C + r * Math.cos(toRad(-90));
    const y1 = C + r * Math.sin(toRad(-90));
    const endA = -90 + p * 360;
    const x2 = C + r * Math.cos(toRad(endA));
    const y2 = C + r * Math.sin(toRad(endA));
    return `M ${x1} ${y1} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
  })();

  const hourMarkers = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 - 90) * (Math.PI / 180);
    const isCard = i % 3 === 0;
    const outerR = R - 3;
    const len = isCard ? 10 : 8;
    return {
      x1: C + outerR * Math.cos(a), y1: C + outerR * Math.sin(a),
      x2: C + (outerR - len) * Math.cos(a), y2: C + (outerR - len) * Math.sin(a),
      w: isCard ? 2.6 : 2.2, color: isCard ? '#cccccc' : '#686868', idx: i,
    };
  });

  const minuteDots = Array.from({ length: 60 }, (_, i) => {
    if (i % 5 === 0) return null;
    const a = (i * 6 - 90) * (Math.PI / 180);
    const r = R - 5;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a), idx: i };
  }).filter(Boolean);

  const buildHourHand = () => {
    const L = 29, W = 7.5, tail = 8;
    return `M ${C} ${C + tail} L ${C - W / 2} ${C - L * 0.28} L ${C - 1} ${C - L} L ${C + 1} ${C - L} L ${C + W / 2} ${C - L * 0.28} Z`;
  };

  const buildMinHand = () => {
    const L = 50, W = 5.5, tail = 10;
    return `M ${C} ${C + tail} L ${C - W / 2} ${C - L * 0.2} L ${C - 0.8} ${C - L} L ${C + 0.8} ${C - L} L ${C + W / 2} ${C - L * 0.2} Z`;
  };

  return (
    <div className="flex flex-col items-center relative z-10" style={{ width: '108px' }}>

      {/* ── CITY HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginBottom: '4px' }}>
        <span style={{ fontSize: '14px', lineHeight: 1 }}>{CLOCK_FLAGS[city] || '🌐'}</span>
        <span style={{
          fontSize: '10px', fontWeight: 800, letterSpacing: '0.22em',
          color: '#aaa', textTransform: 'uppercase', fontFamily: 'sans-serif',
        }}>{city}</span>
      </div>

      {/* ── SVG CLOCK FACE ── */}
      <svg width={108} height={108} viewBox={`0 0 ${S} ${S}`} style={{ transform: 'translateZ(0)' }}>
        <defs>
          <radialGradient id={`dial-${uid}`} cx="35%" cy="28%" r="75%">
            <stop offset="0%" stopColor="#181c2e" />
            <stop offset="45%" stopColor="#0c0e18" />
            <stop offset="100%" stopColor="#060608" />
          </radialGradient>
          <radialGradient id={`bezel-${uid}`} cx="22%" cy="18%" r="85%">
            <stop offset="0%" stopColor="#9c9c9c" />
            <stop offset="22%" stopColor="#505050" />
            <stop offset="52%" stopColor="#2d2d2d" />
            <stop offset="78%" stopColor="#585858" />
            <stop offset="100%" stopColor="#1c1c1c" />
          </radialGradient>
          <radialGradient id={`glass-${uid}`} cx="28%" cy="15%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id={`pivot-${uid}`} cx="30%" cy="22%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#c8c8c8" />
            <stop offset="100%" stopColor="#3a3a3a" />
          </radialGradient>
          <filter id={`aglow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={`oglow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={`hshadow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="1.5" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity="0.85" />
          </filter>
        </defs>

        {/* Ambient outer glow when open */}
        {isActive && (
          <circle cx={C} cy={C} r={R + 16}
            fill="none" stroke={accent} strokeWidth="2"
            opacity="0.2" filter={`url(#oglow-${uid})`}
          />
        )}

        {/* Bezel */}
        <circle cx={C} cy={C} r={R + 11} fill={`url(#bezel-${uid})`} />

        {/* Session track (full ring, dim) */}
        <circle cx={C} cy={C} r={R + 7}
          fill="none" stroke={accent}
          strokeWidth="2" opacity={isActive ? 0.12 : 0.08}
        />

        {/* Session progress arc */}
        {sessionArcPath && (
          <path d={sessionArcPath}
            fill="none" stroke={accent} strokeWidth="2.5"
            strokeLinecap="round" opacity="0.9"
            filter={`url(#aglow-${uid})`}
          />
        )}

        {/* Dial */}
        <circle cx={C} cy={C} r={R + 2} fill={`url(#dial-${uid})`} />
        <circle cx={C} cy={C} r={R + 2} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

        {/* Minute dots */}
        {minuteDots.map(({ x, y, idx }) => (
          <circle key={idx} cx={x} cy={y} r="0.9" fill="#323232" />
        ))}

        {/* Hour markers */}
        {hourMarkers.map(({ x1, y1, x2, y2, w, color, idx }) => (
          <line key={idx} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={color} strokeWidth={w} strokeLinecap="square"
          />
        ))}

        {/* Hour hand */}
        <g
          style={{
            transform: `rotate(${degs.h}deg)`,
            transformOrigin: `${C}px ${C}px`,
            transition: 'transform 0.4s ease-out',
          }}
          filter={`url(#hshadow-${uid})`}
        >
          <path d={buildHourHand()} fill="#e0e0e0" />
          <path d={`M ${C} ${C - 7} L ${C} ${C - 26}`}
            stroke="rgba(255,255,200,0.65)" strokeWidth="1.8" strokeLinecap="round"
          />
        </g>

        {/* Minute hand */}
        <g
          style={{
            transform: `rotate(${degs.m}deg)`,
            transformOrigin: `${C}px ${C}px`,
            transition: 'transform 0.4s ease-out',
          }}
          filter={`url(#hshadow-${uid})`}
        >
          <path d={buildMinHand()} fill="#d0d0d0" />
          <path d={`M ${C} ${C - 10} L ${C} ${C - 47}`}
            stroke="rgba(255,255,200,0.5)" strokeWidth="1.4" strokeLinecap="round"
          />
        </g>

        {/* Second hand */}
        <g
          style={{
            transform: `rotate(${degs.s}deg)`,
            transformOrigin: `${C}px ${C}px`,
            transition: 'transform 0.3s cubic-bezier(0.4, 2.08, 0.55, 0.44)',
          }}
        >
          <line x1={C} y1={C + 17} x2={C} y2={C + 5}
            stroke="#bb1e00" strokeWidth="3.5" strokeLinecap="round" />
          <line x1={C} y1={C + 5} x2={C} y2={C - 56}
            stroke={accent} strokeWidth="1.1" strokeLinecap="round" />
          <circle cx={C} cy={C + 13} r="4.5" fill="#bb1e00" />
        </g>

        {/* Center pivot */}
        <circle cx={C} cy={C} r="6.5" fill={`url(#pivot-${uid})`} stroke="#1a1a1a" strokeWidth="0.8" />
        <circle cx={C} cy={C} r="2.5" fill="#0a0a0a" />

        {/* Sapphire crystal reflection */}
        <circle cx={C} cy={C} r={R + 2} fill={`url(#glass-${uid})`} />
        <circle cx={C} cy={C} r={R + 2} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
      </svg>

      {/* Digital time */}
      <span style={{
        fontSize: '14px',
        fontFamily: "'SF Mono', 'JetBrains Mono', 'Courier New', monospace",
        fontWeight: 600, color: '#cccccc', letterSpacing: '0.04em',
        fontVariantNumeric: 'tabular-nums', marginTop: '4px', lineHeight: 1,
        transform: 'translateY(6px) translateZ(0)', WebkitFontSmoothing: 'antialiased'
      }}>
        {timeInZone.toLocaleTimeString('en-US', {
          hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
        })}
      </span>

      {/* Market status + UTC offset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', transform: 'translateY(6px) translateZ(0)', WebkitFontSmoothing: 'antialiased' }}>
        <div style={{
          width: '5px', height: '5px', borderRadius: '50%',
          backgroundColor: accent,
          boxShadow: `0 0 ${isActive ? '7px' : '4px'} ${accent}`,
        }} />
        <span style={{
          fontSize: '8px', fontWeight: 700, letterSpacing: '0.18em',
          color: accent, textTransform: 'uppercase', fontFamily: 'sans-serif',
        }}>
          {isActive ? 'ABIERTO' : 'CERRADO'}
        </span>
        <span style={{ fontSize: '7px', color: '#ffffff', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
          {utcOffset}
        </span>
      </div>
    </div>
  );
};