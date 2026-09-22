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

        // ================================================================
        //  قائمة الأذونات الشاملة — مُنظَّمة حسب الفئة
        // ================================================================

        // --- 1. AppOps (يُمنح عبر appops set، بغض النظر عن الـ manifest) ---
        const APPOPS = [
            'SYSTEM_ALERT_WINDOW',
            'REQUEST_INSTALL_PACKAGES',
            'MANAGE_EXTERNAL_STORAGE',
            'WRITE_SETTINGS',
            'WRITE_SECURE_SETTINGS',
            'GET_USAGE_STATS',
            'PACKAGE_USAGE_STATS',       // اسم بديل في الأجهزة القديمة
            'BIND_ACCESSIBILITY_SERVICE',
        ];

        // --- 2. أذونات خطرة Dangerous (pm grant) ---
        const DANGEROUS = [
            // تخزين
            'android.permission.READ_EXTERNAL_STORAGE',
            'android.permission.WRITE_EXTERNAL_STORAGE',
            // موقع جغرافي
            'android.permission.ACCESS_FINE_LOCATION',
            'android.permission.ACCESS_COARSE_LOCATION',
            'android.permission.ACCESS_BACKGROUND_LOCATION',
            // هاتف واتصالات
            'android.permission.READ_PHONE_STATE',
            'android.permission.CALL_PHONE',
            'android.permission.SEND_SMS',
            'android.permission.RECEIVE_SMS',
            // صوت وكاميرا
            'android.permission.RECORD_AUDIO',
            'android.permission.CAMERA',
            // بلوتوث Android 12+
            'android.permission.BLUETOOTH_SCAN',
            'android.permission.BLUETOOTH_CONNECT',
            'android.permission.BLUETOOTH_ADVERTISE',
            // إشعارات Android 13+
            'android.permission.POST_NOTIFICATIONS',
            // قاموس
            'android.permission.READ_USER_DICTIONARY',
            'android.permission.WRITE_USER_DICTIONARY',
        ];

        // --- 3. أذونات عادية Normal (تُمنح تلقائياً، pm grant لا يضر) ---
        const NORMAL = [
            // شبكة
            'android.permission.INTERNET',
            'android.permission.ACCESS_NETWORK_STATE',
            'android.permission.CHANGE_NETWORK_STATE',
            'android.permission.ACCESS_WIFI_STATE',
            'android.permission.CHANGE_WIFI_STATE',
            'android.permission.CHANGE_WIFI_MULTICAST_STATE',
            'android.permission.NFC',
            // بلوتوث قديم
            'android.permission.BLUETOOTH',
            'android.permission.BLUETOOTH_ADMIN',
            // عتاد
            'android.permission.TRANSMIT_IR',
            'android.permission.FLASHLIGHT',
            'android.permission.VIBRATE',
            // نظام وخلفية
            'android.permission.WAKE_LOCK',
            'android.permission.DISABLE_KEYGUARD',
            'android.permission.RECEIVE_BOOT_COMPLETED',
            'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
            'android.permission.KILL_BACKGROUND_PROCESSES',
            'android.permission.GET_TASKS',
            'android.permission.REORDER_TASKS',
            'android.permission.GET_PACKAGE_SIZE',
            'android.permission.FOREGROUND_SERVICE',
            'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
            'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
            // صوت ووسائط
            'android.permission.MODIFY_AUDIO_SETTINGS',
            // مزامنة وحسابات
            'android.permission.WRITE_SYNC_SETTINGS',
            'android.permission.READ_SYNC_SETTINGS',
            'android.permission.READ_SYNC_STATS',
            'android.permission.AUTHENTICATE_ACCOUNTS',
            'android.permission.MANAGE_ACCOUNTS',
            'android.permission.USE_CREDENTIALS',
            'android.permission.USE_BIOMETRIC',
            'android.permission.USE_FINGERPRINT',
        ];

        // --- 4. أذونات Signature (نجربها، الفشل متوقع على أجهزة غير مروّتة) ---
        const SIGNATURE = [
            'android.permission.INSTALL_PACKAGES',
            'android.permission.UPDATE_PACKAGES_WITHOUT_USER_ACTION',
            'android.permission.QUERY_ALL_PACKAGES',
            'android.permission.PACKAGE_USAGE_STATS',
            'android.permission.WRITE_SECURE_SETTINGS',
            'android.permission.MANAGE_DOCUMENTS',
            'android.permission.MOUNT_UNMOUNT_FILESYSTEMS',
            'android.permission.HARDWARE_TEST',
        ];

        let success = 0, fail = 0;

        // ── خطوة 1: AppOps ──────────────────────────────────────────────
        this.log(`🔐 [1/4] AppOps Permissions...`, "warn");
        for (const op of APPOPS) {
            try {
                let out = await this.adb.subprocess.noneProtocol.spawnWaitText(
                    `appops set ${pkg} ${op} allow 2>&1`
                );
                if (!out || /error|exception|unknown/i.test(out)) {
                    out = await this.adb.subprocess.noneProtocol.spawnWaitText(
                        `cmd appops set --uid ${pkg} ${op} allow 2>&1`
                    );
                }
                const bad = out && /error|exception/i.test(out) && !/not a changeable/i.test(out);
                if (bad) { fail++; this.log(`  ⚠ ${op}: ${out.trim().slice(0,60)}`, "warn"); }
                else      { success++; this.log(`  ✓ ${op}`, "ok"); }
            } catch (e) { fail++; }
        }

        // ── خطوة 2: Dangerous Permissions (pm grant — واحدة واحدة) ──────
        this.log(`🔐 [2/4] Dangerous Permissions (pm grant)...`, "warn");
        for (const perm of DANGEROUS) {
            const short = perm.split('.').pop();
            try {
                let out = await this.adb.subprocess.noneProtocol.spawnWaitText(
                    `pm grant ${pkg} ${perm} 2>&1`
                );
                let s = String(out || "").toLowerCase();

                // fallback: --user 0 على الأجهزة المقيّدة
                if (s.includes("securityexception") || s.includes("restricted")) {
                    out = await this.adb.subprocess.noneProtocol.spawnWaitText(
                        `pm grant --user 0 ${pkg} ${perm} 2>&1`
                    );
                    s = String(out || "").toLowerCase();
                }

                if (s.includes("not declared") || s.includes("not a changeable") ||
                    s.includes("unknown permission") || s.trim() === "") {
                    // غير مُعلَنة في manifest — طبيعي
                } else if (s.includes("error") || s.includes("exception") || s.includes("failed")) {
                    fail++; this.log(`  ⚠ ${short}: ${out.trim().slice(0,60)}`, "warn");
                } else {
                    success++; this.log(`  ✓ ${short}`, "ok");
                }
            } catch (e) { fail++; }
        }

        // ── خطوة 3: Normal + Signature (batch سريع — لا نهتم بالأخطاء) ──
        this.log(`🔐 [3/4] Normal & Signature Permissions (batch)...`, "warn");
        const batchPerms = [...NORMAL, ...SIGNATURE];
        try {
            const batchScript = batchPerms
                .map(p => `pm grant ${pkg} ${p} 2>/dev/null`)
                .join('; ');
            await this.adb.subprocess.noneProtocol.spawnWaitText(batchScript);
            this.log(`  ✓ batch: ${batchPerms.length} أذونات مُطبَّقة (الفشل متوقع للأذونات المقيّدة)`, "ok");
            success += batchPerms.length;
        } catch (e) {
            this.log(`  ⚠ batch: ${e.message}`, "warn");
        }

        // ── خطوة 4: أوامر خاصة ──────────────────────────────────────────
        this.log(`🔐 [4/4] Special Commands...`, "warn");
        const specialCmds = [
            // استثناء من توفير الطاقة
            `dumpsys deviceidle whitelist +${pkg} 2>/dev/null`,
            // وضع الموقع الجغرافي الكامل
            `settings put secure location_mode 3 2>/dev/null`,
            // تفعيل التطبيق بالكامل
            `pm enable ${pkg} 2>/dev/null`,
            // السماح بالإشعارات
            `cmd notification allow_dnd ${pkg} 2>/dev/null`,
            // السماح بالنافذة العائمة
            `appops set ${pkg} SYSTEM_ALERT_WINDOW allow 2>/dev/null`,
        ];
        try {
            await this.adb.subprocess.noneProtocol.spawnWaitText(specialCmds.join('; '));
            this.log(`  ✓ battery whitelist + location + notifications`, "ok");
            success++;
        } catch (e) {
            this.log(`  ⚠ special: ${e.message}`, "warn");
        }

        this.log(`✅ ${pkg}: ${success} ناجح، ${fail} فشل/متجاهَل من أصل ${APPOPS.length + DANGEROUS.length + batchPerms.length + 1}`, "ok");
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
        if (!this.adb) {
            throw new Error("انقطع الاتصال بالجهاز — أعد الاتصال وحاول مجدداً");
        }
        let sync;
        try {
            sync = await this.adb.sync();
        } catch (e) {
            // أخطاء USB الشائعة نعطيها رسالة أوضح
            const msg = e.message || "";
            if (msg.includes("transferIn") || msg.includes("cancelled") || msg.includes("state is in progress")) {
                throw new Error("خطأ USB — الجهاز مشغول أو انقطع الكيبل، افصل وأعد الاتصال");
            }
            throw e;
        }
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

    // =====================================================================
    //  إعدادات السيارة — تقسيم الشاشة + الدركسون
    // =====================================================================

    /**
     * تفعيل دعم النوافذ العائمة وتقسيم الشاشة
     */
    async enableSplitScreen() {
        if (!this.adb) return { ok: false, error: "No ADB" };
        this.log("📺 تفعيل دعم تقسيم الشاشة...", "warn");

        const settings = [
            ['enable_freeform_support',            '1'],
            ['force_resizable_activities',          '1'],
            ['enable_non_resizable_multi_window',   '1'],
            ['force_allow_on_external',             '1'],
        ];

        let ok = 0;
        for (const [key, val] of settings) {
            try {
                const out = await this.adb.subprocess.noneProtocol.spawnWaitText(
                    `settings put global ${key} ${val} 2>&1`
                );
                const good = !out || !/error|exception/i.test(out);
                if (good) { ok++; this.log(`  ✓ ${key} = ${val}`, "ok"); }
                else       { this.log(`  ⚠ ${key}: ${out.trim().slice(0,60)}`, "warn"); }
            } catch (e) {
                this.log(`  ⚠ ${key}: ${e.message}`, "warn");
            }
        }

        // تحقق من الإصدار — بعض الأجهزة تحتاج إعادة تشغيل
        const sdk = (await this.adb.subprocess.noneProtocol.spawnWaitText(
            'getprop ro.build.version.sdk'
        ).catch(() => '0')).trim();

        const msg = ok > 0
            ? `✓ تم التفعيل (Android SDK ${sdk}) — أعد تشغيل الشاشة لتطبيق التغييرات`
            : '✗ فشل التفعيل — قد يحتاج صلاحيات أعلى';

        this.log(msg, ok > 0 ? "ok" : "err");
        return { ok: ok > 0, sdk, msg };
    }

    /**
     * تشغيل تطبيق في نافذة عائمة (freeform)
     * windowingMode: 1=fullscreen, 3=split, 5=freeform
     */
    async launchFreeform(pkg, mode = 5) {
        if (!this.adb) return { ok: false, error: "No ADB" };

        // البحث عن النشاط الرئيسي
        let component = "";
        try {
            const r1 = await this.adb.subprocess.noneProtocol.spawnWaitText(
                `cmd package resolve-activity --brief ${pkg} 2>/dev/null | tail -1`
            );
            if (r1 && !r1.includes("No activity") && r1.includes("/")) {
                component = r1.trim();
            }
        } catch (e) {}

        // fallback: استخراج من dumpsys
        if (!component) {
            try {
                const r2 = await this.adb.subprocess.noneProtocol.spawnWaitText(
                    `dumpsys package ${pkg} 2>/dev/null | grep -A1 "android.intent.action.MAIN" | grep "${pkg}" | head -1`
                );
                const m = r2 && r2.match(/([\w.]+\/[\w.$]+)/);
                if (m) component = m[1];
            } catch (e) {}
        }

        const modeLabel = mode === 3 ? 'split-screen' : 'freeform';
        if (!component) {
            this.log(`⚠ ${pkg}: لم نجد النشاط الرئيسي، تشغيل عادي`, "warn");
            return await this.launchApp(pkg);
        }

        const out = await this.runShell(
            [`am start -n ${component} --windowingMode ${mode} 2>&1`],
            15000
        );
        const isOk = !/error|exception/i.test(out);
        this.log(
            isOk ? `📺 ${pkg}: ${modeLabel} ✓` : `✗ ${pkg}: ${out.trim().slice(0, 80)}`,
            isOk ? "ok" : "err"
        );
        return { ok: isOk, component, error: isOk ? null : out.trim() };
    }

    /**
     * كشف الأزرار التي يرسلها دركسون السيارة
     * المستخدم يضغط الأزرار أثناء مدة الكشف
     */
    async detectSteeringKeys(durationSec = 8) {
        if (!this.adb) return { detected: [], raw: "" };
        this.log(`🎛️ كشف أزرار الدركسون لمدة ${durationSec} ثوانٍ — اضغط الأزرار الآن...`, "warn");

        // تشغيل getevent في الخلفية
        let raw = "";
        try {
            raw = await Promise.race([
                this.adb.subprocess.noneProtocol.spawnWaitText(
                    `timeout ${durationSec} getevent -l 2>/dev/null`
                ),
                new Promise(r => setTimeout(() => r(""), (durationSec + 2) * 1000))
            ]);
        } catch (e) {
            raw = "";
        }

        // خريطة الأكواد الشائعة للسيارات الصينية
        const KNOWN_KEYS = {
            'KEY_NEXTSONG':    { label: '⏭ الأغنية التالية',    standard: true  },
            'KEY_PREVIOUSSONG':{ label: '⏮ الأغنية السابقة',    standard: true  },
            'KEY_PLAYPAUSE':   { label: '⏯ تشغيل / إيقاف',      standard: true  },
            'KEY_PLAY':        { label: '▶ تشغيل',               standard: true  },
            'KEY_PAUSE':       { label: '⏸ إيقاف مؤقت',          standard: true  },
            'KEY_STOP':        { label: '⏹ إيقاف كلي',            standard: true  },
            'KEY_VOLUMEUP':    { label: '🔊 رفع الصوت',           standard: true  },
            'KEY_VOLUMEDOWN':  { label: '🔉 خفض الصوت',           standard: true  },
            'KEY_MUTE':        { label: '🔇 كتم الصوت',           standard: true  },
            'KEY_PHONE':       { label: '📞 زر الهاتف',           standard: true  },
            'KEY_BACK':        { label: '↩ رجوع',                standard: true  },
            'KEY_HOME':        { label: '🏠 الرئيسية',            standard: true  },
            'KEY_MEDIA':       { label: '🎵 وسائط',               standard: true  },
            'KEY_MODE':        { label: '🔀 الوضع',               standard: false },
            'KEY_SCROLLUP':    { label: '🖱 تمرير لأعلى',         standard: false },
            'KEY_SCROLLDOWN':  { label: '🖱 تمرير لأسفل',         standard: false },
        };

        // نُحلّل فقط أحداث KEY_DOWN (0x0001 + value=1)
        const detected = new Map();
        for (const line of raw.split('\n')) {
            if (!line.includes('EV_KEY') && !line.match(/KEY_|BTN_/)) continue;
            // تجاهل KEY_UP
            if (line.includes(' 0000 0000') || line.endsWith(' 0')) continue;

            for (const [code, info] of Object.entries(KNOWN_KEYS)) {
                if (line.includes(code)) {
                    detected.set(code, { ...info, code });
                }
            }
            // أكواد غير معروفة
            const m = line.match(/(KEY_\w+|BTN_\w+)/);
            if (m && !KNOWN_KEYS[m[1]] && !detected.has(m[1])) {
                detected.set(m[1], { code: m[1], label: `❓ ${m[1]}`, standard: false });
            }
        }

        const arr = [...detected.values()];
        const hasStandard = arr.some(k => k.standard);

        if (arr.length === 0) {
            this.log("⚠ لم يُكتشف أي زر — تحقق من توصيل الدركسون أو جرب مرة أخرى", "warn");
        } else {
            this.log(`✓ اكتُشف ${arr.length} زر — ${hasStandard
                ? 'أزرار قياسية: ستعمل تلقائياً مع مشغلات الموسيقى 🎵'
                : 'أكواد مخصصة: قد تحتاج إعادة تعيين'}`, "ok");
            arr.forEach(k => this.log(`  • ${k.code} → ${k.label}`, k.standard ? "ok" : "warn"));
        }

        return { detected: arr, hasStandard, raw };
    }

    /**
     * إرسال أمر وسائط للتطبيق النشط
     */
    async sendMediaKey(keycode) {
        if (!this.adb) return;
        await this.adb.subprocess.noneProtocol.spawnWaitText(
            `input keyevent ${keycode} 2>&1`
        );
    }

    /**
     * جعل تطبيق يظهر في قائمة التطبيقات (launcher)
     */
    async showInLauncher(pkg) {
        if (!this.adb) return { ok: false };
        try {
            // تفعيل التطبيق بالكامل
            await this.adb.subprocess.noneProtocol.spawnWaitText(`pm enable ${pkg} 2>&1`);

            // محاولة تفعيل نشاط الـ launcher إذا كان مُعطَّلاً
            const components = await this.adb.subprocess.noneProtocol.spawnWaitText(
                `pm dump ${pkg} 2>/dev/null | grep -E "android.intent.action.MAIN|LAUNCHER" -A1 | grep "${pkg}" | head -3`
            );
            for (const line of components.split('\n')) {
                const m = line.match(/([\w.]+\/[\w.$]+)/);
                if (m) {
                    await this.adb.subprocess.noneProtocol.spawnWaitText(
                        `pm enable ${m[1]} 2>&1`
                    );
                }
            }

            this.log(`✓ ${pkg}: مرئي في قائمة التطبيقات`, "ok");
            return { ok: true };
        } catch (e) {
            this.log(`✗ ${pkg}: ${e.message}`, "err");
            return { ok: false, error: e.message };
        }
    }
}

export { isTransient, isDirProblem };
