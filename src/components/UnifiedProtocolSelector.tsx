import React from 'react';
import { InstallMethod } from '../types';
import { 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  Tv, 
  Layers, 
  Cpu, 
  FolderOpen, 
  Radio, 
  Flame, 
  Check, 
  Unlock, 
  FolderCheck, 
  LayoutGrid,
  Settings2
} from 'lucide-react';

interface UnifiedProtocolSelectorProps {
  selectedMethod: InstallMethod;
  onSelectMethod: (method: InstallMethod) => void;
  isConnected: boolean;
  onUnlockRestrictions?: () => void;
  onOpenCarFileManager?: () => void;
  onExposeAllApps?: () => void;
}

export interface ProtocolOption {
  id: InstallMethod;
  name: string;
  badge: string;
  badgeColor: string;
  desc: string;
  recommendedFor?: string;
  icon: React.ReactNode;
}

export const PROTOCOLS_LIST: ProtocolOption[] = [
  {
    id: 'auto',
    name: 'المحرك التلقائي الذكي المتكيف لشاشات السيارات (Smart Automotive Engine)',
    badge: 'تخطي ذكي صامت 100% بدون نقر',
    badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    desc: 'المحرك الأحدث والأذكى لشاشات السيارات: يختبر النظام ويفك القيود تلقائياً ويتجاوز حظر السيارة عبر تسلسل ذكي صامت (جلسة الحزم المتدفقة ← محرك GtInstall الجافا المستقل ← بروفايل المستخدم النشط ← بث المصنع المباشر) بدون أي نقر على الشاشة نهائياً.',
    recommendedFor: 'الخيار الأضمن والموصى به لجميع شاشات جيتور T2 وشيري وديساي المقفلة',
    icon: <Sparkles className="w-4 h-4 text-emerald-400" />
  },
  {
    id: 'stream_session',
    name: 'جلسة الحزم المتدفقة المباشرة (Direct Streaming Package Session)',
    badge: 'تخطي قيود التخزين و FUSE',
    badgeColor: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    desc: 'بث حزمة APK مباشرة إلى جلسة مثبت النظام (cmd package / install-write) بدون حفظ مؤقت على قرص السيارة وبدون استدعاء صلاحيات محظورة تثير SecurityException.',
    recommendedFor: 'شاشات Jetour و Chery التي تمنع الكتابة على /data/local/tmp أو تقيد التخزين',
    icon: <ShieldCheck className="w-4 h-4 text-cyan-400" />
  },
  {
    id: 'app_process_gt',
    name: 'محرك الجافا المستقل (Automotive app_process / GtInstall)',
    badge: 'تجاوز فلتر Shell الداخلي',
    badgeColor: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    desc: 'تشغيل runtime الجافا في أندرويد عبر app_process وحزمة g.jar للاتصال المباشر بخدمة IPackageManager عبر Binder IPC، متجاوزاً قيود سكربت pm المحظور في سيارات جيتور.',
    recommendedFor: 'شاشات جيتور T2 المقفلة برمجياً التي ترفض أوامر تثبيت Shell',
    icon: <Zap className="w-4 h-4 text-indigo-400" />
  },
  {
    id: 'active_user',
    name: 'تثبيت المستخدم النشط لشاشات السيارات (Active Car User Protocol)',
    badge: 'استهداف بروفايل السائق 10 و 0',
    badgeColor: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    desc: 'استهداف معرف المستخدم الفعلي لواجهة القيادة (User 10 أو current) في Android Automotive، مع فك قيود no_install_apps وتثبيت الحزمة وتفعيلها مباشرة لواجهة الشاشة.',
    recommendedFor: 'الشاشات التي تعطي INSTALL_FAILED_USER_RESTRICTED أو التي لا تظهر فيها التطبيقات بعد التثبيت',
    icon: <Flame className="w-4 h-4 text-rose-400" />
  },
  {
    id: 'desay_broadcast',
    name: 'حاقن بث المصنع المباشر (Desay SV / Chery Factory Broadcast)',
    badge: 'بث مباشر لفيرموير الشاشة',
    badgeColor: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    desc: 'إرسال إشارات البث الرسمية المدمجة في فيرموير Desay SV و Chery لطلب التثبيت الصامت عبر خدمة النظام الداخلية دون تدخل من المستخدم.',
    recommendedFor: 'شاشات Desay SV و Geely و Chery بأنظمتها المصنعية الأصلية',
    icon: <Radio className="w-4 h-4 text-teal-400" />
  },
  {
    id: 'download_staging',
    name: 'الإيداع بمجلد التحميلات ومدير الملفات (Car Storage Staging & File Manager)',
    badge: 'حفظ فوري في /sdcard/Download',
    badgeColor: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    desc: 'نسخ الحزمة بصلاحيات كاملة إلى مجلد التحميلات بالسيارة، وتسجيلها في وسائط أندرويد، وتشغيل مدير الملفات لتصفح وتثبيت الحزمة بكل سهولة.',
    recommendedFor: 'الوصول اليدوي الآمن وتثبيت التطبيقات عبر فلاشة التخزين أو مدير الملفات',
    icon: <FolderOpen className="w-4 h-4 text-blue-400" />
  },
  {
    id: 'root_su',
    name: 'الحقن المباشر بصلاحيات الروت (Direct Root su Injection)',
    badge: 'صلاحيات الروت المطلقة',
    badgeColor: 'bg-red-500/15 text-red-300 border-red-500/30',
    desc: 'تحويل SELinux إلى وضع Permissive وتثبيت الحزمة بأعلى صلاحيات النظام (su 0). في حال عدم توفر الروت يتم تنبيهك بوضوح.',
    recommendedFor: 'الشاشات المفتوحة الحماية أو المعدلة بامتيازات الروت',
    icon: <Cpu className="w-4 h-4 text-red-400" />
  },
];

