import React, { useState, useEffect, useRef } from "react";
import { Play, CheckCircle2, Figma, MousePointer2, Layers, Terminal as TerminalIcon, Info, AlertTriangle, Github, Heart } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import JSZip from "jszip";

// Architect Exporter - V2.5
// Enhanced: Rich terminal feedback and progress tracking.

const isLocal = window.location.hostname === "localhost";
const PLUGIN_ID = isLocal ? "*" : "1619447879001265326";

interface LogEntry {
  id: string;
  message: string;
  type: "info" | "success" | "error";
  time: string;
}

interface PluginConfig {
  pngScale: number;
  includeSvg: boolean;
  separateImages: boolean;
  renamePrefix: string;
}

interface SelectionState {
  hasFrame: boolean;
  thumbnail: string | null;
  name: string;
  count: number;
  width: number;
  height: number;
}

export default function App() {
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [selection, setSelection] = useState<SelectionState>({
    hasFrame: false,
    thumbnail: null,
    name: "",
    count: 0,
    width: 0,
    height: 0
  });

  const [config, setConfig] = useState<PluginConfig>({
    pngScale: 5,
    includeSvg: true,
    separateImages: false,
    renamePrefix: "[Background]"
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zipRef = useRef<JSZip | null>(null);
  
  const addLog = (message: string, type: "info" | "success" | "error" = "info") => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setLogs(prev => [...prev.slice(-6), { id: Math.random().toString(36), message, type, time }]);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;
      
      if (msg.type === 'export-result') {
        if (!zipRef.current) zipRef.current = new JSZip();
        
        const folderName = msg.folder ? msg.folder : "Other";
        
        // Add PNG to ZIP folder
        if (msg.png && msg.pngFilename) {
          zipRef.current.file(`${folderName}/${msg.pngFilename}`, msg.png.buffer);
        }
        
        // Add SVG to ZIP folder
        if (msg.svg && msg.svgFilename) {
          zipRef.current.file(`${folderName}/${msg.svgFilename}`, msg.svg.buffer);
        }
        
        addLog(`Capturado: "${msg.name}" em /${folderName}`, "info");
      }

      if (msg.type === 'export-finished') {
        if (zipRef.current) {
          addLog("Gerando pacote final...", "info");
          zipRef.current.generateAsync({ type: "blob" }).then((blob) => {
            const date = new Date().toISOString().slice(0, 10);
            const fileName = `export-${date}-${Math.random().toString(36).substring(7)}.zip`;
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 100);
            
            addLog(`Finalizado: ${msg.count} assets no ZIP`, "success");
            setStatus("success");
            zipRef.current = null; // Clear for next run
          });
        } else {
          setStatus("idle");
        }
      }

      if (msg.type === 'export-log') {
        addLog(msg.message, msg.logType || 'info');
      }

      if (msg.type === 'selection-updated') {
        if (msg.hasFrame) {
          const blob = new Blob([msg.thumbnail.buffer as any], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          
          setSelection(prev => {
            if (prev.thumbnail) URL.revokeObjectURL(prev.thumbnail);
            return {
              hasFrame: true,
              thumbnail: url,
              name: msg.name,
              count: msg.count,
              width: msg.width,
              height: msg.height
            };
          });
        } else {
          setSelection(prev => {
            if (prev.thumbnail) URL.revokeObjectURL(prev.thumbnail);
            return { hasFrame: false, thumbnail: null, name: "", count: 0, width: 0, height: 0 };
          });
        }
      }
    };

    window.addEventListener('message', handleMessage);
    parent.postMessage({ 
      pluginMessage: { type: 'request-initial-selection' }, 
      pluginId: PLUGIN_ID 
    }, '*');

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Hug Content Logic: Monitor element size and notify Figma
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { height } = entry.contentRect;
        // Add a tiny bit of padding to avoid scrollbars
        parent.postMessage({ 
          pluginMessage: { type: 'resize', height: Math.ceil(height) + 4, width: 320 },
          pluginId: PLUGIN_ID
        }, '*');
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Reset status to idle after success
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => setStatus("idle"), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleRun = () => {
    setStatus("running");
    setLogs([]);
    zipRef.current = new JSZip(); // Create new zip instance
    addLog(`Exporting ${selection.count} frames...`, "info");
    parent.postMessage({ 
      pluginMessage: { 
        type: 'run-export',
        config: config 
      },
      pluginId: PLUGIN_ID
    }, '*');
  };

  return (
    <div 
      ref={containerRef}
      className="w-[320px] bg-[var(--figma-bg)] text-black flex flex-col items-center gap-6 p-4 select-none overflow-hidden font-sans relative"
    >
      
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none flex items-center justify-center">
        <Figma size={500} className="rotate-12" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full flex flex-col items-center gap-5"
      >
        <header className="text-center space-y-2">
          <div className="space-y-0.5">
            <h1 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30">Visant Exporter</h1>
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] opacity-10 text-blue-500">by Pedro Jaques</p>
          </div>
          <div className="h-4">
             <AnimatePresence mode="wait">
               {!selection.hasFrame ? (
                 <motion.p key="no-sel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[9px] text-black/20 font-bold uppercase tracking-widest flex items-center justify-center gap-1">
                   <MousePointer2 size={10} /> Selecione um frame
                 </motion.p>
               ) : (
                 <motion.p key="has-sel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[9px] text-blue-500 font-bold uppercase tracking-widest flex items-center justify-center gap-1">
                   <Layers size={10} strokeWidth={3} /> {selection.count} {selection.count === 1 ? 'frame' : 'frames'}
                 </motion.p>
               )}
             </AnimatePresence>
          </div>
        </header>

        <div className="relative">
          <AnimatePresence mode="wait">
            {selection.hasFrame ? (
              <motion.div
                key="active-state"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-8"
              >
                <div className="relative w-48 h-32">
                  <AnimatePresence>
                    {selection.count > 1 && (
                      <>
                        <motion.div 
                          initial={{ opacity: 0, rotate: 0 }}
                          animate={{ opacity: 0.3, rotate: -8, x: -16, y: -8 }}
                          className="absolute inset-0 bg-white rounded-3xl border border-black/[0.03] shadow-sm pointer-events-none"
                        />
                        <motion.div 
                          initial={{ opacity: 0, rotate: 0 }}
                          animate={{ opacity: 0.5, rotate: -4, x: -8, y: -4 }}
                          className="absolute inset-0 bg-white rounded-3xl border border-black/[0.03] shadow-md pointer-events-none"
                        />
                      </>
                    )}
                  </AnimatePresence>

                  <div className="relative w-48 h-32 flex items-center justify-center">
                     <div 
                       className="rounded-2xl overflow-hidden bg-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-black/[0.03] transition-all duration-500 grayscale-[0.3] hover:grayscale-0"
                       style={{
                         maxHeight: '100%',
                         maxWidth: '100%',
                         aspectRatio: `${selection.width} / ${selection.height}`,
                       }}
                     >
                        {selection.thumbnail && (
                          <motion.img 
                            key={selection.thumbnail}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            src={selection.thumbnail} 
                            alt="preview" 
                            className="w-full h-full object-cover" 
                          />
                        )}
                        <div className="absolute bottom-2 inset-x-2 flex justify-center pointer-events-none">
                          <span className="bg-black/70 text-white text-[8px] px-2.5 py-1 rounded-full font-bold truncate backdrop-blur-md border border-white/10">
                            {selection.count > 1 ? `${selection.count} Frames` : selection.name}
                          </span>
                        </div>
                     </div>
                  </div>
                </div>

                {/* Scale Selector */}
                <div className="flex flex-col gap-3 items-center">
                  <div className="flex gap-2 bg-black/[0.03] p-1 rounded-full">
                    {[2, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setConfig(prev => ({ ...prev, pngScale: s }))}
                        className={`
                          text-[8px] font-black px-3 py-1 rounded-full transition-all
                          ${config.pngScale === s ? "bg-black text-white" : "text-black/30 hover:text-black/60"}
                        `}
                      >
                        {s}X
                      </button>
                    ))}
                  </div>

                  {/* Separate Images Toggle */}
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, separateImages: !prev.separateImages }))}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-black/[0.05] hover:bg-black/[0.02] transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full ${config.separateImages ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-black/10'}`} />
                    <span className={`text-[8px] font-bold uppercase tracking-widest ${config.separateImages ? 'text-black' : 'text-black/30'}`}>Separate Images</span>
                  </button>
                </div>

                <motion.button
                  onClick={handleRun}
                  disabled={status === "running"}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className={`
                    w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300
                    ${status === "running" ? "bg-black/5" : "bg-black text-white shadow-xl shadow-black/20"}
                  `}
                >
                  <AnimatePresence mode="wait">
                    {status === "idle" && <Play size={24} fill="currentColor" key="p" />}
                    {status === "running" && <div key="l" className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />}
                    {status === "success" && <CheckCircle2 size={24} className="text-green-500" key="s" />}
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-48 h-48 rounded-full border border-black/[0.05] flex items-center justify-center bg-white/50">
                 <Figma size={40} className="opacity-[0.03]" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Terminal Section (In-flow) */}
      <div className="w-full">
        <AnimatePresence>
          {(logs.length > 0 || status === "running") && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full bg-white/60 backdrop-blur-xl rounded-2xl border border-black/[0.05] overflow-hidden shadow-2xl shadow-black/[0.05]"
            >
              <div className="bg-black/[0.03] px-4 py-2 flex items-center justify-between border-b border-black/[0.03]">
                <div className="flex items-center gap-2">
                  <TerminalIcon size={10} className="opacity-40" />
                  <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Process Log</span>
                </div>
                <div className="flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-black/10" />
                  <div className="w-1 h-1 rounded-full bg-black/10" />
                </div>
              </div>
              <div 
                ref={scrollRef}
                className="p-4 flex flex-col gap-1.5 max-h-[160px] overflow-y-auto custom-scrollbar"
              >
                {logs.length === 0 && status === "running" && (
                   <div className="flex items-center gap-2 opacity-30">
                     <div className="w-1 h-1 bg-black rounded-full animate-pulse" />
                     <span className="text-[9px] font-mono">Initializing engine...</span>
                   </div>
                )}
                {logs.map((log) => (
                  <motion.div 
                    key={log.id} 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2"
                  >
                    <span className="text-[8px] font-mono opacity-20 whitespace-nowrap pt-0.5">{log.time}</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                       {log.type === 'success' && <CheckCircle2 size={8} className="text-green-500 shrink-0" />}
                       {log.type === 'error' && <AlertTriangle size={8} className="text-red-500 shrink-0" />}
                       {log.type === 'info' && <Info size={8} className="text-blue-500 shrink-0" />}
                       <span className={`text-[9px] font-mono truncate ${log.type === 'error' ? 'text-red-600' : 'text-black/60'}`}>
                         {log.message}
                       </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="text-[9px] opacity-20 uppercase tracking-[0.2em] font-black">
            {status === "idle" && selection.hasFrame && "Ready to sync"}
            {status === "running" && "Encoding..."}
            {status === "success" && "Assets delivered"}
          </p>
          
          <div className="flex items-center gap-4 pt-2 border-t border-black/[0.03] w-full justify-center">
            <a 
              href="https://github.com/pedrojaques99/figma-to-illustrator" 
              target="_blank" 
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 opacity-20 hover:opacity-100 transition-all duration-300"
            >
              <Github size={10} className="group-hover:scale-110 transition-transform" />
              <span className="text-[8px] font-black uppercase tracking-widest">OSS Plugin</span>
            </a>
            
            <div className="w-1 h-1 rounded-full bg-black/5" />
            
            <a 
              href="https://pedrojaques.com.br/donate" 
              target="_blank" 
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 text-blue-500/30 hover:text-blue-500 transition-all duration-300"
            >
              <Heart size={10} fill="currentColor" className="opacity-30 group-hover:opacity-100 group-hover:scale-110 transition-all" />
              <span className="text-[8px] font-black uppercase tracking-widest">Donate</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
