import "./style.css";
import { AdbInstaller } from "./installer.js";
import { setLang, t, getLang } from "./i18n.js";

// ================================================================
//  🔐 إعدادات تسجيل الدخول — غيّرها هنا بسهولة
// ================================================================
const AUTH = {
    username: "admin",
    password: "samsoft2025",
    storageKey: "ss_auth_v1",     // مفتاح التخزين في localStorage
};

// ================================================================
//  Login Logic
// ================================================================
const loginOverlay = document.getElementById("loginOverlay");
const loginBtn     = document.getElementById("loginBtn");
const loginUser    = document.getElementById("loginUser");
const loginPass    = document.getElementById("loginPass");
const loginErr     = document.getElementById("loginErr");
const logoutBtn    = document.getElementById("logoutBtn");

function checkAuth() {
    return localStorage.getItem(AUTH.storageKey) === "1";
}

function showLogin()  { loginOverlay.classList.remove("hidden"); }
function hideLogin()  { loginOverlay.classList.add("hidden"); }

function doLogin() {
    const u = loginUser.value.trim();
    const p = loginPass.value;
    if (u === AUTH.username && p === AUTH.password) {
        localStorage.setItem(AUTH.storageKey, "1");
        loginErr.hidden = true;
        loginOverlay.classList.add("fade-out");
        setTimeout(hideLogin, 400);
    } else {
        loginErr.hidden = false;
        loginPass.value = "";
        loginPass.focus();
        loginOverlay.querySelector(".login-card").classList.add("shake");
        setTimeout(() => loginOverlay.querySelector(".login-card").classList.remove("shake"), 500);
    }
}

function doLogout() {
    localStorage.removeItem(AUTH.storageKey);
    // قطع الاتصال إن وُجد
    if (installer) installer.disconnect().catch(() => {});
    installer = null;
    showLogin();
    loginOverlay.classList.remove("fade-out", "hidden");
    loginUser.value = "";
    loginPass.value = "";
    loginErr.hidden = true;
}

// تحقق عند التحميل
if (checkAuth()) { hideLogin(); } else { showLogin(); }

loginBtn.addEventListener("click", doLogin);
loginPass.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
loginUser.addEventListener("keydown", e => { if (e.key === "Enter") loginPass.focus(); });
logoutBtn.addEventListener("click", doLogout);


// ================================================================
//  مكتبة التطبيقات — روابط GitHub Releases مباشرة
// ================================================================
const GH = 'https://github.com/ksa-s/jetoadb.v2/releases/download';

const APP_LIBRARY = [
    {
        id: 'aptoide',
        name: 'Aptoide',         nameAr: 'أبتويد',
        desc: 'متجر تطبيقات بديل — ملايين التطبيقات مجاناً بدون Google Play',
        icon: '🏪', color: '#f59e0b',
        file: `${GH}/aptoide/aptoide.apk`,
        size: '20 MB', category: 'متجر',
    },
    {
        id: 'youtube',
        name: 'YouTube',          nameAr: 'يوتيوب',
        desc: 'تطبيق يوتيوب الرسمي للفيديوهات والبث المباشر',
        icon: '▶', color: '#f87171',
        file: `${GH}/youtube/youtube.apk`,
        size: '—', category: 'ترفيه',
    },
    {
        id: 'drama-live',
        name: 'Drama Live',       nameAr: 'دراما لايف',
        desc: 'مسلسلات وأفلام عربية وأجنبية مباشرة مجاناً',
        icon: '🎬', color: '#c084fc',
        file: `${GH}/drama-live/drama-live.apk`,
        size: '16 MB', category: 'ترفيه',
    },
    {
        id: 'samsung-browser',
        name: 'Samsung Internet', nameAr: 'متصفح سامسونج',
        desc: 'متصفح سريع وآمن مع دعم AdBlock مدمج',
        icon: '🌐', color: '#60a5fa',
        file: `${GH}/Samsung-Internet-Browser/Samsung-Internet-Browser.apk`,
        size: '—', category: 'متصفح',
    },
    {
        id: 'yandex-map',
        name: 'Yandex Maps',      nameAr: 'خرائط يانديكس',
        desc: 'خرائط ملاحة دقيقة تعمل بدون خدمات Google',
        icon: '🗺', color: '#4ade80',
        file: `${GH}/Yandex-Map/Yandex-Map.apk`,
        size: '—', category: 'ملاحة',
    },
    {
        id: 'yandex-keyboard',
        name: 'Yandex Keyboard',  nameAr: 'لوحة يانديكس',
        desc: 'لوحة مفاتيح ذكية تدعم العربية والإنجليزية والروسية',
        icon: '⌨️', color: '#22d3ee',
        file: `${GH}/V1.0.0/yandex-keyboard.apk`,
        size: '76 MB', category: 'إدخال',
    },
    {
        id: 'file-manager',
        name: 'File Manager',     nameAr: 'مدير الملفات',
        desc: 'تصفح وإدارة جميع ملفات الجهاز بالكامل',
        icon: '📁', color: '#fb923c',
        file: `${GH}/file-manager/file-manager.apk`,
        size: '22 MB', category: 'أدوات',
    },
    {
        id: 'back-button',
        name: 'Back Button Anywhere', nameAr: 'زر الرجوع',
        desc: 'إضافة زر رجوع عائم في أي مكان على الشاشة',
        icon: '↩', color: '#a78bfa',
        file: `${GH}/back-button/back-button.apk`,
        size: '7.1 MB', category: 'أدوات',
    },
    {
        id: 'micro-g',
        name: 'MicroG',           nameAr: 'مايكرو جي',
        desc: 'بديل مفتوح المصدر لخدمات Google Play — ضروري لبعض التطبيقات',
        icon: '🤖', color: '#34d399',
        file: `${GH}/micro/micro-g.apk`,
        size: '38 MB', category: 'نظام',
    },
    {
        id: 'system-settings',
        name: 'System Settings',  nameAr: 'إعدادات النظام',
        desc: 'الوصول للإعدادات المتقدمة والمخفية في النظام',
        icon: '⚙️', color: '#94a3b8',
        file: `${GH}/V2/system-settings.apk`,
        size: '2 MB', category: 'نظام',
    },
];

