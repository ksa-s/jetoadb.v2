// =====================================================================
//  webadb.js — البروتوكول الاحتياطي الكامل + دوال التثبيت الأصلية
//  الغرض: تجاوز حظر pm install على شاشات السيارات (Jetour T2 وغيرها)
//  الطريقة: app_process + g.jar
// =====================================================================

// ---------- الثوابت ----------
const HELPER_JAR_URL = "./tools/g.jar";
const HELPER_JAR_PATH = "/data/local/tmp/g.jar";
const HELPER_SH_PATH = "/data/local/tmp/r.sh";
const HELPER_JAR_BYTES_EXPECTED = 0; // 0 = تعطيل التحقق (حدّثه لاحقاً بالحجم الحقيقي)
const HELPER_CLASS = "com.garagetool.installer.GtInstall";
const PUSH_PRIMARY_DIR = "/data/local/tmp";
const PUSH_FALLBACK_DIR = "/sdcard/Download";
const PUSH_TRIES = 3;

let helperJarBytes = null;
let helperDelivered = false;
let helperDead = "";

// ---------- تعابير الفحص ----------
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

// ---------- دوال مساعدة ----------
function apkToReadableStream(buffer) {
    let offset = 0;
    const CHUNK = 1024 * 1024;
    return new ReadableStream({
        pull(controller) {
            if (offset >= buffer.length) { controller.close(); return; }
            const end = Math.min(offset + CHUNK, buffer.length);
            controller.enqueue(buffer.subarray(offset, end));
            offset = end;
        }
    });
}

async function syncPushOnce(remotePath, buffer) {
    const sync = await adb.sync();
    try {
        await sync.write({ filename: remotePath, file: apkToReadableStream(buffer) });
    } finally {
        try { await sync.dispose(); } catch (e) {}
    }
}

async function runShellSession(commands, timeoutMs = 180000) {
    const pty = await adb.subprocess.noneProtocol.pty();
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
    if (timedOut) output += "\n[انتهت المهلة]";
    return output;
}

// ---------- البروتوكول الاحتياطي ----------
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
        if (HELPER_JAR_BYTES_EXPECTED > 0 && helperJarBytes.length !== HELPER_JAR_BYTES_EXPECTED) {
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

    try {
        const out = await runShellSession([`sha256sum ${HELPER_JAR_PATH}`], 30000);
        if (!/[0-9a-f]{64}/i.test(out)) {
            toolLog("تم إرسال المثبت الاحتياطي (لا يمكن التحقق من البصمة على هذا الجهاز).", "warn");
        }
    } catch (e) {}

    helperDelivered = true;
    return "";
}

function razborHelperVyvoda(out) {
    const text = String(out || "");
    const zapuskalsya = /GT_/.test(text);
    const okMatch = text.match(/GT_INSTALL_OK\s+(\S+)(?:\s+(\S+))?/);
    if (okMatch) return { ok: true, pkg: okMatch[1], code: "OK", text: "", zapuskalsya: true };
    const failMatch = text.match(/GT_INSTALL_FAIL\s+(\S+)\s*(.*)/);
    if (failMatch) return { ok: false, pkg: null, code: failMatch[1], text: (failMatch[2] || "").trim(), zapuskalsya: true };
    return { ok: false, pkg: null, code: zapuskalsya ? "NO_VERDICT" : "NO_START", text: "", zapuskalsya };
}

async function installViaHelper(remoteApkPath) {
    if (!adb) return { ok: false, code: "NO_ADB", text: "لا يوجد اتصال ADB", zapuskalsya: false };

    const problema = await ensureHelperOnDevice();
    if (problema) return { ok: false, code: "NO_HELPER", text: problema, zapuskalsya: false };

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
        let podtverzhden = null;
        try {
            const pathOut = await runShellSession([`pm path ${pkg}`], 30000);
            if (/package:\S+/.test(pathOut)) podtverzhden = true;
            else podtverzhden = false;
        } catch (e) {}

        if (podtverzhden === false) {
            return { ok: false, code: "NO_PATH", text: `المثبت ادعى النجاح لكن الحزمة ${pkg} غير موجودة`, zapuskalsya: true };
        }
        return { ok: true, pkg, code: "OK", text: "", zapuskalsya: true };
    }
    return razbor;
}

function helperOtkazText(r) {
    if (!r) return "المثبت الاحتياطي فشل دون تفاصيل.";
    if (r.code === "NO_START") return "المثبت الاحتياطي لم يستطع العمل على هذه الشاشة (النظام منع app_process).";
    if (r.code === "NO_HELPER" || r.code === "NO_SCRIPT") return r.text || "تعذر تجهيز المثبت الاحتياطي.";
    if (r.code === "NO_PATH") return r.text;
    return `المثبت الاحتياطي فشل أيضاً (${r.code}${r.text ? ": " + r.text : ""})`;
}

