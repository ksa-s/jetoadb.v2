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
import { CarToolsModal } from './components/CarToolsModal';
import { AppManagerModal } from './components/AppManagerModal';
import { PermissionsModal } from './components/PermissionsModal';
import { HelpAndGuideModal } from './components/HelpAndGuideModal';
import { Adb } from '@yume-chan/adb';

export default function App() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [adb, setAdb] = useState<Adb | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWebUsbSupported, setIsWebUsbSupported] = useState(true);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);

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
        (logMsg, logType) => addLog(logMsg, logType)
      );

      if (result.success) {
        setApkList((prev) =>
          prev.map((a) =>
            a.id === item.id ? { ...a, status: 'success', progress: 100, usedMethod: result.methodUsed } : a
          )
        );
        addLog(`تم تثبيت ${item.name} بنجاح على الشاشة (${result.methodUsed})!`, 'success');
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

        {/* APK Batch Installer Card */}
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
        />

        {/* Permissions & Special AppOps Manager */}
        <PermissionsCard
          adb={adb}
          isConnected={isConnected}
          onLog={addLog}
          installedApps={installedApps}
        />

        {/* Custom Shell Card */}
        <ShellCard
          onExecuteCommand={handleExecuteShell}
          isExecuting={isExecutingShell}
          isConnected={isConnected}
        />

        {/* Terminal Log */}
        <LogTerminal logs={logs} onClearLogs={() => setLogs([])} />
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
      />

      <HelpAndGuideModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
}