// ================================================================
//  تطبيقات حصرية — تظهر فقط لسيارات ماركة معينة
// ================================================================
const BRAND_EXCLUSIVE = {
    haval: ['system-settings', 'samsung-browser'],   // حصري لهافال فقط
};
const ALL_EXCLUSIVE = new Set(Object.values(BRAND_EXCLUSIVE).flat());

function getAppsForCar(car) {
    const brand   = car ? car.id.split('-')[0] : '';
    const allowed = new Set(BRAND_EXCLUSIVE[brand] || []);
    return APP_LIBRARY.filter(app =>
        !ALL_EXCLUSIVE.has(app.id) || allowed.has(app.id)
    );
}

const CARS = [
    {
        id: 'jetour-t2',
        brand: 'Jetour', model: 'T2',
        img: './cars/jetour-t2.webp',
        protocols: [
            { key: 'jetour-t2-old', label: 'نظام قديم', desc: 'تثبيت مباشر بدون قيود', restricted: false, icon: '✓' },
            { key: 'jetour-t2-new', label: 'نظام جديد', desc: 'محدود — يستخدم المثبت الاحتياطي', restricted: true, icon: '🔒' },
        ],
    },
    {
        id: 'jetour-x70',
        brand: 'Jetour', model: 'X70',
        img: './cars/jetour-x70.avif',
        protocols: [
            { key: 'jetour-x70-old', label: 'نظام قديم', desc: 'تثبيت مباشر بدون قيود', restricted: false, icon: '✓' },
            { key: 'jetour-x70-new', label: 'نظام جديد', desc: 'محدود — يستخدم المثبت الاحتياطي', restricted: true, icon: '🔒' },
        ],
    },
    {
        id: 'geely-monjaro',
        brand: 'Geely', model: 'Monjaro',
        img: './cars/geely-monjaro.png',
        protocols: [
            { key: 'geely-monjaro', label: 'تثبيت مباشر', desc: 'بدون قيود', restricted: false, icon: '✓' },
        ],
    },
    {
        id: 'haval-h6',
        brand: 'Haval', model: 'H6',
        img: './cars/haval-h6.webp',
        protocols: [
            { key: 'haval-h6', label: 'تثبيت مباشر', desc: 'بدون قيود', restricted: false, icon: '✓' },
        ],
    },
    {
        id: 'changan-cs55',
        brand: 'Changan', model: 'CS55 Plus',
        img: './cars/cs55-plus.webp',
        protocols: [
            { key: 'changan-cs55', label: 'تثبيت مباشر', desc: 'بدون قيود', restricted: false, icon: '✓' },
        ],
    },
    {
        id: 'other',
        brand: 'أخرى', model: 'عام',
        img: './cars/other.webp',
        protocols: [
            { key: 'other', label: 'تلقائي', desc: 'يجرب المباشر ثم الاحتياطي', restricted: false, icon: '⚡' },
        ],
    },
];

// إعدادات الموديلات (تُقرأ بواسطة AdbInstaller)
const MODEL_CONFIG = Object.fromEntries(
    CARS.flatMap(car => car.protocols.map(p => [
        p.key,
        {
            restricted: p.restricted,
            hint: p.restricted
                ? `🔒 ${p.label} — سيتم استخدام المثبت الاحتياطي تلقائياً`
                : (car.protocols.length === 1 ? '' : `✓ ${p.label} — التثبيت المباشر مدعوم`),
        }
    ]))
);