// =====================================================================
//  دالة التثبيت الأصلية installBatchShell (مستعادة من كودك الأصلي)
// =====================================================================
async function installBatchShell(items) {
    let ok = 0, fail = 0; const results = []; let lastError = "";
    for (const item of items) {
        toolLog(`--- ${item.name} ---`);
        let itemOk = false, itemErr = "", tries = 0;
        try {
            const buffer = await getBytesWithRetry(item);
            const remoteName = sanitizeRemoteName(item.remoteName || item.name);
            let outputText = "";

            let dir = PUSH_PRIMARY_DIR;
            let helperPath = "";
            for (let attempt = 0; attempt < PUSH_TRIES; attempt++) {
                const remotePath = `${dir}/${remoteName}`;
                tries = attempt + 1;
                if (attempt > 0) {
                    await sleep(1500 * attempt);
                }

                try {
                    toolLog(`$ push -> ${remotePath}`, "prompt");
                    await syncPushOnce(remotePath, buffer);
                } catch (pushErr) {
                    outputText = pushErr.message;
                    if (isDirProblem(pushErr) && dir === PUSH_PRIMARY_DIR) {
                        toolLog(`في مجلد الخدمة لا يمكن الكتابة (${pushErr.message}). أجرب مجلد التنزيلات...`);
                        dir = PUSH_FALLBACK_DIR;
                        continue;
                    }
                    if (attempt < PUSH_TRIES - 1 && isTransient(pushErr)) {
                        toolLog(`انقطع الاتصال بالذاكرة. محاولة ${attempt + 2} من ${PUSH_TRIES}...`);
                        continue;
                    }
                    throw pushErr;
                }

                toolLog(`> cd ${dir}`, "prompt");
                toolLog(`> cat "${remoteName}" | pm install -S ${buffer.length}`, "prompt");
                outputText = await runShellSession([
                    `cd ${dir}`,
                    `cat "${remoteName}" | pm install -S ${buffer.length}`
                ]);

                const uspekh = outputText.includes("Success");
                const vyhodim = uspekh || attempt >= PUSH_TRIES - 1 || !isTransient(outputText);

                const zhdyotHelper = vyhodim && !uspekh;
                if (!zhdyotHelper) {
                    try {
                        await adb.subprocess.noneProtocol.spawnWaitText(`rm -f "${remotePath}"`);
                    } catch (e) {}
                }

                if (vyhodim) { if (zhdyotHelper) helperPath = remotePath; break; }
                toolLog(`فشل التثبيت. محاولة ${attempt + 2} من ${PUSH_TRIES}...`);
            }

            let postavleno = outputText.includes("Success");
            let helperRezultat = null;

            // ============================================================
            // ✅ كود الدمج: البروتوكول الاحتياطي
            // ============================================================
            if (!postavleno && helperPath && !isDirProblem(outputText) && !isTransient(outputText)) {
                try {
                    helperRezultat = await installViaHelper(helperPath);
                } catch (e) {
                    helperRezultat = { ok: false, code: "SBOY", text: e.message, zapuskalsya: false };
                    console.error(e);
                }
                if (helperRezultat.ok) {
                    postavleno = true;
                    toolLog(`تم التثبيت بنجاح عبر المثبت الاحتياطي: ${helperRezultat.pkg}`, "ok");
                } else {
                    toolLog(helperOtkazText(helperRezultat), "err");
                }
            }
            if (helperPath) {
                try {
                    await adb.subprocess.noneProtocol.spawnWaitText(`rm -f "${helperPath}"`);
                } catch (e) {}
            }
            // ============================================================

            if (postavleno) {
                itemOk = true;
                if (!helperRezultat) {
                    toolLog(tries > 1 ? `تم التثبيت بنجاح (محاولة ${tries}).` : "تم التثبيت بنجاح.", "ok");
                }
                if (item.postInstall && item.postInstall.length) {
                    toolLog("تطبيق الصلاحيات...");
                    const grantOut = await runShellSession(item.postInstall, 60000);
                    console.log("postInstall output:\n" + grantOut);
                    soobshchitProPrava(await verifyGrants(item.postInstall, item.name), grantOut, item.name);
                }
            } else {
                const reason = logFailure(item.name, outputText, { downloadUrl: item.url });
                itemErr = `${reason} · ${failureDetails(outputText)}`;
                if (helperRezultat) itemErr += ` · ${helperOtkazText(helperRezultat)}`;
                lastError = `${item.name}: ${itemErr}`;
            }
        } catch (err) {
            const reason = logFailure(item.name, err, { downloadUrl: item.url });
            itemErr = `${reason} · ${err.message}`;
            lastError = `${item.name}: ${itemErr}`;
            console.error(err);
        }
        if (itemOk) ok++; else fail++;
        results.push({
            name: item.name,
            ok: itemOk,
            err: itemErr && tries > 1 ? `${itemErr} · محاولات: ${tries}` : itemErr,
            tries,
        });
    }
    reportInstall(ok, fail, items, results, lastError);
    toolLog("=== انتهى ===", "ok");
    showAppNotes(items, results);
}

// =====================================================================
//  الدوال المعتمدة عليها من installBatchShell (يجب أن تكون موجودة)
// =====================================================================
// ⚠️ إذا كانت هذه الدوال مفقودة من موقعك، أرسل لي الكود الأصلي لها:
//  - getBytesWithRetry
//  - sanitizeRemoteName
//  - sleep
//  - logFailure
//  - reportInstall
//  - showAppNotes
//  - verifyGrants
//  - soobshchitProPrava
//  - failureDetails
//  - toolLog
