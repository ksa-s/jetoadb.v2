// =====================================================================
//  installer.js — WebADB + Helper Installer Protocol (v3.1)
//  FIX: replaced PTY-based runShell with spawnWaitText (root cause fix)
//  FIX: grantPermissions now checks output text for real errors
//  FIX: install sequence cleaned up + more methods added
// =====================================================================

import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { t } from "./i18n.js";

// ---------- ثوابت البروتوكول ----------
const HELPER_JAR_URL = "./tools/g.jar?v=" + Date.now();
const HELPER_JAR_PATH = "/data/local/tmp/g.jar";
const HELPER_SH_PATH = "/data/local/tmp/r.sh";
const HELPER_JAR_BYTES_EXPECTED = 0;
const HELPER_CLASS = "com.garagetool.installer.GtInstall";
const PUSH_PRIMARY_DIR = "/data/local/tmp";
const PUSH_FALLBACK_DIR = "/sdcard/Download";
const PUSH_TRIES = 3;
const PUSH_CHUNK = 1024 * 1024;
const SIGN_API_URL = "/api/sign";

let helperJarBytes = null;
let helperDelivered = false;
let helperDead = "";

// ---------- تعابير الفحص ----------
// SecurityException: Restriction prevents installing → نتخطى فوراً للـ helper بدل تجربة 4 طرق
const PERMANENT_RE = /cannot stat|no space left|read-only file system|permission denied|install_failed|is not auth|not enough space|restriction prevents|securityexception.*install/i;
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

// =====================================================================
//  مدير ADB
// =====================================================================
export class AdbInstaller {
    constructor(logFn, options = {}) {
        this.adb = null;
        this.log = logFn || console.log;
        this.device = null;
        this.installMode = options.installMode || 'pm-shell';
        this.shellPassword = options.shellPassword || null;
        this.autoSign = options.autoSign || false;
        this.deviceOwnerReceiver = options.deviceOwnerReceiver || null;
        // وضع تجاوز القيود: يتخطى pm install مباشرة ويذهب للـ Helper JAR
        // مناسب للأنظمة الجديدة التي تمنع pm install
        this.restrictedMode = options.restrictedMode || false;
    }

    // ==================== إدارة التطبيقات ====================

    async listApps(type = 'user') {
        if (!this.adb) return [];
        try {
            const flag = type === 'system' ? '-s' : '-3';
            const output = await this.adb.subprocess.noneProtocol.spawnWaitText(`pm list packages ${flag}`);
            const pkgs = [];
            for (const line of output.split('\n')) {
                const match = line.match(/^package:(.+)$/);
                if (match) pkgs.push(match[1].trim());
            }
            return pkgs.map(pkg => ({ package: pkg }));
        } catch (e) {
            this.log(`خطأ في جلب التطبيقات: ${e.message}`, "err");
            return [];
        }
    }

