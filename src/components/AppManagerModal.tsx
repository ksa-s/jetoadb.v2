import React, { useState, useEffect } from 'react';
import { 
  X, 
  Smartphone, 
  Search, 
  Play, 
  Trash2, 
  Eraser, 
  RefreshCw, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  PackageCheck,
  ShieldCheck,
  Zap,
  Eye,
  Tv,
  Sparkles,
  Unlock
} from 'lucide-react';
import { Adb } from '@yume-chan/adb';
import { CarSystemTools } from '../lib/adb/car-system-tools';
import { InstalledApp } from '../types';

interface AppManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  adb: Adb | null;
  onLog: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  onSelectForPermissions?: (pkg: string) => void;
  onOpenMagicEradicator?: (pkg: string) => void;
}

export const AppManagerModal: React.FC<AppManagerModalProps> = ({
  isOpen,
  onClose,
  adb,
  onLog,
  onSelectForPermissions,
  onOpenMagicEradicator,
}) => {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSystemApps, setShowSystemApps] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen && adb) {
      loadApps();
    }
  }, [isOpen, adb, showSystemApps]);

  const loadApps = async () => {
    if (!adb) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      onLog('جاري جلب قائمة التطبيقات المثبتة على الشاشة...', 'info');
      const list = await CarSystemTools.getInstalledApps(adb, !showSystemApps);
      setApps(list);
      onLog(`تم جلب ${list.length} تطبيق بنجاح`, 'success');
    } catch (e: any) {
      onLog(`فشل جلب التطبيقات: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: e.message || 'فشل جلب قائمة التطبيقات' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGrantPermissions = async (pkg: string) => {
    if (!adb) return;
    setActionLoading(`perm-${pkg}`);
    setFeedback(null);
    try {
      onLog(`بدء منح وتفعيل أذونات التطبيق (${pkg})...`, 'info');
      const res = await CarSystemTools.grantAllEssentialPermissions(adb, pkg);
      onLog(`تم منح ${res.granted.length} إذن بنجاح للتطبيق (${pkg})`, 'success');
      setFeedback({
        type: 'success',
        message: `تم منح ${res.granted.length} إذن لتطبيق (${pkg}) بنجاح (الموقع، الذاكرة، الظهور، والبطارية)`,
      });
    } catch (e: any) {
      onLog(`فشل منح الصلاحيات: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: `فشل منح الصلاحيات: ${e.message || e}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleLaunch = async (pkg: string) => {
    if (!adb) return;
    setActionLoading(`launch-${pkg}`);
    try {
      const msg = await CarSystemTools.launchApp(adb, pkg);
      onLog(msg, 'success');
      setFeedback({ type: 'success', message: `تم فتح التطبيق (${pkg}) على الشاشة` });
    } catch (e: any) {
      onLog(`فشل فتح التطبيق: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: e.message || 'فشل فتح التطبيق' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleExpose = async (pkg: string) => {
    if (!adb) return;
    setActionLoading(`expose-${pkg}`);
    try {
      const msg = await CarSystemTools.exposeAppToCarLauncher(adb, pkg);
      onLog(msg, 'success');
      setFeedback({ type: 'success', message: `تم تفعيل وتثبيت التطبيق (${pkg}) لواجهة السيارة وتحديث القائمة` });
    } catch (e: any) {
      onLog(`فشل تفعيل التطبيق: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: e.message || 'فشل تفعيل التطبيق' });
    } finally {
      setActionLoading(null);
    }
  };

  const [isExposingAll, setIsExposingAll] = useState(false);
  const [isUnlockingPolicy, setIsUnlockingPolicy] = useState(false);

  const handleUnlockDevicePolicy = async () => {
    if (!adb) return;
    setIsUnlockingPolicy(true);
    setFeedback({ type: 'success', message: 'جاري فحص وفك قيود Device Policy ومسؤولي النظام وإلغاء حظر الحذف والتثبيت...' });
    try {
      const res = await CarSystemTools.unlockDevicePolicyAndRestrictions(adb, (msg, type) => {
        onLog(msg, type);
      });
      onLog(res.message, 'success');
      setFeedback({ type: 'success', message: res.message });
      await loadApps();
    } catch (e: any) {
      onLog(`فشل فك قيود النظام: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: e.message || 'فشل فك قيود النظام' });
    } finally {
      setIsUnlockingPolicy(false);
    }
  };

  const handleExposeAll = async () => {
    if (!adb) return;
    setIsExposingAll(true);
    setFeedback({ type: 'success', message: 'جاري تفعيل وإظهار كافة التطبيقات في شاشة السيارة ولانشر البرامج...' });
    try {
      const res = await CarSystemTools.exposeAllAppsToCarLauncher(adb, (msg) => {
        onLog(msg, 'info');
      });
      onLog(`تم تفعيل وإظهار ${res.count} تطبيق لواجهة السيارة.`, 'success');
      setFeedback({ type: 'success', message: `تم تفعيل وتحديث ${res.count} تطبيق لشاشة ولانشر السيارة بنجاح!` });
    } catch (e: any) {
      onLog(`فشل تفعيل التطبيقات: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: e.message || 'فشل تفعيل التطبيقات' });
    } finally {
      setIsExposingAll(false);
    }
  };

  const handleClear = async (pkg: string) => {
    if (!adb) return;
    setActionLoading(`clear-${pkg}`);
    try {
      const msg = await CarSystemTools.clearAppData(adb, pkg);
      onLog(msg, 'success');
      setFeedback({ type: 'success', message: msg });
    } catch (e: any) {
      onLog(`فشل مسح البيانات: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: e.message || 'فشل مسح البيانات' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async (pkg: string) => {
    if (!adb) return;
    setActionLoading(`uninstall-${pkg}`);
    setFeedback({ type: 'success', message: `جاري تنفيذ مسح وإلغاء تثبيت الحزمة (${pkg})...` });
    try {
      const res = await CarSystemTools.deepEradicateApp(adb, pkg, (msg, type) => {
        onLog(msg, type === 'ok' ? 'success' : type === 'fail' ? 'error' : 'info');
      });
      if (res.success) {
        onLog(res.message, 'success');
        setFeedback({ type: 'success', message: res.message });
        setApps(prev => prev.filter(a => a.packageName !== pkg));
      } else {
        throw new Error(res.message);
      }
    } catch (e: any) {
      onLog(`فشل الحذف: ${e.message || e}`, 'error');
      setFeedback({ 
        type: 'error', 
        message: `فشل الحذف العادي للتطبيق (${pkg}). يمكنك استخدام "ساحر حذف المستعصية 🪄" لتجميده وإخفائه قسرياً.` 
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  const filteredApps = apps.filter(app =>
    app.packageName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                إدارة التطبيقات المثبتة
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-700/50 text-cyan-300 font-mono">
                  {apps.length}
                </span>
              </h3>
              <p className="text-xs text-slate-400">عرض، تشغيل، منح الأذونات، مسح وحذف التطبيقات من شاشة السيارة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/30 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في اسم الحزمة..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              dir="ltr"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end text-xs">
            <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showSystemApps}
                onChange={(e) => setShowSystemApps(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-cyan-500 cursor-pointer"
              />
              <span>عرض تطبيقات النظام</span>
            </label>

            <button
              onClick={() => onOpenMagicEradicator?.('')}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-950 to-purple-950 hover:from-rose-900 hover:to-purple-900 border border-rose-500/50 text-rose-200 font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-rose-950/40"
              title="ساحر لحذف واقتلاع التطبيقات المستعصية التي ترفض الحذف العادي"
            >
              <Sparkles className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>🪄 ساحر حذف المستعصية</span>
            </button>

            <button
              onClick={handleUnlockDevicePolicy}
              disabled={isLoading || isExposingAll || isUnlockingPolicy}
              className="px-3 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 border border-purple-500/50 text-purple-300 font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-purple-950/40"
              title="فك قيود Device Policy ومسؤولي النظام وإلغاء حظر الحذف والتثبيت للتطبيقات المحمية"
            >
              <Unlock className={`w-3.5 h-3.5 text-purple-400 ${isUnlockingPolicy ? 'animate-spin' : ''}`} />
              <span>🔓 فك قيود وحظر النظام (Unlock Policy)</span>
            </button>

            <button
              onClick={handleExposeAll}
              disabled={isLoading || isExposingAll || isUnlockingPolicy}
              className="px-3 py-1.5 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 border border-amber-500/50 text-amber-300 font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-amber-950/40"
              title="تفعيل وإظهار كافة التطبيقات في شاشة السيارة ولانشر البرامج"
            >
              <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isExposingAll ? 'animate-spin' : ''}`} />
              <span>⚡ إظهار كافة التطبيقات بالشاشة</span>
            </button>

            <button
              onClick={loadApps}
              disabled={isLoading || isExposingAll || isUnlockingPolicy}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className={`p-3 mx-4 mt-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'success' ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
          }`}>
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
            {feedback.type === 'error' && (
              <button
                onClick={handleUnlockDevicePolicy}
                disabled={isUnlockingPolicy}
                className="px-2.5 py-1 rounded-lg bg-purple-900/80 hover:bg-purple-800 border border-purple-400/50 text-purple-200 font-bold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Unlock className="w-3 h-3" />
                <span>فك قفل النظام الآن</span>
              </button>
            )}
          </div>
        )}

        {/* OEM Launcher Notice */}
        <div className="mx-4 mt-3 p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl text-xs text-slate-300 flex items-start gap-2.5">
          <Tv className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-cyan-300">ملاحظة حول ظهور التطبيقات في شاشة السيارة: </span>
            <span>
              إذا قمت بتثبيت التطبيق بنجاح ولكنه لا يظهر في شاشة سيارتك أو قائمة البرامج، فإن واجهة السيارة الأصلية (OEM Launcher) قد تحجب التطبيقات العادية بعد التحديث. يمكنك الضغط على <strong>"تشغيل"</strong> لفتحه فوراً على الشاشة، أو استخدام <strong>"إظهار بالقائمة"</strong> لتنشيطه عبر كافة مستخدمي النظام، أو تثبيت مشغل تطبيقات مثل <strong>Car Launcher Pro</strong> لعرض كافة التطبيقات بحرية.
            </span>
          </div>
        </div>

        {/* Apps List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <span className="text-xs">جاري قراءة الحزم من الشاشة...</span>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              <PackageCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>لا توجد تطبيقات مطابقة لبحثك.</p>
            </div>
          ) : (
            filteredApps.map((app) => (
              <div
                key={app.packageName}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0">
                  <span className="text-xs font-mono font-bold text-slate-200 block truncate" dir="ltr">
                    {app.packageName}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {app.isSystem ? 'تطبيق نظام' : 'تطبيق خارجي مثبت (User Installed)'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => handleGrantPermissions(app.packageName)}
                    disabled={actionLoading !== null}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-600/40 text-emerald-300 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    title="منح كافة الصلاحيات والأذونات لهذا التطبيق"
                  >
                    {actionLoading === `perm-${app.packageName}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    )}
                    <span>منح الأذونات</span>
                  </button>

                  <button
                    onClick={() => handleLaunch(app.packageName)}
                    disabled={actionLoading !== null}
                    className="px-2.5 py-1 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-600/30 text-cyan-300 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    title="تشغيل التطبيق على شاشة السيارة"
                  >
                    {actionLoading === `launch-${app.packageName}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3 fill-current" />
                    )}
                    <span>تشغيل</span>
                  </button>

                  <button
                    onClick={() => handleExpose(app.packageName)}
                    disabled={actionLoading !== null}
                    className="px-2.5 py-1 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/70 border border-indigo-600/40 text-indigo-300 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    title="تفعيل وإظهار التطبيق لجميع مستخدمي واجهة السيارة وتحديث القائمة"
                  >
                    {actionLoading === `expose-${app.packageName}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Eye className="w-3 h-3 text-indigo-400" />
                    )}
                    <span>إظهار بالقائمة</span>
                  </button>

                  <button
                    onClick={() => handleClear(app.packageName)}
                    disabled={actionLoading !== null}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    title="مسح البيانات المؤقتة والكاش"
                  >
                    {actionLoading === `clear-${app.packageName}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Eraser className="w-3 h-3" />
                    )}
                    <span>مسح</span>
                  </button>

                  <button
                    onClick={() => onOpenMagicEradicator?.(app.packageName)}
                    disabled={actionLoading !== null}
                    className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-rose-950 to-purple-950 hover:from-rose-900 hover:to-purple-900 border border-rose-500/50 text-rose-300 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-sm shadow-rose-950/30"
                    title="المحو والمسح السحري الجذري (12 مرحلة تشمل فك قيود DPM والتجميد القسري)"
                  >
                    <Sparkles className="w-3 h-3 text-rose-400" />
                    <span>محو سحري 🪄</span>
                  </button>

                  {!app.isSystem && (
                    <button
                      onClick={() => handleUninstall(app.packageName)}
                      disabled={actionLoading !== null}
                      className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-600/30 text-rose-300 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      title="إلغاء تثبيت التطبيق"
                    >
                      {actionLoading === `uninstall-${app.packageName}` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      <span>حذف</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
