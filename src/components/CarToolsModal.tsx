import React, { useState } from 'react';
import { 
  X, 
  Monitor, 
  Unlock, 
  Camera, 
  RotateCcw, 
  Power, 
  Sliders, 
  Check, 
  Loader2, 
  AlertTriangle,
  Download,
  Wifi,
  Layers,
  ShieldCheck,
  Cpu,
  Sparkles
} from 'lucide-react';
import { Adb } from '@yume-chan/adb';
import { CarSystemTools } from '../lib/adb/car-system-tools';

interface CarToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  adb: Adb | null;
  onLog: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const CarToolsModal: React.FC<CarToolsModalProps> = ({
  isOpen,
  onClose,
  adb,
  onLog,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [densityInput, setDensityInput] = useState('180');
  const [sizeInput, setSizeInput] = useState('1920x1080');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [cpuInfo, setCpuInfo] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUnlockSideload = async () => {
    if (!adb) return;
    setLoadingAction('unlock');
    try {
      onLog('بدء فك قيود التثبيت الأمني لشاشات السيارات...', 'info');
      const results = await CarSystemTools.unlockCarSideloading(adb);
      results.forEach(r => onLog(r, 'success'));
      setActionSuccess('تم فك قيود وتصاريح التثبيت الأمني بنجاح!');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (e: any) {
      onLog(`فشل فك القيود: ${e.message || e}`, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRestoreHelper = async () => {
    if (!adb) return;
    setLoadingAction('restore-helper');
    try {
      onLog('جاري إصلاح وتفعيل صلاحيات المساعد الخفي (Garage Tool / GSplit)...', 'info');
      const logs = await CarSystemTools.restoreCarCompanionHelper(adb);
      logs.forEach((log) => onLog(log, 'info'));
      onLog('تم تفعيل كافة صلاحيات المساعد الخفي والنوافذ وإمكانية الوصول بنجاح!', 'success');
      setActionSuccess('تم تفعيل وتجهيز صلاحيات المساعد الخفي والنوافذ العائمة');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (e: any) {
      onLog(`خطأ أثناء استعادة المساعد: ${e.message || e}`, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleEnableFreeform = async () => {
    if (!adb) return;
    setLoadingAction('freeform');
    try {
      const logs = await CarSystemTools.enableFreeformMultiWindow(adb);
      logs.forEach((log) => onLog(log, 'info'));
      onLog('تم تفعيل دعم النوافذ الحرة وتقسيم شاشة السيارة بنجاح!', 'success');
      setActionSuccess('تم تفعيل دعم تقسيم الشاشة والنوافذ الحرة (Freeform)');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (e: any) {
      onLog(`فشل تفعيل النوافذ الحرة: ${e.message || e}`, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleEnableWirelessAdb = async () => {
    if (!adb) return;
    setLoadingAction('wireless-adb');
    try {
      onLog('جاري تفعيل ADB اللاسلكي على المنفذ 5555...', 'info');
      const res = await CarSystemTools.enableWirelessAdb(adb);
      onLog(res.message, res.success ? 'success' : 'error');
      if (res.success) {
        setActionSuccess(res.message);
        setTimeout(() => setActionSuccess(null), 6000);
      }
    } catch (e: any) {
      onLog(`خطأ تفعيل التصحيح اللاسلكي: ${e.message || e}`, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGetCpuAbi = async () => {
    if (!adb) return;
    setLoadingAction('cpu-abi');
    try {
      const info = await CarSystemTools.getCpuArchitectureInfo(adb);
      setCpuInfo(info);
      onLog(info, 'info');
      setActionSuccess(info);
      setTimeout(() => setActionSuccess(null), 6000);
    } catch (e: any) {
      onLog(`فشل قراءة المعمارية: ${e.message || e}`, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSetDensity = async (val: number | 'reset') => {
    if (!adb) return;
    setLoadingAction('density');
    try {
      const msg = await CarSystemTools.setDisplayDensity(adb, val);
      onLog(msg, 'success');
      setActionSuccess(msg);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (e: any) {
      onLog(`خطأ تغيير الكثافة: ${e.message || e}`, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSetSize = async (val: string | 'reset') => {
    if (!adb) return;
    setLoadingAction('size');
    try {
      const msg = await CarSystemTools.setDisplaySize(adb, val);
      onLog(msg, 'success');
      setActionSuccess(msg);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (e: any) {
      onLog(`خطأ تغيير الدقة: ${e.message || e}`, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleTakeScreenshot = async () => {
    if (!adb) return;
    setLoadingAction('screenshot');
    try {
      onLog('جاري التقاط صورة لشاشة السيارة...', 'info');
      const blob = await CarSystemTools.captureScreenshot(adb);
      const url = URL.createObjectURL(blob);
      setScreenshotUrl(url);
      onLog('تم التقاط صورة الشاشة بنجاح', 'success');
    } catch (e: any) {
      onLog(`فشل التقاط الشاشة: ${e.message || e}`, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReboot = async (mode: 'normal' | 'recovery' | 'soft') => {
    if (!adb) return;
    const confirm = window.confirm(
      mode === 'soft'
        ? 'هل تريد إعادة تشغيل واجهة النظام (Soft Restart)؟'
        : 'هل أنت متأكد من إعادة تشغيل شاشة السيارة الآن؟'
    );
    if (!confirm) return;

    setLoadingAction(`reboot-${mode}`);
    try {
      const msg = await CarSystemTools.rebootDevice(adb, mode);
      onLog(msg, 'warning');
      onClose();
    } catch (e: any) {
      onLog(`فشل إعادة التشغيل: ${e.message || e}`, 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">أدوات تحسين وتخصيص شاشات السيارات</h3>
              <p className="text-xs text-slate-400">تعديل كثافة العرض DPI، فك قيود التثبيت، وأوامر النظام</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-200">
          {actionSuccess && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-300 font-semibold flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Section 1: Security & Sideload Unlock */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-cyan-400" />
                  فك قيود التثبيت لشاشات السيارات (Unlock Sideloading)
                </h4>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  يقوم بتفعيل خيار "تثبيت التطبيقات من مصادر غير معروفة" وتعطيل الفاحص الأمني الصارم لـ AAOS و Google Play Protect الذي قد يمنع تثبيت تطبيقات الملاحة و Car Launcher.
                </p>
              </div>
              <button
                onClick={handleUnlockSideload}
                disabled={loadingAction !== null || !adb}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                {loadingAction === 'unlock' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                <span>تطبيق الفك الآن</span>
              </button>
            </div>
          </div>

          {/* Section: Hidden Car Helper & Accessibility Companion Hub */}
          <div className="bg-gradient-to-r from-amber-950/30 to-slate-950/70 border border-amber-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm text-amber-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  إصلاح وتفعيل صلاحيات المساعد الخفي (Garage Tool / GSplit Helper)
                </h4>
                <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                  عند حذف برنامج المساعد من شاشة السيارة (مثل GarageTool Helper أو GSplit)، تفقد الشاشة خدمات إمكانية الوصول والتثبيت الصامت. يقوم هذا الإجراء بإعادة تهيئة تصاريح النظام وإعدادات النوافذ العائمة (SYSTEM_ALERT_WINDOW و Accessibility Service) لحساب المستخدم الحالي.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleRestoreHelper}
                disabled={loadingAction !== null || !adb}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {loadingAction === 'restore-helper' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>إصلاح وتفعيل صلاحيات المساعد الخفي</span>
              </button>

              <button
                onClick={handleEnableFreeform}
                disabled={loadingAction !== null || !adb}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {loadingAction === 'freeform' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5 text-cyan-400" />}
                <span>تفعيل النوافذ العائمة وتقسيم الشاشة (Freeform)</span>
              </button>
            </div>
          </div>

          {/* Section: Developer & Connectivity Tools */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-purple-400" />
              أدوات الاتصال اللاسلكي ومعمارية النظام (Wireless ADB & Architecture)
            </h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              تفعيل الاتصال اللاسلكي للشاشة عبر شبكة Wi-Fi الداخلية بدون كابل USB، وفحص معمارية المعالج (ARM64 / ARMv7) لدعم أدوات المطورين مثل Frida و scrcpy.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handleEnableWirelessAdb}
                disabled={loadingAction !== null || !adb}
                className="px-3.5 py-2 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 border border-purple-600/40 text-purple-200 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {loadingAction === 'wireless-adb' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5 text-purple-400" />}
                <span>تفعيل التصحيح اللاسلكي (TCP 5555)</span>
              </button>

              <button
                onClick={handleGetCpuAbi}
                disabled={loadingAction !== null || !adb}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {loadingAction === 'cpu-abi' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5 text-emerald-400" />}
                <span>فحص معمارية المعالج (CPU ABI)</span>
              </button>
            </div>

            {cpuInfo && (
              <div className="mt-2 p-2.5 bg-slate-900 rounded-lg border border-slate-800 font-mono text-[11px] text-emerald-300">
                {cpuInfo}
              </div>
            )}
          </div>

          {/* Section 2: Screen DPI / Density */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              ضبط كثافة البكسل (DPI Density) لحل تشوه لانشر السيارات
            </h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              إذا كانت الأيقونات كبيرة جداً أو مشوهة في الشاشات العريضة، يمكنك تعديل الـ DPI لتناسب حجم الشاشة (مثلاً 160 أو 180 أو 200).
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {[140, 160, 180, 200, 240].map((d) => (
                <button
                  key={d}
                  onClick={() => handleSetDensity(d)}
                  disabled={loadingAction !== null}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-indigo-950 hover:text-indigo-200 border border-slate-700 text-slate-300 font-mono font-semibold transition-colors"
                >
                  {d} DPI
                </button>
              ))}
              <button
                onClick={() => handleSetDensity('reset')}
                disabled={loadingAction !== null}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>إعادة ضبط DPI</span>
              </button>
            </div>
          </div>

          {/* Section 3: Live Screenshot */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                التقاط لقطة حية لشاشة السيارة (Screenshot)
              </h4>
              <button
                onClick={handleTakeScreenshot}
                disabled={loadingAction !== null || !adb}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {loadingAction === 'screenshot' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                <span>التقاط لقطة شاشة</span>
              </button>
            </div>

            {screenshotUrl && (
              <div className="mt-3 p-2 bg-slate-900 rounded-xl border border-slate-800 flex flex-col items-center gap-2">
                <img
                  src={screenshotUrl}
                  alt="Car Screen"
                  className="max-h-60 rounded-lg object-contain border border-slate-800"
                />
                <a
                  href={screenshotUrl}
                  download={`car_screen_${Date.now()}.png`}
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل الصورة على الكمبيوتر</span>
                </a>
              </div>
            )}
          </div>

          {/* Section 4: Power Controls */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2 mb-2">
              <Power className="w-4 h-4 text-rose-400" />
              التحكم في الطاقة وإعادة تشغيل الشاشة
            </h4>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => handleReboot('soft')}
                disabled={loadingAction !== null}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                <span>إعادة تشغيل واجهة النظام (Soft UI)</span>
              </button>

              <button
                onClick={() => handleReboot('normal')}
                disabled={loadingAction !== null}
                className="px-3.5 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-600/40 text-rose-300 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Power className="w-3.5 h-3.5 text-rose-400" />
                <span>إعادة تشغيل الشاشة بالكامل (Reboot)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
