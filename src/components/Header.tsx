import React from 'react';
import { DeviceInfo } from '../types';
import { Power, Cpu, Smartphone, Monitor, Car, RefreshCw, ShieldCheck, Zap } from 'lucide-react';

interface HeaderProps {
  deviceInfo: DeviceInfo | null;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenTools: () => void;
  onOpenApps: () => void;
  onOpenPermissions?: () => void;
  onOpenSteeringWheel?: () => void;
  onOpenHelp: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  deviceInfo,
  isConnected,
  isConnecting,
  onConnect,
  onDisconnect,
  onOpenTools,
  onOpenApps,
  onOpenPermissions,
  onOpenSteeringWheel,
  onOpenHelp,
}) => {
  return (
    <header className="w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Logo & Title */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Car className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  Sam Software
                </h1>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-700/50 text-cyan-400">
                  Car ADB Pro
                </span>
              </div>
              <p className="text-xs text-slate-400">
                إدارة شاشات السيارات (Android Auto / AAOS) عبر ADB من المتصفح
              </p>
            </div>
          </div>

          {/* Quick buttons on mobile */}
          <div className="flex items-center gap-2 md:hidden">
            {isConnected ? (
              <button
                onClick={onDisconnect}
                className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Power className="w-3.5 h-3.5" />
                <span>قطع</span>
              </button>
            ) : (
              <button
                onClick={onConnect}
                disabled={isConnecting}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                {isConnecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Car className="w-3.5 h-3.5" />}
                <span>اتصال USB</span>
              </button>
            )}
          </div>
        </div>

        {/* Actions & Connection Status on Desktop */}
        <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-end">
          {/* Quick nav links */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={onOpenSteeringWheel}
              disabled={!isConnected}
              className="px-3 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900/90 disabled:opacity-40 disabled:cursor-not-allowed border border-purple-500/50 text-purple-200 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm shadow-purple-950 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span>أزرار الدركسون</span>
            </button>

            <button
              onClick={onOpenPermissions}
              disabled={!isConnected}
              className="px-3 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/80 disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>قسم الأذونات</span>
            </button>

            <button
              onClick={onOpenApps}
              disabled={!isConnected}
              className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/60 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span>إدارة التطبيقات</span>
            </button>
            
            <button
              onClick={onOpenTools}
              disabled={!isConnected}
              className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/60 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <span>أدوات الشاشة والـ DPI</span>
            </button>

            <button
              onClick={onOpenHelp}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-700/60 border border-slate-700/50 text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>دليل الشاشات</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block"></div>

          {/* Device Pill */}
          {isConnected && deviceInfo ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-emerald-950/50 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-mono font-bold tracking-wide">{deviceInfo.serial}</span>
                <span className="text-emerald-500/60 text-[11px]">({deviceInfo.model})</span>
              </div>

              <button
                onClick={onDisconnect}
                className="hidden md:flex px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold items-center gap-1.5 transition-colors"
                title="قطع الاتصال بالجهاز"
              >
                <Power className="w-3.5 h-3.5" />
                <span>قطع</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              className="hidden md:flex px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-semibold items-center gap-2 transition-all shadow-md shadow-cyan-600/20"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري طلب الإذن والاتصال...</span>
                </>
              ) : (
                <>
                  <Car className="w-4 h-4" />
                  <span>اتصال بشاشة السيارة (WebUSB)</span>
                </>
              )}
            </button>
          )}

        </div>

      </div>
    </header>
  );
};