    async grantPermissions(pkg) {
        if (!this.adb) return { ok: false, error: "No ADB" };

        // ─── FIX: نفصل appops عن pm grant ونتحقق من المخرجات ───

        // appops: نجرب الأمرين (appops set + cmd appops set)
        // GET_USAGE_STATS هو الاسم الصحيح على Android 10+ (PACKAGE_USAGE_STATS قديم)
        const appopsList = [
            'SYSTEM_ALERT_WINDOW',
            'REQUEST_INSTALL_PACKAGES',
            'MANAGE_EXTERNAL_STORAGE',
            'WRITE_SETTINGS',
            'GET_USAGE_STATS',       // الاسم الصحيح على Android 10+
            'PACKAGE_USAGE_STATS',   // fallback للأجهزة القديمة
        ];

        // أذونات خطرة dangerous permissions (يجب أن تكون مُعلَنة في manifest)
        const dangerousPerms = [
            'android.permission.READ_EXTERNAL_STORAGE',
            'android.permission.WRITE_EXTERNAL_STORAGE',
            'android.permission.ACCESS_FINE_LOCATION',
            'android.permission.ACCESS_COARSE_LOCATION',
            'android.permission.READ_PHONE_STATE',
            'android.permission.RECORD_AUDIO',
            'android.permission.CAMERA',
            'android.permission.CALL_PHONE',
            'android.permission.SEND_SMS',
            'android.permission.RECEIVE_SMS',
        ];

        let success = 0, fail = 0;

        // منح appops
        for (const op of appopsList) {
            try {
                // محاولة 1: appops set مباشرة
                let out = await this.adb.subprocess.noneProtocol.spawnWaitText(
                    `appops set ${pkg} ${op} allow 2>&1`
                );
                if (!out || /error|exception|unknown/i.test(out)) {
                    // محاولة 2: cmd appops set
                    out = await this.adb.subprocess.noneProtocol.spawnWaitText(
                        `cmd appops set --uid ${pkg} ${op} allow 2>&1`
                    );
                }
                if (out && /error|exception/i.test(out) && !/not a changeable/i.test(out)) {
                    fail++;
                    this.log(`  ⚠ appops ${op}: ${out.trim().slice(0, 80)}`, "warn");
                } else {
                    success++;
                    this.log(`  ✓ appops ${op}`, "ok");
                }
            } catch (e) {
                fail++;
                this.log(`  ✗ appops ${op}: ${e.message}`, "warn");
            }
        }

        // منح الأذونات الخطرة — نجرب pm grant ثم pm grant --user 0 كـ fallback
        for (const perm of dangerousPerms) {
            const shortName = perm.split('.').pop();
            try {
                let out = await this.adb.subprocess.noneProtocol.spawnWaitText(
                    `pm grant ${pkg} ${perm} 2>&1`
                );
                let outStr = String(out || "").toLowerCase();

                // بعض الأجهزة المقيّدة (DesaySV) ترفض pm grant → نجرب --user 0
                if (outStr.includes("securityexception") || outStr.includes("restricted")) {
                    out = await this.adb.subprocess.noneProtocol.spawnWaitText(
                        `pm grant --user 0 ${pkg} ${perm} 2>&1`
                    );
                    outStr = String(out || "").toLowerCase();
                }

                if (outStr.includes("not declared") ||
                    outStr.includes("not a changeable") ||
                    outStr.includes("unknown permission") ||
                    outStr.trim() === "") {
                    // مقبول — غير مُعلَنة في manifest أو غير قابلة للمنح
                } else if (outStr.includes("error") || outStr.includes("exception") || outStr.includes("failed")) {
                    fail++;
                    this.log(`  ⚠ grant ${shortName}: ${out.trim().slice(0, 60)}`, "warn");
                } else {
                    success++;
                    this.log(`  ✓ grant ${shortName}`, "ok");
                }
            } catch (e) {
                fail++;
            }
        }

        // تفعيل التطبيق
        try {
            await this.adb.subprocess.noneProtocol.spawnWaitText(`pm enable ${pkg} 2>&1`);
            this.log(`  ✓ pm enable ${pkg}`, "ok");
        } catch (e) {}

        // تفعيل وضع الموقع (اختياري)
        if (this.installMode === 'push') {
            try {
                await this.adb.subprocess.noneProtocol.spawnWaitText("settings put secure location_mode 3 2>&1");
            } catch (e) {}
        }

        this.log(`✓ ${pkg}: ${success} أذونات ناجحة، ${fail} فشلت/مُتجاهَلة`, "ok");
        return { ok: true, success, fail };
    }

    async launchApp(pkg) {
        if (!this.adb) return { ok: false };
        try {
            await this.adb.subprocess.noneProtocol.spawnWaitText(
                `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`
            );
            this.log(`▶ ${pkg}: تم التشغيل`, "ok");
            return { ok: true };
        } catch (e) {
            this.log(`✗ ${pkg}: فشل التشغيل - ${e.message}`, "err");
            return { ok: false, error: e.message };
        }
    }

    async uninstallApp(pkg) {
        if (!this.adb) return { ok: false };
        try {
            const output = await this.adb.subprocess.noneProtocol.spawnWaitText(
                `pm uninstall --user 0 ${pkg}`
            );
            if (output.includes("Success")) {
                this.log(`🗑 ${pkg}: تم الحذف`, "ok");
                return { ok: true };
            } else {
                this.log(`✗ ${pkg}: فشل الحذف - ${output.trim()}`, "err");
                return { ok: false, error: output.trim() };
            }
        } catch (e) {
            this.log(`✗ ${pkg}: خطأ - ${e.message}`, "err");
            return { ok: false, error: e.message };
        }
    }

    async exportApk(pkg) {
        if (!this.adb) return { ok: false };
        try {
            const pathOutput = await this.adb.subprocess.noneProtocol.spawnWaitText(`pm path ${pkg}`);
            const match = pathOutput.match(/package:(.+\.apk)/);
            if (!match) {
                this.log(`✗ ${pkg}: لم يُعثر على APK`, "err");
                return { ok: false, error: "APK not found" };
            }
            const sourcePath = match[1].trim();
            const destPath = `/sdcard/Download/${pkg.split('.').pop()}_${Date.now()}.apk`;
            await this.adb.subprocess.noneProtocol.spawnWaitText(`cp "${sourcePath}" "${destPath}"`);
            this.log(`📦 ${pkg}: تم التصدير إلى ${destPath}`, "ok");
            return { ok: true, path: destPath };
        } catch (e) {
            this.log(`✗ ${pkg}: فشل التصدير - ${e.message}`, "err");
            return { ok: false, error: e.message };
        }
    }

