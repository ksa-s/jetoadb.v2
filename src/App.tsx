import React, { useState, useEffect, useCallback } from 'react';
import { DeviceInfo, ApkItem, InstallMethod, LogEntry, InstalledApp } from './types';
import { adbManager } from './lib/adb/webusb-manager';
import { ApkInstaller } from './lib/adb/apk-installer';
import { CarSystemTools } from './lib/adb/car-system-tools';
import { Header } from './components/Header';
import { ConnectionPanel } from './components/ConnectionPanel';
import { ApkInstallerCard } from './components/ApkInstallerCard';
import { PermissionsCard } from './components/PermissionsCard';
import { ShellCard } from './components/ShellCard';
import { LogTerminal } from './components/LogTerminal';
import { UnifiedProtocolSelector } from './components/UnifiedProtocolSelector';
import { CarToolsModal } from './components/CarToolsModal';
import { AppManagerModal } from './components/AppManagerModal';
import { PermissionsModal } from './components/PermissionsModal';
import { SteeringWheelModal } from './components/SteeringWheelModal';
import { HelpAndGuideModal } from './components/HelpAndGuideModal';
import { MagicUninstallerModal } from './components/MagicUninstallerModal';
import { Adb } from '@yume-chan/adb';
import { Package, ShieldCheck, Terminal, Sparkles } from 'lucide-react';

