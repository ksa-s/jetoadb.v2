import React, { useRef, useEffect, useState } from 'react';
import { LogEntry } from '../types';
import { 
  Terminal, 
  Copy, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  ChevronRight,
  Check,
  Download
} from 'lucide-react';

interface LogTerminalProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const LogTerminal: React.FC<LogTerminalProps> = ({ logs, onClearLogs }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopyLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] ${l.type === 'command' ? '$ ' : ''}${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}${l.details ? `\nDetails: ${l.details}` : ''}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `car_adb_logs_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full rounded-2xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 backdrop-blur-sm shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              السجل
              <span className="text-[11px] font-normal text-slate-400 font-mono">
                ({logs.length} سجل)
              </span>
            </h2>
          </div>
        </div>

        {/* Log Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopyLogs}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 text-slate-300 hover:text-white text-xs flex items-center gap-1 transition-colors cursor-pointer"
            title="نسخ السجل بالكامل"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'تم النسخ' : 'نسخ'}</span>
          </button>

          <button
            onClick={handleDownloadLogs}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 text-slate-300 hover:text-white text-xs flex items-center gap-1 transition-colors cursor-pointer"
            title="تصدير السجل كملف نصي"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClearLogs}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-rose-950/40 border border-slate-700/50 text-slate-400 hover:text-rose-300 text-xs flex items-center gap-1 transition-colors cursor-pointer"
            title="مسح السجل"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div
        ref={containerRef}
        className="w-full h-80 sm:h-96 bg-slate-950/95 rounded-xl p-3 sm:p-4 border border-slate-800/80 overflow-y-auto font-mono text-xs text-slate-200 space-y-1.5 selection:bg-cyan-500/30"
        dir="ltr"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 text-center font-sans">
            <p>لا توجد سجلات بعد. قم بالاتصال بشاشة السيارة لبدء تسجيل العمليات.</p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`flex items-start gap-2 leading-relaxed transition-colors py-0.5 px-1 rounded ${
                log.type === 'error'
                  ? 'text-rose-400 bg-rose-950/20'
                  : log.type === 'success'
                  ? 'text-emerald-400'
                  : log.type === 'warning'
                  ? 'text-amber-400'
                  : log.type === 'command'
                  ? 'text-cyan-300 font-semibold'
                  : log.type === 'output'
                  ? 'text-slate-300 pl-6'
                  : 'text-slate-400'
              }`}
            >
              {/* Icon */}
              <span className="shrink-0 mt-0.5">
                {log.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {log.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                {log.type === 'warning' && <AlertCircle className="w-3.5 h-3.5 text-amber-400" />}
                {log.type === 'info' && <Info className="w-3.5 h-3.5 text-slate-500" />}
                {log.type === 'command' && <span className="text-cyan-400 font-bold">$</span>}
                {log.type === 'output' && <ChevronRight className="w-3 h-3 text-slate-600" />}
              </span>

              {/* Timestamp */}
              <span className="text-[11px] text-slate-600 shrink-0 select-none">
                [{log.timestamp}]
              </span>

              {/* Message Content */}
              <div className="flex-1 break-all whitespace-pre-wrap font-mono">
                {log.message}
                {log.details && (
                  <div className="text-[11px] text-slate-500 mt-0.5 border-l-2 border-slate-700 pl-2">
                    {log.details}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Auto-scroll toggle */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
        <span>وضع الطرفية: WebUSB Stream Engine</span>
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-400">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
          />
          <span>تمرير تلقائي (Auto Scroll)</span>
        </label>
      </div>
    </div>
  );
};
