import React, { useState, useEffect, useRef } from 'react';
import Chart from 'react-apexcharts';
import { TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
          <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-white/40">Aggregating Intel...</span>
        </div>
      </div>
    );
  }

  const activeNews = news[activeIdx] || news[0];

  // Aplicar el estilo más premium (Bloomberg) a TODAS las fuentes de noticias
  const getSourceStyle = (source) => {
    return {
      bgGradient: 'from-zinc-800/20 to-black',
      text: 'text-zinc-200',
      badge: 'bg-zinc-800/30 border-zinc-700/50 text-zinc-300',
      progress: 'from-white/60 via-white to-white/60'
    };
  };

  const style = getSourceStyle(activeNews.source || '');

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#131313] font-sans">

      {/* Dynamic Background Gradients */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`bg-${activeNews.id || activeIdx}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          className={`absolute inset-0 bg-gradient-to-br ${style.bgGradient} opacity-40 mix-blend-screen pointer-events-none`}
        />
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeNews.id || activeIdx}
          initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, filter: 'blur(5px)' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 px-6 py-4 flex flex-col justify-center"
        >
          <div className="flex justify-between items-center mb-3">
            <span className={`text-[9px] font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded-sm border backdrop-blur-md ${style.badge} ${style.text}`}>
              {activeNews.source || 'GLOBAL MARKETS'}
            </span>
            <span className="text-[10px] font-medium text-white/40 tracking-wider pt-[1px]">
              {activeNews.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <h3 className="text-white/95 text-[15px] font-medium leading-[1.5] tracking-wide line-clamp-3">
            {activeNews.headline}
          </h3>
        </motion.div>
      </AnimatePresence>

      {/* Modern Progress Bar Line */}
      <div className="absolute bottom-0 left-0 w-full h-[3px] bg-white/5">
        <motion.div
          key={`progress-${activeIdx}`}
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 6, ease: "linear" }}
          className={`h-full bg-gradient-to-r ${style.progress}`}
        />
      </div>
    </div>
  );
};

// --- WIDGET 1: GRÁFICO DINÁMICO UADE (ULTRA-CLEAN WHITE) ---
const FinancialChart = ({ ticker, onCycleComplete }) => {
  const [series, setSeries] = useState([
    { name: ticker, type: 'area', data: [] },
    { name: 'SMA 20', type: 'line', data: [] },
    { name: 'SMA 50', type: 'line', data: [] },
  ]);
  const [scalesOpacity, setScalesOpacity] = useState(0);
  const [lineClip, setLineClip] = useState(0);
  const [priceInfo, setPriceInfo] = useState(null);
  const [labelAnim, setLabelAnim] = useState('');
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const runSequence = async () => {
      // RESET: Todo limpio
      setScalesOpacity(0);
      setLineClip(0);
      setLabelAnim('');
      setPriceInfo(null);

      try {
        // Timeout de 12s para dar margen a la descarga de 5 días
        const fetchTimeout = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(`${API_BASE}/api/chart/${ticker}`, { signal: controller.signal });
        clearTimeout(fetchTimeout);
        const data = await res.json();

        if (cancelled) return;

        if (data && data.length > 0) {
          setSeries([
            { name: ticker, type: 'area', data: data.map(d => [d.time, d.value]) },
            { name: 'SMA 20', type: 'line', data: data.filter(d => d.sma20 != null).map(d => [d.time, d.sma20]) },
            { name: 'SMA 50', type: 'line', data: data.filter(d => d.sma50 != null).map(d => [d.time, d.sma50]) },
          ]);

          // Calcular precio y variación
          const lastPrice = data[data.length - 1].value;
          const firstPrice = data[0].value;
          const pctChange = ((lastPrice - firstPrice) / firstPrice * 100);
          const lastSma20 = data.filter(d => d.sma20 != null).slice(-1)[0]?.sma20 || null;
          const lastSma50 = data.filter(d => d.sma50 != null).slice(-1)[0]?.sma50 || null;
          if (!cancelled) setPriceInfo({ price: lastPrice, change: pctChange, sma20: lastSma20, sma50: lastSma50 });

          // 1. ENTRADA: Fundido de escalas, luego barrido de línea
          await new Promise(r => setTimeout(r, 500));
          if (cancelled) return;
          setScalesOpacity(1);

          await new Promise(r => setTimeout(r, 600));
          if (cancelled) return;
          setLineClip(100);

          // 2. Etiqueta aparece con barrido cuando la línea terminó
          await new Promise(r => setTimeout(r, 1600));
          if (cancelled) return;
          setLabelAnim('enter');

          // 3. PAUSA de visualización
          await new Promise(r => setTimeout(r, 3500));
          if (cancelled) return;

          // 4. SALIDA: barrido inverso de la etiqueta
          setLabelAnim('exit');
          await new Promise(r => setTimeout(r, 600));
          if (cancelled) return;

          // 5. El barrido de la línea arranca
          setLineClip(0);

          // 6. FUNDIDO DE ESCALAS
          await new Promise(r => setTimeout(r, 800));
          if (cancelled) return;
          setScalesOpacity(0);

          // 7. ESPERA FINAL: Completar animaciones
          await new Promise(r => setTimeout(r, 500));
          if (cancelled) return;
          onCycleComplete();
        } else {
          // Sin datos: avanzar al siguiente ticker
          await new Promise(r => setTimeout(r, 1000));
          if (!cancelled) onCycleComplete();
        }
      } catch (e) {
        // Error o abort (timeout/unmount): avanzar al siguiente ticker
        if (!cancelled) onCycleComplete();
      }
    };

    runSequence();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ticker]);

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
    <div
      className="w-full h-full relative font-mono flex flex-col bg-transparent transition-opacity duration-300"
      style={{ opacity: series[0].data.length > 0 ? 1 : 0 }}
    >

      {/* ── CONTENEDOR DEL GRÁFICO ── */}
      <div className="flex-1 relative mt-[1px]">
        {/* CSS para animar fundido / barrido */}
        <style>{`
          .apexcharts-xaxis-texts-g, .apexcharts-yaxis-texts-g {
            transition: opacity 1500ms ease-in-out !important;
            opacity: ${scalesOpacity};
          }
          /* Grid stays static, only series fade/clip away */
          .apexcharts-series-group, 
          .apexcharts-area-series, 
          .apexcharts-line-series {
            transition: clip-path 1500ms ease-in-out !important;
            clip-path: inset(0 ${100 - lineClip}% 0 0);
          }
        `}
        </style>

        {/* DAY SESSION INFO BOX (LAST PRICE, VARIACIÓN, SMAs) */}
        <div className="absolute top-[8px] left-[8px] z-10 border border-[#888] rounded-sm bg-[#111111]/70 text-white text-[8px] p-1 w-36 font-bold shadow-md">
          <div className="text-center mb-[2px] tracking-wide text-[#bbbbbb] pb-[2px] border-b border-[#333]">Day Session (<span className="text-white text-[10px]">{ticker}</span>)</div>
          <div className="flex justify-between items-center pt-[2px]">
            <span className="flex items-center gap-[3px]"><span className="w-1.5 h-1.5 bg-white inline-block"></span>Last Price</span>
            <span>{priceInfo ? priceInfo.price.toFixed(2) : '-'}</span>
          </div>
          <div className="flex justify-between items-center mt-[1px]">
            <span className="flex items-center gap-[3px] text-[#999]"><span className="w-1.5 h-1.5 bg-[#999] inline-block"></span>Change %</span>
            <span className={priceInfo?.change >= 0 ? "text-emerald-400" : "text-[#ff0000]"}>
              {priceInfo ? `${priceInfo.change > 0 ? '+' : ''}${priceInfo.change.toFixed(2)}%` : '-'}
            </span>
          </div>
          <div className="flex justify-between items-center mt-[1px]">
            <span className="flex items-center gap-[3px]"><span className="w-1.5 h-1.5 bg-[#FFD700] inline-block"></span>SMA 20</span>
            <span className="text-[#FFD700]">{priceInfo?.sma20 ? priceInfo.sma20.toFixed(2) : '-'}</span>
          </div>
          <div className="flex justify-between items-center mt-[1px]">
            <span className="flex items-center gap-[3px]"><span className="w-1.5 h-1.5 bg-[#00E5FF] inline-block"></span>SMA 50</span>
            <span className="text-[#00E5FF]">{priceInfo?.sma50 ? priceInfo.sma50.toFixed(2) : '-'}</span>
          </div>
        </div>

        {/* GRÁFICO APEXCHARTS */}
        <Chart options={options} series={series} type="line" height="100%" width="100%" />
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
            Processing Information
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
    { label: 'MKT CAP', value: fmtLarge(marketCap) },
    { label: 'P/E TTM', value: fmtNum(trailingPE) },
    { label: 'BETA', value: fmtNum(beta) },
    { label: 'ENT. VAL', value: fmtLarge(enterpriseValue) },
    { label: 'EPS TTM', value: fmtNum(trailingEps) },
    { label: '52W CHG', value: fmtPct(weekChange52) },
    { label: 'OPEN', value: fmtNum(open) },
    { label: 'DAY HIGH', value: fmtNum(dayHigh) },
    { label: 'DAY LOW', value: fmtNum(dayLow) },
    { label: 'DIV YIELD', value: fmtPct(dividendYield) },
    { label: 'VOLUME', value: fmtVol(volume) },
    { label: 'AVG VOL', value: fmtVol(averageVolume) },
    { label: 'FWD P/E', value: fmtNum(forwardPE) },
    { label: 'ROE', value: fmtPct(returnOnEquity) },
    { label: 'NET MGN', value: fmtPct(profitMargins) },
    { label: 'DEBT/EQ', value: fmtNum(debtToEquity) },
    { label: 'EV/EBITDA', value: fmtNum(enterpriseToEbitda) },
    { label: 'P/BOOK', value: fmtNum(priceToBook) },
  ]; // 18 items (6 filas x 3 columnas)

  const incomeRows = [
    { label: 'TOTAL REVENUE', key: 'revenue' },
    { label: 'GROSS PROFIT', key: 'grossProfit' },
    { label: 'OPER. INCOME', key: 'operatingIncome' },
    { label: 'PRE-TAX INC.', key: 'pretaxIncome' },
    { label: 'NET INCOME', key: 'netIncome' },
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
          <span className={`text-[11px] font-bold uppercase tracking-[0.25em] ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>Returning in 00:{timeLeft.toString().padStart(2, '0')}</span>
        </div>

        {scout_summary ? (
          <div className="mt-12 text-[15px] leading-[1.6] text-[#e0e0e0] font-sans pr-4 tracking-wide font-medium">
            <AnimatedTypingText text={scout_summary} isPos={isPos} />
          </div>
        ) : (
          <div className="mt-12 text-[14px] text-[#444] italic uppercase tracking-widest animate-pulse">
            Analyzing market data...
          </div>
        )}
      </div>

      {/* ── COL 4: Income Statement (580px) ── */}
      <div
        className="flex flex-col justify-center px-6 shrink-0 bg-[#141414]"
        style={{ width: '580px' }}
      >
        <div className="flex items-center text-[9px] uppercase tracking-widest mb-[6px] pb-[5px] border-b border-[#333]">
          <div className="w-[120px] text-[#555] shrink-0">INCOME STMT</div>
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

// --- WIDGET 3 ALTERNATIVO: YAHOO SCOUT INTELLIGENCE (384px) ---
const YahooScoutWidget = () => {
  const [localIdx, setLocalIdx] = useState(0);
  const [data, setData] = useState(null);
  const ticker = TICKERS_ROTATION[localIdx];

  // Bucle independiente: Cambiar de acción cada 25 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalIdx(prev => (prev + 1) % TICKERS_ROTATION.length);
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  // Fetch data cuando cambia el ticker local
  useEffect(() => {
    let active = true;
    const fetchScout = async () => {
      setData(null);
      try {
        const res = await fetch(`${API_BASE}/api/scout/${ticker}`);
        const result = await res.json();
        if (active && result && result.summary) {
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
    <div className="w-full h-full p-4 flex flex-col font-mono text-white/90 bg-[#151515]">
      {!data ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-white/30 text-[10px] uppercase tracking-widest">
          <svg className="w-4 h-4 text-emerald-400/50 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          ANALYZING {ticker}...
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-2 border-b border-emerald-400/20 pb-2 shrink-0">
            <span className="text-[14px] font-bold text-white/90 tracking-wider tooltip" title={data.name}>
              {data.ticker}
            </span>
            <span className="text-[9px] text-emerald-400 uppercase tracking-widest bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20 -translate-y-[2px]">
              AI SUMMARY
            </span>
          </div>
          <div className="flex-1 overflow-hidden mt-1 text-[15px] leading-[1.6] text-[#e0e0e0] font-sans pr-1 tracking-wide font-medium flex flex-col">
            <AnimatedTypingText text={data.summary} isPos={true} speed={40} className="flex-1 h-full" />
          </div>
        </>
      )}
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
        if (active) setData(result);
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
          {/* Luz dinámica que viaja por la barra usando el index para cascadear */}
          <div
            className="absolute top-0 bottom-0 left-0 w-[100px] bg-gradient-to-r from-transparent via-white/25 to-transparent mix-blend-overlay blur-[2px]"
            style={{
              animation: `shimmer-bar 3s infinite cubic-bezier(0.4, 0, 0.2, 1)`,
              animationDelay: `${index * 0.2}s`
            }}
          />
        </div>

        {/* Contenido (Z-10 para estar sobre la barra) */}
        <div className="relative z-10 flex justify-between items-center w-full h-full">
          <div className="flex flex-col z-10">
            <span className="text-[14px] font-bold text-[#e2e8f0] tracking-wide">{item.symbol}</span>
          </div>

          {/* Capa de difuminado (gradient) atrás del texto para que el borde brillante nunca corte visualmente los números */}
          <div className="absolute right-[-16px] pl-16 pr-4 h-full flex items-center gap-2 bg-gradient-to-l from-[#151515] via-[#151515]/90 to-transparent z-20">
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
    <div className="w-full h-full flex bg-[#151515] font-sans shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] border-r border-[#111]">
      <style>{`
        @keyframes shimmer-bar {
          0% { transform: translateX(-150%) skewX(-20deg); opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateX(800%) skewX(-20deg); opacity: 0; }
        }
      `}</style>
      {/* Columna Izquierda: Gainers */}
      <div className="flex-1 flex flex-col border-r border-[#1f2329]/50">
        <div className="h-[24px] flex items-center px-2 border-b border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent">
          <span className="text-[9px] tracking-[0.15em] font-bold uppercase opacity-75" style={{ color: '#34d399' }}>Top Gainers</span>
        </div>
        <div className="flex-1 flex flex-col">
          {data.gainers.length > 0
            ? data.gainers.map((item, i) => (
              <div key={`g-${i}`} className={`flex-1 flex border-b border-white/[0.02] ${i === data.gainers.length - 1 ? 'border-b-0' : ''}`}>
                {renderBar(item, true, maxGain, i)}
              </div>
            ))
            : <div className="flex-1 flex items-center justify-center text-[10px] text-zinc-600 uppercase tracking-widest animate-pulse">Scanning...</div>
          }
        </div>
      </div>

      {/* Columna Derecha: Losers */}
      <div className="flex-1 flex flex-col">
        <div className="h-[24px] flex items-center px-2 border-b border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent">
          <span className="text-[9px] tracking-[0.15em] font-bold uppercase opacity-75" style={{ color: '#f87171' }}>Top Losers</span>
        </div>
        <div className="flex-1 flex flex-col">
          {data.losers.length > 0
            ? data.losers.map((item, i) => (
              <div key={`l-${i}`} className={`flex-1 flex border-b border-white/[0.02] ${i === data.losers.length - 1 ? 'border-b-0' : ''}`}>
                {renderBar(item, false, maxLoss, i)}
              </div>
            ))
            : <div className="flex-1 flex items-center justify-center text-[10px] text-zinc-600 uppercase tracking-widest animate-pulse">Scanning...</div>
          }
        </div>
      </div>
    </div>
  );
};

// --- WIDGET 4 ALTERNATIVO: MARKET HEATMAP (576px) ---
const MarketHeatmap = () => {
  const [data, setData] = useState({ commodities: [], indices: [] });
  const [flashMap, setFlashMap] = useState({});

  useEffect(() => {
    let active = true;
    const fetchHeatmap = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/market-heatmap`);
        const result = await res.json();

        if (active && result && result.commodities && result.indices) {
          setData(prev => {
            // Check for flashes
            const newFlash = { ...flashMap };

            const checkFlashes = (newItems, oldItems, prefix) => {
              if (!newItems || !oldItems) return;
              newItems.forEach((item, i) => {
                const oldItem = oldItems[i];
                if (oldItem && item.price !== oldItem.price) {
                  const direction = parseFloat(item.price) > parseFloat(oldItem.price) ? 'up' : 'down';
                  const key = `${prefix}_${item.symbol}`;
                  newFlash[key] = direction;

                  // Clear flash after 800ms
                  setTimeout(() => {
                    setFlashMap(current => {
                      const copy = { ...current };
                      delete copy[key];
                      return copy;
                    });
                  }, 800);
                }
              });
            };

            checkFlashes(result.commodities, prev.commodities, 'comm');
            checkFlashes(result.indices, prev.indices, 'idx');

            if (Object.keys(newFlash).length > Object.keys(flashMap).length) {
              setFlashMap(newFlash);
            }

            return result;
          });
        }
      } catch (e) {
        console.error("Heatmap fetch error", e);
      }
    };

    fetchHeatmap();
    const interval = setInterval(fetchHeatmap, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const renderCell = (item, prefix) => {
    // Elegant cell backgrounds: Deep dark like Widget 2
    const bgColor = '#161616';

    if (!item) return <div className="flex-1" style={{ backgroundColor: bgColor }} />;

    const changePct = parseFloat(item.change) || 0;
    const changeAbs = parseFloat(item.change_abs || '0');
    const isPos = changePct >= 0;

    // Professional green/red matching Widget 2 (emerald-400 / red-400)
    const valColor = isPos ? '#34d399' : '#f87171';

    const flash = flashMap[`${prefix}_${item.symbol}`];

    return (
      <div
        key={item.symbol}
        className={`flex-1 flex flex-col justify-between p-2 relative overflow-hidden transition-all duration-300 ${flash === 'up' ? 'ring-1 ring-inset ring-[#34d399] z-10 brightness-125' : flash === 'down' ? 'ring-1 ring-inset ring-[#f87171] z-10 brightness-125' : ''}`}
        style={{ backgroundColor: bgColor }}
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
    <div className="w-full h-full flex flex-col bg-[#303030] gap-[1px] font-sans shadow-[inset_0_0_20px_rgba(0,0,0,1)]">
      {data.commodities.length === 0 && data.indices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-zinc-600 uppercase tracking-widest animate-pulse h-full bg-[#151515]">Scanning global markets...</div>
      ) : (
        <>
          {/* Fila 1: Commodities */}
          <div className="flex-1 flex w-full gap-[1px]">
            {data.commodities.length > 0 ? data.commodities.map((item) => renderCell(item, 'comm')) : Array(5).fill(0).map((_, i) => renderCell(null, 'comm'))}
          </div>
          {/* Fila 2: Indices */}
          <div className="flex-1 flex w-full gap-[1px]">
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

  const [prices, setPrices] = useState([]);

  const [rofexPrices, setRofexPrices] = useState({});
  const [news, setNews] = useState([]);
  const [flashMap, setFlashMap] = useState({});
  const prevPricesRef = useRef([]);
  const [idx, setIdx] = useState(0);
  const [masterTime, setMasterTime] = useState(new Date());
  const [maxDuration, setMaxDuration] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);
  const socketRef = useRef(null);
  const [isAiActive, setIsAiActive] = useState(false);
  const [companyData, setCompanyData] = useState(null);
  const [newsIdx, setNewsIdx] = useState(0);
  const aiDismissTimer = useRef(null);

  useEffect(() => {
    const pulse = setInterval(() => setMasterTime(new Date()), 1000);
    return () => clearInterval(pulse);
  }, []);

  const newsRef = useRef(news);

  useEffect(() => {
    newsRef.current = news;
  }, [news]);

  // Rotación de noticias robusta: el intervalo lee siempre la longitud actual de `news` a través del ref
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
          // Actualizaciones siguientes: escalonar cada ticker con delay aleatorio
          newPrices.forEach((p, i) => {
            const delay = Math.random() * 3000;
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

  useEffect(() => {
    if (news.length > 0) {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      context.font = "14px 'JetBrains Mono'";

      const times = news.slice(0, 5).map(n => {
        const metrics = context.measureText(n.headline.toUpperCase());
        const textWidth = metrics.width;
        const containerWidth = 280; // ~75% de 384px
        const dist = Math.max(0, textWidth - containerWidth);

        // (Distancia / Velocidad 18px/s) + 3s de pausa total (1.5s inicio + 1.5s fin)
        return (dist / 18) + 3;
      });

      const slowest = Math.max(...times);
      // Seteamos la duración perfecta para que el más largo termine y todos peguen el salto
      setMaxDuration(slowest > 0 ? slowest : 8);
    }
  }, [news]);

  // Reloj maestro: resetea TODAS las headlines juntas cada ciclo
  // +4s de pausa al final para que se queden quietas antes de reiniciar
  const holdTime = 4;
  useEffect(() => {
    if (maxDuration <= 0) return;
    const interval = setInterval(() => setCycleKey(k => k + 1), (maxDuration + holdTime) * 1000);
    return () => clearInterval(interval);
  }, [maxDuration]);

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
          setCompanyData(data.payload);
          // Auto-dismiss a los 30 segundos
          if (aiDismissTimer.current) clearTimeout(aiDismissTimer.current);
          aiDismissTimer.current = setTimeout(() => {
            setIsAiActive(false);
            setCompanyData(null);
          }, 30000);
        }

        if (data.command === "STOP_AI_MODE") {
          setIsAiActive(false);
          setCompanyData(null);
          if (aiDismissTimer.current) clearTimeout(aiDismissTimer.current);
        }

        // Manejador del WebSocket de Cotizaciones ROFEX (Mercado Local)
        if (data.command === "ROFEX_UPDATE") {
          const { symbol, price } = data.payload;
          setRofexPrices(prev => {
            const oldPrice = prev[symbol];

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

            return { ...prev, [symbol]: price };
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

  // --- EFECTO DE COTIZACIONES FALSAS PARA WIDGET 2 ---
  useEffect(() => {
    // Array de los símbolos a simular (mezcla de Rofex y Acciones locales)
    const mockSymbols = [
      "DLR/FEB26", "DLR/MAR26", "DLR/ABR26", "DLR/MAY26",
      "DLR/JUN26", "DLR/JUL26", "DLR/AGO26", "DLR/SEP26",
      "BMA - 48hs", "BYMA - 48hs", "CEPU - 48hs", "GGAL - 48hs",
      "PAMP - 48hs", "YPFD - 48hs", "TECO2 - 48hs", "LOMA - 48hs",
      "PESOS - 1D", "PESOS - 3D", "PESOS - 7D", "PESOS - 30D",
      "DOLARES - 1D", "DOLARES - 3D", "DOLARES - 7D", "DOLARES - 30D"
    ];

    // Valores iniciales "estáticos" en caso de que aún no existan
    const initialValues = {
      "DLR/FEB26": 1418.00, "DLR/MAR26": 1432.00, "DLR/ABR26": 1446.00, "DLR/MAY26": 1456.00,
      "DLR/JUN26": 1464.00, "DLR/JUL26": 1473.00, "DLR/AGO26": 1482.00, "DLR/SEP26": 1491.00,
      "BMA - 48hs": 13300.00, "BYMA - 48hs": 301.25, "CEPU - 48hs": 301.25, "GGAL - 48hs": 6850.00,
      "PAMP - 48hs": 4815.00, "YPFD - 48hs": 55950.00, "TECO2 - 48hs": 3285.00, "LOMA - 48hs": 3287.50,
      "PESOS - 1D": 30.25, "PESOS - 3D": 30.50, "PESOS - 7D": 31.80, "PESOS - 30D": 34.10,
      "DOLARES - 1D": 2.15, "DOLARES - 3D": 2.30, "DOLARES - 7D": 2.45, "DOLARES - 30D": 3.10
    };

    // Rellenamos el estado con los valores estáticos si están vacíos
    setRofexPrices(prev => ({ ...initialValues, ...prev }));

    const simulateTick = () => {
      // Elegir 1 a 3 símbolos al azar para actualizar
      const numToUpdate = Math.floor(Math.random() * 3) + 1;

      setRofexPrices(prev => {
        const nextState = { ...prev };
        const keysToUpdate = [];

        for (let i = 0; i < numToUpdate; i++) {
          const sym = mockSymbols[Math.floor(Math.random() * mockSymbols.length)];
          keysToUpdate.push(sym);

          let currentVal = nextState[sym] || 1000;

          // Lógica de fluctuación: las tasas fluctúan menos que los precios
          const isRate = sym.includes("PESOS") || sym.includes("DOLARES");
          const isUsdRate = sym.includes("DOLARES");

          let change;
          if (isRate) {
            change = (Math.random() - 0.5) * (isUsdRate ? 0.05 : 0.5); // Tasas fluctúan poquito
          } else {
            // Precios fluctúan entre -0.5% y +0.5%
            change = currentVal * ((Math.random() - 0.5) * 0.01);
          }

          const newVal = currentVal + change;

          // Solo actualizamos si el cambio es significativo (para evitar triggers en falso)
          if (Math.abs(newVal - currentVal) > 0.001) {
            nextState[sym] = newVal;

            // Disparar flash
            const direction = newVal > currentVal ? 'up' : 'down';
            const flashKey = `rofex_${sym}`;

            setFlashMap(fm => ({ ...fm, [flashKey]: direction }));
            setTimeout(() => setFlashMap(fm => {
              const copy = { ...fm };
              delete copy[flashKey];
              return copy;
            }), 800);
          }
        }
        return nextState;
      });
    };

    // Actualiza precios cada 800ms a 2000ms al azar
    const runSimulation = () => {
      simulateTick();
      const nextTimeout = 800 + Math.random() * 1200;
      simTimer = setTimeout(runSimulation, nextTimeout);
    };

    let simTimer = setTimeout(runSimulation, 2000);

    return () => clearTimeout(simTimer);
  }, []);

  // --- LÓGICA DE SENTIMIENTO (Se mantiene igual) ---
  const pricesArray = Array.isArray(prices) ? prices : [];
  const positiveCount = pricesArray.filter(p => p && p.change && parseFloat(p.change) > 0).length;
  const totalCount = pricesArray.length || 1;
  const ratio = positiveCount / totalCount;
  const r = Math.round(248 + (74 - 248) * ratio);
  const g = Math.round(113 + (222 - 113) * ratio);
  const b = Math.round(113 + (128 - 113) * ratio);
  const sentimentColor = `rgb(${r}, ${g}, ${b})`;
  const neonGlow = `0 0 2px ${sentimentColor}, 0 0 8px ${sentimentColor}, 0 0 15px ${sentimentColor}`;

  return (
    <div className="flex flex-col bg-[#111111] overflow-hidden h-screen items-center">

      <div className="w-[2048px] relative">
        {/* INTERFAZ DE ANCHO FIJO: 2048px totales */}
        <div className="w-full h-[192px] bg-[#111111] text-white flex overflow-hidden font-mono select-none relative shrink-0">



          <AnimatePresence>
            {isAiActive && <CompanyDataDisplay data={companyData} active={isAiActive} />}
          </AnimatePresence>

          {/* W1: CHART (512px) */}
          <motion.div
            animate={{ y: isAiActive ? -200 : 0 }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1], delay: isAiActive ? 0 : 0.3 }}
            className="w-[512px] h-full border-r border-[#333] relative shrink-0 overflow-hidden bg-[#111111]"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={typeof idx !== 'undefined' ? idx : 'chart'}
                initial={{ opacity: 0, filter: 'blur(3px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(3px)' }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="absolute inset-0 w-full h-full"
              >
                <FinancialChart
                  ticker={typeof TICKERS_ROTATION !== 'undefined' ? TICKERS_ROTATION[idx] : 'SPY'}
                  onCycleComplete={() => setIdx(i => (i + 1) % TICKERS_ROTATION.length)}
                />
              </motion.div>
            </AnimatePresence>
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
                    {(() => {
                      // Helpers de formateo
                      const fmtPrice = (val) => '$' + new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(val);
                      const fmtRate = (val) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + '%';

                      // Obtenemos los valores de rofex o null
                      const safeGet = (sym) => rofexPrices[sym] !== undefined ? rofexPrices[sym] : null;

                      // Definimos las columnas
                      const columns = [
                        {
                          title: "DÓLAR FUTURO",
                          flex: "w-[33%]",
                          priceMin: "min-w-[62px]",
                          items: [
                            { label: "DLR/FEB26", sym: "DLR/FEB26", val: safeGet("DLR/FEB26"), type: "price" },
                            { label: "DLR/MAR26", sym: "DLR/MAR26", val: safeGet("DLR/MAR26"), type: "price" },
                            { label: "DLR/ABR26", sym: "DLR/ABR26", val: safeGet("DLR/ABR26"), type: "price" },
                            { label: "DLR/MAY26", sym: "DLR/MAY26", val: safeGet("DLR/MAY26"), type: "price" },
                            { label: "DLR/JUN26", sym: "DLR/JUN26", val: safeGet("DLR/JUN26"), type: "price" },
                            { label: "DLR/JUL26", sym: "DLR/JUL26", val: safeGet("DLR/JUL26"), type: "price" },
                            { label: "DLR/AGO26", sym: "DLR/AGO26", val: safeGet("DLR/AGO26"), type: "price" },
                            { label: "DLR/SEP26", sym: "DLR/SEP26", val: safeGet("DLR/SEP26"), type: "price" }
                          ]
                        },
                        {
                          title: "CAUCIONES (TNA)",
                          flex: "w-[38%]",
                          priceMin: "min-w-[50px]",
                          items: [
                            { label: "PESOS - 1D", sym: "PESOS - 1D", val: 30.25, type: "rate" },
                            { label: "PESOS - 3D", sym: "PESOS - 3D", val: 30.50, type: "rate" },
                            { label: "PESOS - 7D", sym: "PESOS - 7D", val: 31.80, type: "rate" },
                            { label: "PESOS - 30D", sym: "PESOS - 30D", val: 34.10, type: "rate" },
                            { label: "DOLARES - 1D", sym: "DOLARES - 1D", val: 2.15, type: "rate" },
                            { label: "DOLARES - 3D", sym: "DOLARES - 3D", val: 2.30, type: "rate" },
                            { label: "DOLARES - 7D", sym: "DOLARES - 7D", val: 2.45, type: "rate" },
                            { label: "DOLARES - 30D", sym: "DOLARES - 30D", val: 3.10, type: "rate" }
                          ]
                        },
                        {
                          title: "ACCIONES (BYMA)",
                          flex: "w-[29%]",
                          priceMin: "min-w-[68px]",
                          isLast: true,
                          items: [
                            { label: "BMA", sym: "BMA - 48hs", val: 13300.00, type: "price" },
                            { label: "BYMA", sym: "BYMA - 48hs", val: 301.25, type: "price" },
                            { label: "CEPU", sym: "CEPU - 48hs", val: 301.25, type: "price" },
                            { label: "GGAL", sym: "GGAL - 48hs", val: 6850.00, type: "price" },
                            { label: "PAMP", sym: "PAMP - 48hs", val: 4815.00, type: "price" },
                            { label: "YPFD", sym: "YPFD - 48hs", val: 55950.00, type: "price" },
                            { label: "TECO2", sym: "TECO2 - 48hs", val: 3285.00, type: "price" },
                            { label: "LOMA", sym: "LOMA - 48hs", val: 3287.50, type: "price" }
                          ]
                        }
                      ];

                      const maxItems = 8;

                      return (
                        <div className="w-full h-full flex flex-col text-[12px] font-mono leading-none">

                          {/* Títulos de columnas */}
                          <div className="flex w-full border-b border-white/[0.05] shrink-0">
                            {columns.map((col, cIdx) => (
                              <div key={cIdx} className={`${col.flex} px-2 py-[3px] ${!col.isLast ? 'border-r border-white/[0.07]' : ''}`}>
                                <span className="text-[8.5px] tracking-[0.12em] text-white/20 uppercase font-semibold font-sans">{col.title}</span>
                              </div>
                            ))}
                          </div>

                          {/* Filas de datos */}
                          <div className="flex-1 flex flex-col min-h-0">
                            {Array.from({ length: maxItems }).map((_, rIdx) => {
                              const rowBgColor = rIdx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';

                              return (
                                <div key={rIdx} className="flex w-full flex-1 items-center" style={{ backgroundColor: rowBgColor }}>
                                  {columns.map((col, cIdx) => {
                                    const item = col.items[rIdx];
                                    if (!item || !item.label) {
                                      return <div key={cIdx} className={`${col.flex} flex px-2 h-full items-center shrink-0 ${!col.isLast ? 'border-r border-white/[0.07]' : ''}`}></div>;
                                    }

                                    const mockSymbolsArray = [
                                      "DLR/FEB26", "DLR/MAR26", "DLR/ABR26", "DLR/MAY26",
                                      "DLR/JUN26", "DLR/JUL26", "DLR/AGO26", "DLR/SEP26",
                                      "BMA - 48hs", "BYMA - 48hs", "CEPU - 48hs", "GGAL - 48hs",
                                      "PAMP - 48hs", "YPFD - 48hs", "TECO2 - 48hs", "LOMA - 48hs",
                                      "PESOS - 1D", "PESOS - 3D", "PESOS - 7D", "PESOS - 30D",
                                      "DOLARES - 1D", "DOLARES - 3D", "DOLARES - 7D", "DOLARES - 30D"
                                    ];

                                    const initialValuesMap = {
                                      "DLR/FEB26": 1418.00, "DLR/MAR26": 1432.00, "DLR/ABR26": 1446.00, "DLR/MAY26": 1456.00,
                                      "DLR/JUN26": 1464.00, "DLR/JUL26": 1473.00, "DLR/AGO26": 1482.00, "DLR/SEP26": 1491.00,
                                      "BMA - 48hs": 13300.00, "BYMA - 48hs": 301.25, "CEPU - 48hs": 301.25, "GGAL - 48hs": 6850.00,
                                      "PAMP - 48hs": 4815.00, "YPFD - 48hs": 55950.00, "TECO2 - 48hs": 3285.00, "LOMA - 48hs": 3287.50,
                                      "PESOS - 1D": 30.25, "PESOS - 3D": 30.50, "PESOS - 7D": 31.80, "PESOS - 30D": 34.10,
                                      "DOLARES - 1D": 2.15, "DOLARES - 3D": 2.30, "DOLARES - 7D": 2.45, "DOLARES - 30D": 3.10
                                    };

                                    const flashKey = `rofex_${item.sym}`;
                                    const flash = flashMap[flashKey];
                                    const symItem = mockSymbolsArray.includes(item.sym) ? item.sym : null;
                                    const hasVal = item.val !== null || safeGet(symItem) !== null;
                                    const currentVal = safeGet(item.sym) !== null ? safeGet(item.sym) : item.val;

                                    // Definir un precio inicial "base" para calcular una variación realista
                                    const initialVal = symItem ? initialValuesMap[symItem] : item.val;

                                    let fakeVar = 0;
                                    if (hasVal && currentVal && initialVal) {
                                      fakeVar = ((currentVal - initialVal) / initialVal) * 100;
                                    } else {
                                      // Fallback estático viejo si por alguna razón falla el simulador
                                      const hash = item.label.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                                      fakeVar = ((hash % 800) / 100) - 4; // Entre -4.00% y +4.00%
                                    }

                                    const isPos = fakeVar >= 0;

                                    return (
                                      <div
                                        key={cIdx}
                                        className={`${col.flex} flex justify-between items-center h-full pl-2 ${!col.isLast ? 'border-r border-white/[0.07]' : ''} ${flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''}`}
                                      >
                                        {/* Ticker label */}
                                        <span className="text-zinc-500 truncate mr-1 min-w-[30px] transform-gpu antialiased tracking-wide">{item.label}</span>
                                        <div className={`flex items-center h-full shrink-0 whitespace-nowrap transform-gpu antialiased ${cIdx > 0 ? 'pr-2' : 'pr-1'}`}>
                                          {/* Precio */}
                                          <div className={`relative h-full flex items-center ${col.priceMin} justify-end overflow-hidden ${hasVal ? "" : "text-white/20"} mr-1`} style={hasVal ? { color: '#c0c0c0' } : {}}>
                                            <AnimatePresence mode="popLayout" initial={false}>
                                              <motion.span
                                                key={hasVal ? currentVal : 'empty'}
                                                initial={{ y: flash === 'up' ? 10 : (flash === 'down' ? -10 : 0), opacity: flash ? 0 : 1, filter: flash ? 'blur(2px)' : 'blur(0px)' }}
                                                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                                                exit={{ y: flash === 'up' ? -10 : (flash === 'down' ? 10 : 0), opacity: flash ? 0 : 1, filter: flash ? 'blur(2px)' : 'blur(0px)' }}
                                                transition={{ duration: flash ? 0.25 : 0, ease: "easeOut" }}
                                                className="absolute right-0 font-mono tracking-tight"
                                              >
                                                {hasVal
                                                  ? (item.type === 'price' ? fmtPrice(currentVal) : fmtRate(currentVal))
                                                  : '-.--'}
                                              </motion.span>
                                            </AnimatePresence>
                                          </div>

                                          {/* Badge variación */}
                                          {hasVal ? (
                                            <div className={`relative h-full w-[42px] flex items-center justify-end font-bold text-[11px] transform-gpu antialiased overflow-hidden ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                                              <AnimatePresence mode="popLayout" initial={false}>
                                                <motion.div
                                                  key={fakeVar}
                                                  initial={{ y: flash === 'up' ? 8 : (flash === 'down' ? -8 : 0), opacity: flash ? 0 : 1, filter: flash ? 'blur(2px)' : 'blur(0px)' }}
                                                  animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                                                  exit={{ y: flash === 'up' ? -8 : (flash === 'down' ? 8 : 0), opacity: flash ? 0 : 1, filter: flash ? 'blur(2px)' : 'blur(0px)' }}
                                                  transition={{ duration: flash ? 0.25 : 0, ease: "easeOut" }}
                                                  className="absolute right-0"
                                                >
                                                  {isPos ? '+' : ''}{fakeVar.toFixed(2)}%
                                                </motion.div>
                                              </AnimatePresence>
                                            </div>
                                          ) : (
                                            <div className="h-full w-[45px]"></div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
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
                      <span className="text-white/80 text-[10px] font-semibold tracking-[0.2em]">LATEST HEADLINES</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-sm bg-red-500/10 border border-red-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                      <span className="text-red-400 text-[8px] font-bold tracking-[0.15em] -translate-y-[1.5px]">LIVE</span>
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
            className="w-[576px] h-full flex items-center justify-center shrink-0 border-l border-r border-gray-900 relative overflow-hidden bg-[#111111]"
          >
            <AnimatePresence mode="wait">
              {currentView === 'LOCAL' ? (
                <motion.div
                  key="local-clocks"
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -50, opacity: 0 }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                  className="absolute inset-0 w-full h-full flex items-center justify-around px-3 bg-zinc-950/20"
                >
                  {/* Mapa del mundo de fondo (SVG realista) */}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-[0.12]"
                    style={{
                      backgroundImage: 'url(/world_map.svg)',
                      backgroundSize: '80% auto',
                      backgroundPosition: 'center 20%',
                      backgroundRepeat: 'no-repeat',
                    }}
                  />
                  <Clock city="BS AS" zone="America/Argentina/Buenos_Aires" time={masterTime} />
                  <Clock city="NY" zone="America/New_York" time={masterTime} />
                  <Clock city="LONDON" zone="Europe/London" time={masterTime} />
                  <Clock city="TOKIO" zone="Asia/Tokyo" time={masterTime} />
                  <Clock city="BEIJING" zone="Asia/Shanghai" time={masterTime} />
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

        </div >

        {/* VIEW SWITCHER TABS (Bottom Bar, attached to W2) */}
        <div className="absolute top-[216px] left-[800px] -translate-x-1/2 flex items-center gap-3">
          <button
            onClick={() => setCurrentViewW2('TICKERS')}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentViewW2 === 'TICKERS' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            Market Watch
          </button>
          <button
            onClick={() => setCurrentViewW2('MOVERS')}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentViewW2 === 'MOVERS' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            Top Movers
          </button>
        </div>

        {/* VIEW SWITCHER TABS (Bottom Bar, attached to W3) */}
        <div className="absolute top-[216px] left-[1280px] -translate-x-1/2 flex items-center gap-3">
          <button
            onClick={() => setCurrentViewW3('NEWS')}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentViewW3 === 'NEWS' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            Headlines
          </button>
          <button
            onClick={() => setCurrentViewW3('SCOUT')}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentViewW3 === 'SCOUT' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            Yahoo Scout
          </button>
        </div>

        {/* VIEW SWITCHER TABS (Bottom Bar, attached to W4) */}
        <div className="absolute top-[216px] right-[288px] translate-x-1/2 flex items-center gap-3">
          <button
            onClick={() => setCurrentView('LOCAL')}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentView === 'LOCAL' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            World Clocks
          </button>
          <button
            onClick={() => setCurrentView('GLOBAL')}
            className={`px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-sm transition-all duration-300 ${currentView === 'GLOBAL' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
          >
            Global Markets
          </button>
        </div>

      </div >
    </div >
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

const Clock = ({ city, zone, time }) => {
  const timeInZone = new Date(time.toLocaleString('en-US', { timeZone: zone }));
  const hrs = timeInZone.getHours();
  const mins = timeInZone.getMinutes();
  const secs = timeInZone.getSeconds();

  const hourDeg = (hrs % 12) * 30 + mins * 0.5 + secs * (0.5 / 60);
  const minDeg = mins * 6 + secs * 0.1;

  // Accumulated rotation — always increases so CSS transition never animates backwards
  const prevSecsRef = useRef(secs);
  const accSecRef = useRef(secs * 6);
  if (secs !== prevSecsRef.current) {
    const delta = secs - prevSecsRef.current;
    accSecRef.current += (delta > 0 ? delta : 60 + delta) * 6;
    prevSecsRef.current = secs;
  }
  const secDeg = accSecRef.current;

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
            transform: `rotate(${hourDeg}deg)`,
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
            transform: `rotate(${minDeg}deg)`,
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
            transform: `rotate(${secDeg}deg)`,
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
          {isActive ? 'OPEN' : 'CLOSED'}
        </span>
        <span style={{ fontSize: '7px', color: '#ffffff', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
          {utcOffset}
        </span>
      </div>
    </div>
  );
};