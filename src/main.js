import "./style.css";
import { AdbInstaller } from "./installer.js";
import { setLang, t, getLang } from "./i18n.js";

// ---------- عناصر DOM ----------
const modelSelect = document.getElementById("modelSelect");
const modelHint = document.getElementById("modelHint");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const deviceInfo = document.getElementById("deviceInfo");
const deviceModelText = document.getElementById("deviceModelText");
const dropZone = document.getElementById("dropZone");
const apkInput = document.getElementById("apkInput");
const apkList = document.getElementById("apkList");
const installBtn = document.getElementById("installBtn");
const terminal = document.getElementById("terminal");
const langToggle = document.getElementById("langToggle");
const appsManagerCard = document.getElementById("appsManagerCard");
const tabUser = document.getElementById("tabUser");
const tabSystem = document.getElementById("tabSystem");
const refreshAppsBtn = document.getElementById("refreshAppsBtn");
const appsList = document.getElementById("appsList");
const userAppsCount = document.getElementById("userAppsCount");
const systemAppsCount = document.getElementById("systemAppsCount");

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

// ---------- اختيار الموديل ----------
modelSelect.addEventListener("change", () => {
    const m = modelSelect.value;
    if (!m) {
        modelHint.textContent = "";
        connectBtn.disabled = true;
        return;
    }
    modelHint.textContent = "";
    connectBtn.disabled = false;
});

// ---------- الاتصال ----------
connectBtn.addEventListener("click", async () => {
    if (!modelSelect.value) {
        alert(t("selectModelFirst"));
        return;
    }
    connectBtn.disabled = true;
    log("$ connecting...", "prompt");

    try {
        installer = new AdbInstaller(log, { installMode: 'pm-shell' });
        const info = await installer.connect();
        deviceModelText.textContent = info.model;
        deviceInfo.hidden = false;
        disconnectBtn.hidden = false;
        connectBtn.hidden = true;
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
    log(t("disconnected"));
});

// ---------- رفع APK ----------
dropZone.addEventListener("click", () => apkInput.click());

apkInput.addEventListener("change", (e) => {
    for (const f of e.target.files) {
        if (f.name.toLowerCase().endsWith(".apk")) selectedFiles.push(f);
    }
    renderApkList();
});

dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));

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
        const li = document.createElement("li");
        const span = document.createElement("span");
        span.textContent = `${f.name} - ${(f.size / 1024 / 1024).toFixed(1)} MB`;
        const rm = document.createElement("button");
        rm.textContent = "x";
        rm.className = "apk-remove";
        rm.addEventListener("click", () => {
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
        log(`--- ${file.name} ---`);
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const result = await installer.installApk(bytes, file.name);
            if (result.ok) {
                ok++;
                log(`OK: ${file.name}`, "ok");
            } else {
                fail++;
                log(`FAIL: ${file.name} - ${result.error}`, "err");
            }
        } catch (err) {
            fail++;
            log(`FAIL: ${file.name} - ${err.message}`, "err");
        }
    }

    log(`=== ${ok} OK, ${fail} FAIL ===`, fail === 0 ? "ok" : "warn");
    selectedFiles = [];
    renderApkList();
    installBtn.disabled = false;
});

// ==================== إدارة التطبيقات ====================

async function loadApps(force = false) {
    if (!installer) return;
    appsList.innerHTML = `<p class="empty-msg">Loading...</p>`;
    try {
        const [userApps, systemApps] = await Promise.all([
            installer.listApps('user'),
            installer.listApps('system'),
        ]);
        appsCache.user = userApps;
        appsCache.system = systemApps;
        userAppsCount.textContent = userApps.length;
        systemAppsCount.textContent = systemApps.length;
        renderApps();
    } catch (e) {
        appsList.innerHTML = `<p class="empty-msg">Error: ${e.message}</p>`;
    }
}

function renderApps() {
    const apps = appsCache[currentTab] || [];
    if (apps.length === 0) {
        appsList.innerHTML = `<p class="empty-msg">No apps</p>`;
        return;
    }

    appsList.innerHTML = "";
    for (const app of apps) {
        const div = document.createElement("div");
        div.className = "app-item";

        const header = document.createElement("div");
        header.className = "app-header";

        const icon = document.createElement("div");
        icon.className = "app-icon";
        icon.textContent = currentTab === 'system' ? 'SYS' : 'APP';

        const info = document.createElement("div");
        info.className = "app-info";

        const name = document.createElement("div");
        name.className = "app-name";
        name.textContent = app.package.split('.').pop();

        const pkg = document.createElement("div");
        pkg.className = "app-pkg";
        pkg.textContent = app.package;

        info.appendChild(name);
        info.appendChild(pkg);
        header.appendChild(icon);
        header.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "app-actions";

        const grantBtn = document.createElement("button");
        grantBtn.className = "action-btn btn-grant";
        grantBtn.textContent = "Grant";
        grantBtn.onclick = async () => {
            grantBtn.disabled = true;
            await installer.grantPermissions(app.package);
            await installer.verifyGrants(app.package, []);
            grantBtn.textContent = "Done";
            setTimeout(() => {
                grantBtn.textContent = "Grant";
                grantBtn.disabled = false;
            }, 2000);
        };

        const launchBtn = document.createElement("button");
        launchBtn.className = "action-btn btn-launch";
        launchBtn.textContent = "Launch";
        launchBtn.onclick = async () => {
            launchBtn.disabled = true;
            await installer.launchApp(app.package);
            setTimeout(() => { launchBtn.disabled = false; }, 1000);
        };

        const exportBtn = document.createElement("button");
        exportBtn.className = "action-btn btn-export";
        exportBtn.textContent = "Export";
        exportBtn.onclick = async () => {
            exportBtn.disabled = true;
            const result = await installer.exportApk(app.package);
            exportBtn.textContent = result.ok ? "Done" : "Fail";
            setTimeout(() => {
                exportBtn.textContent = "Export";
                exportBtn.disabled = false;
            }, 2000);
        };

        const uninstallBtn = document.createElement("button");
        uninstallBtn.className = "action-btn btn-uninstall";
        uninstallBtn.textContent = "Uninstall";
        uninstallBtn.onclick = async () => {
            if (!confirm("Uninstall " + app.package + "?")) return;
            uninstallBtn.disabled = true;
            const result = await installer.uninstallApp(app.package);
            if (result.ok) {
                const idx = appsCache[currentTab].findIndex(a => a.package === app.package);
                if (idx !== -1) appsCache[currentTab].splice(idx, 1);
                renderApps();
                if (currentTab === 'user') userAppsCount.textContent = appsCache.user.length;
                else systemAppsCount.textContent = appsCache.system.length;
            } else {
                uninstallBtn.textContent = "Fail";
                setTimeout(() => {
                    uninstallBtn.textContent = "Uninstall";
                    uninstallBtn.disabled = false;
                }, 2000);
            }
        };

        actions.appendChild(grantBtn);
        actions.appendChild(launchBtn);
        actions.appendChild(exportBtn);
        actions.appendChild(uninstallBtn);

        div.appendChild(header);
        div.appendChild(actions);
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

refreshAppsBtn.addEventListener("click", () => loadApps(true));
