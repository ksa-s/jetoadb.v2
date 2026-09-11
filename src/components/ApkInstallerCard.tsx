import React, { useRef, useState } from 'react';
import { ApkItem, InstallMethod } from '../types';
import { 
  Package, 
  Upload, 
  Trash2, 
  Play, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  FileText, 
  Sparkles, 
  Settings2, 
  RotateCw,
  AlertCircle,
  HelpCircle,
  Zap,
  ShieldAlert,
  Eye,
  Tv,
  FolderOpen,
} from 'lucide-react';
import { parseApkMetadata } from '../lib/apk-parser';

interface ApkInstallerCardProps {
  apkList: ApkItem[];
  onAddApks: (items: ApkItem[]) => void;
  onRemoveApk: (id: string) => void;
  onClearList: () => void;
  onInstallSingle: (item: ApkItem, method?: InstallMethod) => void;
  onInstallAll: (method?: InstallMethod) => void;
  isInstalling: boolean;
  isConnected: boolean;
  selectedMethod: InstallMethod;
  onSelectMethod: (method: InstallMethod) => void;
  onLaunchApp?: (packageName: string) => void;
  onExposeApp?: (packageName: string) => void;
  onExposeAllApps?: () => void;
  onUnlockRestrictions?: () => void;
  onOpenCarFileManager?: () => void;
}

