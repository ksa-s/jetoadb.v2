import "./style.css";
import { AdbInstaller } from "./installer.js";
import { setLang, t, getLang } from "./i18n.js";

// ---------- عناصر DOM ----------
const modelSelect    = document.getElementById("modelSelect");
const modelHint      = document.getElementById("modelHint");
const connectBtn     = document.getElementById("connectBtn");
const disconnectBtn  = document.getElementById("disconnectBtn");
const deviceInfo     = document.getElementById("deviceInfo");
const deviceModelText= document.getElementById("deviceModelText");
const dropZone       = document.getElementById("dropZone");
const apkInput       = document.getElementById("apkInput");
const apkList        = document.getElementById("apkList");
const installBtn     = document.getElementById("installBtn");
const terminal       = document.getElementById("terminal");
const langToggle     = document.getElementById("langToggle");
const appsManagerCard= document.getElementById("appsManagerCard");
const tabUser        = document.getElementById("tabUser");
const tabSystem      = document.getElementById("tabSystem");
const refreshAppsBtn = document.getElementById("refreshAppsBtn");
const appsList       = document.getElementById("appsList");
const userAppsCount  = document.getElementById("userAppsCount");
const systemAppsCount= document.getElementById("systemAppsCount");
// جديد: status pill
const statusPill     = document.getElementById("statusPill");
const statusLabel    = document.getElementById("statusLabel");

// ---------- إعدادات الموديلات ----------
// restricted: true = نظام محدود → يتخطى pm install ويستخدم Helper JAR مباشرة
// restricted: false = نظام عادي → يجرب pm install أولاً
const MODEL_CONFIG = {
    'jetour-t2-old':    { restricted: false, hint: '✓ نظام قديم — التثبيت المباشر مدعوم' },
    'jetour-t2-new':    { restricted: true,  hint: '🔒 نظام جديد — سيتم استخدام المثبت الاحتياطي تلقائياً' },
    'jetour-x70-old':   { restricted: false, hint: '✓ نظام قديم — التثبيت المباشر مدعوم' },
    'jetour-x70-new':   { restricted: true,  hint: '🔒 نظام جديد — سيتم استخدام المثبت الاحتياطي تلقائياً' },
    'changan-cs55':     { restricted: false, hint: '' },
    'haval-h6':         { restricted: false, hint: '' },
    'geely-coolray':    { restricted: false, hint: '' },
    'other':            { restricted: false, hint: '' },
};

// ---------- الحالة ----------
let installer = null;
let selectedFiles = [];
let currentTab = 'user';
let appsCache = { user: [], system: [] };

// ---------- الترجمة ----------
setLang("ar");
langToggle.addEventListener("click", () => {
    setLang(getLang() === "ar" ? "en" : "ar");
});

// ---------- Terminal ----------
function log(text, cls) {
    const div = document.createElement("div");
    div.className = "line" + (cls ? " " + cls : "");
    div.textContent = text;
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
}

// ---------- Status Pill ----------
function setConnected(model) {
    statusPill.classList.add("connected");
    statusLabel.textContent = model || t("connected");
}

function setDisconnected() {
    statusPill.classList.remove("connected");
    statusLabel.textContent = getLang() === "ar" ? "غير متصل" : "Disconnected";
}

// ---------- اختيار الموديل ----------
modelSelect.addEventListener("change", () => {
    const m = modelSelect.value;
    const cfg = MODEL_CONFIG[m];
    // عرض hint يشرح الوضع المحدد
    modelHint.textContent = cfg?.hint || "";
    modelHint.className = cfg?.restricted
        ? "field-hint hint-restricted"
        : "field-hint hint-normal";
    connectBtn.disabled = !m;
});

// ---------- الاتصال ----------
connectBtn.addEventListener("click", async () => {
    if (!modelSelect.value) { alert(t("selectModelFirst")); return; }
    connectBtn.disabled = true;
    log("$ connecting...", "prompt");

    try {
        const cfg = MODEL_CONFIG[modelSelect.value] || { restricted: false };
        installer = new AdbInstaller(log, {
            installMode: 'pm-shell',
            restrictedMode: cfg.restricted,
        });
        if (cfg.restricted) {
            log(`🔒 وضع تجاوز القيود مُفعَّل — سيتم تخطي pm install`, "warn");
        }
        const info = await installer.connect();
        deviceModelText.textContent = info.model;
        deviceInfo.hidden = false;
        disconnectBtn.hidden = false;
        connectBtn.hidden = true;
        setConnected(info.model);
        log(`${t("connected")}: ${info.model}`, "ok");
        appsManagerCard.hidden = false;
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
    connectBtn.disabled = !modelSelect.value;
    appsManagerCard.hidden = true;
    setDisconnected();
    log(t("disconnected"));
});

// ---------- رفع APK ----------
dropZone.addEventListener("click", () => apkInput.click());

apkInput.addEventListener("change", (e) => {
    for (const f of e.target.files) {
        if (f.name.toLowerCase().endsWith(".apk")) selectedFiles.push(f);
    }
    renderApkList();
    apkInput.value = "";
});

dropZone.addEventListener("dragover",  (e) => { e.preventDefault(); dropZone.classList.add("drag"); });
dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("drag"));