// ================================================================
//  عناصر DOM
// ================================================================
const modelSelect     = document.getElementById("modelSelect");
const modelHint       = document.getElementById("modelHint");
const connectBtn      = document.getElementById("connectBtn");
const disconnectBtn   = document.getElementById("disconnectBtn");
const deviceInfo      = document.getElementById("deviceInfo");
const deviceModelText = document.getElementById("deviceModelText");
const dropZone        = document.getElementById("dropZone");
const apkInput        = document.getElementById("apkInput");
const apkList         = document.getElementById("apkList");
const installBtn      = document.getElementById("installBtn");
const terminal        = document.getElementById("terminal");
const langToggle      = document.getElementById("langToggle");
const appsManagerCard = document.getElementById("appsManagerCard");
const carSettingsCard = document.getElementById("carSettingsCard");
const tabUser         = document.getElementById("tabUser");
const tabSystem       = document.getElementById("tabSystem");
const refreshAppsBtn  = document.getElementById("refreshAppsBtn");
const appsList        = document.getElementById("appsList");
const userAppsCount   = document.getElementById("userAppsCount");
const systemAppsCount = document.getElementById("systemAppsCount");
const statusPill      = document.getElementById("statusPill");
const statusLabel     = document.getElementById("statusLabel");
const enableSplitBtn  = document.getElementById("enableSplitBtn");
const detectKeysBtn   = document.getElementById("detectKeysBtn");
const detectBtnLabel  = document.getElementById("detectBtnLabel");
const keysResult      = document.getElementById("keysResult");
const protocolPicker  = document.getElementById("protocolPicker");
const protoOpts       = document.getElementById("protoOpts");
const carGrid         = document.getElementById("carGrid");
// ── مكتبة التطبيقات: نحصل على العنصر أو ننشئه ديناميكياً إذا كان ناقصاً من HTML ──
let appLibraryCard = document.getElementById("appLibraryCard");
let libGrid        = document.getElementById("libGrid");

if (!appLibraryCard) {
    // العنصر مفقود من HTML → ننشئه في JS
    appLibraryCard = document.createElement("section");
    appLibraryCard.className = "panel";
    appLibraryCard.id = "appLibraryCard";
    appLibraryCard.hidden = true;
    appLibraryCard.innerHTML = `
        <div class="section-head">
            <span class="section-title">🏪 مكتبة التطبيقات</span>
            <span class="lib-badge" style="font-size:10px;font-weight:700;padding:3px 8px;
                background:rgba(245,158,11,0.1);color:#f59e0b;
                border:1px solid rgba(245,158,11,0.35);border-radius:100px">جاهزة للتثبيت</span>
        </div>
        <div class="lib-grid" id="libGrid"></div>`;

    // أدرج قبل قسم إدارة التطبيقات
    const anchor = document.getElementById("appsManagerCard")
                || document.getElementById("carSettingsCard")
                || document.querySelector(".panel-terminal");

    const container = document.querySelector("main.content")
                   || document.querySelector("main")
                   || document.querySelector(".shell");

    if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(appLibraryCard, anchor);
    } else if (container) {
        container.appendChild(appLibraryCard);
    }

    libGrid = document.getElementById("libGrid");
}

// ================================================================
//  حالة
// ================================================================
let installer = null;
let selectedFiles = [];
let currentTab = 'user';
let appsCache = { user: [], system: [] };
let selectedCar = null;
let selectedProto = null;

// ================================================================
//  ترجمة
// ================================================================
setLang("ar");
langToggle.addEventListener("click", () => setLang(getLang() === "ar" ? "en" : "ar"));

// ================================================================
//  Terminal
// ================================================================
function log(text, cls) {
    const div = document.createElement("div");
    div.className = "line" + (cls ? " " + cls : "");
    div.textContent = text;
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
}

// ================================================================
//  Status Pill
// ================================================================
function setConnected(model) {
    statusPill.classList.add("connected");
    statusLabel.textContent = model || t("connected");
}
function setDisconnected() {
    statusPill.classList.remove("connected");
    statusLabel.textContent = getLang() === "ar" ? "غير متصل" : "Disconnected";
}