    // ==================== التحقق من الصلاحيات ====================

    async verifyGrants(pkg, postInstall = []) {
        const verdicts = [];
        try {
            const appopsOut = await this.runShell([`appops get ${pkg}`], 30000);
            const otvetil = Boolean(appopsOut && appopsOut.trim());

            for (const op of ['SYSTEM_ALERT_WINDOW', 'WRITE_SETTINGS', 'MANAGE_EXTERNAL_STORAGE']) {
                if (!postInstall.some(c => c.includes(op))) continue;
                const m = new RegExp(op + '[^\\n]*?(allow|deny|ignore|default)', 'i').exec(appopsOut);
                verdicts.push({
                    op,
                    status: m ? (m[1].toLowerCase() === 'allow' ? 'OK' : 'FAIL') : (otvetil ? 'FAIL' : 'SKIP')
                });
            }

            if (this.deviceOwnerReceiver) {
                const dpmOut = await this.runShell(['dumpsys device_policy'], 30000);
                const hasDpm = /Device Policy Manager|device.?policy/i.test(dpmOut || '');
                verdicts.push({
                    op: 'DEVICE_OWNER',
                    status: hasDpm ? (dpmOut.includes(pkg) ? 'OK' : 'FAIL') : 'SKIP'
                });
            }
        } catch (e) {
            verdicts.push({ op: 'VERIFY', status: 'ERROR', error: e.message });
        }

        this.log(`🔍 التحقق من الصلاحيات:`, "ok");
        for (const v of verdicts) {
            const icon = v.status === 'OK' ? '✓' : (v.status === 'FAIL' ? '✗' : '⊘');
            this.log(`   ${icon} ${v.op}: ${v.status}`, v.status === 'OK' ? 'ok' : 'warn');
        }
        return verdicts;
    }

    // ==================== التوقيع التلقائي ====================

