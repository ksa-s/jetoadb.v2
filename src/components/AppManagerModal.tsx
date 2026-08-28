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
  Zap
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
}

export const AppManagerModal: React.FC<AppManagerModalProps> = ({
  isOpen,
  onClose,
  adb,
  onLog,
  onSelectForPermissions,
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

  const handleClear = async (pkg: string) => {
    if (!adb) return;
    const confirm = window.confirm(`هل أنت متأكد من مسح بيانات التطبيق (${pkg}) بالكامل؟`);
    if (!confirm) return;

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
    const confirm = window.confirm(`هل أنت متأكد من إلغاء تثبيت وحذف التطبيق (${pkg}) من الشاشة نهائياً؟`);
    if (!confirm) return;

    setActionLoading(`uninstall-${pkg}`);
    try {
      const msg = await CarSystemTools.uninstallApp(adb, pkg);
      onLog(msg, 'success');
      setFeedback({ type: 'success', message: msg });
      setApps(prev => prev.filter(a => a.packageName !== pkg));
    } catch (e: any) {
      onLog(`فشل الحذف: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: e.message || 'فشل حذف التطبيق' });
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
              onClick={loadApps}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className={`p-3 mx-4 mt-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success' ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
          }`}>
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

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
