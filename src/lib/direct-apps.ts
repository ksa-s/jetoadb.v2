import { Adb } from '@yume-chan/adb';
import { ApkInstaller } from './adb/apk-installer';
import { InstallMethod } from '../types';

export interface DirectAppItem {
  id: string;
  name: string;
  nameAr: string;
  category: 'system' | 'navigation' | 'media' | 'utilities';
  description: string;
  fileName: string;
  fileUrl: string;
  approxSizeMb: number;
  packageName: string;
  badge?: string;
  badgeColor?: string;
  accentColor?: string;
  requiresMicroG?: boolean;
  rebootRequired?: boolean;
  postInstall?: string[];
  note?: string;
}

export const DIRECT_CAR_APPS: DirectAppItem[] = [
  {
    id: 'garagesplit',
    name: 'GarageSplit',
    nameAr: 'مقسم الشاشة وقائمة التطبيقات العائمة (GarageSplit)',
    category: 'system',
    description: 'حل مشكلة إخفاء التطبيقات في واجهة جيتور T2 الأصلية! يوفر أيقونة عائمة على حافة الشاشة لفتح وتشغيل كافة التطبيقات المثبتة وتقسيم الشاشة لنصفين (خريطة وموسيقى معاً).',
    fileName: 'garagesplit.apk',
    fileUrl: '/apks/bundle/garagesplit.apk',
    approxSizeMb: 0.1,
    packageName: 'com.garagetool.split',
    badge: 'حل مشكلة القائمة الرئيسية',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    accentColor: 'emerald',
    rebootRequired: true,
    postInstall: [
      'settings put global enable_freeform_support 1',
      'settings put global force_resizable_activities 1',
      'settings put global hidden_api_policy 1',
      'pm grant com.garagetool.split android.permission.WRITE_SECURE_SETTINGS',
      'appops set com.garagetool.split SYSTEM_ALERT_WINDOW allow',
      'am broadcast -n com.garagetool.split/.BootReceiver -a android.intent.action.QUICKBOOT_POWERON --include-stopped-packages',
    ],
    note: 'ملاحظة: هذا التطبيق أساسي لشاشات جيتور T2 ليسمح لك بالوصول لكافة التطبيقات المثبتة بضغطة زر عائمة.',
  },
  {
    id: 'garagehelper',
    name: 'Garage Tool Helper',
    nameAr: 'مساعد Garage Tool (فحص الأذونات وتفعيل وضع المالك)',
    category: 'system',
    description: 'فحص الأذونات الناقصة وتفعيل وضع مالك الجهاز لفتح كافة صلاحيات النظام وتجاوز قيود الأمان في شاشات جيتور T2.',
    fileName: 'garagehelper.apk',
    fileUrl: '/apks/bundle/garagehelper.apk',
    approxSizeMb: 0.1,
    packageName: 'com.garagetool.helper',
    badge: 'أساسي للنظام',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    accentColor: 'indigo',
    postInstall: [
      'pm grant com.garagetool.helper android.permission.WRITE_SECURE_SETTINGS',
      'dpm set-device-owner com.garagetool.helper/.AdminReceiver',
    ],
  },
  {
    id: 'cx_file_explorer',
    name: 'CX File Explorer',
    nameAr: 'مدير الملفات وتشغيل البرامج (CX File Explorer)',
    category: 'utilities',
    description: 'مدير ملفات متكامل يسمح لك بتصفح الفلاشات USB، تثبيت التطبيقات، ويحتوي على قسم خاص بالبرامج (Apps) يعرض كل التطبيقات المثبتة ويشغلها فوراً.',
    fileName: 'cx-file-explorer.apk',
    fileUrl: '/apks/bundle/cx-file-explorer.apk',
    approxSizeMb: 18,
    packageName: 'com.cxinventor.file.explorer',
    badge: 'مشغل التطبيقات والفلاشات',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    accentColor: 'blue',
    postInstall: [
      'appops set com.cxinventor.file.explorer REQUEST_INSTALL_PACKAGES allow',
      'appops set com.cxinventor.file.explorer MANAGE_EXTERNAL_STORAGE allow',
      'pm grant com.cxinventor.file.explorer android.permission.READ_EXTERNAL_STORAGE',
      'pm grant com.cxinventor.file.explorer android.permission.WRITE_EXTERNAL_STORAGE',
      'settings put global block_untrusted_touches 0',
    ],
  },
  {
    id: 'yandex_navigator',
    name: 'Yandex Navigator',
    nameAr: 'ياندكس نافيجيتور (خرائط وملاحة حية مع كشف المسارات)',
    category: 'navigation',
    description: 'تطبيق الملاحة والخرائط الدقيقة مع التوجيه الصوتي، حركة المرور المباشرة، مع فتح صلاحيات الموقع والتخزين بالكامل لشاشات السيارات.',
    fileName: 'yandex-navigator.apk',
    fileUrl: '/apks/bundle/yandex-navigator.apk',
    approxSizeMb: 256,
    packageName: 'ru.yandex.yandexnavi',
    badge: 'ملاحة وخرائط',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    accentColor: 'amber',
    postInstall: [
      'pm grant ru.yandex.yandexnavi android.permission.ACCESS_FINE_LOCATION',
      'pm grant ru.yandex.yandexnavi android.permission.READ_EXTERNAL_STORAGE',
      'pm grant ru.yandex.yandexnavi android.permission.WRITE_EXTERNAL_STORAGE',
      'pm grant ru.yandex.yandexnavi android.permission.ACCESS_COARSE_LOCATION',
      'pm grant ru.yandex.yandexnavi android.permission.ACCESS_BACKGROUND_LOCATION',
      'settings put secure location_mode 3',
    ],
  },
  {
    id: 'yandex_music',
    name: 'Yandex Music',
    nameAr: 'ياندكس ميوزك (مشغل الموسيقى والبودكاست)',
    category: 'media',
    description: 'مشغل الموسيقى والبودكاست المتوافق تماماً مع أزرار مقود السيارة وتشغيل المقاطع بجودة صوت نقية.',
    fileName: 'yandex-music.apk',
    fileUrl: '/apks/bundle/yandex-music.apk',
    approxSizeMb: 45,
    packageName: 'ru.yandex.music',
    badge: 'صوتيات وموسيقى',
    badgeColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    accentColor: 'yellow',
    postInstall: [
      'pm grant ru.yandex.music android.permission.READ_EXTERNAL_STORAGE',
      'pm grant ru.yandex.music android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  {
    id: 'vk_video',
    name: 'VK Video',
    nameAr: 'فيديوهات VK (مشغل الفيديو والمقاطع عبر الإنترنت)',
    category: 'media',
    description: 'مشاهدة مقاطع الفيديو والأفلام عبر الإنترنت بجودة عالية على شاشة السيارة.',
    fileName: 'vk-video.apk',
    fileUrl: '/apks/bundle/vk-video.apk',
    approxSizeMb: 150,
    packageName: 'com.vk.video',
    badge: 'فيديو وسينما',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    accentColor: 'sky',
  },
  {
    id: 'replaio',
    name: 'Replaio Radio',
    nameAr: 'راديو الإنترنت Replaio (محطات الراديو العالمية)',
    category: 'media',
    description: 'استماع لمحطات الراديو العربية والعالمية عبر الإنترنت بصوت رقمي نقي وبدون تشويش ترددات FM.',
    fileName: 'replaio.apk',
    fileUrl: '/apks/bundle/replaio.apk',
    approxSizeMb: 40,
    packageName: 'com.replaio.radio',
    badge: 'راديو إنترنت',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    accentColor: 'purple',
  },
  {
    id: 'hud_speed_pro',
    name: 'HUD Speed Pro',
    nameAr: 'كاشف الرادارات والسرعة (HUD Speed Pro)',
    category: 'navigation',
    description: 'تنبيه كاميرات ساهر والسرعة وتجاوز الإشارة مع نافذة رقمية عائمة فوق خرائط الملاحة.',
    fileName: 'hud-speed-pro.apk',
    fileUrl: '/apks/bundle/hud-speed-pro.apk',
    approxSizeMb: 12,
    packageName: 'air.StrelkaHUDFREE',
    badge: 'تنبيه الرادارات',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    accentColor: 'red',
    postInstall: [
      'pm grant air.StrelkaHUDFREE android.permission.ACCESS_FINE_LOCATION',
      'pm grant air.StrelkaHUDFREE android.permission.ACCESS_COARSE_LOCATION',
      'pm grant air.StrelkaHUDFREE android.permission.ACCESS_BACKGROUND_LOCATION',
      'appops set air.StrelkaHUDFREE SYSTEM_ALERT_WINDOW allow',
      'settings put secure location_mode 3',
    ],
  },
  {
    id: 'garageremote',
    name: 'GarageRemote',
    nameAr: 'متحكم أزرار الدركسون وعجلة القيادة (GarageRemote)',
    category: 'system',
    description: 'تفعيل أزرار عجلة القيادة (المقود) لتقليب الأغاني ورفع/خفض الصوت والتحكم بالتشغيل مباشرة.',
    fileName: 'garageremote.apk',
    fileUrl: '/apks/bundle/garageremote.apk',
    approxSizeMb: 0.1,
    packageName: 'com.garage.yamusic',
    badge: 'أزرار الدركسون',
    badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    accentColor: 'teal',
    rebootRequired: true,
    postInstall: [
      'cmd notification allow_listener com.garage.yamusic/com.garage.yamusic.YaNotificationListener',
      'dumpsys deviceidle whitelist +com.garage.yamusic',
      'pm grant com.garage.yamusic android.permission.READ_LOGS',
      'monkey -p com.garage.yamusic -c android.intent.category.LAUNCHER 1',
      'am start-foreground-service com.garage.yamusic/.OverlayService',
    ],
    note: 'ملاحظة: بعد تثبيت هذا التطبيق، يجب إعادة تشغيل السيارة (إطفاء المحرك والشاشة ثم التشغيل) لتبدأ أزرار المقود بالعمل.',
  },
  {
    id: 'youtube_revanced',
    name: 'YouTube ReVanced',
    nameAr: 'يوتيوب فانسد المطور (YouTube ReVanced)',
    category: 'media',
    description: 'يوتيوب بدون إعلانات نهائياً مع ميزة التشغيل في الخلفية والشاشة مطفأة، ميزة تجاوز مقاطع الرعاة SponsorBlock، والتحكم باللمس.',
    fileName: 'youtube_revanced.apk',
    fileUrl: '/apks/youtube_revanced.apk',
    approxSizeMb: 117,
    packageName: 'app.revanced.android.youtube',
    badge: 'بدون إعلانات',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    accentColor: 'rose',
    requiresMicroG: true,
  },
  {
    id: 'microg',
    name: 'Vanced MicroG',
    nameAr: 'مايكرو سيرفس فانسد (Vanced MicroG)',
    category: 'utilities',
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
    id: 'smart_tube',
    name: 'SmartTube Car Edition',
    nameAr: 'يوتيوب شاشات السيارات الذكي (SmartTube)',
    category: 'media',
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
];

/**
 * Downloads a pre-configured car application with live progress and installs it directly
 * onto the connected car head unit using the Jetour T2 GtInstall engine.
 */
export async function downloadAndInstallCarApp(
  adb: Adb,
  app: DirectAppItem,
  onProgress?: (progress: number, stage: 'downloading' | 'uploading' | 'installing' | 'processing', message?: string) => void,
  onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
  installMethod: InstallMethod = 'auto'
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

    // Install using universal Auto method (or specified protocol)
    const result = await ApkInstaller.installApk(
      adb,
      file,
      installMethod,
      (prog, stage, msg) => {
        onProgress?.(prog, stage, msg);
      },
      onLog,
      app.packageName
    );

    if (result.success && app.postInstall && app.postInstall.length > 0) {
      onLog?.(`تطبيق الإعدادات ومنح الصلاحيات التلقائية لشاشة السيارة (${app.nameAr})...`, 'info');
      for (const cmd of app.postInstall) {
        try {
          await ApkInstaller.execShell(adb, cmd);
        } catch {}
      }
      onLog?.(`تم منح الصلاحيات الخاصة وتفعيل خدمة ${app.nameAr} بنجاح.`, 'success');
    }

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