// ================================================================
//  بناء شبكة السيارات
// ================================================================
function buildCarGrid() {
    carGrid.innerHTML = "";
    for (const car of CARS) {
        const card = document.createElement("div");
        card.className = "car-card";
        card.dataset.id = car.id;

        // صورة السيارة
        const imgWrap = document.createElement("div");
        imgWrap.className = "car-img-wrap";

        if (car.img) {
            const img = document.createElement("img");
            img.src = car.img;
            img.alt = `${car.brand} ${car.model}`;
            img.className = "car-img";
            img.loading = "lazy";
            img.onerror = () => {
                imgWrap.classList.add("no-img");
                img.remove();
                imgWrap.innerHTML = `<span class="car-placeholder">🚗</span>`;
            };
            imgWrap.appendChild(img);
        } else {
            imgWrap.classList.add("no-img");
            imgWrap.innerHTML = `<span class="car-placeholder">🚗</span>`;
        }

        // الاسم
        const nameWrap = document.createElement("div");
        nameWrap.className = "car-name-wrap";
        nameWrap.innerHTML = `<span class="car-brand">${car.brand}</span><span class="car-model-label">${car.model}</span>`;

        card.append(imgWrap, nameWrap);
        card.addEventListener("click", () => onCarClick(car));
        carGrid.appendChild(card);
    }
}

function onCarClick(car) {
    selectedCar = car;
    selectedProto = null;
    connectBtn.disabled = true;
    modelHint.textContent = "";

    // تمييز البطاقة
    document.querySelectorAll(".car-card").forEach(c => c.classList.remove("selected"));
    carGrid.querySelector(`[data-id="${car.id}"]`).classList.add("selected");

    // بناء خيارات البروتوكول
    protoOpts.innerHTML = "";
    for (const proto of car.protocols) {
        const btn = document.createElement("button");
        btn.className = `proto-btn ${proto.restricted ? "restricted" : "standard"}`;
        btn.dataset.key = proto.key;
        btn.innerHTML = `
            <span class="proto-icon">${proto.icon}</span>
            <div class="proto-info">
                <span class="proto-name">${proto.label}</span>
                <span class="proto-desc">${proto.desc}</span>
            </div>`;
        btn.addEventListener("click", () => onProtoClick(car, proto, btn));
        protoOpts.appendChild(btn);
    }

    protocolPicker.hidden = false;

    // إعادة بناء المكتبة حسب الماركة الجديدة
    buildLibrary();

    // إذا كان بروتوكول واحد فقط → اختار تلقائياً
    if (car.protocols.length === 1) {
        protoOpts.querySelector(".proto-btn").click();
    }
}

function onProtoClick(car, proto, btn) {
    selectedProto = proto;
    // تحديث الـ select المخفي
    modelSelect.value = proto.key;
    // تمييز الزر
    protoOpts.querySelectorAll(".proto-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    // hint
    const cfg = MODEL_CONFIG[proto.key];
    modelHint.textContent = cfg?.hint || "";
    modelHint.className = proto.restricted ? "field-hint hint-restricted" : "field-hint hint-normal";
    // تفعيل زر الاتصال
    connectBtn.disabled = false;
}

// ================================================================
//  الاتصال
// ================================================================
connectBtn.addEventListener("click", async () => {
    if (!selectedProto) return;
    connectBtn.disabled = true;
    log("$ connecting...", "prompt");

    try {
        const cfg = MODEL_CONFIG[selectedProto.key] || { restricted: false };
        installer = new AdbInstaller(log, {
            installMode: 'pm-shell',
            restrictedMode: cfg.restricted,
        });
        if (cfg.restricted) log(`🔒 وضع تجاوز القيود مُفعَّل`, "warn");

        const info = await installer.connect();
        deviceModelText.textContent = info.model;
        deviceInfo.hidden = false;
        disconnectBtn.hidden = false;
        connectBtn.hidden = true;
        setConnected(info.model);
        log(`${t("connected")}: ${info.model}`, "ok");

        if (appsManagerCard) appsManagerCard.hidden = false;
        if (carSettingsCard) carSettingsCard.hidden = false;
        appLibraryCard.hidden = false;   // مضمون الوجود (مُنشأ ديناميكياً إذا كان ناقصاً)

        loadApps();
    } catch (err) {
        log(`Error: ${err.message}`, "err");
        connectBtn.disabled = false;
    }
});

disconnectBtn.addEventListener("click", async () => {
    if (installer) await installer.disconnect();
    installer = null;
    deviceInfo.hidden = true;
    disconnectBtn.hidden = true;
    connectBtn.hidden = false;
    connectBtn.disabled = !selectedProto;
    if (appsManagerCard) appsManagerCard.hidden = true;
    if (carSettingsCard) carSettingsCard.hidden = true;
    appLibraryCard.hidden = true;
    setDisconnected();
    log(t("disconnected"));
});

// ================================================================
//  رفع APK
// ================================================================
dropZone.addEventListener("click", () => apkInput.click());

apkInput.addEventListener("change", (e) => {
    for (const f of e.target.files) {
        if (f.name.toLowerCase().endsWith(".apk")) selectedFiles.push(f);
    }
    renderApkList();
    apkInput.value = "";
});

dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("drag"); });
dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("drag"));
dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("drag");
    for (const f of e.dataTransfer.files) {
        if (f.name.toLowerCase().endsWith(".apk")) selectedFiles.push(f);
    }
    renderApkList();
});

