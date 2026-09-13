// =====================================================================
//  بروتوكول التثبيت الاحتياطي (Helper Installer Protocol)
//  الغرض: تجاوز حظر pm install على شاشات السيارات (Jetour T2 وغيرها)
//  الطريقة: استخدام app_process لتشغيل g.jar داخل النظام بصلاحيات أعلى
// =====================================================================

const HELPER_JAR_URL = "/tools/g.jar";
const HELPER_JAR_PATH = "/data/local/tmp/g.jar";
const HELPER_SH_PATH = "/data/local/tmp/r.sh";
const HELPER_JAR_BYTES_EXPECTED = 4676; // سيتم تحديثه بعد تصريف g.jar
const HELPER_CLASS = "com.garagetool.installer.GtInstall";
const PUSH_PRIMARY_DIR = "/data/local/tmp";

let helperJarBytes = null;
let helperDelivered = false;
let helperDead = "";

// تعريف تعابير الفحص الدقيقة لمشاكل الاتصال والذاكرة
const PERMANENT_RE = /cannot stat|no space left|read-only file system|permission denied|install_failed|is not auth|not enough space/i;
const TRANSIENT_RE = /transport endpoint|couldn't create file|broken pipe|input\/output error|bad address|stat failed|protocol fault|resource temporarily unavailable|econnreset|connection reset|network error|failed to fetch|load failed|no such file or directory|device is busy|timed?\s?out|таймаут|device not found|device disconnected/i;

function isTransient(text) {
    const s = String(text && text.message ? text.message : text || "");
    return !PERMANENT_RE.test(s) && TRANSIENT_RE.test(s);
}

function isDirProblem(text) {
    const s = String(text && text.message ? text.message : text || "");
    if (/cannot stat/i.test(s)) return false;
    return /no space left|not enough space|insufficient[ _]storage|read-only file system|permission denied/i.test(s);
}

// دالة مساعدة: تحويل buffer إلى stream
function apkToReadableStream(buffer) {
    let offset = 0;
    const CHUNK = 1024 * 1024;
    return new ReadableStream({
        pull(controller) {
            if (offset >= buffer.length) {
                controller.close();
                return;
            }
            const end = Math.min(offset + CHUNK, buffer.length);
            controller.enqueue(buffer.subarray(offset, end));
            offset = end;
        }
    });
}

// دالة مساعدة: دفعة واحدة عبر ADB Sync
async function syncPushOnce(remotePath, buffer) {
    const sync = await adb.sync();
    try {
        await sync.write({
            filename: remotePath,
            file: apkToReadableStream(buffer)
        });
    } finally {
        try {
            await sync.dispose();
        } catch (e) {
            /* تم الإغلاق مسبقاً */
        }
    }
}

// دالة مساعدة: تنفيذ أوامر في جلسة تفاعلية PTY
async function runShellSession(commands, timeoutMs = 180000) {
    const pty = await adb.subprocess.noneProtocol.pty();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        try {
            pty.kill();
        } catch (e) {}
    }, timeoutMs);

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
        try {
            writer.releaseLock();
        } catch (e) {}
    }

    await readDone;
    clearTimeout(timer);
    if (timedOut) output += "\n[انتهت المهلة]";
    return output;
}

