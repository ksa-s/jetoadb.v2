import React, { useState, useEffect } from 'react';
import { 
  X, 
  Trash2, 
  Sparkles, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Loader2, 
  RefreshCw, 
  Info, 
  Terminal, 
  ShieldCheck, 
  Cpu,
  Package,
  Layers,
  Flame,
  Check
} from 'lucide-react';
import { Adb } from '@yume-chan/adb';
import { CarSystemTools, PackageDiagnosticInfo } from '../lib/adb/car-system-tools';
import { InstalledApp } from '../types';

interface MagicUninstallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  adb: Adb | null;
  onLog: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  initialPackage?: string;
  onAppRemoved?: (pkg: string) => void;
}

interface StepLog {
  step: string;
  status: 'running' | 'ok' | 'fail' | 'info';
  timestamp: string;
}

export const MagicUninstallerModal: React.FC<MagicUninstallerModalProps> = ({
  isOpen,
  onClose,
  adb,
  onLog,
  initialPackage,
  onAppRemoved,
}) => {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<string>(initialPackage || '');
  const [customPkgInput, setCustomPkgInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<PackageDiagnosticInfo | null>(null);

  const [isEradicating, setIsEradicating] = useState(false);
  const [stepLogs, setStepLogs] = useState<StepLog[]>([]);
  const [finalResult, setFinalResult] = useState<{
    success: boolean;
    message: string;
    method?: 'uninstalled' | 'neutralized' | 'not_found';
  } | null>(null);

  const [showConfirmAction, setShowConfirmAction] = useState(false);

  useEffect(() => {
    if (isOpen && adb) {
      loadAppsList();
      if (initialPackage) {
        setSelectedPkg(initialPackage);
        handleDiagnose(initialPackage);
      }
    }
  }, [isOpen, adb, initialPackage]);

  const loadAppsList = async () => {
    if (!adb) return;
    setIsLoadingApps(true);
    try {
      const list = await CarSystemTools.getInstalledApps(adb, false);
      setApps(list);
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingApps(false);
    }
  };

  const currentPkg = selectedPkg || customPkgInput.trim();

  const handleDiagnose = async (pkgToDiagnose?: string) => {
    const target = pkgToDiagnose || currentPkg;
    if (!adb || !target) return;

    setIsDiagnosing(true);
    setDiagnosticReport(null);
    setFinalResult(null);
    try {
      onLog(`فحص وتشخيص الحزمة المستعصية (${target})...`, 'info');
      const diag = await CarSystemTools.diagnosePackage(adb, target);
      setDiagnosticReport(diag);
      onLog(`نتيجة التشخيص: ${diag.rawSummary}`, 'info');
    } catch (e: any) {
      onLog(`فشل التشخيص: ${e.message || e}`, 'error');
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleExecuteEradication = async () => {
    const target = currentPkg;
    if (!adb || !target) return;

    setShowConfirmAction(false);
    setIsEradicating(true);
    setStepLogs([]);
    setFinalResult(null);

    const appendStepLog = (step: string, status: 'running' | 'ok' | 'fail' | 'info') => {
      const time = new Date().toLocaleTimeString('ar-EG');
      setStepLogs(prev => [...prev, { step, status, timestamp: time }]);
      onLog(step, status === 'ok' ? 'success' : status === 'fail' ? 'error' : 'info');
    };

    try {
      appendStepLog(`بدء تنفيذ السكربت السحري للإزالة والمسح الجذري للتطبيق (${target})...`, 'running');
      const res = await CarSystemTools.deepEradicateApp(adb, target, appendStepLog);
      
      setFinalResult(res);
      if (res.success) {
        onAppRemoved?.(target);
        setApps(prev => prev.filter(a => a.packageName !== target));
        await handleDiagnose(target);
      }
    } catch (e: any) {
      const err = e.message || 'حدث خطأ غير متوقع أثناء تنفيذ السكربت السحري.';
      appendStepLog(`❌ فشل: ${err}`, 'fail');
      setFinalResult({ success: false, message: err });
    } finally {
      setIsEradicating(false);
    }
  };

  if (!isOpen) return null;

  const filteredApps = apps.filter(a => 
    a.packageName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-purple-600 to-cyan-600 p-0.5 shadow-lg shadow-rose-950">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-rose-400 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  ساحر إزالة ومحو التطبيقات المستعصية
                </h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300">
                  Magic Deep Eradicator
                </span>
              </div>
              <p className="text-xs text-slate-400">
                حل مشكلة التطبيقات المقفلة التي ثبتت كأنها من أصل النظام ولا تقبل الحذف العادي
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          
          {/* Target App Selector */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-cyan-400" />
                <span>اختر التطبيق المستعصي أو اكتب اسم الحزمة:</span>
              </label>
              <button
                onClick={loadAppsList}
                disabled={isLoadingApps || !adb}
                className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingApps ? 'animate-spin' : ''}`} />
                <span>تحديث القائمة</span>
              </button>
            </div>

            {/* Quick App Select Dropdown & Search */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="ابحث في قائمة تطبيقات الشاشة (مثلاً: modbay, rustore, youtube)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-lg pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {searchQuery && (
                <div className="max-h-36 overflow-y-auto rounded-lg bg-slate-900 border border-slate-800 divide-y divide-slate-800/60">
                  {filteredApps.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500">لا يوجد تطبيق بهذا الاسم</div>
                  ) : (
                    filteredApps.map(app => (
                      <button
                        key={app.packageName}
                        onClick={() => {
                          setSelectedPkg(app.packageName);
                          setCustomPkgInput('');
                          setSearchQuery('');
                          handleDiagnose(app.packageName);
                        }}
                        className={`w-full text-right p-2.5 hover:bg-slate-800/80 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          selectedPkg === app.packageName ? 'bg-cyan-950/50 text-cyan-300 font-bold' : 'text-slate-300'
                        }`}
                      >
                        <span className="font-mono truncate max-w-[320px]">{app.packageName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {app.isSystem ? 'نظام' : 'تطبيق خارجي'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Manual Package Input fallback */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="أو اكتب اسم الحزمة يدوياً هنا: com.example.app"
                value={selectedPkg || customPkgInput}
                onChange={e => {
                  setSelectedPkg('');
                  setCustomPkgInput(e.target.value);
                }}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => handleDiagnose()}
                disabled={!currentPkg || isDiagnosing || !adb}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-cyan-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isDiagnosing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>تشخيص</span>
              </button>
            </div>
          </div>

          {/* Diagnostic Card */}
          {diagnosticReport && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-indigo-400" />
                  <span>تقرير تشخيص حالة التطبيق في النظام:</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  diagnosticReport.exists ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {diagnosticReport.exists ? 'الحزمة موجودة' : 'الحزمة غير موجودة'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
                <div>
                  <span className="text-slate-500">مسار الملف: </span>
                  <span className="font-mono text-slate-300 break-all">{diagnosticReport.apkPath || 'غير متوفر'}</span>
                </div>
                <div>
                  <span className="text-slate-500">نوع التثبيت: </span>
                  <span className="text-slate-300 font-semibold">
                    {diagnosticReport.isSystem ? '🔒 تطبيق نظام محمي (System App)' : '📱 تطبيق مستخدم عادي (Data App)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">مسؤول الجهاز (Device Admin): </span>
                  <span className={diagnosticReport.isAdmin ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                    {diagnosticReport.isAdmin ? '⚠️ مفعل كمسؤول جهاز (يحجب الحذف)' : 'غير مفعل'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">حسابات المستخدمين النشطة: </span>
                  <span className="text-slate-300 font-mono">
                    {diagnosticReport.userIds.length > 0 ? diagnosticReport.userIds.join(', ') : '0'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Button & In-App Confirmation */}
          <div className="space-y-3">
            {!showConfirmAction ? (
              <button
                onClick={() => setShowConfirmAction(true)}
                disabled={!currentPkg || isEradicating || !adb}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 via-purple-600 to-cyan-600 hover:from-rose-500 hover:to-cyan-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40 transition-all cursor-pointer"
              >
                <Flame className="w-4 h-4 text-rose-200" />
                <span>تنفيذ السكربت السحري للإزالة والمسح الجذري (12 مرحلة)</span>
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-600/50 space-y-3 text-right">
                <div className="flex items-start gap-2.5 text-rose-200 text-xs">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-rose-300 text-sm">تأكيد عملية المحو والإزالة القسرية</div>
                    <p className="text-rose-200/90 mt-1">
                      سيقوم السكربت السحري بتفكيك قيود DPM، مسح الذاكرة وبيانات التطبيق (0 بايت)، تنفيذ محاولات الحذف عبر جميع المستخدمين، وتعطيله وتجميده وإخفائه نهائياً من لانشر شاشة السيارة.
                    </p>
                    <div className="font-mono text-cyan-300 mt-1.5 font-bold">{currentPkg}</div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-900/60">
                  <button
                    onClick={() => setShowConfirmAction(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleExecuteEradication}
                    disabled={isEradicating}
                    className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                  >
                    {isEradicating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5" />}
                    <span>بدء المحو القسري الآن</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Real-time Progress & Step Logs */}
          {stepLogs.length > 0 && (
            <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
              <div className="px-3 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>سجل تنفيذ مراحل السكربت السحري المباشر:</span>
                </div>
                {isEradicating && (
                  <span className="text-[10px] text-cyan-400 flex items-center gap-1 animate-pulse font-mono">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>جاري التنفيذ...</span>
                  </span>
                )}
              </div>
              <div className="p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1.5 text-slate-300 bg-slate-950">
                {stepLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-[10px] text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                    <span className={
                      log.status === 'ok' ? 'text-emerald-400' :
                      log.status === 'fail' ? 'text-rose-400' :
                      log.status === 'running' ? 'text-amber-300' :
                      'text-slate-400'
                    }>
                      {log.step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Outcome Banner */}
          {finalResult && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
              finalResult.success
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
            }`}>
              {finalResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold text-sm">
                  {finalResult.success ? 'اكتملت العملية بنجاح!' : 'تنبيه العملية'}
                </div>
                <p className="text-slate-300">{finalResult.message}</p>
                {finalResult.method === 'neutralized' && (
                  <p className="text-[11px] text-emerald-300/80">
                    💡 ملاحظة: التطبيق تم تجميده، تصفير بياناته بالكامل، وإخفاؤه من شاشة ولانشر السيارة ولن يظهر أو يستهلك أي موارد نهائياً.
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Jetour T2 & Chery Desay SV Magic Recovery Engine
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
