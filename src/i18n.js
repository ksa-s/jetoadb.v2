export const translations = {
    ar: {
        selectModel: "اختر موديل السيارة",
        connect: "الاتصال بالجهاز",
        connectBtn: "اتصال",
        disconnectBtn: "قطع الاتصال",
        deviceModel: "الموديل:",
        uploadApk: "رفع ملفات APK",
        dropText: "اسحب الملفات هنا أو انقر للاختيار",
        installBtn: "تثبيت",
        verifyGrants: "التحقق من الأذونات",
        signing: "جارٍ التوقيع...",
        signed: "تم التوقيع",
        signFailed: "فشل التوقيع",
        terminal: "سجل العمليات",
        connected: "تم الاتصال",
        disconnected: "تم قطع الاتصال",
        installing: "جارٍ التثبيت",
        installed: "تم التثبيت بنجاح",
        failed: "فشل التثبيت",
        helperInstalling: "التثبيت العادي رُفض. أجرب المثبت الاحتياطي...",
        helperSuccess: "تم التثبيت بنجاح عبر المثبت الاحتياطي",
        helperFailed: "فشل المثبت الاحتياطي",
        selectModelFirst: "اختر موديل السيارة أولاً",
        noApkSelected: "لم تختر أي ملف APK",
        // إدارة التطبيقات
        userApps: "التطبيقات المثبّتة",
        systemApps: "تطبيقات النظام",
        refresh: "🔄 تحديث",
        loadingApps: "جارٍ تحميل التطبيقات...",
        noApps: "لا توجد تطبيقات",
        grant: "منح الأذونات",
        launch: "تشغيل",
        export: "تصدير",
        uninstall: "حذف",
        confirmUninstall: "هل أنت متأكد من حذف هذا التطبيق؟",
        systemAppWarning: "تحذير: هذا تطبيق نظام. حذفه قد يُعطّل السيارة!",
        grantedSuccess: "تم منح الأذونات",
        launched: "تم التشغيل",
        exported: "تم التصدير إلى Download",
        uninstalled: "تم الحذف",
    },
    en: {
        selectModel: "Select Car Model",
        connect: "Connect to Device",
        connectBtn: "Connect",
        disconnectBtn: "Disconnect",
        deviceModel: "Model:",
        uploadApk: "Upload APK Files",
        dropText: "Drag files here or click to select",
        installBtn: "Install",
        terminal: "Operation Log",
        connected: "Connected",
        disconnected: "Disconnected",
        installing: "Installing",
        installed: "Installed successfully",
        failed: "Install failed",
        helperInstalling: "Standard install rejected. Trying helper installer...",
        helperSuccess: "Installed successfully via helper",
        helperFailed: "Helper installer failed",
        selectModelFirst: "Select a car model first",
        noApkSelected: "No APK selected",
        // Apps Management
        userApps: "Installed Apps",
        systemApps: "System Apps",
        refresh: "🔄 Refresh",
        loadingApps: "Loading apps...",
        noApps: "No apps found",
        grant: "Grant Permissions",
        launch: "Launch",
        export: "Export",
        uninstall: "Uninstall",
        confirmUninstall: "Are you sure you want to uninstall this app?",
        systemAppWarning: "Warning: This is a system app. Uninstalling may break the car!",
        grantedSuccess: "Permissions granted",
        launched: "Launched",
        exported: "Exported to Download",
        uninstalled: "Uninstalled",
    }
};

let currentLang = 'ar';

export function setLang(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
    const btn = document.getElementById('langToggle');
    if (btn) btn.textContent = lang === 'ar' ? 'EN' : 'ع';
}

export function t(key) {
    return translations[currentLang][key] || key;
}

export function getLang() {
    return currentLang;
}