function renderApkList() {
    apkList.innerHTML = "";
    selectedFiles.forEach((f, i) => {
        const li   = document.createElement("li");
        const span = document.createElement("span");
        span.textContent = `${f.name}  —  ${(f.size / 1024 / 1024).toFixed(1)} MB`;
        const rm   = document.createElement("button");
        rm.textContent = "✕";
        rm.className = "apk-remove";
        rm.addEventListener("click", e => { e.stopPropagation(); selectedFiles.splice(i, 1); renderApkList(); });
        li.append(span, rm);
        apkList.appendChild(li);
    });
    installBtn.disabled = selectedFiles.length === 0 || !installer;
}

// ================================================================
//  التثبيت
// ================================================================
installBtn.addEventListener("click", async () => {
    if (!installer || selectedFiles.length === 0) return;
    installBtn.disabled = true;
    let ok = 0, fail = 0;

    for (const file of selectedFiles) {
        log(`─── ${file.name} ───`);
        try {
            const bytes  = new Uint8Array(await file.arrayBuffer());
            const result = await installer.installApk(bytes, file.name);
            if (result.ok) { ok++;   log(`✓ ${file.name}`, "ok"); }
            else           { fail++; log(`✗ ${file.name} — ${result.error}`, "err"); }
        } catch (err) {
            fail++;
            log(`✗ ${file.name} — ${err.message}`, "err");
        }
    }

    log(`═══ ${ok} ناجح، ${fail} فاشل ═══`, fail === 0 ? "ok" : "warn");
    selectedFiles = [];
    renderApkList();
    installBtn.disabled = false;
});

// ================================================================
//  إدارة التطبيقات
// ================================================================
async function loadApps() {
    if (!installer) return;
    appsList.innerHTML = `<p class="empty-state">جارٍ التحميل...</p>`;
    try {
        const [userApps, systemApps] = await Promise.all([
            installer.listApps('user'),
            installer.listApps('system'),
        ]);
        appsCache.user   = userApps;
        appsCache.system = systemApps;
        userAppsCount.textContent   = userApps.length;
        systemAppsCount.textContent = systemApps.length;
        renderApps();
    } catch (e) {
        appsList.innerHTML = `<p class="empty-state">خطأ: ${e.message}</p>`;
    }
}

function renderApps() {
    const apps = appsCache[currentTab] || [];
    if (apps.length === 0) { appsList.innerHTML = `<p class="empty-state">${t("noApps")}</p>`; return; }

    appsList.innerHTML = "";
    for (const app of apps) {
        const shortName = app.package.split('.').pop();
        const div = document.createElement("div");
        div.className = "app-item";

        const header = document.createElement("div");
        header.className = "app-header";

        const icon = document.createElement("div");
        icon.className = "app-icon";
        icon.textContent = shortName.slice(0, 3).toUpperCase();

        const info = document.createElement("div");
        info.className = "app-info";
        info.innerHTML = `<div class="app-name">${shortName}</div><span class="app-pkg">${app.package}</span>`;

        header.append(icon, info);

        const actions = document.createElement("div");
        actions.className = "app-actions";

        const make = (cls, label, fn) => {
            const b = document.createElement("button");
            b.className = `action-btn ${cls}`;
            b.textContent = label;
            b.onclick = fn;
            return b;
        };

        const grantBtn = make("btn-grant", t("grant"), async () => {
            grantBtn.disabled = true; grantBtn.textContent = "...";
            await installer.grantPermissions(app.package);
            await installer.verifyGrants(app.package, []);
            grantBtn.textContent = "✓";
            setTimeout(() => { grantBtn.textContent = t("grant"); grantBtn.disabled = false; }, 2000);
        });

        const launchBtn = make("btn-launch", t("launch"), async () => {
            launchBtn.disabled = true;
            await installer.launchApp(app.package);
            setTimeout(() => { launchBtn.disabled = false; }, 1200);
        });

        const freeformBtn = make("btn-freeform", "عائم 📺", async () => {
            freeformBtn.disabled = true; freeformBtn.textContent = "...";
            const res = await installer.launchFreeform(app.package);
            freeformBtn.textContent = res.ok ? "✓" : "✗";
            setTimeout(() => { freeformBtn.textContent = "عائم 📺"; freeformBtn.disabled = false; }, 2000);
        });

        const showBtn = make("btn-show", "ظهور 📱", async () => {
            showBtn.disabled = true; showBtn.textContent = "...";
            const res = await installer.showInLauncher(app.package);
            showBtn.textContent = res.ok ? "✓" : "✗";
            setTimeout(() => { showBtn.textContent = "ظهور 📱"; showBtn.disabled = false; }, 2000);
        });

        const exportBtn = make("btn-export", t("export"), async () => {
            exportBtn.disabled = true;
            const res = await installer.exportApk(app.package);
            exportBtn.textContent = res.ok ? "✓" : "✗";
            setTimeout(() => { exportBtn.textContent = t("export"); exportBtn.disabled = false; }, 2000);
        });

        const uninstallBtn = make("btn-uninstall", t("uninstall"), async () => {
            if (!confirm(`${t("confirmUninstall")}\n\n${app.package}`)) return;
            if (currentTab === 'system' && !confirm(t("systemAppWarning"))) return;
            uninstallBtn.disabled = true;
            const res = await installer.uninstallApp(app.package);
            if (res.ok) {
                const idx = appsCache[currentTab].findIndex(a => a.package === app.package);
                if (idx !== -1) appsCache[currentTab].splice(idx, 1);
                renderApps();
                (currentTab === 'user' ? userAppsCount : systemAppsCount).textContent = appsCache[currentTab].length;
            } else {
                uninstallBtn.textContent = "✗";
                setTimeout(() => { uninstallBtn.textContent = t("uninstall"); uninstallBtn.disabled = false; }, 2000);
            }
        });

        actions.append(grantBtn, launchBtn, freeformBtn, showBtn, exportBtn, uninstallBtn);
        div.append(header, actions);
        appsList.appendChild(div);
    }
}

