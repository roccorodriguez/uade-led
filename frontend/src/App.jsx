import React, { useState, useEffect, useRef } from 'react';
import Chart from 'react-apexcharts';
import { TrendingUp } from 'lucide-react';
import { motion, useTime, useTransform } from 'framer-motion';


const TICKERS_ROTATION = ["NVDA", "MSFT", "GOOG", "META", "TSLA", "AMZN", "AAPL"];

// --- WIDGET 1: GRÁFICO DINÁMICO UADE (ULTRA-CLEAN WHITE) ---
const FinancialChart = ({ ticker, onCycleComplete }) => {
  const [series, setSeries] = useState([{ data: [] }]);
  const [scalesOpacity, setScalesOpacity] = useState(0); 
  const [lineClip, setLineClip] = useState(0); 
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    const runSequence = async () => {
      // RESET: Todo limpio
      setScalesOpacity(0);
      setLineClip(0);
      
      try {
        const res = await fetch(`${API_BASE}/api/chart/${ticker}`);
        const data = await res.json();
        
        if (!isMounted.current) return;

        if (data && data.length > 0) {
          setSeries([{ name: ticker, data: data.map(d => [d.time, d.value]) }]);

          // 1. ENTRADA: Fundido de escalas, luego barrido de línea
          await new Promise(r => setTimeout(r, 500));
          if (isMounted.current) setScalesOpacity(1);

          await new Promise(r => setTimeout(r, 600));
          if (isMounted.current) setLineClip(100);

          // 2. PAUSA: 4 segundos de visualización
          await new Promise(r => setTimeout(r, 4000));
          
          if (isMounted.current) {
            // 3. SALIDA: El barrido de la línea arranca primero
            setLineClip(0); 

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
      labels: { show: true, style: { colors: '#555', fontSize: '9px' }, datetimeUTC: false },
      axisBorder: { show: false }, 
      axisTicks: { show: false }
    },
    yaxis: {
      labels: { show: true, style: { colors: '#555', fontSize: '9px' }, formatter: v => v.toFixed(2) },
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
      `}</style>
      <Chart options={options} series={series} type="area" height="100%" width="100%" />
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
            ? `${animName} ${maxDuration}s linear infinite` 
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
  const [idx, setIdx] = useState(0);
  const [masterTime, setMasterTime] = useState(new Date());
  const [maxDuration, setMaxDuration] = useState(0);
  const socketRef = useRef(null);
  const [isAiActive, setIsAiActive] = useState(false);
  const [audioData, setAudioData] = useState(new Uint8Array(0));
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const API_BASE = import.meta.env.VITE_API_URL;
  const WS_BASE = import.meta.env.VITE_WS_URL;

  useEffect(() => {
    const pulse = setInterval(() => setMasterTime(new Date()), 1000);
    return () => clearInterval(pulse);
  }, []);

  useEffect(() => {
    const upd = async () => {
      try {
        const p = await fetch('${API_BASE}/api/prices').then(r => r.json());
        setPrices(p);
        
        // Nueva petición para el Widget 3
        const n = await fetch('${API_BASE}/api/market-news').then(r => r.json());
        if (Array.isArray(n)) {
          setNews(n);
        }
      } catch (e) { 
        console.error("Error cargando noticias:", e); 
      }
    };
    upd();
    const t = setInterval(upd, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (news.length > 0) {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      context.font = "10px 'JetBrains Mono'"; 
  
      const times = news.slice(0, 7).map(n => {
        const metrics = context.measureText(n.headline.toUpperCase());
        const textWidth = metrics.width;
        const containerWidth = 307; // El 60% exacto de los 512px del widget
        const dist = Math.max(0, textWidth - containerWidth);
        
        // (Distancia / Velocidad 18px/s) + 3s de pausa total (1.5s inicio + 1.5s fin)
        return (dist / 18) + 3; 
      });
      
      const slowest = Math.max(...times);
      // Seteamos la duración perfecta para que el más largo termine y todos peguen el salto
      setMaxDuration(slowest > 0 ? slowest : 8); 
    }
  }, [news]);

  useEffect(() => {
    let socket;
    let isMounted = true; // Control para no actuar si el componente se desmontó
  
    const connect = () => {
      socket = new WebSocket('${WS_BASE}/ws');
  
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
      
      {/* Estela Superior Fina (1px) */}
      <div 
        className="h-[1px] min-h-[1px] w-full transition-all duration-700 ease-out z-50 relative"
        style={{ backgroundColor: sentimentColor, boxShadow: neonGlow, filter: 'saturate(1.8)' }}
      />

      {/* INTERFAZ DE ANCHO FIJO: 1920px totales */}
      <div className="w-[1920px] h-[192px] bg-black text-white flex overflow-hidden border-b border-gray-900 font-mono select-none relative shrink-0">
        
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
              const renderCol = (title, data, flexClass, isLast = false) => (
                <div className={`${flexClass} flex flex-col h-full ${!isLast ? 'border-r border-zinc-900/40 pr-3' : 'pl-1'}`}>
                  <div className="text-[9px] text-zinc-500 font-bold mb-3 uppercase tracking-widest border-b border-zinc-800 pb-1">{title}</div>
                  <div className="flex flex-col justify-between flex-1 pb-2">
                    {data.map((p, i) => {
                      const isPos = p && p.change && parseFloat(p.change) > 0;
                      return (
                        <div key={i} className="flex justify-between items-center text-[10px] font-mono leading-none">
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
                  {renderCol("Commodities", pricesArray.slice(0, 5), "flex-[0.9]")}
                  {renderCol("ETFs", pricesArray.slice(5, 10), "flex-[0.9]")}
                  {renderCol("Índices", pricesArray.slice(10, 15), "flex-[1.2]", true)}
                </>
              );
            })()}
          </div>
        </motion.div>

        {/* W3: NEWS FEED (512px) - SE VA PARA ARRIBA */}
        <motion.div 
          animate={{ y: isAiActive ? -200 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-[512px] h-[192px] border-r border-gray-800 shrink-0 bg-black flex flex-col font-mono overflow-hidden"
        >
          <div className="flex h-[24px] items-center text-[9px] font-bold text-zinc-500 border-b border-zinc-800 bg-zinc-900/30 px-2 uppercase tracking-tighter shrink-0">
            <div className="w-[60%]">Headline</div>
            <div className="w-[15%] text-center">Time</div>
            <div className="w-[10%] text-center">Ticker</div>
            <div className="w-[15%] text-right">Source</div>
          </div>
          <div className="flex flex-col h-[168px] bg-black overflow-hidden">
            {news.slice(0, 7).map((n, i) => (
              <div key={i} className="flex items-center px-2 h-[24px] border-b border-zinc-900/40 hover:bg-zinc-900/50 transition-colors group shrink-0">
                <div className="w-[60%] text-[10px] text-zinc-300 font-medium group-hover:text-white overflow-hidden pr-2">
                  <MarqueeHeadline text={n.headline} maxDuration={maxDuration} id={i} />
                </div>
                <div className="w-[15%] text-[10px] text-violet-500 text-center font-bold">{n.time}</div>
                <div className="w-[10%] text-[9px] text-zinc-500 text-center uppercase">{n.ticker}</div>
                <div className="w-[15%] text-[9px] text-zinc-600 text-right truncate">{n.source}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* W4: WORLD CLOCKS (384px) - SE VA PARA ABAJO */}
        <motion.div 
          animate={{ y: isAiActive ? 200 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-[384px] h-full grid grid-cols-3 bg-zinc-950/20 shrink-0 border-l border-gray-900"
        >
          <div className="flex flex-col justify-around border-r border-zinc-900/50 py-1">
            <Clock city="BS AS" zone="America/Argentina/Buenos_Aires" time={masterTime} />
            <Clock city="SYDNEY" zone="Australia/Sydney" time={masterTime} />
          </div>
          <div className="flex flex-col justify-around border-r border-zinc-900/50 py-1">
            <Clock city="NY" zone="America/New_York" time={masterTime} />
            <Clock city="TOKIO" zone="Asia/Tokyo" time={masterTime} />
          </div>
          <div className="flex flex-col justify-around py-1">
            <Clock city="LONDON" zone="Europe/London" time={masterTime} />
            <Clock city="BEIJING" zone="Asia/Shanghai" time={masterTime} />
          </div>
        </motion.div>

      </div>

      {/* Estela Inferior Fina (1px) */}
      <div 
        className="h-[1px] min-h-[1px] w-full transition-all duration-700 ease-out z-50 relative"
        style={{ backgroundColor: sentimentColor, boxShadow: neonGlow, filter: 'saturate(1.8)' }}
      />

    </div>
  );
}

const Clock = ({ city, zone, time }) => {
  // Usamos el tiempo del Pulso Maestro para la sincronización total
  const timeInZone = new Date(time.toLocaleString('en-US', { timeZone: zone }));
  const hrs = timeInZone.getHours();
  const mins = timeInZone.getMinutes();
  const secs = timeInZone.getSeconds();

  // Cálculos de rotación de alta precisión
  const hourDeg = (hrs * 30) + (mins * 0.5);
  const minDeg = (mins * 6) + (secs * 0.1);
  const secDeg = secs * 6;

  return (
    <div className="flex flex-col items-center justify-center py-1">
      <span className="text-[8px] text-zinc-600 font-bold uppercase mb-0.5 tracking-widest">{city}</span>
      <span className="text-base font-mono text-orange-400/90 font-medium leading-none mb-2">
        {timeInZone.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
      </span>

      <svg width="34" height="34" viewBox="0 0 34 34">
        {/* Aguja Horas (Lanza) */}
        <polygon points="17,17 14,17 17,4.5 20,17" fill="#fb923c" transform={`rotate(${hourDeg} 17 17)`} />
        {/* Aguja Minutos (Lanza) */}
        <polygon points="17,17 15.5,17 17,0 18.5,17" fill="#fb923c" transform={`rotate(${minDeg} 17 17)`} />
        {/* Segundero Sincronizado (Aguja de hilo blanca) */}
        <line 
          x1="17" y1="21" x2="17" y2="1" 
          stroke="white" strokeWidth="0.5" strokeLinecap="round" opacity="0.6"
          transform={`rotate(${secDeg} 17 17)`} 
        />
        <circle cx="17" cy="17" r="1.8" fill="#fb923c" stroke="#000" strokeWidth="0.5" />
      </svg>
    </div>
  );
};