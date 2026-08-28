import React from 'react';
import { DeviceInfo } from '../types';
import { Smartphone, Cpu, ShieldCheck, Layers, Tv, Usb, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ConnectionPanelProps {
  deviceInfo: DeviceInfo | null;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  isWebUsbSupported: boolean;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  deviceInfo,
  isConnected,
  isConnecting,
  onConnect,
  isWebUsbSupported,
}) => {
  if (!isWebUsbSupported) {
    return (
      <div className="w-full rounded-2xl bg-amber-950/40 border border-amber-500/40 p-4 text-amber-200 text-sm flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-amber-300">المتصفح الحالي لا يدعم ميزة WebUSB</h4>
          <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
            للاتصال بكمبيوتر وشاشة السيارة عبر كابل الـ USB مباشرة، يرجى فتح هذا الرابط عبر متصفح **Google Chrome** أو **Microsoft Edge** أو **Brave** من الكمبيوتر أو من هاتف أندرويد يدعم OTG.
          </p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="w-full rounded-2xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-700/40 flex items-center justify-center text-cyan-400 shrink-0">
              <Usb className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                جاهز للاتصال بشاشة السيارة عبر USB
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                قم بتوصيل كابل الـ USB بمنفذ الشاشة / السيارة، ثم اضغط زر الاتصال ووافق على طلب تصحيح أخطاء USB (ADB) على شاشة السيارة.
              </p>
            </div>
          </div>

          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-600/20 shrink-0 cursor-pointer"
          >
            <Usb className="w-4 h-4" />
            <span>{isConnecting ? 'جاري الاتصال...' : 'اتصال بالجهاز الآن'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl bg-slate-900/70 border border-slate-800 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">{deviceInfo?.model || 'شاشة السيارة'}</span>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                {deviceInfo?.serial}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              الشركة المصنعة: {deviceInfo?.manufacturer || deviceInfo?.brand || 'Android Automotive'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300">
            Android {deviceInfo?.androidVersion} (API {deviceInfo?.sdkVersion})
          </span>
          <span className="px-2.5 py-1 rounded-md bg-cyan-950/60 border border-cyan-700/40 text-cyan-300 font-mono">
            {deviceInfo?.cpuAbi}
          </span>
        </div>
      </div>

      {/* Grid of hardware details */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/60 flex items-center gap-2.5">
          <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="truncate">
            <span className="text-[10px] text-slate-400 block">نظام التشغيل</span>
            <span className="font-semibold text-slate-200 truncate block">Android {deviceInfo?.androidVersion}</span>
          </div>
        </div>

        <div className="bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/60 flex items-center gap-2.5">
          <Cpu className="w-4 h-4 text-blue-400 shrink-0" />
          <div className="truncate">
            <span className="text-[10px] text-slate-400 block">معمارية المعالج</span>
            <span className="font-mono font-semibold text-slate-200 truncate block">{deviceInfo?.cpuAbi}</span>
          </div>
        </div>

        <div className="bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/60 flex items-center gap-2.5">
          <Tv className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="truncate">
            <span className="text-[10px] text-slate-400 block">أبعاد الشاشة</span>
            <span className="font-semibold text-slate-200 truncate block">{deviceInfo?.displaySize || 'تلقائي'}</span>
          </div>
        </div>

        <div className="bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/60 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="truncate">
            <span className="text-[10px] text-slate-400 block">بروتوكول التثبيت</span>
            <span className="font-semibold text-emerald-300 truncate block">Direct Stream Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};
