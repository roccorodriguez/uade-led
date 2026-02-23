import React, { useState, useEffect, useRef } from 'react';
import Chart from 'react-apexcharts';
import { TrendingUp } from 'lucide-react';
import { motion, AnimatePresence, useTime, useTransform } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL;
const WS_BASE = import.meta.env.VITE_WS_URL;

const TICKERS_ROTATION = ["NVDA", "MSFT", "GOOG", "META", "TSLA", "AMZN", "AAPL"];

// --- WIDGET 3: PREMIUM NEWS FEED COMPONENT ---
const PremiumNewsFeed = ({ news, activeIdx }) => {
  if (!news || news.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center font-sans backdrop-blur-md bg-black/40">
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
    <div className="w-full h-full relative overflow-hidden bg-[#050505] font-sans">

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
    { name: 'Volumen', type: 'bar', data: [] }
  ]);
  const [scalesOpacity, setScalesOpacity] = useState(0);
  const [lineClip, setLineClip] = useState(0);
  const [priceInfo, setPriceInfo] = useState(null);
  const [labelAnim, setLabelAnim] = useState('');
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const runSequence = async () => {
      // RESET: Todo limpio
      setScalesOpacity(0);
      setLineClip(0);
      setLabelAnim('');
      setPriceInfo(null);

      try {
        const res = await fetch(`${API_BASE}/api/chart/${ticker}`);
        const data = await res.json();

        if (!isMounted.current) return;

        if (data && data.length > 0) {
          setSeries([
            { name: ticker, type: 'area', data: data.map(d => [d.time, d.value]) },
            { name: 'Volumen', type: 'bar', data: data.map(d => [d.time, d.volume || 0]) }
          ]);

          // Calcular precio y variación
          const lastPrice = data[data.length - 1].value;
          const firstPrice = data[0].value;
          const pctChange = ((lastPrice - firstPrice) / firstPrice * 100);
          if (isMounted.current) setPriceInfo({ price: lastPrice, change: pctChange });

          // 1. ENTRADA: Fundido de escalas, luego barrido de línea
          await new Promise(r => setTimeout(r, 500));
          if (isMounted.current) setScalesOpacity(1);

          await new Promise(r => setTimeout(r, 600));
          if (isMounted.current) setLineClip(100);

          // 2. Etiqueta aparece con barrido cuando la línea terminó
          await new Promise(r => setTimeout(r, 1600));
          if (isMounted.current) setLabelAnim('enter');

          // 3. PAUSA de visualización
          await new Promise(r => setTimeout(r, 5000));

          if (isMounted.current) {
            // 4. SALIDA: barrido inverso de la etiqueta
            setLabelAnim('exit');
            await new Promise(r => setTimeout(r, 600));

            // 5. El barrido de la línea arranca
            if (isMounted.current) setLineClip(0);

            // 4. FUNDIDO DE ESCALAS: Arranca justo antes de que termine el barrido (800ms)
            await new Promise(r => setTimeout(r, 800));
            if (isMounted.current) setScalesOpacity(0);

            // 5. ESPERA FINAL: Completar animaciones (1.5s totales)
            await new Promise(r => setTimeout(r, 1500));
            if (isMounted.current) onCycleComplete();
          }
        } else {
          // Fallback para evitar bloqueos si no hay datos
          await new Promise(r => setTimeout(r, 1000));
          if (isMounted.current) onCycleComplete();
        }
      } catch (e) {
        if (isMounted.current) onCycleComplete();
      }
    };

    runSequence();
    return () => { isMounted.current = false; };
  }, [ticker]);

  // Bloomberg Terminal Style: exact replica
  const volData = series.length > 1 ? series[1].data : [];
  const maxVol = volData.length > 0 ? Math.max(...volData.map(d => d[1])) : 1000;

  const options = {
    chart: {
      type: 'area', // área para el gradiente
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: false },
      fontFamily: '"Courier New", Courier, monospace',
    },
    stroke: { curve: 'straight', width: [1.5, 0], colors: ['#87CEEB', 'transparent'] },
    fill: {
      type: ['gradient', 'solid'],
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.9,
        opacityTo: 0.1,
        stops: [0, 100],
        colorStops: [
          [{ offset: 0, color: '#1e3a8a', opacity: 0.8 }, { offset: 100, color: '#000000', opacity: 0.2 }],
          []
        ]
      },
      opacity: [1, 0.9], // Area applies grad, Bar applies solid
      colors: ['#1e3a8a', '#ffffff'] // Series 1 (area), Series 2 (bar, volume)
    },
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
      axisBorder: { show: false }, // Oculta la línea divisoria del eje X
      axisTicks: { show: true, color: '#666666' },
      tooltip: { enabled: false }
    },
    yaxis: [
      {
        seriesName: ticker,
        labels: { show: true, style: { colors: '#cccccc', fontSize: '10px', fontWeight: 'bold' }, formatter: v => v.toFixed(2), offsetX: -10 },
        opposite: true,
        axisBorder: { show: true, color: '#666666' },
        axisTicks: { show: true, color: '#666666' }
      },
      {
        seriesName: 'Volumen',
        show: false,
        min: 0,
        max: maxVol * 2.5 // Empuja las barras de volumen al 40% inferior (haciéndolas más altas)
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
          .apexcharts-bar-series {
            transition: clip-path 1500ms ease-in-out !important;
            clip-path: inset(0 ${100 - lineClip}% 0 0);
          }
        `}</style>

        {/* DAY SESSION INFO BOX (LAST PRICE Y VARIACIÓN) */}
        <div className="absolute top-[8px] left-[8px] z-10 border border-[#888] rounded-sm bg-black/70 text-white text-[8px] p-1 w-36 font-bold shadow-md">
          <div className="text-center mb-[2px] tracking-wide text-[#bbbbbb] pb-[2px] border-b border-[#333]">Day Session (<span className="text-white text-[10px]">{ticker}</span>)</div>
          <div className="flex justify-between items-center pt-[2px]">
            <span className="flex items-center gap-[3px]"><span className="w-1.5 h-1.5 bg-white inline-block"></span>Last Price</span>
            <span>{priceInfo ? priceInfo.price.toFixed(2) : '-'}</span>
          </div>
          <div className="flex justify-between items-center mt-[1px]">
            <span className="flex items-center gap-[3px] text-[#999]"><span className="w-1.5 h-1.5 bg-[#999] inline-block"></span>Change %</span>
            <span className={priceInfo?.change >= 0 ? "text-[#00ff00]" : "text-[#ff0000]"}>
              {priceInfo ? `${priceInfo.change > 0 ? '+' : ''}${priceInfo.change.toFixed(2)}%` : '-'}
            </span>
          </div>
        </div>

        {/* GRÁFICO APEXCHARTS */}
        <Chart options={options} series={series} type="area" height="100%" width="100%" />
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

const AIWaveform = ({ rawData, active }) => {
  const width = 2048;
  const height = 192;
  const centerY = height / 2;

  const time = useTime();
  const t = useTransform(time, (v) => v / 1000);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    return t.onChange(v => setElapsed(v));
  }, [t]);

  const generatePath = () => {
    // Detectamos si hay señal real (Time Domain diferente a 128)
    const hasSignal = rawData && rawData.length > 0 && !rawData.every(v => v >= 126 && v <= 130);
    let path = `M 0 ${centerY}`;

    if (hasSignal) {
      const sliceWidth = width / rawData.length;
      for (let i = 0; i < rawData.length; i++) {
        const x = i * sliceWidth;
        const v = rawData[i] / 128.0;
        const y = centerY + (v - 1) * 85;
        path += ` L ${x} ${y}`;
      }
    } else {
      // Si no hay audio o estamos en el fundido de salida, mantenemos el "respiro"
      // Esto evita que la onda se "parta" o salte a una línea recta bruscamente
      const points = 120;
      const step = width / points;
      for (let i = 0; i <= points; i++) {
        const x = i * step;
        const oscillation = Math.sin(i * 0.08 + elapsed * 2.2) * 14;
        const breathing = Math.cos(elapsed * 1.5) * 10;
        path += ` L ${x} ${centerY + oscillation + breathing}`;
      }
    }
    return path;
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden flex items-center">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <filter id="glowWave">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <motion.path
          // VOLVEMOS A ASIGNAR 'd' DIRECTAMENTE: Sin lag de interpolación
          d={generatePath()}
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          filter="url(#glowWave)"
          // Framer Motion solo maneja la opacidad aquí
          initial={{ opacity: 0 }}
          animate={{ opacity: active ? 1 : 0 }}
          transition={{
            duration: 0.8,
            ease: [0.4, 0, 0.2, 1]
          }}
        />
      </svg>
    </div>
  );
};

// --- APP PRINCIPAL ---
export default function App() {
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
  const [audioData, setAudioData] = useState(new Uint8Array(0));
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const [newsIdx, setNewsIdx] = useState(0);

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
          setRofexPrices(current => ({ ...responseData.rofex, ...current }));
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
          setIsAiActive(true); // Cambiamos el alert por un estado de React
        }

        // Manejador del WebSocket de Cotizaciones ROFEX (Mercado Local)
        if (data.command === "ROFEX_UPDATE") {
          const { symbol, price } = data.payload;
          setRofexPrices(prev => {
            const oldPrice = prev[symbol];

            // Si el precio cambió, aplicamos efecto de flash verde/rojo
            if (oldPrice && price !== oldPrice) {
              const direction = price > oldPrice ? 'up' : 'down';
              // Usamos un identificador único para el flashMap de Rofex
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

        if (data.command === "PLAY_AUDIO") {
          setIsVoicePlaying(true);
          const audio = new Audio(data.payload.url);
          audio.crossOrigin = "anonymous";

          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const analyser = audioCtx.createAnalyser();
          const source = audioCtx.createMediaElementSource(audio);

          source.connect(analyser);
          analyser.connect(audioCtx.destination);

          analyser.fftSize = 2048;
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          const updateLevel = () => {
            if (audio.paused || audio.ended) {
              setAudioData(new Uint8Array(0));
              return;
            }
            analyser.getByteTimeDomainData(dataArray);
            setAudioData(new Uint8Array(dataArray));
            requestAnimationFrame(updateLevel);
          };

          audio.onended = () => {
            setIsVoicePlaying(false);
            setIsAiActive(false);
            // Eliminamos setAudioLevel(1) porque no está definida y causaba el error
            audioCtx.close();
            setTimeout(() => setAudioData(new Uint8Array(0)), 800);
          };

          audio.play().then(() => updateLevel());
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
    <div className="flex flex-col bg-black overflow-hidden h-screen items-center">

      {/* INTERFAZ DE ANCHO FIJO: 2048px totales */}
      <div className="w-[2048px] h-[192px] bg-black text-white flex overflow-hidden font-mono select-none relative shrink-0">



        <AIWaveform rawData={audioData} active={isAiActive} />

        {/* W1: CHART (512px) */}
        <motion.div
          animate={{ y: isAiActive ? -200 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-[512px] h-full border-r border-[#333] relative shrink-0 overflow-hidden bg-black"
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

        {/* W2: MARKET WATCH (512px) */}
        <motion.div
          animate={{ y: isAiActive ? 200 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-[576px] h-full border-r border-gray-800 shrink-0 bg-black flex flex-col justify-center">
          <div className="flex w-full h-full">
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
                  flex: "w-[31%]",
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
                  flex: "w-[37%]",
                  items: [
                    { label: "PESOS - 1D", sym: "PESOS - 1D", val: 51.25, type: "rate" },
                    { label: "PESOS - 3D", sym: "PESOS - 3D", val: 51.50, type: "rate" },
                    { label: "PESOS - 7D", sym: "PESOS - 7D", val: 52.80, type: "rate" },
                    { label: "PESOS - 30D", sym: "PESOS - 30D", val: 55.10, type: "rate" },
                    { label: "DOLARES - 1D", sym: "DOLARES - 1D", val: 2.15, type: "rate" },
                    { label: "DOLARES - 3D", sym: "DOLARES - 3D", val: 2.30, type: "rate" },
                    { label: "DOLARES - 7D", sym: "DOLARES - 7D", val: 2.45, type: "rate" },
                    { label: "DOLARES - 30D", sym: "DOLARES - 30D", val: 3.10, type: "rate" }
                  ]
                },
                {
                  title: "ACCIONES (BYMA)",
                  flex: "w-[32%]",
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

              // Para llenar todo el alto de 160px con renglones más grandes:
              // Forzamos 8 renglones (8 * 20px = 160px)
              const maxItems = 8;

              return (
                <div className="w-full h-full flex flex-col text-[11px] font-mono leading-none bg-black">
                  {Array.from({ length: maxItems }).map((_, rIdx) => {
                    // Alternating Row Color Match Bloomberg: Oscuro más profundo y Negro
                    const rowBgColor = rIdx % 2 === 0 ? '#161616' : '#000000';

                    return (
                      <div key={rIdx} className="flex w-full flex-1 items-center" style={{ backgroundColor: rowBgColor }}>
                        {columns.map((col, cIdx) => {
                          const item = col.items[rIdx];
                          if (!item || !item.label) {
                            // Espaciador visible integrado si no hay data para esta fila de esta columna
                            return <div key={cIdx} className={`${col.flex} flex px-2 h-full items-center shrink-0 ${!col.isLast ? 'border-r border-[#333]' : ''}`}></div>;
                          }

                          const flashKey = `rofex_${item.sym}`;
                          const flash = flashMap[flashKey];
                          const hasVal = item.val !== null;

                          const hash = item.label.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                          const fakeVar = ((hash % 800) / 100) - 4; // Entre -4.00% y +4.00%
                          const isPos = fakeVar >= 0;

                          return (
                            <div
                              key={cIdx}
                              className={`${col.flex} flex justify-between items-center h-full pl-2 ${!col.isLast ? 'border-r border-[#333]' : ''} ${flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''}`}
                            >
                              {/* Ticker in Orange (truncates to avoid breaking layout) */}
                              <span className="text-[#ffaa00] truncate mr-1 min-w-[30px] transform-gpu antialiased">{item.label}</span>
                              <div className={`flex items-center h-full shrink-0 whitespace-nowrap transform-gpu antialiased ${cIdx > 0 ? 'pr-3' : 'pr-1'}`}>
                                {/* Value in White/Amber */}
                                <span className={hasVal ? "text-[#ffaa00] mr-2" : "text-white mr-2"}>
                                  {hasVal
                                    ? (item.type === 'price' ? fmtPrice(item.val) : fmtRate(item.val))
                                    : '-.--'}
                                </span>
                                {/* Badge Variación Diaria (Fake temporal) */}
                                {hasVal ? (
                                  <div className={`h-full flex items-center font-bold text-[10px] transform-gpu antialiased ${isPos ? 'text-[#00ff00]' : 'text-[#ff0000]'}`}>
                                    {isPos ? '+' : ''}{fakeVar.toFixed(2)}%
                                  </div>
                                ) : (
                                  <div className="h-full w-[36px]"></div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </motion.div>

        {/* W3: NEWS — PREMIUM WIDGET (384px) */}
        <motion.div
          animate={{ y: isAiActive ? -200 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-[384px] h-[192px] border-r border-white/5 shrink-0 bg-[#070707] flex flex-col font-sans overflow-hidden relative shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]"
        >
          {/* Elegante Header */}
          <div className="w-full px-5 py-2.5 border-b border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent flex justify-between items-center z-10 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-zinc-400 -translate-y-[0.5px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2.5 2.5 0 00-2.5-2.5H14" />
              </svg>
              <span className="text-white/80 text-[10px] font-semibold tracking-[0.2em]">LATEST HEADLINES</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-sm bg-red-500/10 border border-red-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
              <span className="text-red-400 text-[8px] font-bold tracking-[0.15em] -translate-y-[0.5px]">LIVE</span>
            </div>
          </div>

          {/* Contenido principal (Premium Feed) */}
          <div className="flex-1 w-full overflow-hidden relative">
            <PremiumNewsFeed news={news} activeIdx={newsIdx} />
          </div>
        </motion.div>

        {/* W4: WORLD CLOCKS (576px) - 5 EN FILA HORIZONTAL */}
        <motion.div
          animate={{ y: isAiActive ? 200 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-[576px] h-full flex items-center justify-around bg-zinc-950/20 shrink-0 border-l border-gray-900 relative"
        >
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
          <Clock city="BS AS" zone="America/Argentina/Buenos_Aires" time={masterTime} />
          <Clock city="NY" zone="America/New_York" time={masterTime} />
          <Clock city="LONDON" zone="Europe/London" time={masterTime} />
          <Clock city="TOKIO" zone="Asia/Tokyo" time={masterTime} />
          <Clock city="BEIJING" zone="Asia/Shanghai" time={masterTime} />
        </motion.div>

      </div >
    </div >
  );
}

const Clock = ({ city, zone, time }) => {
  const timeInZone = new Date(time.toLocaleString('en-US', { timeZone: zone }));
  const hrs = timeInZone.getHours();
  const mins = timeInZone.getMinutes();
  const secs = timeInZone.getSeconds();
  const ms = timeInZone.getMilliseconds();

  const hourDeg = (hrs % 12) * 30 + mins * 0.5 + secs * (0.5 / 60);
  const minDeg = mins * 6 + secs * 0.1;
  const secDeg = secs * 6;

  const MARKET_HOURS = {
    'BS AS': { sessions: [[11 * 60, 17 * 60]] },
    'NY': { sessions: [[9 * 60 + 30, 16 * 60]] },
    'LONDON': { sessions: [[8 * 60, 16 * 60 + 30]] },
    'TOKIO': { sessions: [[9 * 60, 11 * 60 + 30], [12 * 60 + 30, 15 * 60 + 30]] },
    'BEIJING': { sessions: [[9 * 60 + 30, 11 * 60 + 30], [13 * 60, 15 * 60]] },
  };

  const dayOfWeek = timeInZone.getDay();
  const minuteOfDay = hrs * 60 + mins;
  const schedule = MARKET_HOURS[city];
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isActive = isWeekday && schedule &&
    schedule.sessions.some(([open, close]) => minuteOfDay >= open && minuteOfDay < close);

  // SVG dimensions — larger for more realism
  const S = 158;
  const C = S / 2;   // center = 79
  const R = 68;      // dial radius
  const uid = city.replace(/\s/g, '');

  // Arabic numbers at cardinal positions
  const CARDINALS = { 0: '12', 3: '3', 6: '6', 9: '9' };

  // 60 minute indices
  const indices = Array.from({ length: 60 }, (_, i) => {
    const a = (i * 6 - 90) * (Math.PI / 180);
    const isHour = i % 5 === 0;
    const isCardinal = i % 15 === 0;
    const outerR = R - 1;
    const innerR = isCardinal ? R - 12 : isHour ? R - 8 : R - 5;
    return {
      x1: C + outerR * Math.cos(a),
      y1: C + outerR * Math.sin(a),
      x2: C + innerR * Math.cos(a),
      y2: C + innerR * Math.sin(a),
      w: isCardinal ? 3 : isHour ? 1.8 : 0.9,
      color: isCardinal ? '#e8e8e8' : isHour ? '#aaa' : '#555',
      isCardinal,
      isHour,
      idx: i,
    };
  });

  // Hour-hand path (lancet shape)
  const buildHourHand = () => {
    const L = 32, W = 6, tail = 8;
    // points relative to center, pointing up
    return `M ${C} ${C + tail} L ${C - W / 2} ${C - L * 0.3} L ${C} ${C - L} L ${C + W / 2} ${C - L * 0.3} Z`;
  };
  // Minute-hand path (longer lancet)
  const buildMinHand = () => {
    const L = 50, W = 4.5, tail = 9;
    return `M ${C} ${C + tail} L ${C - W / 2} ${C - L * 0.25} L ${C} ${C - L} L ${C + W / 2} ${C - L * 0.25} Z`;
  };

  const marketColor = isActive ? '#4ade80' : '#ef4444';
  const marketGlow = isActive ? '#22c55e' : '#dc2626';

  return (
    <div className="flex flex-col items-center gap-[4px] relative z-10">

      {/* SVG watchface — rendered smaller so 5 clocks fit in 640px */}
      <svg width={100} height={100} viewBox={`0 0 ${S} ${S}`} style={{ overflow: 'visible' }}>
        <defs>
          {/* Esfera negra profunda */}
          <radialGradient id={`dial-${uid}`} cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#2a2a2e" />
            <stop offset="55%" stopColor="#111114" />
            <stop offset="100%" stopColor="#080809" />
          </radialGradient>

          {/* Bisel metálico — aluminio cepillado */}
          <radialGradient id={`bezel-${uid}`} cx="30%" cy="25%" r="80%">
            <stop offset="0%" stopColor="#9a9a9a" />
            <stop offset="20%" stopColor="#5c5c5c" />
            <stop offset="50%" stopColor="#3a3a3a" />
            <stop offset="75%" stopColor="#6b6b6b" />
            <stop offset="100%" stopColor="#2a2a2a" />
          </radialGradient>

          {/* Reflejo de cristal zafiro */}
          <radialGradient id={`glass-${uid}`} cx="35%" cy="20%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          {/* Gradiente de aguja de horas */}
          <linearGradient id={`hhand-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d4d4d4" />
            <stop offset="40%" stopColor="#f5f5f5" />
            <stop offset="100%" stopColor="#888" />
          </linearGradient>

          {/* Gradiente de aguja de minutos */}
          <linearGradient id={`mhand-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#c8c8c8" />
            <stop offset="45%" stopColor="#f0f0f0" />
            <stop offset="100%" stopColor="#777" />
          </linearGradient>

          {/* Glow del segundero */}
          <filter id={`secglow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Sombra de agujas */}
          <filter id={`handshadow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.7" />
          </filter>

          {/* Pivote plateado */}
          <radialGradient id={`pivot-${uid}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#c0c0c0" />
            <stop offset="100%" stopColor="#505050" />
          </radialGradient>

          {/* Market ring glow */}
          <filter id={`mktglow-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── SOMBRA EXTERIOR DEL RELOJ ── */}
        <circle cx={C} cy={C} r={R + 10} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="6" />

        {/* ── BISEL EXTERIOR (metálico) ── */}
        <circle cx={C} cy={C} r={R + 9} fill={`url(#bezel-${uid})`} />

        {/* ── ANILLO DE MERCADO (activo = verde / cerrado = rojo) ── */}
        <circle
          cx={C} cy={C} r={R + 5}
          fill="none"
          stroke={marketColor}
          strokeWidth="1.5"
          opacity={isActive ? 0.7 : 0.35}
          filter={isActive ? `url(#mktglow-${uid})` : undefined}
        />

        {/* ── ESFERA PRINCIPAL ── */}
        <circle cx={C} cy={C} r={R + 2} fill={`url(#dial-${uid})`} />

        {/* ── TEXTURA FINA GUILLOCHE (líneas concéntricas sutiles) ── */}
        {[0.85, 0.65, 0.45].map((factor, fi) => (
          <circle key={fi}
            cx={C} cy={C} r={R * factor}
            fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5"
          />
        ))}

        {/* ── ÍNDICES DE MINUTOS Y HORAS ── */}
        {indices.map((idx) => (
          <line key={idx.idx}
            x1={idx.x1} y1={idx.y1} x2={idx.x2} y2={idx.y2}
            stroke={idx.color} strokeWidth={idx.w} strokeLinecap="round"
          />
        ))}

        {/* ── NÚMEROS ARÁBIGOS en cardinales (Removidos) ── */}
        {/*
        {[0, 3, 6, 9].map((i) => {
          const a = (i * 30 - 90) * (Math.PI / 180);
          const textR = R - 13;
          return (
            <text
              key={i}
              x={C + textR * Math.cos(a)}
              y={C + textR * Math.sin(a)}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#cccccc"
              fontSize="9"
              fontFamily="'JetBrains Mono', 'Courier New', monospace"
              fontWeight="bold"
             >
              {CARDINALS[i]}
            </text>
          );
        })}
        */}

        {/* ── AGUJA DE HORAS ── */}
        <g transform={`rotate(${hourDeg} ${C} ${C})`} filter={`url(#handshadow-${uid})`}>
          <path d={buildHourHand()} fill={`url(#hhand-${uid})`} stroke="#555" strokeWidth="0.4" />
          {/* borde reflectante superior */}
          <path d={buildHourHand()} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.6" />
        </g>

        {/* ── AGUJA DE MINUTOS ── */}
        <g transform={`rotate(${minDeg} ${C} ${C})`} filter={`url(#handshadow-${uid})`}>
          <path d={buildMinHand()} fill={`url(#mhand-${uid})`} stroke="#555" strokeWidth="0.4" />
          <path d={buildMinHand()} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        </g>

        {/* ── SEGUNDERO (rojo rallye) ── */}
        <g transform={`rotate(${secDeg} ${C} ${C})`} filter={`url(#secglow-${uid})`}>
          {/* Cola de contrapeso */}
          <line x1={C} y1={C + 14} x2={C} y2={C + 3}
            stroke="#cc2200" strokeWidth="3" strokeLinecap="round" />
          {/* Cuerpo principal */}
          <line x1={C} y1={C + 3} x2={C} y2={C - 55}
            stroke="#ff3a1a" strokeWidth="1.1" strokeLinecap="round" />
          {/* Punta blanca de precisión */}
          <line x1={C} y1={C - 48} x2={C} y2={C - 55}
            stroke="#ffffff" strokeWidth="1.1" strokeLinecap="round" opacity="0.85" />
          {/* Pastilla de contrapeso */}
          <ellipse cx={C} cy={C + 10} rx="3.5" ry="2" fill="#cc2200" />
        </g>

        {/* ── PIVOTE CENTRAL (tornillo plateado) ── */}
        <circle cx={C} cy={C} r="5.5" fill={`url(#pivot-${uid})`} stroke="#333" strokeWidth="0.5" />
        <circle cx={C} cy={C} r="2" fill="#1a1a1a" />
        {/* Ranura del tornillo */}
        <line x1={C - 1.8} y1={C} x2={C + 1.8} y2={C} stroke="#555" strokeWidth="0.7" />

        {/* ── REFLEXIÓN CRISTAL ZAFIRO ── */}
        <circle cx={C} cy={C} r={R + 2} fill={`url(#glass-${uid})`} />

        {/* Borde interno del cristal */}
        <circle cx={C} cy={C} r={R + 2} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />
      </svg>

      {/* Ciudad + indicador de mercado */}
      <div className="flex items-center gap-2">
        <div
          className="w-[6px] h-[6px] rounded-full"
          style={{
            backgroundColor: isActive ? '#4ade80' : '#ef4444',
            boxShadow: isActive
              ? '0 0 6px #4ade80, 0 0 2px #22c55e'
              : '0 0 4px #ef4444, 0 0 1px #dc2626',
          }}
        />
        <span className="text-[12px] font-bold uppercase tracking-[0.18em]"
          style={{ color: '#888' }}>{city}</span>
      </div>

      {/* Hora digital — monoespaciada refinada */}
      <span
        className="text-[15px] font-mono font-semibold leading-none"
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: '#c0c0c0',
          letterSpacing: '0.05em',
        }}
      >
        {timeInZone.toLocaleTimeString('en-US', {
          hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
        })}
      </span>
    </div>
  );
};