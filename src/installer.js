// =====================================================================
//  installer.js — WebADB + Helper Installer Protocol
// =====================================================================

import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { t } from "./i18n.js";

// ---------- ثوابت البروتوكول ----------
const HELPER_JAR_URL = "./tools/g.jar";
const HELPER_JAR_PATH = "/data/local/tmp/g.jar";
const HELPER_SH_PATH = "/data/local/tmp/r.sh";
const HELPER_JAR_BYTES_EXPECTED = 0; // 0 = تعطيل التحقق
const HELPER_CLASS = "com.garagetool.installer.GtInstall";
const PUSH_PRIMARY_DIR = "/data/local/tmp";
const PUSH_FALLBACK_DIR = "/sdcard/Download";
const PUSH_TRIES = 3;
const PUSH_CHUNK = 1024 * 1024;

let helperJarBytes = null;
let helperDelivered = false;
let helperDead = "";

// ---------- تعابير الفحص ----------
const PERMANENT_RE = /cannot stat|no space left|read-only file system|permission denied|install_failed|is not auth|not enough space/i;
const TRANSIENT_RE = /transport endpoint|couldn't create file|broken pipe|input\/output error|bad address|stat failed|protocol fault|resource temporarily unavailable|econnreset|connection reset|network error|failed to fetch|load failed|no such file or directory|device is busy|timed?\s?out|device not found|device disconnected/i;

function isTransient(text) {
    const s = String(text && text.message ? text.message : text || "");
    return !PERMANENT_RE.test(s) && TRANSIENT_RE.test(s);
}

function isDirProblem(text) {
    const s = String(text && text.message ? text.message : text || "");
    if (/cannot stat/i.test(s)) return false;
    return /no space left|not enough space|insufficient[ _]storage|read-only file system|permission denied/i.test(s);
}