export const ApkInstallerCard: React.FC<ApkInstallerCardProps> = ({
  apkList,
  onAddApks,
  onRemoveApk,
  onClearList,
  onInstallSingle,
  onInstallAll,
  isInstalling,
  isConnected,
  selectedMethod,
  onSelectMethod,
  onLaunchApp,
  onExposeApp,
  onExposeAllApps,
  onUnlockRestrictions,
  onOpenCarFileManager,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleFileSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: ApkItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.toLowerCase().endsWith('.apk')) {
        continue;
      }

      const id = `${file.name}-${Date.now()}-${i}`;
      const item: ApkItem = {
        id,
        file,
        name: file.name,
        size: file.size,
        status: 'parsing',
        progress: 0,
      };

      newItems.push(item);
    }

    if (newItems.length > 0) {
      onAddApks(newItems);

      // Asynchronously parse metadata
      for (const item of newItems) {
        try {
          const meta = await parseApkMetadata(item.file);
          item.packageName = meta.packageName;
          item.versionName = meta.versionName;
          item.minSdkVersion = meta.minSdkVersion;
          item.status = 'idle';
        } catch {
          item.status = 'idle';
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelection(e.dataTransfer.files);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full rounded-2xl bg-slate-900/80 border border-slate-800 p-4 sm:p-5 backdrop-blur-sm shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              حزمة تطبيقات — تثبيت تلقائي
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-700/40">
                {apkList.length} ملفات
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              تثبيت تطبيقات APK بدون فك حماية وبدون أخطاء Socket open failed
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".apk"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelection(e.target.files)}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>إضافة APK +</span>
          </button>

          {isConnected && onExposeAllApps && (
            <button
              onClick={onExposeAllApps}
              className="px-3 py-1.5 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 border border-amber-500/50 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-amber-950/40"
              title="إظهار وتفعيل كافة التطبيقات المثبتة في شاشة السيارة ولانشر البرامج فوراً"
            >
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>⚡ إظهار كافة التطبيقات بالشاشة</span>
            </button>
          )}

          {isConnected && onOpenCarFileManager && (
            <button
              onClick={onOpenCarFileManager}
              className="px-3 py-1.5 rounded-xl bg-blue-950/70 hover:bg-blue-900/80 border border-blue-500/50 text-blue-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-blue-950/40"
              title="فتح مدير ملفات السيارة (مجلد التحميلات Download) على شاشة السيارة لتثبيت التطبيق بنقرة واحدة"
            >
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>📂 فتح مدير ملفات السيارة</span>
            </button>
          )}

          {apkList.length > 0 && (
            <>
              <button
                onClick={onClearList}
                disabled={isInstalling}
                className="px-3 py-1.5 rounded-xl bg-slate-800/60 hover:bg-rose-950/40 hover:text-rose-300 border border-slate-700/60 text-slate-400 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                title="مسح قائمة التطبيقات"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح</span>
              </button>

              <button
                onClick={() => onInstallAll(selectedMethod)}
                disabled={isInstalling || !isConnected}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-purple-600/20 cursor-pointer"
              >
                {isInstalling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري التثبيت...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>تثبيت الكل ({apkList.length})</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Unified Active Protocol Reference Bar */}
      <div className="mt-3.5 bg-slate-950/60 rounded-xl p-3 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-slate-400 font-medium">البروتوكول المعتمد لرفع وتثبيت APK:</span>
          <span className="font-bold text-slate-100 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-750 font-mono">
            {selectedMethod === 'auto' && '🌟 المحرك التلقائي الذكي المتكيف (Auto Smart)'}
            {selectedMethod === 'stream_session' && '🛡️ جلسة الحزم المتدفقة المباشرة (Direct Streaming)'}
            {selectedMethod === 'app_process_gt' && '🚀 محرك الجافا المستقل (Automotive app_process / GtInstall)'}
            {selectedMethod === 'active_user' && '👤 تثبيت المستخدم النشط لشاشات السيارات (Active Car User)'}
            {selectedMethod === 'desay_broadcast' && '📡 حاقن بث المصنع المباشر (Desay SV / Chery)'}
            {selectedMethod === 'download_staging' && '📁 إيداع مجلد التحميلات ومدير الملفات (/sdcard/Download)'}
            {selectedMethod === 'root_su' && '⚡ الحقن المباشر بصلاحيات الروت (Root su)'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1 text-emerald-400 font-mono">
            ✓ موحد مع قائمة الحزم الـ12 الجاهزة
          </span>
        </div>
      </div>

      {/* Drop Zone or Apk List */}
      {apkList.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-4 border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-cyan-500 bg-cyan-950/20'
              : 'border-slate-800 hover:border-slate-700 bg-slate-950/30'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-purple-950/40 border border-purple-700/30 text-purple-400 flex items-center justify-center mx-auto mb-3">
            <Upload className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-200">
            أضف ملفات APK لتكوين حزمتك، ثم اضغط "تثبيت الكل" لتثبيتها واحداً تلو الآخر تلقائياً.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            اسحب وأفلت الملفات هنا أو اضغط للاختيار من جهازك (يدعم جميع شاشات جيلي، جيتور، هافال، وتطبيقات Car Launcher)
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {apkList.map((item, index) => (
            <div
              key={item.id}
              className={`rounded-xl border p-3 transition-all ${
                item.status === 'uploading' || item.status === 'installing'
                  ? 'bg-slate-900/90 border-cyan-500/50 shadow-md shadow-cyan-500/10'
                  : item.status === 'success'
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : item.status === 'error'
                  ? 'bg-rose-950/20 border-rose-500/40'
                  : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                {/* Left: Info */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                    {item.status === 'uploading' || item.status === 'installing' ? (
                      <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    ) : item.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : item.status === 'error' ? (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <span className="text-xs font-mono font-bold text-slate-400">{index + 1}</span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-100 truncate max-w-xs sm:max-w-md" title={item.name}>
                        {item.name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-800/60 px-2 py-0.2 rounded border border-slate-700/50">
                        {formatFileSize(item.size)}
                      </span>
                    </div>

                    {item.packageName && (
                      <p className="text-[11px] font-mono text-cyan-400/80 mt-0.5 truncate">
                        {item.packageName} {item.versionName ? `(v${item.versionName})` : ''}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Actions and Status badge */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {item.status === 'success' && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>مثبت في النظام</span>
                      </span>

                      {item.packageName && onLaunchApp && (
                        <button
                          onClick={() => onLaunchApp(item.packageName!)}
                          disabled={!isConnected}
                          className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-sm shadow-emerald-950/40"
                          title="تشغيل وفتح التطبيق فوراً على شاشة السيارة"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          <span>تشغيل على الشاشة</span>
                        </button>
                      )}

                      {item.packageName && onExposeApp && (
                        <button
                          onClick={() => onExposeApp(item.packageName!)}
                          disabled={!isConnected}
                          className="text-[11px] font-semibold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          title="إعادة تفعيل التطبيق وإظهاره لجميع مستخدمي واجهة السيارة وتحديث القائمة"
                        >
                          <Eye className="w-3 h-3" />
                          <span>تفعيل في القائمة</span>
                        </button>
                      )}
                    </div>
                  )}

                  {item.status === 'error' && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => onInstallSingle(item, 'pipe_stream')}
                        disabled={isInstalling || !isConnected}
                        className="text-[11px] font-bold text-amber-200 bg-amber-950/80 hover:bg-amber-900/80 border border-amber-400/50 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-sm shadow-amber-950/40"
                        title="التثبيت بحاقن التدفق المباشر لبايسمكس (Desay SV Pipe-Stream)"
                      >
                        <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span>تدفق Desay SV Pipe-Stream</span>
                      </button>

                      <button
                        onClick={() => onInstallSingle(item, 'auto')}
                        disabled={isInstalling || !isConnected}
                        className="text-[11px] font-bold text-cyan-200 bg-cyan-950/80 hover:bg-cyan-900/80 border border-cyan-400/50 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-sm shadow-cyan-950/40"
                        title="إعادة التثبيت بالوضع التلقائي الذكي"
                      >
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        <span>الوضع التلقائي المتكيف</span>
                      </button>

                        <button
                        onClick={() => onInstallSingle(item, 'stream_session')}
                        disabled={isInstalling || !isConnected}
                        className="text-[11px] font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                        title="التثبيت عبر جلسة الحزم المتدفقة المباشرة"
                      >
                        <ShieldAlert className="w-3 h-3" />
                        <span>جلسة الحزم المتدفقة</span>
                      </button>

                      {item.packageName && onExposeApp && (
                        <button
                          onClick={() => onExposeApp(item.packageName!)}
                          disabled={!isConnected}
                          className="text-[11px] font-semibold text-amber-300 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          title="إذا كان التطبيق مثبتاً بالفعل لكنه مخفي، اضغط هنا لإظهاره"
                        >
                          <Eye className="w-3 h-3 text-amber-400" />
                          <span>إظهار في الشاشة</span>
                        </button>
                      )}
                    </div>
                  )}

                  {item.status === 'idle' && (
                    <button
                      onClick={() => onInstallSingle(item, selectedMethod)}
                      disabled={isInstalling || !isConnected}
                      className="text-[11px] font-semibold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>تثبيت</span>
                    </button>
                  )}

                  <button
                    onClick={() => onRemoveApk(item.id)}
                    disabled={isInstalling && (item.status === 'uploading' || item.status === 'installing')}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                    title="حذف من القائمة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress bar when uploading/installing */}
              {(item.status === 'uploading' || item.status === 'installing') && (
                <div className="mt-2.5">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>{item.status === 'uploading' ? 'جاري نقل وبث البيانات...' : 'جاري التثبيت على شاشة السيارة...'}</span>
                    <span className="font-mono font-bold text-cyan-400">{item.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-purple-500 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${Math.max(5, item.progress)}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Error message box if failed */}
              {item.status === 'error' && item.errorMessage && (
                <div className="mt-2 text-xs bg-rose-950/50 border border-rose-500/40 rounded-lg p-2.5 text-rose-200 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-rose-300">سبب الخطأ: </span>
                      <span>{item.errorMessage}</span>
                    </div>
                  </div>

                  {(item.errorMessage.toLowerCase().includes('restriction') ||
                    item.errorMessage.toLowerCase().includes('user restricted') ||
                    item.errorMessage.includes('قيود') ||
                    item.errorMessage.includes('أوامر pm')) && (
                    <div className="mr-6 bg-rose-900/40 border border-rose-500/30 rounded-lg p-2 flex items-center justify-between flex-wrap gap-2 text-[11px]">
                      <span className="text-cyan-300 font-medium">
                        💡 رفض النظام التثبيت. استخدم حزمة معتمدة من Jetour ووافق على طلب التثبيت من شاشة السيارة.
                      </span>
                      <button
                        onClick={() => onInstallSingle(item, 'stream_session')}
                        disabled={isInstalling || !isConnected}
                        className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Zap className="w-3 h-3 fill-current" />
                        <span>إعادة المحاولة بجلسة الحزم المتدفقة</span>
                      </button>
                    </div>
                  )}

                  {(item.errorMessage.toLowerCase().includes('abort') ||
                    item.errorMessage.includes('شاشة السيارة') ||
                    item.errorMessage.includes('زر (تثبيت)')) && (
                    <div className="mr-6 bg-amber-950/50 border border-amber-500/40 rounded-lg p-2.5 flex items-center justify-between flex-wrap gap-2 text-[11px]">
                      <span className="text-amber-200 font-medium">
                        🚗 نظام السيارة يمنع التثبيت المباشر. يُنصح بتجربة محرك GtInstall المستقل.
                      </span>
                      <button
                        onClick={() => onInstallSingle(item, 'app_process_gt')}
                        disabled={isInstalling || !isConnected}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current text-amber-200" />
                        <span>تشغيل محرك GtInstall</span>
                      </button>
                    </div>
                  )}

                  {onOpenCarFileManager && (
                    <div className="mr-6 bg-blue-950/40 border border-blue-500/30 rounded-lg p-2.5 flex items-center justify-between flex-wrap gap-2 text-[11px]">
                      <div className="text-blue-200">
                        <span className="font-bold">📁 ملف البرنامج تم حفظه مسبقاً في مجلد التحميلات (Download) بشاشة سيارتك:</span>
                        <p className="text-slate-300 mt-0.5">يمكنك فتح مدير الملفات في شاشة السيارة بنقرة واحدة وتثبيته مباشرة بأمان تام بدون أي أخطاء.</p>
                      </div>
                      <button
                        onClick={onOpenCarFileManager}
                        disabled={!isConnected}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow shrink-0"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>فتح مجلد التحميلات بشاشة السيارة الآن</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Success launcher visibility helper notice */}
              {item.status === 'success' && (
                <div className="mt-2.5 text-xs bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2.5 text-slate-300 flex items-start gap-2.5">
                  <Tv className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold text-emerald-300">هل التطبيق لا يظهر في شاشة السيارة أو قائمة البرامج؟ </span>
                    <span>
                      تحديثات أنظمة السيارات الأخيرة (Android 11+ و Desay SV و Geely و Haval) قد تحجب واجهتها الأصلية التطبيقات الخارجية من شاشة العرض، رغم اكتمال تثبيتها في النظام.
                      يمكنك الضغط على زر <strong className="text-white">"تشغيل على الشاشة"</strong> لفتحه مباشرة، أو تثبيت تطبيق <strong className="text-cyan-300">Car Launcher Pro</strong> أو مشغل تطبيقات بديل للوصول لكافة البرامج المثبتة بحرية.
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