export default function App() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [adb, setAdb] = useState<Adb | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWebUsbSupported, setIsWebUsbSupported] = useState(true);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);

  // Navigation tab state for a smooth, clutter-free layout
  const [activeTab, setActiveTab] = useState<'installer' | 'permissions' | 'shell'>('installer');

  // APK Queue
  const [apkList, setApkList] = useState<ApkItem[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<InstallMethod>('auto');

  // Shell
  const [isExecutingShell, setIsExecutingShell] = useState(false);

  // Modals
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isAppsOpen, setIsAppsOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isSteeringWheelOpen, setIsSteeringWheelOpen] = useState(false);
  const [isMagicUninstallerOpen, setIsMagicUninstallerOpen] = useState(false);
  const [magicTargetPackage, setMagicTargetPackage] = useState<string>('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString('ar-SA', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type: 'info',
      message: 'نظام Sam Software لإدارة وتثبيت تطبيقات شاشات السيارات جاهز. قم بتوصيل كابل USB والضغط على زر الاتصال.',
    },
  ]);

  const addLog = useCallback((
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' | 'command' | 'output' = 'info',
    details?: string
  ) => {
    const timestamp = new Date().toLocaleTimeString('ar-SA', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp,
        type,
        message,
        details,
      },
    ]);
  }, []);

  useEffect(() => {
    setIsWebUsbSupported(adbManager.isWebUsbSupported());
  }, []);

  // Connect via WebUSB
  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      addLog('على الشاشة وافق على طلب ADB جاري الاتصال...', 'info');

      const { adb: adbInstance, deviceInfo: info } = await adbManager.requestAndConnect(
        (msg, type) => addLog(msg, type)
      );

      setAdb(adbInstance);
      setDeviceInfo(info);
      setIsConnected(true);
      addLog(`متصل بـ ${info.serial}`, 'success');

      // Fetch 3rd party package count
      try {
        const apps = await CarSystemTools.getInstalledApps(adbInstance, false);
        setInstalledApps(apps);
        addLog(`تم جلب ${apps.length} تطبيق من الشاشة بنجاح.`, 'success');
      } catch {}
    } catch (e: any) {
      addLog(`فشل الاتصال: ${e.message || e}`, 'error');
      setIsConnected(false);
      setAdb(null);
      setDeviceInfo(null);
      setInstalledApps([]);
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    await adbManager.disconnect();
    setAdb(null);
    setDeviceInfo(null);
    setIsConnected(false);
    setInstalledApps([]);
    addLog('تم قطع الاتصال بشاشة السيارة.', 'info');
  };

  // Add APKs to list
  const handleAddApks = (newItems: ApkItem[]) => {
    setApkList((prev) => [...prev, ...newItems]);
    addLog(`تمت إضافة ${newItems.length} ملفات APK إلى قائمة التثبيت.`, 'info');
  };

  // Remove single APK
  const handleRemoveApk = (id: string) => {
    setApkList((prev) => prev.filter((item) => item.id !== id));
  };

  // Clear APK list
  const handleClearList = () => {
    setApkList([]);
  };

  // Install Single APK
  const handleInstallSingle = async (item: ApkItem, method: InstallMethod = selectedMethod) => {
    if (!adb) {
      addLog('تنبيه: يجب الاتصال بالجهاز أولاً قبل التثبيت.', 'warning');
      return;
    }

    setIsInstalling(true);
    setApkList((prev) =>
      prev.map((a) =>
        a.id === item.id ? { ...a, status: 'uploading', progress: 0, errorMessage: undefined } : a
      )
    );

    addLog(`رفع ${item.name} (${(item.size / (1024 * 1024)).toFixed(1)}MB)...`, 'info');

    try {
      const result = await ApkInstaller.installApk(
        adb,
        item.file,
        method,
        (progress, stage, msg) => {
          setApkList((prev) =>
            prev.map((a) =>
              a.id === item.id
                ? {
                    ...a,
                    status: stage === 'installing' ? 'installing' : 'uploading',
                    progress,
                  }
                : a
            )
          );
          if (msg && progress % 25 === 0) {
            addLog(`${item.name}: ${msg}`, 'info');
          }
        },
        (logMsg, logType) => addLog(logMsg, logType),
        item.packageName
      );

      if (result.success) {
        setApkList((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? {
                  ...a,
                  status: 'success',
                  progress: 100,
                  usedMethod: result.methodUsed,
                  packageName: result.packageName || a.packageName,
                }
              : a
          )
        );
        addLog(`تم تثبيت ${item.name} بنجاح على الشاشة (${result.methodUsed})!`, 'success');

        // Refresh installed apps list
        try {
          const apps = await CarSystemTools.getInstalledApps(adb, false);
          setInstalledApps(apps);
        } catch {}
      } else {
        setApkList((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? { ...a, status: 'error', progress: 0, errorMessage: result.message }
              : a
          )
        );
        addLog(`فشل تثبيت ${item.name}: ${result.message}`, 'error');
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      setApkList((prev) =>
        prev.map((a) =>
          a.id === item.id
            ? { ...a, status: 'error', progress: 0, errorMessage: errorMsg }
            : a
        )
      );
      addLog(`خطأ تثبيت (${item.name}): ${errorMsg}`, 'error');
    } finally {
      setIsInstalling(false);
    }
  };

  // Install All APKs in queue
  const handleInstallAll = async (method: InstallMethod = selectedMethod) => {
    if (!adb) {
      addLog('تنبيه: يجب الاتصال بالجهاز أولاً.', 'warning');
      return;
    }

    const pending = apkList.filter((a) => a.status !== 'success');
    if (pending.length === 0) {
      addLog('جميع التطبيقات في القائمة مثبتة بالفعل.', 'info');
      return;
    }

    setIsInstalling(true);
    addLog(`بدء تثبيت الحزمة (${pending.length} تطبيق) تلقائياً...`, 'info');

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      addLog(`[${i + 1}/${pending.length}] جاري تثبيت: ${item.name}...`, 'info');
      await handleInstallSingle(item, method);
    }

    setIsInstalling(false);
    addLog('اكتملت معالجة حزمة التطبيقات.', 'info');
  };

  // Launch app directly on car screen
  const handleLaunchApp = async (packageName: string) => {
    if (!adb) {
      addLog('تنبيه: يجب الاتصال بالجهاز أولاً لتشغيل التطبيق.', 'warning');
      return;
    }
    addLog(`جاري إرسال أمر فتح وتشغيل التطبيق (${packageName}) على شاشة السيارة...`, 'info');
    try {
      const msg = await CarSystemTools.launchApp(adb, packageName);
      addLog(msg, 'success');
    } catch (err: any) {
      addLog(`فشل فتح التطبيق: ${err.message || err}`, 'error');
    }
  };

  // Expose app to car launcher
  const handleExposeApp = async (packageName: string) => {
    if (!adb) {
      addLog('تنبيه: يجب الاتصال بالجهاز أولاً.', 'warning');
      return;
    }
    addLog(`جاري تفعيل وإظهار التطبيق (${packageName}) لواجهة مستخدم السيارة...`, 'info');
    try {
      const msg = await CarSystemTools.exposeAppToCarLauncher(adb, packageName);
      addLog(msg, 'success');
      // Refresh apps
      const apps = await CarSystemTools.getInstalledApps(adb, false);
      setInstalledApps(apps);
    } catch (err: any) {
      addLog(`فشل تفعيل التطبيق: ${err.message || err}`, 'error');
    }
  };

  // Expose ALL apps to car launcher
  const handleExposeAllApps = async () => {
    if (!adb) {
      addLog('تنبيه: يجب الاتصال بالجهاز أولاً.', 'warning');
      return;
    }
    addLog('جاري بدء تفعيل وإظهار كافة التطبيقات المثبتة في لانشر وشاشة السيارة...', 'info');
    try {
      const res = await CarSystemTools.exposeAllAppsToCarLauncher(adb, (msg) => {
        addLog(msg, 'info');
      });
      addLog(`تم تفعيل وتحديث ${res.count} تطبيق لواجهة شاشة السيارة بنجاح!`, 'success');
      // Refresh apps
      const apps = await CarSystemTools.getInstalledApps(adb, false);
      setInstalledApps(apps);
    } catch (err: any) {
      addLog(`فشل تفعيل التطبيقات: ${err.message || err}`, 'error');
    }
  };

  // Unlock user restrictions for installing apps
  const handleUnlockRestrictions = async () => {
    if (!adb) {
      addLog('تنبيه: يجب الاتصال بالجهاز أولاً.', 'warning');
      return;
    }
    addLog('جاري فك قيود تثبيت التطبيقات ومصادر التثبيت الخارجية لجميع مستخدمي الشاشة...', 'info');
    try {
      const userId = await ApkInstaller.getCurrentUserId(adb);
      await ApkInstaller.unlockUserRestrictions(adb, userId, (msg, type) => addLog(msg, type));
      addLog('تم فك قيود التثبيت وإلغاء حظر المصادر الخارجية بنجاح.', 'success');
    } catch (err: any) {
      addLog(`خطأ فك القيود: ${err.message || err}`, 'error');
    }
  };

  // Open Car File Manager at /sdcard/Download
  const handleOpenCarFileManager = async () => {
    if (!adb) {
      addLog('تنبيه: يجب الاتصال بالجهاز أولاً.', 'warning');
      return;
    }
    addLog('جاري فتح مدير ملفات السيارة (مجلد التحميلات) على شاشة السيارة...', 'info');
    try {
      const res = await ApkInstaller.openCarFileManager(adb, (msg, type) => addLog(msg, type));
      if (res.success) {
        addLog('تم إرسال أمر فتح مدير الملفات لشاشة السيارة بنجاح! يمكنك الآن النقر على ملف APK لتثبيته فوراً.', 'success');
      }
    } catch (err: any) {
      addLog(`خطأ فتح مدير الملفات: ${err.message || err}`, 'error');
    }
  };

  // Execute custom shell command
  const handleExecuteShell = async (command: string) => {
    if (!adb) {
      addLog('تنبيه: يجب الاتصال بالجهاز أولاً لتنفيذ أوامر shell.', 'warning');
      return;
    }

    setIsExecutingShell(true);
    addLog(`$ ${command}`, 'command');

    try {
      // Clean command if user typed 'adb shell ...' or 'adb ...'
      let cleanCmd = command.trim();
      if (cleanCmd.toLowerCase().startsWith('adb shell ')) {
        cleanCmd = cleanCmd.substring(10).trim();
      } else if (cleanCmd.toLowerCase().startsWith('adb ')) {
        cleanCmd = cleanCmd.substring(4).trim();
      }

      const output = await adbManager.execShell(adb, cleanCmd);
      if (output.trim()) {
        addLog(output.trim(), 'output');
      } else {
        addLog('تم التنفيذ بنجاح (بدون مخرجات نصية).', 'success');
      }
    } catch (e: any) {
      addLog(e.message || String(e), 'error');
    } finally {
      setIsExecutingShell(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Cairo',sans-serif]">
      {/* Top Navigation */}
      <Header
        deviceInfo={deviceInfo}
        isConnected={isConnected}
        isConnecting={isConnecting}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onOpenTools={() => setIsToolsOpen(true)}
        onOpenApps={() => setIsAppsOpen(true)}
        onOpenPermissions={() => setIsPermissionsOpen(true)}
        onOpenSteeringWheel={() => setIsSteeringWheelOpen(true)}
        onOpenMagicUninstaller={() => {
          setMagicTargetPackage('');
          setIsMagicUninstallerOpen(true);
        }}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* Device Connectivity & Specs Panel */}
        <ConnectionPanel
          deviceInfo={deviceInfo}
          isConnected={isConnected}
          isConnecting={isConnecting}
          onConnect={handleConnect}
          isWebUsbSupported={isWebUsbSupported}
        />

        {/* Smooth Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
            <button
              onClick={() => setActiveTab('installer')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'installer'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>تثبيت وحاقن التطبيقات</span>
              {apkList.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-900 border border-cyan-400/40 text-cyan-200">
                  {apkList.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'permissions'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>أذونات ونظام السيارة</span>
              {installedApps.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-900 border border-emerald-400/40 text-emerald-200">
                  {installedApps.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('shell')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'shell'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>طرفية الأوامر والسجلات</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>نظام خالي من النقر وتجاوز صامت 100%</span>
          </div>
        </div>

        {/* Tab 1: APK Installer & Universal Protocols */}
        {activeTab === 'installer' && (
          <div className="space-y-5">
            <UnifiedProtocolSelector
              selectedMethod={selectedMethod}
              onSelectMethod={setSelectedMethod}
              isConnected={isConnected}
              onUnlockRestrictions={handleUnlockRestrictions}
              onOpenCarFileManager={handleOpenCarFileManager}
              onExposeAllApps={handleExposeAllApps}
            />

            <ApkInstallerCard
              apkList={apkList}
              onAddApks={handleAddApks}
              onRemoveApk={handleRemoveApk}
              onClearList={handleClearList}
              onInstallSingle={handleInstallSingle}
              onInstallAll={handleInstallAll}
              isInstalling={isInstalling}
              isConnected={isConnected}
              selectedMethod={selectedMethod}
              onSelectMethod={setSelectedMethod}
              onLaunchApp={handleLaunchApp}
              onExposeApp={handleExposeApp}
              onExposeAllApps={handleExposeAllApps}
              onUnlockRestrictions={handleUnlockRestrictions}
              onOpenCarFileManager={handleOpenCarFileManager}
            />

            <LogTerminal logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        )}

        {/* Tab 2: Car System & AppOps Permissions */}
        {activeTab === 'permissions' && (
          <div className="space-y-5">
            <PermissionsCard
              adb={adb}
              isConnected={isConnected}
              onLog={addLog}
              installedApps={installedApps}
            />
          </div>
        )}

        {/* Tab 3: ADB Shell & Console Logs */}
        {activeTab === 'shell' && (
          <div className="space-y-5">
            <ShellCard
              onExecuteCommand={handleExecuteShell}
              isExecuting={isExecutingShell}
              isConnected={isConnected}
            />
            <LogTerminal logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 py-4 px-6 bg-slate-950/80 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Sam Software — أداة ويب متخصصة لشاشات جيتور، جيلي، هافال، وتطبيقات السيارات</span>
          <button
            onClick={() => setIsHelpOpen(true)}
            className="text-cyan-400 hover:underline cursor-pointer"
          >
            تعليمات مهمة وحل الأخطاء (Socket open failed)
          </button>
        </div>
      </footer>

      {/* Modals */}
      <SteeringWheelModal
        isOpen={isSteeringWheelOpen}
        onClose={() => setIsSteeringWheelOpen(false)}
        adb={adb}
        isConnected={isConnected}
        onLog={addLog}
      />

      <PermissionsModal
        isOpen={isPermissionsOpen}
        onClose={() => setIsPermissionsOpen(false)}
        adb={adb}
        isConnected={isConnected}
        onLog={addLog}
        installedApps={installedApps}
      />

      <CarToolsModal
        isOpen={isToolsOpen}
        onClose={() => setIsToolsOpen(false)}
        adb={adb}
        onLog={addLog}
      />

      <AppManagerModal
        isOpen={isAppsOpen}
        onClose={() => setIsAppsOpen(false)}
        adb={adb}
        onLog={addLog}
        onOpenMagicEradicator={(pkg) => {
          setMagicTargetPackage(pkg || '');
          setIsMagicUninstallerOpen(true);
        }}
      />

      <MagicUninstallerModal
        isOpen={isMagicUninstallerOpen}
        onClose={() => setIsMagicUninstallerOpen(false)}
        adb={adb}
        onLog={addLog}
        initialPackage={magicTargetPackage}
        onAppRemoved={(pkg) => {
          setInstalledApps(prev => prev.filter(a => a.packageName !== pkg));
        }}
      />

      <HelpAndGuideModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
}
