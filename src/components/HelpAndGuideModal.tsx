import React from 'react';
import { 
  X, 
  HelpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Usb, 
  Sparkles, 
  Terminal, 
  ShieldAlert,
  Car
} from 'lucide-react';

interface HelpAndGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpAndGuideModal: React.FC<HelpAndGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">دليل حل المشاكل وتثبيت تطبيقات السيارات</h3>
              <p className="text-xs text-slate-400">شرح خطأ Socket open failed وطرق التثبيت الصحيحة لشاشات السيارات</p>
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
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed">
          
          {/* Card 1: The exact error explanation */}
          <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-2">
            <h4 className="font-bold text-sm text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              لماذا كان يظهر خطأ "Socket open failed" في الرفع والتثبيت؟
            </h4>
            <p className="text-slate-300">
              شاشات وكمبيوتر السيارات الحديثة (مثل جيتور Jetour، جيلي Geely، هافال، و Android Automotive) تفرض حماية صارمة تمنع بروتوكول <code>sync:</code> من كتابة ملفات داخل المجلد المؤقت <code>/data/local/tmp/</code>، مما كان يؤدي لفشل القناة وظهور خطأ <strong>Socket open failed</strong> وتعليق اتصال الـ USB.
            </p>
            <div className="mt-2 p-2.5 rounded-lg bg-slate-900/90 border border-amber-500/20 text-slate-200">
              <span className="font-bold text-cyan-400 block mb-1">كيف قمنا بحلها جذرياً في هذا التحديث؟</span>
              <ul className="space-y-1 list-disc list-inside text-[11px] text-slate-300">
                <li>استخدام <strong>البث المباشر (Direct Stream Install)</strong> عبر <code>pm install -S</code> بدون رفع ملف مؤقت على الشاشة نهائياً.</li>
                <li>تفعيل بروتوكول <strong>جلسات الحزم (Package Session)</strong> للملفات الكبيرة مثل Car Launcher.</li>
                <li>إتاحة النسخ المباشر إلى ذاكرة الشاشة العامة <code>/sdcard/Download/</code> كخيار بديل في حال رفض البث المباشر.</li>
              </ul>
            </div>
          </div>

          {/* Card 2: Shell commands tips */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <h4 className="font-bold text-sm text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              لماذا ظهر خطأ <code>adb: inaccessible or not found</code> في موجه الأوامر؟
            </h4>
            <p className="text-slate-300">
              أمر <code>adb</code> هو برنامج يعمل على الكمبيوتر/المتصفح للاتصال بالشاشة. عند كتابة أوامر في خانة "أمر shell مخصص"، أنت موجود بالفعل داخل نظام أندرويد بالسيارة!
            </p>
            <p className="text-slate-400 text-[11px]">
              لذلك تكتب الأوامر مباشرة مثل:
              <br />
              <code className="text-cyan-300 bg-slate-900 px-1.5 py-0.5 rounded font-mono">getprop ro.product.model</code> لعرض موديل الشاشة
              <br />
              <code className="text-cyan-300 bg-slate-900 px-1.5 py-0.5 rounded font-mono">pm list packages -3</code> لعرض التطبيقات الخارجية
              <br />
              <code className="text-cyan-300 bg-slate-900 px-1.5 py-0.5 rounded font-mono">wm size</code> لعرض دقة الشاشة
            </p>
          </div>

          {/* Card 3: Step-by-step for connecting to car */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
            <h4 className="font-bold text-sm text-white flex items-center gap-2">
              <Car className="w-4 h-4 text-indigo-400" />
              خطوات التوصيل الصحيحة بشاشة السيارة:
            </h4>
            <div className="space-y-2 text-[11px]">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 text-cyan-400 flex items-center justify-center font-bold shrink-0">1</span>
                <p>تأكد من تفعيل <strong>خيارات المطور (Developer Options)</strong> و <strong>تصحيح أخطاء USB (USB Debugging)</strong> في إعدادات شاشة السيارة.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 text-cyan-400 flex items-center justify-center font-bold shrink-0">2</span>
                <p>وصل كابل USB بالمنفذ المخصص للبيانات بالسيارة (غالبًا المنفذ الذي يدعم Carplay أو نقل البيانات وليس منفذ الشحن فقط).</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 text-cyan-400 flex items-center justify-center font-bold shrink-0">3</span>
                <p>اضغط زر <strong>"اتصال بشاشة السيارة"</strong> في زاوية الموقع، واختر جهازك من قائمة المتصفح.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 text-cyan-400 flex items-center justify-center font-bold shrink-0">4</span>
                <p>ستظهر نافذة على شاشة السيارة تطلب السماح بالاتصال (Allow USB Debugging)، اضغط <strong>"موافق / Allow"</strong>.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
