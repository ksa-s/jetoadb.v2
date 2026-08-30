import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  ShieldCheck, 
  Sparkles, 
  Check, 
  AlertCircle, 
  Loader2, 
  Layers, 
  Navigation, 
  HardDrive, 
  Sliders, 
  Zap, 
  Search, 
  RefreshCw,
  Cpu,
  Tv,
  CheckCircle2,
  Lock,
  ChevronDown,
  Play
} from 'lucide-react';
import { Adb } from '@yume-chan/adb';
import { CarSystemTools } from '../lib/adb/car-system-tools';
import { InstalledApp } from '../types';

interface PermissionsCardProps {
  adb: Adb | null;
  isConnected: boolean;
  onLog: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  installedApps?: InstalledApp[];
}

export const PermissionsCard: React.FC<PermissionsCardProps> = ({
  adb,
  isConnected,
  onLog,
  installedApps = [],
}) => {
  const [targetPackage, setTargetPackage] = useState('');
  const [customPermission, setCustomPermission] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [grantedList, setGrantedList] = useState<string[]>([]);
  const [isLoadingGranted, setIsLoadingGranted] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | 'system' | 'overlay' | 'location' | 'storage' | 'hardware'>('all');

  const popularCarApps = [
    { name: 'Agama Car Launcher', pkg: 'altergames.carlauncher' },
    { name: 'CarWebGuru', pkg: 'com.softartstudio.carwebguru' },
    { name: 'FCC Car Launcher', pkg: 'speedfox.vv.him' },
    { name: 'Vivid Car Launcher', pkg: 'com.telenav.launcher' },
    { name: 'Waze Navigation', pkg: 'com.waze' },
    { name: 'Google Maps', pkg: 'com.google.android.apps.maps' },
    { name: 'Yandex Navi', pkg: 'ru.yandex.yandexnavi' },
    { name: 'Torque Pro (OBD2)', pkg: 'org.prowl.torque' },
    { name: 'Tasker', pkg: 'net.dinglisch.android.taskerm' },
    { name: 'Nova Launcher', pkg: 'com.teslacoilsw.launcher' },
  ];

  // Refresh granted permissions for targetPackage
  const loadGrantedPermissions = async (pkg: string) => {
    if (!adb || !pkg.trim()) return;
    setIsLoadingGranted(true);
    try {
      const list = await CarSystemTools.getPackageGrantedPermissions(adb, pkg.trim());
      setGrantedList(list);
    } catch {
      setGrantedList([]);
    } finally {
      setIsLoadingGranted(false);
    }
  };

  useEffect(() => {
    if (targetPackage && isConnected && adb) {
      loadGrantedPermissions(targetPackage);
    } else {
      setGrantedList([]);
    }
  }, [targetPackage, isConnected, adb]);

  const handleGrantAll = async () => {
    if (!adb || !targetPackage.trim()) {
      setFeedback({ type: 'error', message: 'يرجى اختيار تطبيق أو إدخال اسم الحزمة أولاً' });
      return;
    }

    setIsProcessing(true);
    setFeedback(null);
    onLog(`بدء منح كافة الصلاحيات الشاملة لتطبيق (${targetPackage})...`, 'info');

    try {
      const result = await CarSystemTools.grantAllEssentialPermissions(adb, targetPackage.trim());
      onLog(`تم منح ${result.granted.length} إذن بنجاح للتطبيق (${targetPackage})!`, 'success');
      setFeedback({
        type: 'success',
        message: `تم تفعيل ومنح ${result.granted.length} إذن بنجاح (الموقع، الذاكرة، الظهور، إعدادات النظام، والبطارية)`,
      });
      loadGrantedPermissions(targetPackage.trim());
    } catch (e: any) {
      const msg = e.message || String(e);
      onLog(`خطأ أثناء منح الصلاحيات: ${msg}`, 'error');
      setFeedback({ type: 'error', message: msg });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGrantSinglePm = async (perm: string, permName: string) => {
    if (!adb || !targetPackage.trim()) {
      setFeedback({ type: 'error', message: 'يرجى اختيار تطبيق أولاً' });
      return;
    }
    setIsProcessing(true);
    try {
      const res = await CarSystemTools.grantPermission(adb, targetPackage.trim(), perm);
      onLog(`${permName}: ${res}`, 'success');
      setFeedback({ type: 'success', message: `تم تفعيل إذن (${permName}) بنجاح` });
      loadGrantedPermissions(targetPackage.trim());
    } catch (e: any) {
      onLog(`فشل تفعيل ${permName}: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: `فشل تفعيل ${permName}: ${e.message || e}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetAppOp = async (opName: string, opLabel: string, mode: 'allow' | 'deny' = 'allow') => {
    if (!adb || !targetPackage.trim()) {
      setFeedback({ type: 'error', message: 'يرجى اختيار تطبيق أولاً' });
      return;
    }
    setIsProcessing(true);
    try {
      const res = await CarSystemTools.setAppOp(adb, targetPackage.trim(), opName, mode);
      onLog(`${opLabel}: ${res}`, 'success');
      setFeedback({ type: 'success', message: `تم ضبط (${opLabel}) بنجاح` });
      loadGrantedPermissions(targetPackage.trim());
    } catch (e: any) {
      onLog(`فشل ضبط ${opLabel}: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: e.message || 'فشل تنفيذ الأمر' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatteryWhitelist = async (enable: boolean) => {
    if (!adb || !targetPackage.trim()) {
      setFeedback({ type: 'error', message: 'يرجى اختيار تطبيق أولاً' });
      return;
    }
    setIsProcessing(true);
    try {
      const res = await CarSystemTools.setBatteryOptimizationWhitelist(adb, targetPackage.trim(), enable);
      onLog(res, 'success');
      setFeedback({ type: 'success', message: res });
    } catch (e: any) {
      onLog(`فشل ضبط استثناء البطارية: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: e.message || 'فشل ضبط استثناء البطارية' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCustomPermissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adb || !targetPackage.trim() || !customPermission.trim()) return;

    setIsProcessing(true);
    try {
      const perm = customPermission.trim();
      const res = await CarSystemTools.grantPermission(adb, targetPackage.trim(), perm);
      onLog(res, 'success');
      setFeedback({ type: 'success', message: `تم منح الإذن (${perm}) بنجاح` });
      setCustomPermission('');
      loadGrantedPermissions(targetPackage.trim());
    } catch (e: any) {
      onLog(`فشل منح الإذن المخصص: ${e.message || e}`, 'error');
      setFeedback({ type: 'error', message: e.message || 'فشل منح الإذن المخصص' });
    } finally {
      setIsProcessing(false);
    }
  };

  const isGranted = (permStr: string): boolean => {
    return grantedList.some(g => g.toLowerCase().includes(permStr.toLowerCase()));
  };

  const permissionsList = [
    // 1. System & Special
    {
      id: 'write_secure',
      name: 'تعديل إعدادات النظام الآمنة (WRITE_SECURE_SETTINGS)',
      desc: 'ضروري لتطبيقات Car Launcher لتغيير الإعدادات، السطوع، والتحكم بالنظام',
      perm: 'android.permission.WRITE_SECURE_SETTINGS',
      category: 'system',
      type: 'pm',
    },
    {
      id: 'usage_stats',
      name: 'الوصول لبيانات استخدام التطبيقات (PACKAGE_USAGE_STATS)',
      desc: 'لمعرفة التطبيقات المشغلة وعرضها في شريط المهام والواجهة الرئيسية',
      perm: 'android.permission.PACKAGE_USAGE_STATS',
      appOp: 'GET_USAGE_STATS',
      category: 'system',
      type: 'both',
    },
    {
      id: 'dump',
      name: 'قراءة سجلات وبيانات النظام (DUMP)',
      desc: 'تستخدمه تطبيقات المراقبة وقراءة بيانات كمبيوتر السيارة والـ CAN-Bus',
      perm: 'android.permission.DUMP',
      category: 'system',
      type: 'pm',
    },
    {
      id: 'change_config',
      name: 'تغيير إعدادات وتكوين الواجهة (CHANGE_CONFIGURATION)',
      desc: 'لتبديل الثيمات واللغات وضبط الوضع الليلي/النهاري تلقائياً',
      perm: 'android.permission.CHANGE_CONFIGURATION',
      category: 'system',
      type: 'pm',
    },

    // 2. Overlay & Background
    {
      id: 'system_alert',
      name: 'الظهور فوق التطبيقات الأخرى (SYSTEM_ALERT_WINDOW)',
      desc: 'ضروري لعدادات السرعة العائمة، النوافذ المصغرة، والخرائط السريعة',
      perm: 'android.permission.SYSTEM_ALERT_WINDOW',
      appOp: 'SYSTEM_ALERT_WINDOW',
      category: 'overlay',
      type: 'appops',
    },
    {
      id: 'battery_white',
      name: 'استثناء من توفير الطاقة وإغلاق الخلفية (Battery Whitelist)',
      desc: 'يمنع نظام السيارة من قتل التطبيق في الخلفية أو إيقاف الملاحة عند التوقف',
      perm: 'BATTERY_WHITELIST',
      category: 'overlay',
      type: 'battery',
    },
    {
      id: 'install_pkgs',
      name: 'السماح بتثبيت التطبيقات (REQUEST_INSTALL_PACKAGES)',
      desc: 'لتحديث التطبيقات ذاتياً أو تثبيت حزم من داخل المتجر واللانشر',
      perm: 'android.permission.REQUEST_INSTALL_PACKAGES',
      appOp: 'REQUEST_INSTALL_PACKAGES',
      category: 'overlay',
      type: 'appops',
    },
    {
      id: 'pip',
      name: 'صورة داخل صورة (Picture-in-Picture)',
      desc: 'تشغيل الفيديو أو الخريطة في نافذة صغيرة عائمة أثناء استخدام تطبيقات أخرى',
      perm: 'PICTURE_IN_PICTURE',
      appOp: 'PICTURE_IN_PICTURE',
      category: 'overlay',
      type: 'appops',
    },

    // 3. Location & Navigation
    {
      id: 'loc_fine',
      name: 'الموقع الدقيق عبر GPS (ACCESS_FINE_LOCATION)',
      desc: 'أساسي لتطبيقات الخرائط والملاحة (Waze, Maps, Sygic) لقياس السرعة والاتجاه',
      perm: 'android.permission.ACCESS_FINE_LOCATION',
      category: 'location',
      type: 'pm',
    },
    {
      id: 'loc_bg',
      name: 'الموقع في الخلفية دائماً (ACCESS_BACKGROUND_LOCATION)',
      desc: 'لتنبيهات كاميرات السرعة والرادار أثناء تشغيل الراديو أو تطبيق آخر',
      perm: 'android.permission.ACCESS_BACKGROUND_LOCATION',
      category: 'location',
      type: 'pm',
    },
    {
      id: 'loc_coarse',
      name: 'الموقع التقريبي (ACCESS_COARSE_LOCATION)',
      desc: 'لتطبيقات الطقس وتحديد المدينة بدون تشغيل الـ GPS المستمر',
      perm: 'android.permission.ACCESS_COARSE_LOCATION',
      category: 'location',
      type: 'pm',
    },

    // 4. Storage & Media
    {
      id: 'storage_all',
      name: 'الوصول لجميع الملفات والـ USB (MANAGE_EXTERNAL_STORAGE)',
      desc: 'قراءة ملفات الموسيقى، الفيديو، والخرائط من الفلاش ميموري والذاكرة',
      perm: 'android.permission.MANAGE_EXTERNAL_STORAGE',
      appOp: 'MANAGE_EXTERNAL_STORAGE',
      category: 'storage',
      type: 'appops',
    },
    {
      id: 'storage_read',
      name: 'قراءة الذاكرة الخارجية (READ_EXTERNAL_STORAGE)',
      desc: 'قراءة الوسائط والملفات المحفوظة على الشاشة',
      perm: 'android.permission.READ_EXTERNAL_STORAGE',
      category: 'storage',
      type: 'pm',
    },
    {
      id: 'storage_write',
      name: 'الكتابة على الذاكرة (WRITE_EXTERNAL_STORAGE)',
      desc: 'تنزيل وحفظ الخرائط والتسجيلات بدون إنترنت',
      perm: 'android.permission.WRITE_EXTERNAL_STORAGE',
      category: 'storage',
      type: 'pm',
    },

    // 5. Hardware & Connectivity
    {
      id: 'bt_connect',
      name: 'الاتصال بأجهزة البلوتوث (BLUETOOTH_CONNECT)',
      desc: 'للاتصال بأجهزة فحص أعطال السيارة OBD2 ومستشعرات ضغط الإطارات TPMS',
      perm: 'android.permission.BLUETOOTH_CONNECT',
      category: 'hardware',
      type: 'pm',
    },
    {
      id: 'bt_scan',
      name: 'البحث عن أجهزة البلوتوث (BLUETOOTH_SCAN)',
      desc: 'للعثور على محولات OBD2 اللاسلكية في السيارة',
      perm: 'android.permission.BLUETOOTH_SCAN',
      category: 'hardware',
      type: 'pm',
    },
    {
      id: 'mic',
      name: 'الميكروفون والأوامر الصوتية (RECORD_AUDIO)',
      desc: 'للمساعد الصوتي والمكالمات والتحكم الصوتي في السيارة',
      perm: 'android.permission.RECORD_AUDIO',
      category: 'hardware',
      type: 'pm',
    },
    {
      id: 'camera',
      name: 'الكاميرا والداش كام (CAMERA)',
      desc: 'لتطبيقات تسجيل الرحلات وكاميرات الرجوع الذكية',
      perm: 'android.permission.CAMERA',
      category: 'hardware',
      type: 'pm',
    },
    {
      id: 'notif',
      name: 'إظهار الإشعارات (POST_NOTIFICATIONS)',
      desc: 'لعرض إشعارات الملاحة والسرعة على أندرويد 13 فما فوق',
      perm: 'android.permission.POST_NOTIFICATIONS',
      category: 'hardware',
      type: 'pm',
    },
  ];

  const filteredPerms = permissionsList.filter(
    p => activeCategory === 'all' || p.category === activeCategory
  );

  return (
    <div className="w-full rounded-2xl bg-slate-900/80 border border-slate-800 p-4 sm:p-5 backdrop-blur-sm shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              إدارة وتفعيل أذونات وتصاريح التطبيقات (Permissions Manager)
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/50 text-emerald-400">
                ADB Rootless
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              منح الصلاحيات الحساسة (إعدادات النظام، الظهور فوق الشاشة، الـ GPS، واستثناء البطارية) بنقرة واحدة
            </p>
          </div>
        </div>

        {/* Quick Batch Action */}
        <button
          onClick={handleGrantAll}
          disabled={!isConnected || isProcessing || !targetPackage.trim()}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer shrink-0"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري المعالجة...</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 fill-current" />
              <span>منح كافة الصلاحيات بنقرة واحدة ⚡</span>
            </>
          )}
        </button>
      </div>

      {/* Package Selector & Input */}
      <div className="bg-slate-950/70 rounded-xl p-3.5 border border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              اسم الحزمة المستهدفة (Package Name):
            </label>
            <div className="relative">
              <input
                type="text"
                value={targetPackage}
                onChange={(e) => setTargetPackage(e.target.value)}
                placeholder="مثال: altergames.carlauncher أو com.softartstudio.carwebguru"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                dir="ltr"
              />
              {targetPackage && (
                <button
                  type="button"
                  onClick={() => loadGrantedPermissions(targetPackage)}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400 p-1"
                  title="تحديث الأذونات الممنوحة"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGranted ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {/* Installed App Dropdown if any */}
          {installedApps.length > 0 && (
            <div className="w-full md:w-64">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                أو اختر من التطبيقات المثبتة:
              </label>
              <select
                onChange={(e) => setTargetPackage(e.target.value)}
                value={targetPackage}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer truncate"
              >
                <option value="">-- اختر تطبيق من الشاشة --</option>
                {installedApps.map((a) => (
                  <option key={a.packageName} value={a.packageName}>
                    {a.packageName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Popular Car App Quick Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-slate-400 flex items-center gap-1 ml-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            تطبيقات سيارات شائعة:
          </span>
          {popularCarApps.map((app) => (
            <button
              key={app.pkg}
              type="button"
              onClick={() => setTargetPackage(app.pkg)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors cursor-pointer ${
                targetPackage === app.pkg
                  ? 'bg-cyan-950 border-cyan-500 text-cyan-200 font-bold'
                  : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700/70 text-slate-300'
              }`}
            >
              {app.name}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
          feedback.type === 'success'
            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Smart Automotive Presets Box */}
      <div className="bg-gradient-to-r from-blue-950/40 via-slate-950/60 to-purple-950/40 rounded-xl p-3.5 border border-blue-900/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-slate-100">
              حزم وحلول شاشات السيارات الذكية (Jetour / Haval / Geely / Changan / Desay SV)
            </span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/50">
            تفعيل فوري وتجاوز قيود النظام
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* MacroDroid Steering Wheel Fix */}
          <button
            type="button"
            onClick={async () => {
              if (!adb) return;
              setIsProcessing(true);
              onLog('بدء تطبيق الحزمة الشاملة لأزرار المقود والدركسون (MacroDroid + Button Mapper + Accessibility)...', 'info');
              try {
                const logs = await CarSystemTools.applySteeringWheelCompleteFix(adb);
                logs.forEach(l => onLog(l, l.startsWith('✓') ? 'success' : l.startsWith('===') ? 'info' : 'warning'));
                setFeedback({ type: 'success', message: 'تم تفعيل حزمة أزرار المقود وخدمات إمكانية الوصول وسجلات CAN-Bus بنجاح!' });
                setTargetPackage('com.arlosoft.macrodroid');
              } catch (e: any) {
                setFeedback({ type: 'error', message: `فشل تطبيق أذونات المقود: ${e.message || e}` });
              } finally {
                setIsProcessing(false);
              }
            }}
            disabled={!isConnected || isProcessing}
            className="p-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-850 border border-purple-500/30 hover:border-purple-500 text-right transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-purple-300 group-hover:text-purple-200">
                حل أزرار المقود والدركسون
              </span>
              <Zap className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              تفعيل تبديل الأغاني من الدركسون وخدمات إمكانية الوصول وسجلات CAN-Bus
            </p>
          </button>

          {/* RuStore & App Stores */}
          <button
            type="button"
            onClick={async () => {
              if (!adb) return;
              setIsProcessing(true);
              const pkg = targetPackage.trim() || 'ru.vk.store';
              onLog(`بدء تطبيق أذونات تثبيت الحزم والنوافذ العائمة لمتاجر التطبيقات (${pkg})...`, 'info');
              try {
                const logs = await CarSystemTools.applyStoreAppPermissions(adb, pkg);
                logs.forEach(l => onLog(l, l.startsWith('✓') ? 'success' : 'warning'));
                setFeedback({ type: 'success', message: `تم تفعيل صلاحيات التثبيت والنوافذ لمتاجر التطبيقات بنجاح!` });
              } catch (e: any) {
                setFeedback({ type: 'error', message: `فشل تطبيق أذونات المتجر: ${e.message || e}` });
              } finally {
                setIsProcessing(false);
              }
            }}
            disabled={!isConnected || isProcessing}
            className="p-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-850 border border-blue-500/30 hover:border-blue-500 text-right transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-blue-300 group-hover:text-blue-200">
                متاجر التطبيقات (App Stores)
              </span>
              <Shield className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              السماح بتثبيت التطبيقات الخارجية بدون روت + إظهار النوافذ المنبثقة
            </p>
          </button>

          {/* Navigation & Music Apps */}
          <button
            type="button"
            onClick={async () => {
              if (!adb) return;
              setIsProcessing(true);
              onLog('بدء تطبيق تصاريح الملاحة والموسيقى (GPS + Overlays + Battery Whitelist)...', 'info');
              try {
                const logs = await CarSystemTools.applyNavigationMediaPermissions(adb);
                logs.forEach(l => onLog(l, l.startsWith('✓') ? 'success' : 'warning'));
                setFeedback({ type: 'success', message: 'تم تفعيل الـ GPS والظهور واستثناء البطارية لتطبيقات الملاحة والصوت بنجاح!' });
              } catch (e: any) {
                setFeedback({ type: 'error', message: `فشل تطبيق أذونات الملاحة: ${e.message || e}` });
              } finally {
                setIsProcessing(false);
              }
            }}
            disabled={!isConnected || isProcessing}
            className="p-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-850 border border-emerald-500/30 hover:border-emerald-500 text-right transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-emerald-300 group-hover:text-emerald-200">
                خرائط وموسيقى وتطبيقات وسائط
              </span>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              تفعيل دقة الـ GPS والظهور فوق الشاشة والتشغيل الدائم بالخلفية
            </p>
          </button>
        </div>

        {/* Interactive Steering Wheel Key Tester */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-cyan-400" />
              أداة اختبار ومحاكاة أزرار الدركسون والميديا:
            </span>
            <span className="text-[10px] text-slate-500">اضغط لتجربة استجابة شاشة السيارة فورياً</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
            {[
              { id: 'next', label: 'التالي ⏭️' },
              { id: 'prev', label: 'السابق ⏮️' },
              { id: 'play_pause', label: 'تشغيل ⏯️' },
              { id: 'vol_up', label: 'صوت + 🔊' },
              { id: 'vol_down', label: 'صوت - 🔉' },
              { id: 'voice', label: 'مساعد 🎙️' },
              { id: 'home', label: 'رئيسية 🏠' },
              { id: 'back', label: 'رجوع 🔙' },
            ].map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={async () => {
                  if (!adb) return;
                  try {
                    const res = await CarSystemTools.sendMediaKey(adb, k.id as any);
                    onLog(res, 'info');
                  } catch (e: any) {
                    onLog(`فشل إرسال الزر: ${e.message || e}`, 'error');
                  }
                }}
                disabled={!isConnected}
                className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/50 text-[11px] font-medium text-slate-200 text-center transition-colors cursor-pointer disabled:opacity-50"
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {[
          { id: 'all', label: 'كافة الأذونات' },
          { id: 'system', label: 'إعدادات النظام والـ ADB' },
          { id: 'overlay', label: 'الظهور والخلفية والبطارية' },
          { id: 'location', label: 'الموقع والملاحة GPS' },
          { id: 'storage', label: 'الذاكرة والـ USB' },
          { id: 'hardware', label: 'الحساسات والبلوتوث' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id as any)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap text-xs font-medium transition-colors cursor-pointer ${
              activeCategory === cat.id
                ? 'bg-slate-800 text-cyan-300 border border-slate-700 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Permissions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {filteredPerms.map((item) => {
          const granted = isGranted(item.perm);

          return (
            <div
              key={item.id}
              className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 flex flex-col justify-between gap-2.5 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    {item.name}
                  </span>
                  {granted && (
                    <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                      <Check className="w-3 h-3" />
                      <span>ممنوح</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {item.desc}
                </p>
                <span className="text-[10px] font-mono text-slate-500 mt-1 block truncate" dir="ltr">
                  {item.perm}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60 justify-end">
                {item.type === 'battery' ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleBatteryWhitelist(true)}
                      disabled={isProcessing || !isConnected || !targetPackage.trim()}
                      className="px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-600/40 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>استثناء من توفير الطاقة</span>
                    </button>
                  </div>
                ) : item.type === 'appops' ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleSetAppOp(item.appOp!, item.name, 'allow')}
                      disabled={isProcessing || !isConnected || !targetPackage.trim()}
                      className="px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-600/40 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>تفعيل الصلاحية (Allow)</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleGrantSinglePm(item.perm, item.name)}
                      disabled={isProcessing || !isConnected || !targetPackage.trim()}
                      className="px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-600/40 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>منح الإذن (Grant)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Permission Input */}
      <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/80">
        <form onSubmit={handleCustomPermissionSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={customPermission}
              onChange={(e) => setCustomPermission(e.target.value)}
              placeholder="منح إذن مخصص... مثال: android.permission.ACCESS_MEDIA_LOCATION"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            disabled={!isConnected || isProcessing || !targetPackage.trim() || !customPermission.trim()}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            <span>منح الإذن المخصص</span>
          </button>
        </form>
      </div>
    </div>
  );
};
