import React, { useState } from 'react';
import { Adb } from '@yume-chan/adb';
import { 
  DIRECT_CAR_APPS, 
  DirectAppItem, 
  downloadAndInstallCarApp 
} from '../lib/direct-apps';
import { InstalledApp } from '../types';
import { 
  Youtube, 
  Download, 
  CheckCircle2, 
  Loader2, 
  Play, 
  Sparkles, 
  ShieldCheck, 
  FolderOpen, 
  Cpu, 
  Zap,
  AlertCircle,
  RotateCw,
  Tv
} from 'lucide-react';

interface DirectAppsCatalogCardProps {
  adb: Adb | null;
  isConnected: boolean;
  installedApps: InstalledApp[];
  onLog: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  onRefreshInstalledApps: () => void;
  onLaunchApp?: (packageName: string) => void;
}

interface AppInstallState {
  status: 'idle' | 'downloading' | 'uploading' | 'installing' | 'processing' | 'success' | 'error';
  progress: number;
  message?: string;
  errorMessage?: string;
}

export const DirectAppsCatalogCard: React.FC<DirectAppsCatalogCardProps> = ({
  adb,
  isConnected,
  installedApps,
  onLog,
  onRefreshInstalledApps,
  onLaunchApp,
}) => {
  const [appStates, setAppStates] = useState<Record<string, AppInstallState>>({});
  const [isProcessingBundle, setIsProcessingBundle] = useState(false);

  const getAppState = (appId: string): AppInstallState => {
    return appStates[appId] || { status: 'idle', progress: 0 };
  };

  const isAppInstalled = (packageName: string): boolean => {
    return installedApps.some((app) => app.packageName.toLowerCase() === packageName.toLowerCase());
  };

  const handleInstallApp = async (app: DirectAppItem) => {
    if (!adb || !isConnected) {
      onLog('يرجى توصيل شاشة السيارة أولاً عبر كابل الـ USB للبدء بالتثبيت.', 'warning');
      return;
    }

    setAppStates((prev) => ({
      ...prev,
      [app.id]: { status: 'downloading', progress: 0, message: 'بدء الاتصال...' },
    }));

    const res = await downloadAndInstallCarApp(
      adb,
      app,
      (progress, stage, msg) => {
        setAppStates((prev) => ({
          ...prev,
          [app.id]: {
            status: stage,
            progress,
            message: msg,
          },
        }));
      },
      onLog
    );

    if (res.success) {
      setAppStates((prev) => ({
        ...prev,
        [app.id]: {
          status: 'success',
          progress: 100,
          message: 'تم التثبيت بنجاح على الشاشة!',
        },
      }));
      onRefreshInstalledApps();
    } else {
      setAppStates((prev) => ({
        ...prev,
        [app.id]: {
          status: 'error',
          progress: 0,
          errorMessage: res.message,
        },
      }));
    }
  };

  // Install YouTube Vanced + MicroG bundle automatically
  const handleInstallVancedBundle = async () => {
    if (!adb || !isConnected) {
      onLog('يرجى توصيل شاشة السيارة أولاً عبر كابل الـ USB.', 'warning');
      return;
    }

    const microGApp = DIRECT_CAR_APPS.find((a) => a.id === 'microg')!;
    const vancedApp = DIRECT_CAR_APPS.find((a) => a.id === 'youtube_revanced')!;

    setIsProcessingBundle(true);
    onLog('بدء تثبيت حزمة يوتيوب فانسد المتكاملة (مايكرو سيرفس أولاً ثم يوتيوب فانسد)...', 'info');

    try {
      // Step 1: Install MicroG
      onLog('[1/2] جاري تثبيت حزمة مايكرو سيرفس (MicroG)...', 'info');
      await handleInstallApp(microGApp);

      // Step 2: Install YouTube Vanced
      onLog('[2/2] جاري تثبيت تطبيق يوتيوب فانسد المطور...', 'info');
      await handleInstallApp(vancedApp);

      onLog('اكتمل تثبيت حزمة يوتيوب فانسد ومايكرو سيرفس بنجاح!', 'success');
    } finally {
      setIsProcessingBundle(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'youtube':
        return <Youtube className="w-5 h-5 text-rose-400" />;
      case 'services':
        return <Cpu className="w-5 h-5 text-cyan-400" />;
      case 'utilities':
        return <FolderOpen className="w-5 h-5 text-blue-400" />;
      default:
        return <Zap className="w-5 h-5 text-emerald-400" />;
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl mb-6 backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-rose-500/20 via-cyan-500/15 to-emerald-500/20 border border-rose-500/30 rounded-xl">
            <Sparkles className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">
                تطبيقات شاشات السيارات الجاهزة (تحميل وتثبيت مباشر بضغطة واحدة)
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                مباشر داخل الموقع
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              تطبيقات رسمية أصلية مجهزة بنظام تجاوز حظر جيتور T2 وفتح أذونات التخزين والـ USB والحسابات تلقائياً
            </p>
          </div>
        </div>

        {/* Quick 1-Click Vanced Bundle Button */}
        <button
          id="btn-install-vanced-bundle"
          onClick={handleInstallVancedBundle}
          disabled={!isConnected || isProcessingBundle}
          className="px-3.5 py-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all shrink-0"
          title="تثبيت يوتيوب فانسد مع مايكرو سيرفس معاً بالترتيب الصحيح"
        >
          {isProcessingBundle ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Youtube className="w-4 h-4 fill-current text-rose-100" />
          )}
          <span>تثبيت حزمة يوتيوب فانسد + مايكرو سيرفس معاً</span>
        </button>
      </div>

      {/* Apps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {DIRECT_CAR_APPS.map((app) => {
          const state = getAppState(app.id);
          const installed = isAppInstalled(app.packageName);
          const isBusy = state.status === 'downloading' || state.status === 'uploading' || state.status === 'installing' || state.status === 'processing';

          return (
            <div
              key={app.id}
              id={`direct-app-card-${app.id}`}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                installed
                  ? 'bg-slate-900/60 border-emerald-500/30'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                {/* Top badges */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-slate-800/80 rounded-lg">
                      {getCategoryIcon(app.category)}
                    </div>
                    {app.badge && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${app.badgeColor}`}>
                        {app.badge}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 font-mono">
                      {app.approxSizeMb} MB
                    </span>
                    {installed && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        مثبت
                      </span>
                    )}
                  </div>
                </div>

                {/* Name and description */}
                <h3 className="text-sm font-bold text-slate-100 mb-1 leading-snug">
                  {app.nameAr}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  {app.description}
                </p>

                {app.requiresMicroG && (
                  <div className="mb-3 px-2 py-1 bg-rose-950/30 border border-rose-500/20 rounded-md text-[11px] text-rose-300 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                    <span>يتطلب مايكرو سيرفس لتسجيل الدخول بالحساب.</span>
                  </div>
                )}
              </div>

              {/* Progress and Actions */}
              <div className="mt-2 pt-3 border-t border-slate-800/80">
                {isBusy && (
                  <div className="mb-2.5">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-cyan-300 font-medium truncate">
                        {state.message || 'جاري المعالجة...'}
                      </span>
                      <span className="text-cyan-400 font-bold font-mono">
                        {state.progress}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-200"
                        style={{ width: `${state.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {state.status === 'error' && (
                  <div className="mb-2 text-[11px] text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-500/30 leading-snug">
                    {state.errorMessage || 'حدث خطأ أثناء التثبيت.'}
                  </div>
                )}

                {state.status === 'success' && (
                  <div className="mb-2 text-[11px] text-emerald-400 bg-emerald-950/40 p-1.5 rounded border border-emerald-500/30 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تم التثبيت وفك القيود بنجاح على الشاشة!</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    id={`btn-install-${app.id}`}
                    onClick={() => handleInstallApp(app)}
                    disabled={!isConnected || isBusy}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                      installed
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950/50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري التثبيت...</span>
                      </>
                    ) : installed ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>إعادة تثبيت / تحديث</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>تحميل وتثبيت مباشر</span>
                      </>
                    )}
                  </button>

                  {installed && onLaunchApp && (
                    <button
                      id={`btn-launch-${app.id}`}
                      onClick={() => onLaunchApp(app.packageName)}
                      className="px-2.5 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="فتح وتشغيل التطبيق على شاشة السيارة"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>تشغيل</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