tabUser.addEventListener("click",   () => { currentTab = 'user';   tabUser.classList.add("active");   tabSystem.classList.remove("active"); renderApps(); });
tabSystem.addEventListener("click", () => { currentTab = 'system'; tabSystem.classList.add("active"); tabUser.classList.remove("active");   renderApps(); });
refreshAppsBtn.addEventListener("click", () => loadApps());

// ================================================================
//  إعدادات السيارة
// ================================================================
enableSplitBtn.addEventListener("click", async () => {
    if (!installer) return;
    enableSplitBtn.disabled = true;
    enableSplitBtn.textContent = "جارٍ التفعيل...";
    const res = await installer.enableSplitScreen();
    enableSplitBtn.textContent = res.ok ? "✓ تم التفعيل — أعد التشغيل" : "✗ فشل التفعيل";
    enableSplitBtn.style.color = res.ok ? "var(--green)" : "var(--red)";
    setTimeout(() => { enableSplitBtn.textContent = "تفعيل تقسيم الشاشة"; enableSplitBtn.style.color = ""; enableSplitBtn.disabled = false; }, 4000);
});

let detectingKeys = false;
detectKeysBtn.addEventListener("click", async () => {
    if (!installer || detectingKeys) return;
    detectingKeys = true;
    detectKeysBtn.disabled = true;
    keysResult.hidden = true;
    keysResult.innerHTML = "";
    const duration = 8;
    let remaining = duration;
    detectBtnLabel.textContent = `⏱ ${remaining}ث — اضغط أزرار الدركسون الآن`;
    const timer = setInterval(() => {
        remaining--;
        detectBtnLabel.textContent = remaining > 0
            ? `⏱ ${remaining}ث — اضغط أزرار الدركسون الآن`
            : "⏱ جارٍ المعالجة...";
        if (remaining <= 0) clearInterval(timer);
    }, 1000);

    const res = await installer.detectSteeringKeys(duration);
    clearInterval(timer);
    detectBtnLabel.textContent = "🔍 كشف أزرار الدركسون (8 ثوانٍ)";
    detectKeysBtn.disabled = false;
    detectingKeys = false;
    keysResult.hidden = false;

    if (res.detected.length === 0) {
        keysResult.innerHTML = `<p class="keys-empty">لم يُكتشف أي زر — تأكد من توصيل الدركسون وحاول مجدداً</p>`;
        return;
    }
    const statusMsg = res.hasStandard
        ? `<p class="keys-status ok">✓ أزرار قياسية — تعمل تلقائياً مع تطبيقات الموسيقى</p>`
        : `<p class="keys-status warn">⚠ أكواد مخصصة — تحتاج إعادة تعيين</p>`;
    const list = res.detected.map(k =>
        `<div class="key-item ${k.standard ? 'standard' : 'custom'}">
            <span class="key-label">${k.label}</span>
            <code class="key-code">${k.code}</code>
        </div>`
    ).join('');
    keysResult.innerHTML = statusMsg + `<div class="keys-list">${list}</div>`;
});

document.querySelectorAll(".media-key").forEach(btn => {
    btn.addEventListener("click", async () => {
        if (!installer) return;
        btn.classList.add("pressed");
        await installer.sendMediaKey(btn.dataset.key);
        setTimeout(() => btn.classList.remove("pressed"), 300);
    });
});

