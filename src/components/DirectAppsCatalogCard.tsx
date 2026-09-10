import React, { useState } from 'react';
import { Adb } from '@yume-chan/adb';
import { 
  DIRECT_CAR_APPS, 
  DirectAppItem, 
  downloadAndInstallCarApp 
} from '../lib/direct-apps';
import { InstalledApp, InstallMethod } from '../types';
import { 
  Check, 
  CheckSquare, 
  Square, 
  Download, 
  CheckCircle2, 
  Loader2, 
  Play, 
  AlertCircle,
  Sparkles,
  Info,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface DirectAppsCatalogCardProps {
  adb: Adb | null;
  isConnected: boolean;
  installedApps: InstalledApp[];
  onLog: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  onRefreshInstalledApps: () => void;
  onLaunchApp?: (packageName: string) => void;
  selectedMethod: InstallMethod;
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
  selectedMethod,
}) => {
  const [appStates, setAppStates] = useState<Record<string, AppInstallState>>({});
  const [isBatchInstalling, setIsBatchInstalling] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; appName: string } | null>(null);
  const [showCarLauncherGuide, setShowCarLauncherGuide] = useState(false);

  // Reliable selection state holding set of selected IDs
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(() => {
    return new Set(DIRECT_CAR_APPS.map((a) => a.id));
  });

  const getAppState = (appId: string): AppInstallState => {
    return appStates[appId] || { status: 'idle', progress: 0 };
  };

  const isAppInstalled = (packageName: string): boolean => {
    return installedApps.some((app) => app.packageName.toLowerCase() === packageName.toLowerCase());
  };

  // Toggle single app selection
  const toggleAppSelection = (appId: string) => {
    if (isBatchInstalling) return;
    setSelectedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  };

  // Select all apps
  const handleSelectAll = () => {
    if (isBatchInstalling) return;
    setSelectedAppIds(new Set(DIRECT_CAR_APPS.map((a) => a.id)));
  };

  // Deselect all apps
  const handleDeselectAll = () => {
    if (isBatchInstalling) return;
    setSelectedAppIds(new Set());
  };

  // Single app install
  const handleInstallSingleApp = async (app: DirectAppItem) => {
    if (!adb || !isConnected) {
      onLog('يرجى توصيل شاشة السيارة أولاً عبر كابل الـ USB للبدء بالتثبيت.', 'warning');
      return false;
    }

    setAppStates((prev) => ({
      ...prev,
      [app.id]: { status: 'downloading', progress: 0, message: 'بدء الاتصال...' },
    }));

    try {
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
        onLog,
        selectedMethod
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
        return true;
      } else {
        setAppStates((prev) => ({
          ...prev,
          [app.id]: {
            status: 'error',
            progress: 0,
            errorMessage: res.message,
          },
        }));
        return false;
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      onLog(`خطأ أثناء تثبيت ${app.nameAr}: ${errMsg}`, 'error');
      setAppStates((prev) => ({
        ...prev,
        [app.id]: {
          status: 'error',
          progress: 0,
          errorMessage: errMsg,
        },
      }));
      return false;
    }
  };

  // Batch install all selected apps
  const handleBatchInstall = async () => {
    if (!adb || !isConnected) {
      onLog('يرجى توصيل شاشة السيارة أولاً عبر كابل الـ USB للبدء بالتثبيت المجمع.', 'warning');
      return;
    }

    const appsToInstall = DIRECT_CAR_APPS.filter((a) => selectedAppIds.has(a.id));
    if (appsToInstall.length === 0) {
      onLog('يرجى تحديد تطبيق واحد على الأقل لتثبيته.', 'warning');
      return;
    }

    setIsBatchInstalling(true);
    onLog(
      `بدء تثبيت الحزم المحددة (${appsToInstall.length} تطبيق) عبر البروتوكول الموحد: ${selectedMethod}...`,
      'info'
    );

    let successCount = 0;
    for (let i = 0; i < appsToInstall.length; i++) {
      const app = appsToInstall[i];
      setBatchProgress({
        current: i + 1,
        total: appsToInstall.length,
        appName: app.nameAr,
      });

      onLog(`[${i + 1}/${appsToInstall.length}] جاري معالجة ${app.nameAr}...`, 'info');
      const ok = await handleInstallSingleApp(app);
      if (ok) {
        successCount++;
      }
    }

    setBatchProgress(null);
    setIsBatchInstalling(false);
    onLog(
      `اكتملت العملية! تم تثبيت (${successCount} من أصل ${appsToInstall.length}) تطبيق بنجاح.`,
      successCount > 0 ? 'success' : 'error'
    );
  };

  const selectedCount = selectedAppIds.size;
  const totalCount = DIRECT_CAR_APPS.length;

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-sm space-y-3.5">
      {/* Top Header & Master Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 via-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              حزمة تطبيقات جيتور T2 الجاهزة ({totalCount} تطبيق)
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/50 text-emerald-400">
                جاهزة محلياً 100%
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              حدد التطبيقات المرغوبة واضغط زر التثبيت المباشر.
            </p>
          </div>
        </div>

        {/* Action Controls & Counters */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Quick Select / Deselect */}
          <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 rounded-xl p-1">
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={isBatchInstalling}
              className="text-xs px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              title="تحديد كافة التطبيقات الـ12"
            >
              <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
              <span>تحديد الكل</span>
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              disabled={isBatchInstalling}
              className="text-xs px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-lg flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              title="إلغاء تحديد كافة التطبيقات"
            >
              <Square className="w-3.5 h-3.5 text-slate-500" />
              <span>إلغاء</span>
            </button>
            <span className="text-xs font-mono text-cyan-400 px-2">
              {selectedCount}/{totalCount}
            </span>
          </div>

          {/* Master Batch Install Button */}
          <button
            id="btn-batch-install-selected"
            type="button"
            onClick={handleBatchInstall}
            disabled={!isConnected || isBatchInstalling || selectedCount === 0}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-950/50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shrink-0"
            title="تثبيت التطبيقات المحددة مباشرة على شاشة السيارة"
          >
            {isBatchInstalling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>
                  جاري التثبيت ({batchProgress ? `${batchProgress.current}/${batchProgress.total}` : '...'})
                </span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-emerald-100" />
                <span>تثبيت التطبيقات المحددة مباشرة ({selectedCount})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Launcher & Screen Visibility Info Accordion Toggle */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCarLauncherGuide(!showCarLauncherGuide)}
          className="w-full px-3.5 py-2 flex items-center justify-between text-xs text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 font-medium">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>💡 ملاحظة هامة: لماذا لا تظهر التطبيقات في واجهة جيتور T2 الرئيسية تلقائياً؟</span>
          </span>
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <span>{showCarLauncherGuide ? 'إخفاء' : 'عرض التفاصيل'}</span>
            {showCarLauncherGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {showCarLauncherGuide && (
          <div className="px-3.5 pb-3 pt-1 text-xs text-slate-300 border-t border-slate-800/60 space-y-1.5 bg-slate-950/40">
            <p className="leading-relaxed">
              شاشة جيتور T2 تخفي التطبيقات الخارجية برمجياً في اللانشر المصنعي. لهذا السبب قمنا بتضمين تطبيقي:
            </p>
            <ul className="list-disc list-inside text-slate-400 space-y-0.5 pr-2">
              <li>
                <strong className="text-emerald-300">GarageSplit:</strong> يمنحك أيقونة وقائمة عائمة على جانب الشاشة لتشغيل أي تطبيق وتقسيم الشاشة.
              </li>
              <li>
                <strong className="text-blue-300">CX File Explorer:</strong> يحتوي على قسم خاص بالبرامج (Apps) يعرض كل التطبيقات المثبتة ويشغلها فوراً.
              </li>
              <li>
                <strong className="text-teal-300">GarageRemote:</strong> لأزرار المقود والدركسون (يتطلب إطفاء السيارة وتشغيلها بعد التثبيت).
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Compact Apps List (High-Density Grid: Name + Checkbox) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {DIRECT_CAR_APPS.map((app) => {
          const state = getAppState(app.id);
          const installed = isAppInstalled(app.packageName);
          const isSelected = selectedAppIds.has(app.id);
          const isBusy =
            state.status === 'downloading' ||
            state.status === 'uploading' ||
            state.status === 'installing' ||
            state.status === 'processing';

          return (
            <div
              key={app.id}
              id={`direct-app-row-${app.id}`}
              onClick={() => toggleAppSelection(app.id)}
              className={`px-3 py-2 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                installed
                  ? 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-500/60'
                  : isSelected
                  ? 'bg-slate-900/90 border-cyan-500/50 hover:border-cyan-400'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-75 hover:opacity-100'
              }`}
            >
              {/* Left Side: App Name + Status */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-100 truncate" title={app.nameAr}>
                  {app.nameAr}
                </span>

                {/* Status Badges */}
                {installed && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-600/50 text-emerald-400 shrink-0">
                    مثبت ✓
                  </span>
                )}

                {isBusy && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-600/50 text-cyan-400 flex items-center gap-1 shrink-0">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span>{state.progress}%</span>
                  </span>
                )}

                {state.status === 'error' && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-rose-950 border border-rose-600/50 text-rose-400 shrink-0"
                    title={state.errorMessage}
                  >
                    فشل ⚠️
                  </span>
                )}
              </div>

              {/* Right Side: Checkbox (Always Visible & High-Contrast) */}
              <div className="shrink-0 flex items-center gap-2">
                {/* Launch Button if already installed */}
                {installed && onLaunchApp && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLaunchApp(app.packageName);
                    }}
                    className="p-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/40 text-emerald-300 transition-colors"
                    title={`تشغيل ${app.name} على شاشة السيارة`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>
                )}

                {/* The Checkbox Box */}
                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-cyan-500 border-cyan-400 text-slate-950 shadow-sm shadow-cyan-500/40'
                      : 'bg-slate-900 border-slate-700 text-transparent hover:border-slate-500'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'block' : 'hidden'}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