// ---------- دوال مساعدة ----------
function apkToReadableStream(buffer) {
    let offset = 0;
    return new ReadableStream({
        pull(controller) {
            if (offset >= buffer.length) { controller.close(); return; }
            const end = Math.min(offset + PUSH_CHUNK, buffer.length);
            controller.enqueue(buffer.subarray(offset, end));
            offset = end;
        }
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- مدير ADB ----------
export class AdbInstaller {
    constructor(logFn) {
        this.adb = null;
        this.log = logFn || console.log;
        this.device = null;
    }

    async connect() {
        const Manager = AdbDaemonWebUsbDeviceManager.BROWSER;
        if (!Manager) throw new Error("WebUSB not supported");

        const CredentialStore = new AdbWebCredentialStore("GarageTool");
        const device = await Manager.requestDevice();
        if (!device) throw new Error("Device selection cancelled");

        const connection = await device.connect();
        const transport = await AdbDaemonTransport.authenticate({
            serial: device.serial,
            connection,
            credentialStore: CredentialStore,
        });

        this.adb = new Adb(transport);
        this.device = device;

        // قراءة الموديل
        let model = "Unknown";
        try {
            model = (await this.adb.subprocess.noneProtocol.spawnWaitText("getprop ro.product.model")).trim() || model;
        } catch (e) {}

        return { model, serial: device.serial };
    }

    async disconnect() {
        if (this.adb) {
            try { await this.adb.close(); } catch (e) {}
            this.adb = null;
        }
    }

    // ---------- ADB helpers ----------
    async syncPushOnce(remotePath, buffer) {
        const sync = await this.adb.sync();
        try {
            await sync.write({ filename: remotePath, file: apkToReadableStream(buffer) });
        } finally {
            try { await sync.dispose(); } catch (e) {}
        }
    }

    async runShell(commands, timeoutMs = 180000) {
        const pty = await this.adb.subprocess.noneProtocol.pty();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let output = "";
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; try { pty.kill(); } catch (e) {} }, timeoutMs);

        const readDone = (async () => {
            const reader = pty.output.getReader();
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) output += decoder.decode(value, { stream: true });
                }
            } catch (e) {}
        })();

        const writer = pty.input.getWriter();
        try {
            for (const cmd of commands) {
                await writer.write(encoder.encode(cmd + "\n"));
            }
            await writer.write(encoder.encode("exit\n"));
        } catch (e) {} finally {
            try { writer.releaseLock(); } catch (e) {}
        }

        await readDone;
        clearTimeout(timer);
        if (timedOut) output += "\n[Timeout]";
        return output;
    }

    // ---------- Helper Installer Protocol ----------
    async ensureHelperOnDevice() {
        if (helperDelivered) return "";
        if (helperDead) return helperDead;

        if (!helperJarBytes) {
            try {
                const res = await fetch(HELPER_JAR_URL, { cache: "no-store" });
                if (!res.ok) throw new Error("HTTP " + res.status);
                helperJarBytes = new Uint8Array(await res.arrayBuffer());
            } catch (e) {
                helperDead = "Failed to load helper: " + e.message;
                return helperDead;
            }
            if (HELPER_JAR_BYTES_EXPECTED > 0 && helperJarBytes.length !== HELPER_JAR_BYTES_EXPECTED) {
                helperDead = `Helper size mismatch (${helperJarBytes.length} vs ${HELPER_JAR_BYTES_EXPECTED})`;
                helperJarBytes = null;
                return helperDead;
            }
        }

        try {
            await this.syncPushOnce(HELPER_JAR_PATH, helperJarBytes);
        } catch (e) {
            helperDead = "Failed to push helper: " + e.message;
            return helperDead;
        }

        helperDelivered = true;
        return "";
    }

    parseHelperOutput(out) {
        const text = String(out || "");
        const started = /GT_/.test(text);
        const okMatch = text.match(/GT_INSTALL_OK\s+(\S+)(?:\s+(\S+))?/);
        if (okMatch) return { ok: true, pkg: okMatch[1], code: "OK", text: "", started: true };
        const failMatch = text.match(/GT_INSTALL_FAIL\s+(\S+)\s*(.*)/);
        if (failMatch) return { ok: false, pkg: null, code: failMatch[1], text: (failMatch[2] || "").trim(), started: true };
        return { ok: false, pkg: null, code: started ? "NO_VERDICT" : "NO_START", text: "", started };
    }

    async installViaHelper(remoteApkPath) {
        if (!this.adb) return { ok: false, code: "NO_ADB", text: "No ADB connection", started: false };

        const problem = await this.ensureHelperOnDevice();
        if (problem) return { ok: false, code: "NO_HELPER", text: problem, started: false };

        const script = [
            "#!/system/bin/sh",
            `chmod 644 ${HELPER_JAR_PATH} '${remoteApkPath}'`,
            `CLASSPATH=${HELPER_JAR_PATH} app_process /system/bin ${HELPER_CLASS} '${remoteApkPath}'`,
            "echo GT_RC $?",
            ""
        ].join("\n");

        try {
            await this.syncPushOnce(HELPER_SH_PATH, new TextEncoder().encode(script));
        } catch (e) {
            return { ok: false, code: "NO_SCRIPT", text: e.message, started: false };
        }

        this.log(t("helperInstalling"), "warn");
        const out = await this.runShell([`sh ${HELPER_SH_PATH}`], 300000);
        console.log("gt-install output:\n" + out);

        const parse = this.parseHelperOutput(out);
        if (parse.ok) {
            const pkg = parse.pkg;
            let confirmed = null;
            try {
                const pathOut = await this.runShell([`pm path ${pkg}`], 30000);
                confirmed = /package:\S+/.test(pathOut);
            } catch (e) {}
            if (confirmed === false) {
                return { ok: false, code: "NO_PATH", text: `Helper reported OK but ${pkg} not found`, started: true };
            }
            return { ok: true, pkg, code: "OK", text: "", started: true };
        }
        return parse;
    }

    helperErrorText(r) {
        if (!r) return "Helper installer failed";
        if (r.code === "NO_START") return "Helper couldn't start on this device";
        if (r.code === "NO_HELPER" || r.code === "NO_SCRIPT") return r.text || "Helper preparation failed";
        if (r.code === "NO_PATH") return r.text;
        return `Helper failed (${r.code}${r.text ? ": " + r.text : ""})`;
    }

    // ---------- دالة التثبيت الرئيسية ----------
    async installApk(apkBytes, apkName, onProgress) {
        const remoteName = apkName.replace(/[^A-Za-z0-9._-]/g, "_");
        const remotePath = `${PUSH_PRIMARY_DIR}/${remoteName}`;
        let outputText = "";
        let installed = false;
        let helperResult = null;

        // محاولة الرفع مع Retry
        for (let attempt = 0; attempt < PUSH_TRIES; attempt++) {
            try {
                this.log(`$ push -> ${remotePath}`, "prompt");
                await this.syncPushOnce(remotePath, apkBytes);
                break;
            } catch (pushErr) {
                outputText = pushErr.message;
                if (attempt < PUSH_TRIES - 1 && isTransient(pushErr)) {
                    this.log(`Retry ${attempt + 2}/${PUSH_TRIES}...`, "warn");
                    await sleep(1500 * (attempt + 1));
                    continue;
                }
                throw pushErr;
            }
        }

        // محاولة pm install
        this.log(`> pm install "${remoteName}"`, "prompt");
        outputText = await this.runShell([
            `cd ${PUSH_PRIMARY_DIR}`,
            `cat "${remoteName}" | pm install -S ${apkBytes.length}`
        ]);

        installed = outputText.includes("Success");

        // ✅ البروتوكول الاحتياطي
        if (!installed && !isDirProblem(outputText) && !isTransient(outputText)) {
            try {
                helperResult = await this.installViaHelper(remotePath);
            } catch (e) {
                helperResult = { ok: false, code: "EXCEPTION", text: e.message, started: false };
            }
            if (helperResult.ok) {
                installed = true;
                this.log(t("helperSuccess") + `: ${helperResult.pkg}`, "ok");
            } else {
                this.log(this.helperErrorText(helperResult), "err");
            }
        }

        // تنظيف
        try {
            await this.runShell([`rm -f "${remotePath}"`], 10000);
        } catch (e) {}

        return {
            ok: installed,
            pkg: helperResult?.pkg || null,
            error: installed ? null : (helperResult ? this.helperErrorText(helperResult) : outputText.slice(0, 200)),
            usedHelper: !!helperResult
        };
    }
}

// تصدير الدوال المساعدة
export { isTransient, isDirProblem };