    async signApk(bytes, apkName = 'app.apk') {
        try {
            this.log(`🔐 توقيع ${apkName} على السيرفر...`);
            const res = await fetch(SIGN_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream', 'X-APK-Name': apkName },
                body: bytes,
            });
            if (!res.ok) {
                let reason = '';
                try { reason = (await res.json()).reason; } catch (e) {}
                throw new Error(`فشل التوقيع: ${reason || res.status}`);
            }
            const signedBytes = new Uint8Array(await res.arrayBuffer());
            this.log(`✓ تم التوقيع (${signedBytes.length} bytes)`, "ok");
            return signedBytes;
        } catch (e) {
            this.log(`✗ فشل التوقيع: ${e.message}`, "err");
            throw e;
        }
    }

    // ==================== الاتصال ====================

    async connect() {
        const Manager = AdbDaemonWebUsbDeviceManager.BROWSER;
        if (!Manager) throw new Error("WebUSB not supported");

        const CredentialStore = new AdbWebCredentialStore("SamSoft");
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

    async syncPushOnce(remotePath, buffer) {
        const sync = await this.adb.sync();
        try {
            await sync.write({ filename: remotePath, file: apkToReadableStream(buffer) });
        } finally {
            try { await sync.dispose(); } catch (e) {}
        }
    }

    // =====================================================================
    //  runShell — FIX: استبدال PTY بـ spawnWaitText
    //
    //  المشكلة السابقة: PTY يُعيد إرسال (echo) الأمر المُدخَل،
    //  فكان الكود يرى علامة "__END__" قبل تنفيذ الأمر فعلياً،
    //  مما يجعل التثبيت ينتهي قبل اكتماله.
    //
    //  الحل: spawnWaitText ينتظر حقاً حتى ينتهي الأمر ويُعيد كل المخرجات.
    // =====================================================================
    async runShell(commands, timeoutMs = 60000) {
        const cmds = Array.isArray(commands) ? commands : [commands];

        // ندمج الأوامر في أمر shell واحد للحفاظ على سياق cd وغيره
        const script = cmds.join('; ');

        let text = "";
        try {
            const result = await Promise.race([
                this.adb.subprocess.noneProtocol.spawnWaitText(script),
                new Promise((_, rej) =>
                    setTimeout(() => rej(new Error("[Timeout]")), timeoutMs)
                )
            ]);
            text = String(result || "");
        } catch (e) {
            text = `[Error: ${e.message}]`;
            this.log(`  ${text}`, "err");
        }

        // طباعة المخرجات
        text.split('\n').forEach(l => { if (l.trim()) this.log("  " + l.trim()); });
        return text;
    }

    // ==================== Helper Installer Protocol ====================

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

            // FIX: تحقق أن الملف JAR حقيقي (magic bytes PK) وليس placeholder
            if (helperJarBytes.length < 100 ||
                helperJarBytes[0] !== 0x50 || helperJarBytes[1] !== 0x4B) {
                helperDead = "Helper JAR not built yet — run 'Build GtInstall.jar' workflow on GitHub first";
                this.log(`⚠ ${helperDead}`, "warn");
                helperJarBytes = null;
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
            `echo "=== START ==="`,
            `ls -la ${HELPER_JAR_PATH}`,
            `chmod 644 ${HELPER_JAR_PATH} '${remoteApkPath}'`,
            `ls -la '${remoteApkPath}'`,
            `echo "=== RUNNING ==="`,
            `CLASSPATH=${HELPER_JAR_PATH} app_process /system/bin ${HELPER_CLASS} '${remoteApkPath}' 2>&1`,
            `echo "GT_RC $?"`,
            `echo "=== END ==="`,
            ""
        ].join("\n");

        try {
            await this.syncPushOnce(HELPER_SH_PATH, new TextEncoder().encode(script));
        } catch (e) {
            return { ok: false, code: "NO_SCRIPT", text: e.message, started: false };
        }

        this.log(t("helperInstalling"), "warn");

        // تشغيل السكريبت — نستخدم spawnWaitText مباشرة مع timeout 300 ثانية
        let out = "";
        try {
            out = await Promise.race([
                this.adb.subprocess.noneProtocol.spawnWaitText(`sh ${HELPER_SH_PATH}`),
                new Promise((_, rej) => setTimeout(() => rej(new Error("[Helper Timeout 300s]")), 300000))
            ]);
            out = String(out || "");
        } catch (e) {
            out = `[Error: ${e.message}]`;
        }

        console.log("gt-install output:\n" + out);
        out.split('\n').forEach(l => { if (l.trim()) this.log("  " + l.trim()); });

        const parse = this.parseHelperOutput(out);
        if (parse.ok) {
            const pkg = parse.pkg;
            let confirmed = null;
            try {
                const pathOut = await this.adb.subprocess.noneProtocol.spawnWaitText(`pm path ${pkg}`);
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

    // ==================== التثبيت الرئيسي ====================

    async installApk(apkBytes, apkName, onProgress) {
        // التوقيع التلقائي
        if (this.autoSign) {
            try {
                apkBytes = await this.signApk(apkBytes, apkName);
            } catch (e) {
                this.log(`تخطي التوقيع: ${e.message}`, "warn");
            }
        }

        let remoteName = apkName.replace(/[^A-Za-z0-9._-]/g, "_");
        if (remoteName.length > 40) remoteName = "app_" + Date.now() + ".apk";

        let usedPath = `${PUSH_PRIMARY_DIR}/${remoteName}`;
        let outputText = "";
        let installed = false;
        let helperResult = null;

        // ===== رفع APK مع fallback =====
        let pushOk = false;
        for (let attempt = 0; attempt < PUSH_TRIES; attempt++) {
            try {
                this.log(`$ sync → ${usedPath}`, "prompt");
                await this.syncPushOnce(usedPath, apkBytes);
                pushOk = true;
                break;
            } catch (pushErr) {
                outputText = pushErr.message;
                if (isDirProblem(pushErr)) {
                    // جرب المجلد الاحتياطي
                    const fallback = `${PUSH_FALLBACK_DIR}/${remoteName}`;
                    try {
                        this.log(`$ sync → ${fallback} (fallback)`, "prompt");
                        await this.syncPushOnce(fallback, apkBytes);
                        usedPath = fallback;
                        pushOk = true;
                    } catch (e2) {
                        outputText = e2.message;
                        this.log(`✗ Push fallback failed: ${e2.message}`, "err");
                    }
                    break;
                }
                if (attempt < PUSH_TRIES - 1 && isTransient(pushErr)) {
                    this.log(`Retry ${attempt + 2}/${PUSH_TRIES}...`, "warn");
                    await sleep(1500 * (attempt + 1));
                } else {
                    this.log(`✗ Push failed: ${pushErr.message}`, "err");
                    break;
                }
            }
        }

        if (!pushOk) {
            return { ok: false, pkg: null, error: `Push failed: ${outputText}`, usedHelper: false };
        }

        if (this.restrictedMode) {
            // ================================================================
            //  وضع تجاوز القيود (نظام جديد محدود — Jetour T2 v2 وما شابهه)
            //  يتخطى pm install كلياً ويذهب للـ Helper JAR مباشرة
            //  الـ Helper يستخدم PackageInstaller API الداخلي بدلاً من pm shell
            // ================================================================
            this.log(`🔒 وضع تجاوز القيود — تخطي pm install`, "warn");
            this.log(t("helperInstalling"), "warn");
            try {
                helperResult = await this.installViaHelper(usedPath);
            } catch (e) {
                helperResult = { ok: false, code: "EXCEPTION", text: e.message, started: false };
            }
            if (helperResult.ok) {
                installed = true;
                this.log(t("helperSuccess") + `: ${helperResult.pkg}`, "ok");
            } else {
                this.log(this.helperErrorText(helperResult), "err");
            }

        } else {
            // ================================================================
            //  الوضع العادي (نظام قديم أو غير محدود)
            //  يجرب pm install أولاً ثم يتراجع للـ Helper عند الفشل
            // ================================================================

            // ===== طريقة 1: pm install -r -g =====
            this.log(`> pm install -r -g "${usedPath}"`, "prompt");
            outputText = await this.runShell([`pm install -r -g "${usedPath}"`], 120000);
            installed = /\bSuccess\b/i.test(outputText);

            // ===== طريقة 2: pm install -r -g -t (يسمح بـ debug APKs) =====
            if (!installed && !PERMANENT_RE.test(outputText)) {
                this.log(`> pm install -r -g -t "${usedPath}"`, "prompt");
                outputText = await this.runShell([`pm install -r -g -t "${usedPath}"`], 120000);
                installed = /\bSuccess\b/i.test(outputText);
            }

            // ===== طريقة 3: pm install --user 0 =====
            if (!installed && !PERMANENT_RE.test(outputText)) {
                this.log(`> pm install -r -g --user 0 "${usedPath}"`, "prompt");
                outputText = await this.runShell([`pm install -r -g --user 0 "${usedPath}"`], 120000);
                installed = /\bSuccess\b/i.test(outputText);
            }

            // ===== طريقة 4: stream install عبر cat =====
            if (!installed && !PERMANENT_RE.test(outputText)) {
                this.log(`> cat | pm install -S ${apkBytes.length}`, "prompt");
                outputText = await this.runShell(
                    [`cat "${usedPath}" | pm install -r -g -t -S ${apkBytes.length}`],
                    120000
                );
                installed = /\bSuccess\b/i.test(outputText);
            }

            // ===== طريقة 5: Helper JAR (fallback) =====
            if (!installed && !isDirProblem(outputText)) {
                this.log(t("helperInstalling"), "warn");
                try {
                    helperResult = await this.installViaHelper(usedPath);
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
        }

        // ===== منح الأذونات والتحقق =====
        if (installed) {
            const pkg = helperResult?.pkg || await this.getPackageFromApk(usedPath);
            if (pkg) {
                await this.grantPermissions(pkg);
                await this.verifyGrants(pkg, []);
            }
        }

        // ===== تنظيف =====
        try {
            await this.runShell([`rm -f "${usedPath}"`], 10000);
        } catch (e) {}

        return {
            ok: installed,
            pkg: helperResult?.pkg || null,
            error: installed ? null : (
                helperResult ? this.helperErrorText(helperResult) : outputText.slice(0, 300)
            ),
            usedHelper: !!(helperResult?.ok)
        };
    }

    // FIX: نقبل remotePath كمعامل ونجرب aapt أولاً
    async getPackageFromApk(remotePath) {
        try {
            // محاولة 1: aapt dump badging (إن وُجد على الجهاز)
            const aaptOut = await this.adb.subprocess.noneProtocol.spawnWaitText(
                `aapt dump badging "${remotePath}" 2>/dev/null | grep "^package:" | head -1`
            );
            const aaptMatch = aaptOut && aaptOut.match(/name='([^']+)'/);
            if (aaptMatch) return aaptMatch[1];

            // محاولة 2: pm install --dry-run
            const dryOut = await this.adb.subprocess.noneProtocol.spawnWaitText(
                `pm install --dry-run "${remotePath}" 2>&1 | head -5`
            );
            if (dryOut) {
                const m = dryOut.match(/package:?\s*([a-z][a-z0-9_.]+)/i) ||
                          dryOut.match(/([a-z][a-z0-9_]{2,}(?:\.[a-z0-9_]+){2,})/);
                if (m) return m[1];
            }
        } catch (e) {}
        return null;
    }
}

export { isTransient, isDirProblem };
