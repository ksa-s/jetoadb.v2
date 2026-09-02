import React, { useState } from 'react';
import {
  X,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tv,
  Check,
  Shield,
  HelpCircle,
  Radio,
  Music,
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Mic,
  RotateCcw
} from 'lucide-react';
import { Adb } from '@yume-chan/adb';
import { CarSystemTools } from '../lib/adb/car-system-tools';

interface SteeringWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  adb: Adb | null;
  isConnected: boolean;
  onLog: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const SteeringWheelModal: React.FC<SteeringWheelModalProps> = ({
  isOpen,
  onClose,
  adb,
  isConnected,
  onLog,
}) => {
  const [isFixing, setIsFixing] = useState(false);
  const [fixSuccess, setFixSuccess] = useState(false);
  const [fixLogs, setFixLogs] = useState<string[]>([]);
  const [lastTestedKey, setLastTestedKey] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunCompleteFix = async () => {
    if (!adb) {
      onLog('يجب الاتصال بشاشة السيارة أولاً عبر كابل USB.', 'warning');
      return;
    }

    setIsFixing(true);
    setFixLogs([]);
    setFixSuccess(false);
    onLog('بدء تفعيل حزمة إصلاح أزرار الدركسون والمقود الشاملة للشاشة...', 'info');

    try {
      const logs = await CarSystemTools.applySteeringWheelCompleteFix(adb);
      setFixLogs(logs);
      setFixSuccess(true);
      logs.forEach((l) =>
        onLog(
          l,
          l.startsWith('✓') ? 'success' : l.startsWith('===') ? 'info' : 'warning'
        )
      );
    } catch (e: any) {
      const msg = e.message || String(e);
      onLog(`فشل تطبيق إصلاح أزرار الدركسون: ${msg}`, 'error');
      setFixLogs((prev) => [...prev, `❌ حدث خطأ: ${msg}`]);
    } finally {
      setIsFixing(false);
    }
  };

  const handleSendTestKey = async (
    key: 'next' | 'prev' | 'play_pause' | 'play' | 'pause' | 'stop' | 'vol_up' | 'vol_down' | 'mute' | 'voice',
    keyLabel: string
  ) => {
    if (!adb) {
      onLog('يجب الاتصال بشاشة السيارة أولاً.', 'warning');
      return;
    }

    setLastTestedKey(key);
    try {
      const res = await CarSystemTools.sendMediaKey(adb, key);
      setTestFeedback(`✓ تم إرسال أمر (${keyLabel}) بنجاح إلى مشغل السيارة`);
      onLog(res, 'success');
      setTimeout(() => setTestFeedback(null), 3000);
    } catch (e: any) {
      const msg = e.message || String(e);
      setTestFeedback(`❌ فشل إرسال (${keyLabel}): ${msg}`);
      onLog(`فشل إرسال زر التحكم: ${msg}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-950/70 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                إصلاح وبرمجة أزرار الدركسون والمقود (Steering Wheel Fix)
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-700/40">
                  حل فوري
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                إصلاح أزرار (التالي ⏭️ / السابق ⏮️ / الإيقاف ⏹️ / التشغيل ⏯️) على شاشات السيارات
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Main 1-Click Fix Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/50 via-slate-900 to-indigo-950/50 border border-purple-500/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-sm font-bold text-purple-200 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-400" />
                  التفعيل الشامل لأزرار الدركسون بنقرة واحدة
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  يقوم هذا الخيار ببرمجة النظام وتجاوز قفل إعدادات السيارة، وتفعيل خدمات إمكانية الوصول (Accessibility Services)، ومنح أذونات MacroDroid و KeyMapper لتلقي ضغطات الأزرار فوراً، وتحرير مسار الصوت من راديو المصنع.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunCompleteFix}
                disabled={isFixing || !isConnected}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/30 shrink-0 cursor-pointer"
              >
                {isFixing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الإصلاح والبرمجة...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    <span>تفعيل وإصلاح الأزرار الآن</span>
                  </>
                )}
              </button>
            </div>

            {/* Status logs */}
            {fixLogs.length > 0 && (
              <div className="mt-3.5 bg-slate-950/80 rounded-lg p-3 border border-slate-800 space-y-1 max-h-36 overflow-y-auto font-mono text-[11px]">
                {fixLogs.map((l, idx) => (
                  <div
                    key={idx}
                    className={
                      l.startsWith('✓')
                        ? 'text-emerald-400'
                        : l.startsWith('❌')
                        ? 'text-rose-400'
                        : l.startsWith('===')
                        ? 'text-purple-300 font-bold'
                        : 'text-slate-300'
                    }
                  >
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real-time Button Tester */}
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-2">
                <Tv className="w-4 h-4 text-cyan-400" />
                لوحة اختبار ومحاكاة أزرار الميديا والدركسون الحية:
              </span>
              <span className="text-[10px] text-slate-400">
                اضغط لتجربة استجابة الموسيقى على الشاشة
              </span>
            </div>

            {testFeedback && (
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-center animate-in fade-in duration-150">
                {testFeedback}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Next Track */}
              <button
                type="button"
                onClick={() => handleSendTestKey('next', 'المقطع التالي (Next)')}
                disabled={!isConnected}
                className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 flex flex-col items-center justify-center gap-1.5 transition-all text-slate-100 font-semibold cursor-pointer active:scale-95 disabled:opacity-40"
              >
                <SkipForward className="w-5 h-5 text-cyan-400" />
                <span className="text-xs">المقطع التالي ⏭️</span>
                <span className="text-[9px] text-slate-500 font-mono">KEYCODE 87</span>
              </button>

              {/* Prev Track */}
              <button
                type="button"
                onClick={() => handleSendTestKey('prev', 'المقطع السابق (Previous)')}
                disabled={!isConnected}
                className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 flex flex-col items-center justify-center gap-1.5 transition-all text-slate-100 font-semibold cursor-pointer active:scale-95 disabled:opacity-40"
              >
                <SkipBack className="w-5 h-5 text-cyan-400" />
                <span className="text-xs">المقطع السابق ⏮️</span>
                <span className="text-[9px] text-slate-500 font-mono">KEYCODE 88</span>
              </button>

              {/* Play / Pause Toggle */}
              <button
                type="button"
                onClick={() => handleSendTestKey('play_pause', 'تبديل التشغيل والإيقاف')}
                disabled={!isConnected}
                className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-1.5 transition-all text-slate-100 font-semibold cursor-pointer active:scale-95 disabled:opacity-40"
              >
                <div className="flex items-center gap-0.5 text-emerald-400">
                  <Play className="w-4 h-4 fill-current" />
                  <Pause className="w-4 h-4 fill-current" />
                </div>
                <span className="text-xs">تشغيل / إيقاف ⏯️</span>
                <span className="text-[9px] text-slate-500 font-mono">KEYCODE 85</span>
              </button>

              {/* Stop Key */}
              <button
                type="button"
                onClick={() => handleSendTestKey('stop', 'إيقاف كامل للميديا (Stop)')}
                disabled={!isConnected}
                className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-rose-500/50 flex flex-col items-center justify-center gap-1.5 transition-all text-slate-100 font-semibold cursor-pointer active:scale-95 disabled:opacity-40"
              >
                <Square className="w-5 h-5 text-rose-400" />
                <span className="text-xs">إيقاف كامل ⏹️</span>
                <span className="text-[9px] text-slate-500 font-mono">KEYCODE 86</span>
              </button>
            </div>

            {/* Volume & Aux Row */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSendTestKey('vol_up', 'رفع الصوت')}
                disabled={!isConnected}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-center font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                <span>رفع الصوت 🔊</span>
              </button>

              <button
                type="button"
                onClick={() => handleSendTestKey('vol_down', 'خفض الصوت')}
                disabled={!isConnected}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-center font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                <span>خفض الصوت 🔉</span>
              </button>

              <button
                type="button"
                onClick={() => handleSendTestKey('mute', 'كتم الصوت')}
                disabled={!isConnected}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-center font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                <span>كتم الصوت 🔇</span>
              </button>

              <button
                type="button"
                onClick={() => handleSendTestKey('voice', 'المساعد الصوتي')}
                disabled={!isConnected}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-center font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 col-span-3 sm:col-span-1"
              >
                <Mic className="w-3.5 h-3.5 text-purple-400" />
                <span>مساعد صوتي 🎙️</span>
              </button>
            </div>
          </div>

          {/* Explanation & Troubleshooting Card */}
          <div className="rounded-xl bg-slate-950/40 border border-slate-800/80 p-3.5 space-y-2">
            <span className="font-bold text-slate-200 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-400" />
              لماذا لا تستجيب أزرار الدركسون في شاشات السيارات وما هو الحل؟
            </span>
            <ul className="list-disc list-inside space-y-1.5 text-slate-300 text-[11px] leading-relaxed">
              <li>
                <strong className="text-white">قفل راديو المصنع (Audio Focus):</strong> تقوم بعض شاشات السيارات بربط أزرار الدركسون بتطبيق الراديو الأصلي وحجبها عن التطبيقات الخارجية مثل Spotify و YouTube Music. زر "تفعيل وإصلاح الأزرار" يقوم بفك هذا الارتباط.
              </li>
              <li>
                <strong className="text-white">إعادة تعيين الأزرار عبر MacroDroid أو KeyMapper:</strong> بعد الضغط على زر التفعيل، افتح تطبيق <span className="font-mono text-cyan-300">MacroDroid</span> على الشاشة واختر Triggers ➔ Media Button أو Volume Button لربط زر الدركسون بأمر Next/Previous.
              </li>
              <li>
                <strong className="text-white">قنوات CAN-Bus للسيارات الصينية (جيتور، شانجان، هافال، جيلي):</strong> تم تفعيل بث سجلات أزرار عجلة القيادة في الـ LogCat بحيث يستطيع تطبيق تعيين المفاتيح التقاطها فوراً.
              </li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            {isConnected ? (
              <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                شاشة السيارة متصلة وجاهزة لتلقي الأوامر
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                يرجى توصيل الشاشة أولاً لتفعيل الأوامر
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
