import { Adb } from '@yume-chan/adb';
import { ApkInstaller } from './adb/apk-installer';

export interface DirectAppItem {
  id: string;
  name: string;
  nameAr: string;
  category: 'youtube' | 'services' | 'utilities';
  description: string;
  fileName: string;
  fileUrl: string;
  approxSizeMb: number;
  packageName: string;
  badge?: string;
  badgeColor?: string;
  accentColor?: string;
  requiresMicroG?: boolean;
}

export const DIRECT_CAR_APPS: DirectAppItem[] = [
  {
    id: 'youtube_revanced',
    name: 'YouTube ReVanced',
    nameAr: 'يوتيوب فانسد المطور (YouTube ReVanced)',
    category: 'youtube',
    description: 'يوتيوب بدون إعلانات نهائياً مع ميزة التشغيل في الخلفية والشاشة مطفأة، ميزة تجاوز مقاطع الرعاة SponsorBlock، والتحكم باللمس.',
    fileName: 'youtube_revanced.apk',
    fileUrl: '/apks/youtube_revanced.apk',
    approxSizeMb: 117,
    packageName: 'app.revanced.android.youtube',
    badge: 'الأكثر طلباً',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    accentColor: 'rose',
    requiresMicroG: true,
  },
  {
    id: 'smart_tube',
    name: 'SmartTube Car Edition',
    nameAr: 'يوتيوب شاشات السيارات الذكي (SmartTube)',
    category: 'youtube',
    description: 'النسخة الخفيفة والأفضل هندسياً لشاشات السيارات وعجلات القيادة. بدون إعلانات، 4K، خفيفة جداً، وتعمل بكفاءة حتى بدون مايكرو سيرفس.',
    fileName: 'smart_tube.apk',
    fileUrl: '/apks/smart_tube.apk',
    approxSizeMb: 26,
    packageName: 'com.liskovsoft.videomanager',
    badge: 'موصى به للشاشات',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    accentColor: 'amber',
    requiresMicroG: false,
  },
  {
    id: 'microg',
    name: 'Vanced MicroG',
    nameAr: 'مايكرو سيرفس فانسد (Vanced MicroG)',
    category: 'services',
    description: 'حزمة الخدمات الأساسية لربط حساب جوجل وقنواتك وقوائم التشغيل الخاصة بك داخل يوتيوب فانسد بدون الحاجة لخدمات جوجل الرسمية.',
    fileName: 'microg.apk',
    fileUrl: '/apks/microg.apk',
    approxSizeMb: 6.5,
    packageName: 'com.mgoogle.android.gms',
    badge: 'ضروري للحسابات',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    accentColor: 'cyan',
  },
  {
    id: 'gmscore',
    name: 'ReVanced GmsCore',
    nameAr: 'مايكرو سيرفس المتقدم (GmsCore Services)',
    category: 'services',
    description: 'الجيل الأحدث من حزمة خدمات مايكرو سيرفس البديلة، متوافقة مع أحدث إصدارات ReVanced وإدارة أذونات الحسابات والبطارية لشاشات السيارات.',
    fileName: 'gmscore.apk',
    fileUrl: '/apks/gmscore.apk',
    approxSizeMb: 38,
    packageName: 'app.revanced.android.gms',
    badge: 'الجيل الأحدث',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    accentColor: 'emerald',
  },
  {
    id: 'cx_file_explorer',
    name: 'Cx File Explorer',
    nameAr: 'مدير الملفات المتطور (Cx File Explorer)',
    category: 'utilities',
    description: 'مدير ملفات متكامل لقراءة الفلاشات USB، تثبيت التطبيقات، وتصفح مجلدات السيارة، مع منح صلاحيات تثبيت الحزم وإدارة التخزين تلقائياً.',
    fileName: 'cx_file_explorer.apk',
    fileUrl: '/apks/cx_file_explorer.apk',
    approxSizeMb: 18,
    packageName: 'com.cxinventor.file.explorer',
    badge: 'أساسي للنظام',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    accentColor: 'blue',
  },
];

/**
 * Downloads a pre-configured car application with live progress and installs it directly
 * onto the connected car head unit using the Jetour T2 GtInstall engine.
 */
export async function downloadAndInstallCarApp(
  adb: Adb,
  app: DirectAppItem,
  onProgress?: (progress: number, stage: 'downloading' | 'uploading' | 'installing' | 'processing', message?: string) => void,
  onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
): Promise<{ success: boolean; message: string }> {
  onLog?.(`بدء تحميل تطبيق ${app.nameAr} (${app.approxSizeMb} MB)...`, 'info');
  onProgress?.(5, 'downloading', `جاري الاتصال وتحميل ${app.name}...`);

  try {
    const response = await fetch(app.fileUrl);
    if (!response.ok) {
      throw new Error(`فشل تحميل ملف التطبيق من الخادم (HTTP ${response.status})`);
    }

    const contentLength = Number(response.headers.get('Content-Length')) || app.approxSizeMb * 1024 * 1024;
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error('تعذر قراءة مسار التنزيل المتدفق.');
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        const pct = Math.min(98, Math.round((receivedBytes / contentLength) * 100));
        const mb = (receivedBytes / (1024 * 1024)).toFixed(1);
        const totalMb = (contentLength / (1024 * 1024)).toFixed(1);
        onProgress?.(pct, 'downloading', `جاري التنزيل: ${mb} / ${totalMb} MB (${pct}%)...`);
      }
    }

    // Merge chunks
    const fullBuffer = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      fullBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    onLog?.(`اكتمل تحميل ${app.name} (${(receivedBytes / (1024 * 1024)).toFixed(1)} MB). جاري الرفع والتثبيت على شاشة السيارة...`, 'success');
    onProgress?.(100, 'uploading', 'تم التنزيل بنجاح، جاري الرفع للشاشة...');

    // Wrap into File object
    const file = new File([fullBuffer], app.fileName, {
      type: 'application/vnd.android.package-archive',
    });

    // Install using universal Auto method (which uses GtInstall app_process helper for Jetour T2)
    const result = await ApkInstaller.installApk(
      adb,
      file,
      'auto',
      (prog, stage, msg) => {
        onProgress?.(prog, stage, msg);
      },
      onLog,
      app.packageName
    );

    return result;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    onLog?.(`خطأ أثناء معالجة تطبيق ${app.nameAr}: ${errMsg}`, 'error');
    return {
      success: false,
      message: errMsg,
    };
  }
}
