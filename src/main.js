import "./style.css";
import { AdbInstaller } from "./installer.js";
import { setLang, t, getLang } from "./i18n.js";

const AUTH = {
    username: "admin",       // ← غيّر هنا
    password: "samsoft2025", // ← غيّر هنا
    storageKey: "ss_auth_v1",
};

// ================================================================
//  بيانات السيارات
// ================================================================
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
        appsManagerCard.hidden = false;
        carSettingsCard.hidden = false;
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
    appsManagerCard.hidden = true;
    carSettingsCard.hidden = true;
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