// ================================================================
//  تهيئة
// ================================================================
buildCarGrid();

// ================================================================
//  مكتبة التطبيقات — بناء البطاقات وتثبيت التطبيقات
// ================================================================

// ================================================================
//  GitHub API — جلب روابط CDN المباشرة (بدون مشكلة CORS)
//  طلب واحد فقط يحضر كل الروابط لجميع الـ releases
// ================================================================
const GH_REPO = 'ksa-s/jetoadb.v2';
let ghUrlCache = {};   // filename → direct CDN URL

// ================================================================
//  حل رابط التحميل — يُحلِّل عند الضغط مع cache
// ================================================================
async function resolveDownloadUrl(app) {
    const filename = app.file.split('/').pop();
    const key      = filename.toLowerCase();

    // 1. مخزَّن → استخدمه فوراً
    if (ghUrlCache[key]) {
        return ghUrlCache[key];
    }

    // 2. طلب GitHub API لهذا الـ release تحديداً
    const tagMatch = app.file.match(/releases\/download\/([^\/]+)\//);
    if (tagMatch) {
        const tag = tagMatch[1];
        try {
            log(`  🔍 جلب رابط CDN للتطبيق...`);
            const r = await fetch(
                `https://api.github.com/repos/${GH_REPO}/releases/tags/${encodeURIComponent(tag)}`,
                { headers: { Accept: 'application/vnd.github.v3+json' } }
            );
            if (r.ok) {
                const json = await r.json();
                const asset = (json.assets || []).find(a => a.name.toLowerCase() === key);
                if (asset?.browser_download_url) {
                    ghUrlCache[key] = asset.browser_download_url;
                    log(`  ✓ رابط CDN جاهز`, "ok");
                    return asset.browser_download_url;
                }
                // لم يجد الملف — نسجّل الأسماء المتاحة
                const names = (json.assets || []).map(a => a.name).join(', ');
                log(`  ⚠ الملفات في Release: [${names}]`, "warn");
            } else if (r.status === 403) {
                log(`  ⚠ GitHub API: تجاوز حد الطلبات (60/ساعة)`, "warn");
            }
        } catch (e) {
            log(`  ⚠ GitHub API: ${e.message}`, "warn");
        }
    }

    // 3. Fallback (قد يفشل CORS على الموبايل)
    log(`  ⚠ استخدام الرابط المباشر — قد يفشل CORS`, "warn");
    return app.file;
}

async function prefetchGHUrls() {
    // خلفي — يملأ الـ cache مسبقاً لتسريع التثبيت
    try {
        const r = await fetch(
            `https://api.github.com/repos/${GH_REPO}/releases`,
            { headers: { Accept: 'application/vnd.github.v3+json' } }
        );
        if (!r.ok) return;
        const releases = await r.json();
        let n = 0;
        for (const rel of releases) {
            for (const asset of (rel.assets || [])) {
                ghUrlCache[asset.name.toLowerCase()] = asset.browser_download_url;
                n++;
            }
        }
        console.log(`[GH] prefetched ${n} assets`);
    } catch (e) {
        console.warn('[GH] prefetch failed:', e.message);
    }
}

// ================================================================
//  بناء المكتبة — قائمة تحديد (checkbox) + زر تثبيت واحد
// ================================================================
function buildLibrary() {
    if (!libGrid) return;
    const apps = getAppsForCar(selectedCar);

    libGrid.innerHTML = "";

    // ── قائمة التطبيقات ──
    const list = document.createElement("div");
    list.className = "lib-checklist";

    for (const app of apps) {
        const label = document.createElement("label");
        label.className = "lib-item";
        label.htmlFor = `libck-${app.id}`;

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "lib-check";
        cb.id = `libck-${app.id}`;
        cb.dataset.id = app.id;
        cb.checked = true;

        const name = document.createElement("span");
        name.className = "lib-item-name";
        name.textContent = app.nameAr;

        const status = document.createElement("span");
        status.className = "lib-item-status";
        status.id = `lib-st-${app.id}`;

        label.append(cb, name, status);
        list.appendChild(label);
    }

    // ── شريط التحكم (تحديد الكل) ──
    const ctrl = document.createElement("div");
    ctrl.className = "lib-ctrl";

    const selectAll = document.createElement("button");
    selectAll.className = "lib-ctrl-btn";
    selectAll.textContent = "تحديد الكل";
    selectAll.onclick = () => {
        const checks = libGrid.querySelectorAll(".lib-check");
        const allChecked = [...checks].every(c => c.checked);
        checks.forEach(c => c.checked = !allChecked);
        selectAll.textContent = allChecked ? "تحديد الكل" : "إلغاء الكل";
        updateInstallCount();
    };

    ctrl.appendChild(selectAll);

    // ── زر التثبيت الجماعي ──
    const installBtn = document.createElement("button");
    installBtn.className = "btn lib-install-all";
    installBtn.id = "libInstallAllBtn";
    installBtn.onclick = installSelectedApps;

    function updateInstallCount() {
        const n = libGrid.querySelectorAll(".lib-check:checked").length;
        installBtn.textContent = n > 0 ? `تثبيت المحدد (${n})` : "تثبيت المحدد";
        installBtn.disabled = n === 0 || !installer;
    }

    libGrid.querySelectorAll && libGrid.addEventListener("change", updateInstallCount);

    libGrid.append(ctrl, list, installBtn);
    updateInstallCount();

    // تحديث العداد عند تغيير الاختيار
    list.addEventListener("change", updateInstallCount);
}

// ================================================================
//  تثبيت التطبيقات المحددة بالترتيب
// ================================================================
async function installSelectedApps() {
    if (!installer) { log("❌ اتصل بالجهاز أولاً", "err"); return; }

    const btn = document.getElementById("libInstallAllBtn");
    if (btn) btn.disabled = true;

    const checked = [...libGrid.querySelectorAll(".lib-check:checked")]
        .map(cb => APP_LIBRARY.find(a => a.id === cb.dataset.id))
        .filter(Boolean);

    if (checked.length === 0) {
        log("لم تحدد أي تطبيق", "warn");
        if (btn) btn.disabled = false;
        return;
    }

    log(`▶ تثبيت ${checked.length} تطبيق...`, "warn");

    let ok = 0, fail = 0;
    for (const app of checked) {
        const success = await installLibApp(app.id);
        if (success) ok++; else fail++;
    }

    log(`═══ ${ok} ناجح، ${fail} فاشل ═══`, fail === 0 ? "ok" : "warn");
    if (btn) { btn.disabled = false; btn.textContent = "تثبيت المحدد"; }
}

// ================================================================
//  تحميل وتثبيت تطبيق واحد — مع GitHub CDN URL
// ================================================================
async function installLibApp(appId) {
    const app = APP_LIBRARY.find(a => a.id === appId);
    if (!app || !installer) return false;

    const statusEl = document.getElementById(`lib-st-${appId}`);
    const checkEl  = document.getElementById(`libck-${appId}`);

    const setStatus = (text, cls) => {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = `lib-item-status ${cls || ""}`;
    };

    setStatus("⏳ تحميل...", "loading");
    log(`─── ${app.nameAr} ───`);

    // نحصل على رابط CDN مباشر (يُحلَّل عند الضغط مع cache)
    const filename = app.file.split('/').pop();
    log(`$ fetch ${filename}`, "prompt");
    const url = await resolveDownloadUrl(app);

    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            if (response.status === 404) throw new Error(`الملف غير موجود في Release — تحقق من اسم الملف`);
            throw new Error(`HTTP ${response.status}`);
        }

        const total  = parseInt(response.headers.get('content-length') || '0');
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;

        // animation وهمية إذا لم يُرسل الحجم (GitHub CDN)
        let animFrame;
        let fakePct = 0;
        if (total === 0) {
            const tick = () => {
                fakePct = Math.min(fakePct + 0.3, 90);
                setStatus(`${fakePct.toFixed(0)}%`, "loading");
                animFrame = requestAnimationFrame(tick);
            };
            animFrame = requestAnimationFrame(tick);
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            if (total > 0) {
                const pct = Math.min(99, Math.round(received / total * 100));
                setStatus(`${pct}%`, "loading");
            } else {
                setStatus(`${(received/1024/1024).toFixed(1)} MB`, "loading");
            }
        }
        if (animFrame) cancelAnimationFrame(animFrame);

        const apkBytes = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) { apkBytes.set(chunk, offset); offset += chunk.length; }

        log(`✓ تم تحميل ${(received/1024/1024).toFixed(1)} MB`, "ok");
        setStatus("📦 تثبيت...", "loading");

        const result = await installer.installApk(apkBytes, `${app.id}.apk`);

        if (result.ok) {
            log(`✅ ${app.nameAr}: تم بنجاح`, "ok");
            setStatus("✓ مُثبَّت", "done");
            if (checkEl) checkEl.checked = false;   // إلغاء التحديد بعد النجاح
            return true;
        } else {
            throw new Error(result.error || "فشل التثبيت");
        }

    } catch (err) {
        if (err.animFrame) cancelAnimationFrame(err.animFrame);
        log(`✗ ${app.nameAr}: ${err.message}`, "err");
        setStatus("✗ فشل", "fail");
        return false;
    }
}

// ================================================================
//  تهيئة — جلب روابط GitHub مسبقاً + بناء المكتبة
// ================================================================
prefetchGHUrls();   // ← طلب GitHub API واحد في الخلفية
buildLibrary();
