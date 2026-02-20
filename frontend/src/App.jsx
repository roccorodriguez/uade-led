import React, { useState, useEffect, useRef } from 'react';
import Chart from 'react-apexcharts';
import { TrendingUp } from 'lucide-react';
import { motion, AnimatePresence, useTime, useTransform } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL;
const WS_BASE = import.meta.env.VITE_WS_URL;

const TICKERS_ROTATION = ["NVDA", "MSFT", "GOOG", "META", "TSLA", "AMZN", "AAPL"];

// --- WIDGET 1: GRÁFICO DINÁMICO UADE (ULTRA-CLEAN WHITE) ---
const FinancialChart = ({ ticker, onCycleComplete }) => {
  const [series, setSeries] = useState([{ data: [] }]);
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
          setSeries([{ name: ticker, data: data.map(d => [d.time, d.value]) }]);

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

  const options = {
    chart: {
      type: 'area',
      background: '#000',
      toolbar: { show: false },
      animations: { enabled: false }
    },
    stroke: { curve: 'smooth', width: 2, colors: ['#ffffff'] }, // Línea Blanca
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.0, stops: [0, 95, 100] },
      colors: ['#ffffff']
    },
    grid: {
      show: true,
      borderColor: '#222',
      strokeDashArray: 2,
      padding: { left: 10, right: 10 }
    },
    xaxis: {
      type: 'datetime',
      labels: { show: true, style: { colors: '#ffffff', fontSize: '9px' }, datetimeUTC: false },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      labels: { show: true, style: { colors: '#ffffff', fontSize: '9px' }, formatter: v => v.toFixed(2) },
      opposite: true,
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    tooltip: { enabled: false },
    dataLabels: { enabled: false }
  };

  return (
    <div className="w-full h-full relative bg-black">
      <style>{`
        /* ESCALAS: Solo fundido (textos de ejes X e Y) */
        .apexcharts-xaxis-texts-g, .apexcharts-yaxis-texts-g {
          transition: opacity 1500ms ease-in-out !important;
          opacity: ${scalesOpacity};
        }

        /* GRÁFICO Y GRILLA: Solo barrido (clip-path) */
        /* Agregado .apexcharts-grid-borders para las líneas superior e inferior */
        .apexcharts-grid, 
        .apexcharts-grid-borders,
        .apexcharts-series-group, 
        .apexcharts-area-series, 
        .apexcharts-grid-line {
          transition: clip-path 1500ms ease-in-out !important;
          clip-path: inset(0 ${100 - lineClip}% 0 0);
        }
        /* Ocultar la última etiqueta del eje X */
        .apexcharts-xaxis-texts-g text:last-of-type {
          display: none !important;
        }
      `}</style>
      <Chart options={options} series={series} type="area" height="100%" width="100%" />

      {/* CSS para animación de etiqueta */}
      <style>{`
        @keyframes labelSweepIn {
          0% {
            clip-path: inset(0 100% 0 0);
            filter: brightness(3);
            box-shadow: 0 0 12px rgba(255,255,255,0.5);
          }
          25% {
            clip-path: inset(0 70% 0 0);
            filter: brightness(2.2);
          }
          50% {
            clip-path: inset(0 35% 0 0);
            filter: brightness(1.5);
            box-shadow: 0 0 6px rgba(255,255,255,0.2);
          }
          75% {
            clip-path: inset(0 10% 0 0);
            filter: brightness(1.2);
          }
          100% {
            clip-path: inset(0 0 0 0);
            filter: brightness(1);
            box-shadow: none;
          }
        }
        @keyframes labelSweepOut {
          0% { opacity: 1; filter: brightness(1); }
          40% { opacity: 1; filter: brightness(2); }
          100% { opacity: 0; filter: brightness(3); }
        }
        .label-enter { animation: labelSweepIn 600ms steps(12, end) forwards; }
        .label-exit { animation: labelSweepOut 350ms ease-out forwards; }
      `}</style>

      {/* Etiqueta de precio — barrido */}
      {priceInfo && labelAnim && (
        <div
          className={`absolute z-20 font-mono px-2 py-1 rounded label-${labelAnim}`}
          style={{
            top: '8px',
            right: '8px',
            backgroundColor: '#000',
            border: '1px solid rgba(255,255,255,0.35)',
          }}
        >
          <span
            className="text-white text-[14px] font-bold"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            ${priceInfo.price.toFixed(2)}
          </span>
          <span
            className={`text-[14px] font-bold ml-2 ${priceInfo.change >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {priceInfo.change >= 0 ? '+' : ''}{priceInfo.change.toFixed(2)}%
          </span>
        </div>
      )}
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

  const newsIntervalRef = useRef(null);
  const newsCounterRef = useRef(0);

  // Rotación de noticias robusta: el intervalo vive independientemente del array
  useEffect(() => {
    // Si ya hay un intervalo corriendo, no creamos otro
    if (newsIntervalRef.current) return;
    // Solo arrancamos si hay noticias
    if (news.length === 0) return;

    newsIntervalRef.current = setInterval(() => {
      newsCounterRef.current += 1;
      // Siempre derivamos el índice al momento del tick para reflejar updates del array
      setNewsIdx(newsCounterRef.current % news.length);
    }, 6000);

    return () => {
      clearInterval(newsIntervalRef.current);
      newsIntervalRef.current = null;
    };
  }, [news]);

  useEffect(() => {
    const staggerTimers = [];

    const upd = async () => {
      try {
        const newPrices = await fetch(`${API_BASE}/api/prices`).then(r => r.json());
        if (!Array.isArray(newPrices)) return;

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

        {/* Luz Ambiental Superior (Gradient Inward) */}
        <div
          className="absolute top-0 left-0 w-full h-[30px] z-50 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, ${sentimentColor} 0%, transparent 100%)`,
            opacity: isAiActive ? 0 : 0.4,
            transition: 'opacity 0.8s ease-out, background 0.7s ease-out'
          }}
        />

        {/* Luz Ambiental Inferior (Gradient Inward) */}
        <div
          className="absolute bottom-0 left-0 w-full h-[30px] z-[100] pointer-events-none"
          style={{
            background: `linear-gradient(to top, ${sentimentColor} 0%, transparent 100%)`,
            opacity: isAiActive ? 0 : 0.4,
            transition: 'opacity 0.8s ease-out, background 0.7s ease-out'
          }}
        />

        <AIWaveform rawData={audioData} active={isAiActive} />

        {/* W1: CHART (512px) */}
        <motion.div
          animate={{ y: isAiActive ? -200 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-[512px] h-full border-r border-gray-800 relative bg-black shrink-0 p-2">
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 text-white bg-black/50 px-2 py-1 border border-white/20 rounded">
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {(typeof TICKERS_ROTATION !== 'undefined') ? TICKERS_ROTATION[idx] : 'LOADING'} INTRADAY
            </span>
          </div>
          <FinancialChart
            key={typeof idx !== 'undefined' ? idx : 'chart'}
            ticker={typeof TICKERS_ROTATION !== 'undefined' ? TICKERS_ROTATION[idx] : 'SPY'}
            onCycleComplete={() => setIdx(i => (i + 1) % TICKERS_ROTATION.length)}
          />
        </motion.div>

        {/* W2: MARKET WATCH (512px) */}
        <motion.div
          animate={{ y: isAiActive ? 200 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-[512px] h-full border-r border-gray-800 p-4 shrink-0 bg-black flex flex-col justify-center">
          <div className="flex gap-2 h-[160px]">
            {(() => {
              const fmt = (val) => '$' + new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
              const renderCol = (title, data, startIdx, flexClass, isLast = false) => (
                <div className={`${flexClass} flex flex-col h-full ${!isLast ? 'border-r border-zinc-900/40 pr-3' : 'pl-1'}`}>
                  <div className="text-[9px] text-zinc-500 font-bold mb-3 uppercase tracking-widest border-b border-zinc-800 pb-1">{title}</div>
                  <div className="flex flex-col justify-between flex-1 pb-2">
                    {data.map((p, i) => {
                      const globalIdx = startIdx + i;
                      const flash = flashMap[globalIdx];
                      const isPos = p && p.change && parseFloat(p.change) > 0;
                      return (
                        <div key={i} className={`flex justify-between items-center text-[10px] font-mono leading-none rounded-sm px-0.5 ${flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''}`}>
                          <span className="text-zinc-500 font-bold truncate mr-1">{p.symbol}</span>
                          <div className="flex gap-2 items-center">
                            <span className="text-white font-bold">{fmt(p.price)}</span>
                            <span className={`font-bold ${isPos ? 'text-green-400' : 'text-red-400'}`}>{p.change}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              return (
                <>
                  {renderCol("Commodities", pricesArray.slice(0, 5), 0, "flex-[0.9]")}
                  {renderCol("ETFs", pricesArray.slice(5, 10), 5, "flex-[0.9]")}
                  {renderCol("Índices", pricesArray.slice(10, 15), 10, "flex-[1.2]", true)}
                </>
              );
            })()}
          </div>
        </motion.div>

        {/* W3: NEWS — SINGLE ROTATING ITEM CON PAUSA (384px) */}
        <motion.div
          animate={{ y: isAiActive ? -200 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-[384px] h-[192px] border-r border-gray-800 shrink-0 bg-black flex flex-col font-mono overflow-hidden relative"
        >
          {/* Textura de fondo sutil */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.15]"
            style={{
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: '10px 10px',
            }}
          />
          {/* Contenido principal (Noticias rotativas) */}
          <div className="flex-1 w-full overflow-hidden relative" style={{ maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)' }}>
            <motion.div
              className="flex flex-col gap-4 absolute w-full top-0 left-0 pt-[41px] pb-[41px]"
              animate={{ y: -(newsIdx * 126) }} // 110px (item) + 16px (gap) = 126px

              transition={{
                type: "spring",
                stiffness: 90,
                damping: 20,
                mass: 1
              }}
            >
              {news.length > 0 &&
                /* Duplicamos el array varias veces para dar el efecto infinito al desplazar con el índice */
                [...news, ...news, ...news, ...news, ...news].map((item, idx) => (
                  <div
                    key={`${item.id}-${idx}`}
                    className="mx-4 p-[2px] rounded-xl relative overflow-hidden group shrink-0 h-[110px]"
                  >
                    {/* Borde animado / Degradado de fondo del contenedor externo */}
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/40 via-zinc-900/10 to-transparent rounded-xl" />

                    {/* Tarjeta Interna (Glassmorphism oscuro) */}
                    <div className="absolute inset-[1px] bg-zinc-950/80 backdrop-blur-md rounded-[10px] overflow-hidden flex flex-col justify-center p-3">

                      {/* Resplandor superior sutil */}
                      <div className="absolute top-0 left-0 right-0 height-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                      {/* Acento lateral vibrante */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-[3px]"
                        style={{
                          background: idx % 2 === 0
                            ? 'linear-gradient(to bottom, #f97316, #fb923c)' // Naranja
                            : 'linear-gradient(to bottom, #3f3f46, #52525b)',  // Gris Oscuro/Negro
                          boxShadow: idx % 2 === 0
                            ? '2px 0 8px rgba(249,115,22,0.4)'
                            : '2px 0 8px rgba(63,63,70,0.4)'
                        }}
                      />

                      {/* Brillo dinámico de fondo (radial gradient asimétrico) */}
                      <div
                        className="absolute -inset-10 opacity-30 pointer-events-none mix-blend-screen"
                        style={{
                          background: `radial-gradient(circle at 10% 50%, ${idx % 2 === 0 ? '#f9731640' : '#3f3f4640'}, transparent 50%)`
                        }}
                      />

                      {/* Header de la tarjeta */}
                      <div className="flex items-center gap-2 mb-1.5 relative z-10">
                        {/* Source Tag estilo Badge Premium */}
                        <div className="bg-white/5 border border-white/10 px-1.5 py-[1px] rounded text-[8px] uppercase font-bold tracking-[0.15rem] flex items-center gap-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                          <span
                            className="w-[3px] h-[3px] rounded-full animate-pulse"
                            style={{ background: idx % 2 === 0 ? '#fb923c' : '#a1a1aa' }}
                          />
                          <span className="text-zinc-300 drop-shadow-md">{item.source || 'MARKET'}</span>
                        </div>

                        <span className="text-zinc-500 text-[9px] font-mono tracking-wider ml-auto">
                          {item.time}
                        </span>
                      </div>

                      {/* Titular */}
                      <p className="text-gray-100 text-[16px] font-semibold leading-[1.25] pl-1 line-clamp-3 relative z-10 drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                        {item.headline}
                      </p>
                    </div>
                  </div>
                ))}
            </motion.div>
          </div>
        </motion.div>

        {/* W4: WORLD CLOCKS (640px) - 5 EN FILA HORIZONTAL */}
        <motion.div
          animate={{ y: isAiActive ? 200 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-[640px] h-full flex items-center justify-around bg-zinc-950/20 shrink-0 border-l border-gray-900 relative"
        >
          {/* Mapa del mundo de fondo (SVG realista) */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.08]"
            style={{
              backgroundImage: 'url(/world_map.svg)',
              backgroundSize: '100% auto',
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

  const hourDeg = (hrs % 12) * 30 + mins * 0.5;
  const minDeg = mins * 6 + secs * 0.1;
  const secDeg = secs * 6;

  // Horarios reales de cada bolsa (en minutos desde medianoche, hora local)
  const MARKET_HOURS = {
    'BS AS': { sessions: [[11 * 60, 17 * 60]] },                          // BYMA 11:00–17:00
    'NY': { sessions: [[9 * 60 + 30, 16 * 60]] },                        // NYSE 09:30–16:00
    'LONDON': { sessions: [[8 * 60, 16 * 60 + 30]] },                        // LSE  08:00–16:30
    'TOKIO': { sessions: [[9 * 60, 11 * 60 + 30], [12 * 60 + 30, 15 * 60 + 30]] },  // TSE  09:00–11:30, 12:30–15:30
    'BEIJING': { sessions: [[9 * 60 + 30, 11 * 60 + 30], [13 * 60, 15 * 60]] },     // SSE  09:30–11:30, 13:00–15:00
  };

  const dayOfWeek = timeInZone.getDay(); // 0=Dom, 6=Sáb
  const minuteOfDay = hrs * 60 + mins;
  const schedule = MARKET_HOURS[city];
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isActive = isWeekday && schedule &&
    schedule.sessions.some(([open, close]) => minuteOfDay >= open && minuteOfDay < close);

  const s = 110;
  const c = s / 2;
  const R = 44;
  const uid = city.replace(/\s/g, '');

  // 12 marcas horarias
  const hourTicks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 - 90) * Math.PI / 180;
    const isCardinal = i % 3 === 0;
    const len = isCardinal ? 9 : 5.5;
    return {
      x1: c + (R - len) * Math.cos(a), y1: c + (R - len) * Math.sin(a),
      x2: c + (R - 0.5) * Math.cos(a), y2: c + (R - 0.5) * Math.sin(a),
      w: isCardinal ? 2.5 : 1,
      color: isCardinal ? '#999' : '#444'
    };
  });

  // 60 puntos de minutos (excluyendo donde hay marcas horarias)
  const minDots = Array.from({ length: 60 }, (_, i) => {
    if (i % 5 === 0) return null;
    const a = (i * 6 - 90) * Math.PI / 180;
    return { cx: c + (R - 2.5) * Math.cos(a), cy: c + (R - 2.5) * Math.sin(a) };
  }).filter(Boolean);

  const accent = '#fb923c';

  return (
    <div className="flex flex-col items-center justify-center gap-[2px] relative z-10">
      {/* Ciudad + indicador de mercado */}
      <div className="flex items-center gap-1.5">
        <div
          className="w-[8px] h-[8px] rounded-full"
          style={{
            backgroundColor: isActive ? '#4ade80' : '#3f3f46',
            boxShadow: isActive ? '0 0 6px #4ade80, 0 0 2px #22c55e' : 'none'
          }}
        />
        <span className="text-[12px] text-zinc-500 font-bold uppercase tracking-[0.15em]">{city}</span>
      </div>

      {/* Dial analógico */}
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        <defs>
          <filter id={`hg-${uid}`}>
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id={`bg-${uid}`} cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </radialGradient>
        </defs>

        {/* Fondo del dial con profundidad */}
        <circle cx={c} cy={c} r={R + 2.5} fill={`url(#bg-${uid})`} />

        {/* Anillo exterior con brillo de mercado */}
        <circle cx={c} cy={c} r={R + 2.5} fill="none"
          stroke={isActive ? '#22c55e' : '#333'} strokeWidth="0.7"
          opacity={isActive ? 0.5 : 0.8}
          style={isActive ? { filter: `drop-shadow(0 0 3px #22c55e)` } : {}}
        />
        <circle cx={c} cy={c} r={R} fill="none" stroke="#555" strokeWidth="0.6" />

        {/* Puntos de minutos */}
        {minDots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r="0.7" fill="#2a2a2a" />
        ))}

        {/* Marcas horarias */}
        {hourTicks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.color} strokeWidth={t.w} strokeLinecap="round" />
        ))}

        {/* Aguja de horas */}
        <line x1={c} y1={c + 5} x2={c} y2={c - 18}
          stroke={accent} strokeWidth="4" strokeLinecap="round"
          transform={`rotate(${hourDeg} ${c} ${c})`}
        />

        {/* Aguja de minutos */}
        <line x1={c} y1={c + 5.5} x2={c} y2={c - 31}
          stroke={accent} strokeWidth="3" strokeLinecap="round"
          transform={`rotate(${minDeg} ${c} ${c})`}
        />

        {/* Segundero */}
        <g transform={`rotate(${secDeg} ${c} ${c})`}>
          <line x1={c} y1={c + 8.5} x2={c} y2={c - 37}
            stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
          <circle cx={c} cy={c + 8} r="1.8" fill="white" opacity="0.3" />
        </g>

        {/* Centro */}
        <circle cx={c} cy={c} r="4.5" fill={accent} />
        <circle cx={c} cy={c} r="2.3" fill="#111" />
        <circle cx={c} cy={c} r="1" fill={accent} opacity="0.9" />
      </svg>

      {/* Hora digital */}
      <span className="text-[16px] font-mono text-orange-400 font-semibold leading-none"
        style={{ fontVariantNumeric: 'tabular-nums' }}>
        {timeInZone.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  );
};