export const UnifiedProtocolSelector: React.FC<UnifiedProtocolSelectorProps> = ({
  selectedMethod,
  onSelectMethod,
  isConnected,
  onUnlockRestrictions,
  onOpenCarFileManager,
  onExposeAllApps,
}) => {
  const currentProto = PROTOCOLS_LIST.find((p) => p.id === selectedMethod) || PROTOCOLS_LIST[0];

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 via-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Settings2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              إدارة بروتوكولات التثبيت الموحدة (Universal Protocols)
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-700/50 text-cyan-400">
                مشترك لجميع الحزم ورفع APK
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              حدد بروتوكول التثبيت الذي سيُعتمد لجميع العمليات (تثبيت الحزم الجاهزة الـ12 ورفع ملفات APK المخصصة).
            </p>
          </div>
        </div>

        {/* Quick Automotive System Tools */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {onUnlockRestrictions && (
            <button
              type="button"
              onClick={onUnlockRestrictions}
              disabled={!isConnected}
              className="text-[11px] px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
              title="فك قيود تثبيت التطبيقات ومصادر التثبيت الخارجية"
            >
              <Unlock className="w-3.5 h-3.5 text-amber-400" />
              <span>فك قيود التثبيت</span>
            </button>
          )}

          {onOpenCarFileManager && (
            <button
              type="button"
              onClick={onOpenCarFileManager}
              disabled={!isConnected}
              className="text-[11px] px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
              title="فتح مدير الملفات بشاشة السيارة"
            >
              <FolderCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>مدير ملفات السيارة</span>
            </button>
          )}

          {onExposeAllApps && (
            <button
              type="button"
              onClick={onExposeAllApps}
              disabled={!isConnected}
              className="text-[11px] px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
              title="تفعيل وإظهار كافة التطبيقات في شاشة السيارة"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
              <span>إظهار التطبيقات</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Select Dropdown */}
      <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1">
            <label htmlFor="master-protocol-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
              اختر البروتوكول المعتمد للنظام:
            </label>
            <div className="relative">
              <select
                id="master-protocol-select"
                value={selectedMethod}
                onChange={(e) => onSelectMethod(e.target.value as InstallMethod)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-cyan-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer appearance-none"
              >
                {PROTOCOLS_LIST.map((proto) => (
                  <option key={proto.id} value={proto.id} className="bg-slate-900 text-slate-100 py-1">
                    {proto.name} — [{proto.badge}]
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* Active Protocol Badge */}
          <div className="flex items-center gap-2 self-start md:self-end pt-1">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-750">
              <div className="p-1 rounded-lg bg-slate-800 border border-slate-700">
                {currentProto.icon}
              </div>
              <div className="text-right">
                <span className="block text-[10px] text-slate-400 font-mono">البروتوكول الفعّال حالياً:</span>
                <span className="text-xs font-bold text-slate-100 truncate max-w-[220px] inline-block">
                  {currentProto.name.split('(')[0].trim()}
                </span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${currentProto.badgeColor}`}>
                {currentProto.badge}
              </span>
            </div>
          </div>
        </div>

        {/* Selected Protocol Explanation Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/30 border border-slate-800 rounded-xl p-3 flex items-start gap-2.5">
          <div className="mt-0.5 shrink-0">
            {currentProto.icon}
          </div>
          <div className="text-xs space-y-1">
            <p className="text-slate-300 leading-relaxed font-normal">
              {currentProto.desc}
            </p>
            {currentProto.recommendedFor && (
              <p className="text-[11px] text-cyan-400/90 font-mono">
                💡 <span className="text-slate-400">مناسب لـ:</span> {currentProto.recommendedFor}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
