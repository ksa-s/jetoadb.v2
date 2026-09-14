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

// ---------- الحالة ----------
let installer = null;
let selectedFiles = [];

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
const MODEL_HINTS = {
    "jetour-t2": { ar: "Jetour T2 — يستخدم المثبت الاحتياطي (pm install محظور)", en: "Jetour T2 — uses helper installer" },
    "jetour-x70": { ar: "Jetour X70 — pm install عادي", en: "Jetour X70 — standard pm install" },
    "changan-cs55": { ar: "Changan CS55 — يتطلب كلمة مرور shell", en: "Changan CS55 — requires shell password" },
    "haval-h6": { ar: "Haval H6 — pm install عادي", en: "Haval H6 — standard pm install" },
    "geely-coolray": { ar: "Geely Coolray — pm install عادي", en: "Geely Coolray — standard pm install" },
    "other": { ar: "عام — pm install عادي", en: "Generic — standard pm install" },
};

modelSelect.addEventListener("change", () => {
    const m = modelSelect.value;
    if (!m) {
        modelHint.textContent = "";
        connectBtn.disabled = true;
        return;
    }
    modelHint.textContent = MODEL_HINTS[m]?.[getLang()] || "";
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
        installer = new AdbInstaller(log);
        const info = await installer.connect();
        deviceModelText.textContent = info.model;
        deviceInfo.hidden = false;
        disconnectBtn.hidden = false;
        connectBtn.hidden = true;
        log(`${t("connected")}: ${info.model}`, "ok");
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
        span.textContent = `${f.name} — ${(f.size / 1024 / 1024).toFixed(1)} MB`;
        const rm = document.createElement("button");
        rm.textContent = "×";
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
                log(`✓ ${file.name} — ${t("installed")}`, "ok");
            } else {
                fail++;
                log(`✗ ${file.name} — ${result.error}`, "err");
            }
        } catch (err) {
            fail++;
            log(`✗ ${file.name} — ${err.message}`, "err");
        }
    }

    log(`=== ${ok} OK, ${fail} FAIL ===`, fail === 0 ? "ok" : "warn");
    selectedFiles = [];
    renderApkList();
    installBtn.disabled = false;
});