// دالة تحميل g.jar إلى الجهاز (مرة واحدة فقط)
async function ensureHelperOnDevice() {
    if (helperDelivered) return "";
    if (helperDead) return helperDead;

    if (!helperJarBytes) {
        try {
            const res = await fetch(HELPER_JAR_URL, { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            helperJarBytes = new Uint8Array(await res.arrayBuffer());
        } catch (e) {
            helperDead = "تعذر تحميل المثبت الاحتياطي: " + e.message;
            return helperDead;
        }
        if (helperJarBytes.length !== HELPER_JAR_BYTES_EXPECTED) {
            helperDead = `حجم المثبت غير صحيح (${helperJarBytes.length} بدلاً من ${HELPER_JAR_BYTES_EXPECTED})`;
            helperJarBytes = null;
            return helperDead;
        }
    }

    try {
        await syncPushOnce(HELPER_JAR_PATH, helperJarBytes);
    } catch (e) {
        helperDead = "تعذر دفع المثبت إلى الجهاز: " + e.message;
        return helperDead;
    }

    // التحقق من السلامة (اختياري - قد لا يتوفر sha256sum)
    try {
        const out = await runShellSession([`sha256sum ${HELPER_JAR_PATH}`], 30000);
        if (!/[0-9a-f]{64}/i.test(out)) {
            toolLog("تم إرسال المثبت الاحتياطي (لا يمكن التحقق من البصمة على هذا الجهاز).", "warn");
        }
    } catch (e) {}

    helperDelivered = true;
    return "";
}

// دالة تحليل مخرجات المثبت
function razborHelperVyvoda(out) {
    const text = String(out || "");
    const zapuskalsya = /GT_/.test(text);
    const okMatch = text.match(/GT_INSTALL_OK\s+(\S+)(?:\s+(\S+))?/);
    if (okMatch) return { ok: true, pkg: okMatch[1], code: "OK", text: "", zapuskalsya: true };
    const failMatch = text.match(/GT_INSTALL_FAIL\s+(\S+)\s*(.*)/);
    if (failMatch) return { ok: false, pkg: null, code: failMatch[1], text: (failMatch[2] || "").trim(), zapuskalsya: true };
    return { ok: false, pkg: null, code: zapuskalsya ? "NO_VERDICT" : "NO_START", text: "", zapuskalsya };
}

// الدالة الرئيسية: تثبيت عبر المثبت الاحتياطي
async function installViaHelper(remoteApkPath) {
    if (!adb) return { ok: false, code: "NO_ADB", text: "لا يوجد اتصال ADB", zapuskalsya: false };

    const problema = await ensureHelperOnDevice();
    if (problema) return { ok: false, code: "NO_HELPER", text: problema, zapuskalsya: false };

    // إنشاء سكريبت r.sh (المسار مدمج داخل الملف لتجنب فلترة adbd)
    const script = [
        "#!/system/bin/sh",
        `chmod 644 ${HELPER_JAR_PATH} '${remoteApkPath}'`,
        `CLASSPATH=${HELPER_JAR_PATH} app_process /system/bin ${HELPER_CLASS} '${remoteApkPath}'`,
        "echo GT_RC $?",
        ""
    ].join("\n");

    try {
        await syncPushOnce(HELPER_SH_PATH, new TextEncoder().encode(script));
    } catch (e) {
        return { ok: false, code: "NO_SCRIPT", text: e.message, zapuskalsya: false };
    }

    toolLog("التثبيت العادي رُفض من النظام. أجرب المثبت الاحتياطي...", "warn");
    toolLog(`> sh ${HELPER_SH_PATH}`, "prompt");
    const out = await runShellSession([`sh ${HELPER_SH_PATH}`], 300000);
    console.log("gt-install output:\n" + out);

    const razbor = razborHelperVyvoda(out);
    if (razbor.ok) {
        const pkg = razbor.pkg;
        // تحقق مزدوج: هل الحزمة موجودة فعلاً؟
        let podtverzhden = null;
        try {
            const pathOut = await runShellSession([`pm path ${pkg}`], 30000);
            if (/package:\S+/.test(pathOut)) podtverzhden = true;
            else podtverzhden = false;
        } catch (e) { /* لا نستطيع التحقق */ }

        if (podtverzhden === false) {
            return { ok: false, code: "NO_PATH", text: `المثبت ادعى النجاح لكن الحزمة ${pkg} غير موجودة`, zapuskalsya: true };
        }
        return { ok: true, pkg, code: "OK", text: "", zapuskalsya: true };
    }
    return razbor;
}

// دالة مساعدة: ترجمة أخطاء المثبت الاحتياطي إلى نص مفهوم
function helperOtkazText(r) {
    if (!r) return "المثبت الاحتياطي فشل دون تفاصيل.";
    if (r.code === "NO_START") return "المثبت الاحتياطي لم يستطع العمل على هذه الشاشة (النظام منع app_process).";
    if (r.code === "NO_HELPER" || r.code === "NO_SCRIPT") return r.text || "تعذر تجهيز المثبت الاحتياطي.";
    if (r.code === "NO_PATH") return r.text;
    return `المثبت الاحتياطي فشل أيضاً (${r.code}${r.text ? ": " + r.text : ""})`;
}

// =====================================================================
//  توضيح موقع الدمج داخل دالة installBatchShell الأصلية لديك
// =====================================================================
/*
    // 1. الأمر الأصلي لـ pm install كما هو في موقعك:
    outputText = await runShellSession([
        `cd ${dir}`,
        `cat "${remoteName}" | pm install -S ${buffer.length}`
    ]);

    if (/Success/i.test(outputText)) {
        postavleno = true;
    }

    // 2. كود الدمج الاحتياطي يوضع هنا مباشرة:
    let helperRezultat = null;
    if (!postavleno && remotePath && !isDirProblem(outputText) && !isTransient(outputText)) {
        try {
            helperRezultat = await installViaHelper(remotePath);
        } catch (e) {
            helperRezultat = { ok: false, code: "SBOY", text: e.message, zapuskalsya: false };
        }
        if (helperRezultat.ok) {
            postavleno = true;
            toolLog(`تم التثبيت بنجاح عبر المثبت الاحتياطي: ${helperRezultat.pkg}`, "ok");
        } else {
            toolLog(helperOtkazText(helperRezultat), "err");
        }
    }
*/
