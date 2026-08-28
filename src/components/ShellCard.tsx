import React, { useState } from 'react';
import { Terminal, Play, Loader2, Sparkles, HelpCircle } from 'lucide-react';

interface ShellCardProps {
  onExecuteCommand: (command: string) => Promise<void>;
  isExecuting: boolean;
  isConnected: boolean;
}

export const ShellCard: React.FC<ShellCardProps> = ({
  onExecuteCommand,
  isExecuting,
  isConnected,
}) => {
  const [command, setCommand] = useState('getprop ro.product.model');
  const [showHelper, setShowHelper] = useState(false);

  const presets = [
    { label: 'موديل الشاشة', cmd: 'getprop ro.product.model' },
    { label: 'إصدار الأندرويد', cmd: 'getprop ro.build.version.release' },
    { label: 'أبعاد الشاشة', cmd: 'wm size' },
    { label: 'كثافة DPI', cmd: 'wm density' },
    { label: 'تطبيقات الطرف الثالث', cmd: 'pm list packages -3' },
    { label: 'فتح التثبيت الخارجي', cmd: 'settings put secure install_non_market_apps 1' },
    { label: 'إيقاف حظر الحزم', cmd: 'settings put global package_verifier_enable 0' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isExecuting || !isConnected) return;
    onExecuteCommand(command.trim());
  };

  const isAdbPrefix = command.trim().toLowerCase().startsWith('adb ');

  return (
    <div className="w-full rounded-2xl bg-slate-900/80 border border-slate-800 p-4 sm:p-5 backdrop-blur-sm shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-950/60 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              أمر shell مخصص
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              تنفيذ أوامر مباشرة على نظام شاشة السيارة بدون قيود
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowHelper(!showHelper)}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>أوامر شائعة</span>
        </button>
      </div>

      {/* Warning if user writes 'adb ...' */}
      {isAdbPrefix && (
        <div className="mb-3 p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-300 flex items-center justify-between gap-2">
          <span>
            💡 <strong>ملاحظة:</strong> أنت الآن متصل داخل شل (Shell) الشاشة مباشرة. لا تحتاج لكتابة كلمة <code>adb</code> في البداية.
          </span>
          <button
            onClick={() => setCommand(command.replace(/^adb\s+/i, ''))}
            className="px-2 py-0.5 rounded bg-amber-900/60 border border-amber-600/40 text-amber-200 hover:bg-amber-800/60 text-[11px] font-bold shrink-0"
          >
            إزالة adb تلقائياً
          </button>
        </div>
      )}

      {/* Command Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-cyan-400 font-bold select-none text-sm">
            $
          </span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="مثال: getprop ro.product.model أو pm list packages -3"
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pr-9 pl-4 py-2.5 text-xs sm:text-sm font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
            dir="ltr"
          />
        </div>

        <button
          type="submit"
          disabled={!isConnected || isExecuting || !command.trim()}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 shrink-0 cursor-pointer"
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري التنفيذ...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>تنفيذ</span>
            </>
          )}
        </button>
      </form>

      {/* Preset Chips */}
      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-400 flex items-center gap-1 ml-1">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          اختصارات سريعة:
        </span>
        {presets.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setCommand(p.cmd)}
            className="px-2.5 py-1 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 transition-colors cursor-pointer"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};
