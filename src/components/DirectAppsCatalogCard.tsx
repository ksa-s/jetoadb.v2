import React, { useState } from 'react';
import { Adb } from '@yume-chan/adb';
import { 
  DIRECT_CAR_APPS, 
  DirectAppItem, 
  downloadAndInstallCarApp 
} from '../lib/direct-apps';
import { InstalledApp, InstallMethod } from '../types';
import { 
  CheckSquare,
  Square,
  Sparkles, 
  Download, 
  CheckCircle2, 
  Loader2, 
  Play, 
  ShieldCheck, 
  FolderOpen, 
  Cpu, 
  Zap,
  AlertCircle,
  RotateCw,
  Tv,
  Navigation,
  Radio,
  Music,
  Film,
  Compass,
  Layers,
  Settings2,
  Info,
  Car
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
  const [isBatchInstalling, setIsBatchInstalling] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; appName: string } | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<InstallMethod>('jetour_helper');
  
  // By default, select all uninstalled apps or all recommended apps
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(() => {
    return new Set(DIRECT_CAR_APPS.map(a => a.id));
  });

  const getAppState = (appId: string): AppInstallState => {
    return appStates[appId] || { status: 'idle', progress: 0 };
  };

  const isAppInstalled = (packageName: string): boolean => {
    return installedApps.some((app) => app.packageName.toLowerCase() === packageName.toLowerCase());
  };

  const toggleAppSelection = (appId: string) => {
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

  const handleSelectAll = () => {
    setSelectedAppIds(new Set(DIRECT_CAR_APPS.map((a) => a.id)));
  };

  const handleDeselectAll = () => {
    setSelectedAppIds(new Set());
  };

  const handleInstallApp = async (app: DirectAppItem, method: InstallMethod = selectedMethod) => {
    if (!adb || !isConnected) {
      onLog('يرجى توصيل شاشة السيارة أولاً عبر كابل الـ USB للبدء بالتثبيت.', 'warning');
      return false;
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
      onLog,
      method
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
  };

  // Direct Batch Install for all selected applications
  const handleBatchInstall = async () => {
    if (!adb || !isConnected) {
      onLog('يرجى توصيل شاشة السيارة أولاً عبر كابل الـ USB للبدء بالتثبيت المجمع.', 'warning');
      return;
    }

    const appsToInstall = DIRECT_CAR_APPS.filter((a) => selectedAppIds.has(a.id));
    if (appsToInstall.length === 0) {
      onLog('يرجى تحديد تطبيق واحد على الأقل للتثبيت.', 'warning');
      return;
    }

    setIsBatchInstalling(true);
    onLog(`بدء التثبيت المباشر المتتالي لـ (${appsToInstall.length}) تطبيق على شاشة السيارة عبر مسار: ${selectedMethod}...`, 'info');

    let successCount = 0;
    for (let i = 0; i < appsToInstall.length; i++) {
      const app = appsToInstall[i];
      setBatchProgress({
        current: i + 1,
        total: appsToInstall.length,
        appName: app.nameAr,
      });

      onLog(`[${i + 1}/${appsToInstall.length}] جاري تثبيت ${app.nameAr}...`, 'info');
      const ok = await handleInstallApp(app, selectedMethod);
      if (ok) {
        successCount++;
      }
    }

    setBatchProgress(null);
    setIsBatchInstalling(false);
    onLog(`اكتملت عملية التثبيت المباشر! تم تثبيت (${successCount} من أصل ${appsToInstall.length}) تطبيق بنجاح.`, successCount > 0 ? 'success' : 'error');
  };

  const getAppIcon = (app: DirectAppItem) => {
    switch (app.id) {
      case 'garagesplit':
        return <Layers className="w-5 h-5 text-emerald-400" />;
      case 'garagehelper':
        return <ShieldCheck className="w-5 h-5 text-indigo-400" />;
      case 'cx_file_explorer':
        return <FolderOpen className="w-5 h-5 text-blue-400" />;
      case 'yandex_navigator':
        return <Compass className="w-5 h-5 text-amber-400" />;
      case 'yandex_music':
        return <Music className="w-5 h-5 text-yellow-400" />;
      case 'vk_video':
        return <Film className="w-5 h-5 text-sky-400" />;
      case 'replaio':
        return <Radio className="w-5 h-5 text-purple-400" />;
      case 'hud_speed_pro':
        return <Navigation className="w-5 h-5 text-red-400" />;
      case 'garageremote':
        return <Car className="w-5 h-5 text-teal-400" />;
      case 'youtube_revanced':
      case 'smart_tube':
        return <Tv className="w-5 h-5 text-rose-400" />;
      case 'microg':
        return <Cpu className="w-5 h-5 text-cyan-400" />;
      default:
        return <Zap className="w-5 h-5 text-emerald-400" />;
    }
  };

  const selectedCount = selectedAppIds.size;
  const totalCount = DIRECT_CAR_APPS.length;

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-5 shadow-2xl mb-6 backdrop-blur-sm">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/90 pb-5 mb-5">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500/20 via-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 rounded-xl shadow-inner shrink-0">
            <Sparkles className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">
                حزمة جيتور T2 الموصى بها (تثبيت مباشر على الشاشة)
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                جاهزة محلياً 100%
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              تثبيت مباشر لكافة ملفات الحزمة دون الحاجة لأي مواقع خارجية أو تنزيل يدوي، مع تطبيق أذونات النظام وفك حظر جيتور T2 تلقائياً.
            </p>
          </div>
        </div>

        {/* Master Batch Install Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <button
            id="btn-batch-install-selected"
            onClick={handleBatchInstall}
            disabled={!isConnected || isBatchInstalling || selectedCount === 0}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
            title="تثبيت جميع التطبيقات المحددة دفعة واحدة مباشرة على شاشة السيارة"
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

      {/* Protocol Selection & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/70 border border-slate-850 p-3 rounded-xl mb-4">
        {/* Selection toggles */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={isBatchInstalling}
            className="text-xs px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
            <span>تحديد الكل ({totalCount})</span>
          </button>
          <button
            type="button"
            onClick={handleDeselectAll}
            disabled={isBatchInstalling}
            className="text-xs px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 border border-slate-700/80 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Square className="w-3.5 h-3.5 text-slate-400" />
            <span>إلغاء التحديد</span>
          </button>
          <span className="text-xs text-slate-400 font-mono mr-1">
            {selectedCount} من {totalCount} محدد
          </span>
        </div>

        {/* Installation Protocol / Path Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Settings2 className="w-3.5 h-3.5 text-slate-500" />
            <span>مسار التثبيت:</span>
          </span>
          <select
            id="select-install-protocol"
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value as InstallMethod)}
            disabled={isBatchInstalling}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="jetour_helper">
              المسار المستقل (المثبت الاحتياطي app_process / r.sh - موصى به لجيتور T2)
            </option>
            <option value="auto">
              الوضع التلقائي الذكي الشامل (Auto Multi-Stage)
            </option>
            <option value="package_installer_ui">
              واجهة مثبت النظام الرسمية (PackageInstaller UI)
            </option>
            <option value="restriction_annihilator">
              ناسف قيود المستخدمين المتعددين (Restriction Annihilator)
            </option>
            <option value="car_download_staging">
              مسار مجلد التحميلات ومدير الملفات (/sdcard/Download)
            </option>
          </select>
        </div>
      </div>

      {/* Explanatory Guide: Why apps don't appear in Jetour Home Screen & How GarageSplit / CX solve it */}
      <div className="mb-5 bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 border border-amber-500/30 rounded-xl p-3.5">
        <div className="flex items-start gap-2.5">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1.5">
            <div className="font-bold text-amber-200">
              💡 لماذا لا تظهر التطبيقات المثبتة في واجهة شاشة جيتور T2 الرئيسية مباشرة؟
            </div>
            <p className="text-slate-300 leading-relaxed">
              شاشات جيتور T2 الأصلية (اللانشر المصنعي) مبرمجة برمجياً على إظهار تطبيقات الوكالة فقط وإخفاء أي تطبيقات خارجية من الشاشة الرئيسية.
              لذلك تم توفير <strong className="text-emerald-300">GarageSplit</strong> و <strong className="text-blue-300">CX File Explorer</strong> ضمن هذه الحزمة:
            </p>
            <ul className="list-disc list-inside text-slate-400 space-y-0.5 pr-1">
              <li>
                <strong className="text-emerald-300">GarageSplit:</strong> يمنحك أيقونة وقائمة عائمة على جانب الشاشة لفتح أي تطبيق مثبت بلمسة واحدة وتقسيم الشاشة.
              </li>
              <li>
                <strong className="text-blue-300">CX File Explorer:</strong> يحتوي على قسم خاص بالبرامج (Apps) يعرض كل التطبيقات المثبتة بالكامل لتشغيلها مباشرة.
              </li>
              <li>
                <strong className="text-teal-300">GarageRemote:</strong> بعد تثبيته يجب إطفاء السيارة والشاشة ثم إعادة تشغيلها لتبدأ أزرار الدركسون بالعمل.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Apps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {DIRECT_CAR_APPS.map((app) => {
          const state = getAppState(app.id);
          const installed = isAppInstalled(app.packageName);
          const isSelected = selectedAppIds.has(app.id);
          const isBusy = state.status === 'downloading' || state.status === 'uploading' || state.status === 'installing' || state.status === 'processing';

          return (
            <div
              key={app.id}
              id={`direct-app-card-${app.id}`}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                installed
                  ? 'bg-slate-900/80 border-emerald-500/30'
                  : isSelected
                  ? 'bg-slate-900/60 border-cyan-500/30 shadow-md shadow-cyan-950/20'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                {/* Header: Checkbox + Icon + Badges + Size */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleAppSelection(app.id)}
                      className="text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer p-0.5"
                      title={isSelected ? 'إلغاء التحديد' : 'تحديد للتثبيت المجمع'}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500" />
                      )}
                    </button>

                    <div className="p-1.5 bg-slate-800/90 rounded-lg border border-slate-700/60">
                      {getAppIcon(app)}
                    </div>

                    {app.badge && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${app.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
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

                {/* Name & Package */}
                <h3 className="text-sm font-bold text-slate-100 mb-0.5 leading-snug">
                  {app.nameAr}
                </h3>
                <div className="text-[10px] font-mono text-slate-500 mb-2 truncate">
                  {app.packageName}
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 leading-relaxed mb-2.5">
                  {app.description}
                </p>

                {/* Specific Notes */}
                {app.note && (
                  <div className="mb-2 px-2.5 py-1.5 bg-amber-950/30 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 leading-snug">
                    {app.note}
                  </div>
                )}

                {app.requiresMicroG && (
                  <div className="mb-2 px-2.5 py-1 bg-rose-950/30 border border-rose-500/20 rounded-md text-[11px] text-rose-300 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                    <span>يتطلب مايكرو سيرفس لتسجيل الدخول بحساب جوجل.</span>
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
                  <div className="mb-2 text-[11px] text-rose-400 bg-rose-950/40 p-2 rounded-lg border border-rose-500/30 leading-snug">
                    {state.errorMessage || 'حدث خطأ أثناء التثبيت.'}
                  </div>
                )}

                {state.status === 'success' && (
                  <div className="mb-2 text-[11px] text-emerald-400 bg-emerald-950/40 p-1.5 rounded-lg border border-emerald-500/30 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تم التثبيت وتطبيق الصلاحيات بنجاح!</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    id={`btn-install-${app.id}`}
                    onClick={() => handleInstallApp(app)}
                    disabled={!isConnected || isBusy || isBatchInstalling}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                      installed
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-950/50'
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
                        <span>تثبيت مباشر</span>
                      </>
                    )}
                  </button>

                  {installed && onLaunchApp && (
                    <button
                      id={`btn-launch-${app.id}`}
                      onClick={() => onLaunchApp(app.packageName)}
                      className="px-3 py-2 bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="تشغيل التطبيق على شاشة السيارة"
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