dropZone.addEventListener("drop", (e) => {
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
        const rm = document.createElement("button");
        rm.textContent = "✕";
        rm.className = "apk-remove";
        rm.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedFiles.splice(i, 1);
            renderApkList();
        });
        li.appendChild(span);
        li.appendChild(rm);
        apkList.appendChild(li);
    });
    installBtn.disabled = selectedFiles.length === 0 || !installer;
}

// ---------- التثبيت ----------
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
    if (apps.length === 0) {
        appsList.innerHTML = `<p class="empty-state">${t("noApps")}</p>`;
        return;
    }

    appsList.innerHTML = "";
    for (const app of apps) {
        const shortName = app.package.split('.').pop();
        const initials  = shortName.slice(0, 3).toUpperCase();

        const div = document.createElement("div");
        div.className = "app-item";

        // header (icon + info)
        const header = document.createElement("div");
        header.className = "app-header";

        const icon = document.createElement("div");
        icon.className = "app-icon";
        icon.textContent = initials;

        const info = document.createElement("div");
        info.className = "app-info";

        const name = document.createElement("div");
        name.className = "app-name";
        name.textContent = shortName;

        const pkg = document.createElement("div");
        pkg.className = "app-pkg";
        pkg.textContent = app.package;

        info.append(name, pkg);
        header.append(icon, info);

        // actions
        const actions = document.createElement("div");
        actions.className = "app-actions";

        const makeBtn = (cls, label, handler) => {
            const b = document.createElement("button");
            b.className = `action-btn ${cls}`;
            b.textContent = label;
            b.onclick = handler;
            return b;
        };

        const grantBtn = makeBtn("btn-grant", t("grant"), async () => {
            grantBtn.disabled = true;
            grantBtn.textContent = "...";
            await installer.grantPermissions(app.package);
            await installer.verifyGrants(app.package, []);
            grantBtn.textContent = "✓";
            setTimeout(() => { grantBtn.textContent = t("grant"); grantBtn.disabled = false; }, 2000);
        });

        const launchBtn = makeBtn("btn-launch", t("launch"), async () => {
            launchBtn.disabled = true;
            await installer.launchApp(app.package);
            setTimeout(() => { launchBtn.disabled = false; }, 1200);
        });

        const exportBtn = makeBtn("btn-export", t("export"), async () => {
            exportBtn.disabled = true;
            const res = await installer.exportApk(app.package);
            exportBtn.textContent = res.ok ? "✓" : "✗";
            setTimeout(() => { exportBtn.textContent = t("export"); exportBtn.disabled = false; }, 2000);
        });

        const uninstallBtn = makeBtn("btn-uninstall", t("uninstall"), async () => {
            if (!confirm(`${t("confirmUninstall")}\n\n${app.package}`)) return;
            if (currentTab === 'system' && !confirm(t("systemAppWarning"))) return;
            uninstallBtn.disabled = true;
            const res = await installer.uninstallApp(app.package);
            if (res.ok) {
                const idx = appsCache[currentTab].findIndex(a => a.package === app.package);
                if (idx !== -1) appsCache[currentTab].splice(idx, 1);
                renderApps();
                if (currentTab === 'user')   userAppsCount.textContent   = appsCache.user.length;
                else                          systemAppsCount.textContent = appsCache.system.length;
            } else {
                uninstallBtn.textContent = "✗";
                setTimeout(() => { uninstallBtn.textContent = t("uninstall"); uninstallBtn.disabled = false; }, 2000);
            }
        });

        actions.append(grantBtn, launchBtn, exportBtn, uninstallBtn);
        div.append(header, actions);
        appsList.appendChild(div);
    }
}

tabUser.addEventListener("click", () => {
    currentTab = 'user';
    tabUser.classList.add("active");
    tabSystem.classList.remove("active");
    renderApps();
});

tabSystem.addEventListener("click", () => {
    currentTab = 'system';
    tabSystem.classList.add("active");
    tabUser.classList.remove("active");
    renderApps();
});

refreshAppsBtn.addEventListener("click", () => loadApps());
