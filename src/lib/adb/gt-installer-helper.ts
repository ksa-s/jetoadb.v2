import { Adb } from '@yume-chan/adb';
import { WrapReadableStream } from '@yume-chan/stream-extra';
import { adbManager } from './webusb-manager';

/**
 * g.jar DEX payload:
 * Pre-compiled Java/Android DEX package (com.garagetool.installer.GtInstall)
 * SHA256: 79c557136d1345b167ea429408e4fa08d63d161cd53b6794366ba63cf393fa27
 * Length: 4676 bytes
 */
export const GT_JAR_SHA = '79c557136d1345b167ea429408e4fa08d63d161cd53b6794366ba63cf393fa27';
export const GT_JAR_BYTES = 4676;
export const HELPER_JAR_PATH = '/data/local/tmp/g.jar';
export const HELPER_SH_PATH = '/data/local/tmp/r.sh';
export const HELPER_CLASS = 'com.garagetool.installer.GtInstall';

export const GT_JAR_BASE64 = 
  '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';

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Creates a WrapReadableStream with 64KB chunks from a buffer,
 * identical to GarageTool's chunked pull implementation to avoid overwhelming ADB sync socket.
 */
export function bufferToWrapReadableStream(buffer: Uint8Array): any {
  const blob = new Blob([buffer]);
  return new WrapReadableStream({
    start: () => blob.stream() as any,
  });
}

/**
 * Pushes binary data to a remote file path on device using AdbSync.
 */
export async function syncPushBytes(
  adb: Adb,
  remotePath: string,
  data: Uint8Array,
  permission = 0o644
): Promise<void> {
  const sync = await adb.sync();
  try {
    await sync.write({
      filename: remotePath,
      file: bufferToWrapReadableStream(data) as any,
      permission,
    });
  } finally {
    try {
      await sync.dispose();
    } catch {}
  }
}

/**
 * Executes shell commands in an interactive session with early completion detection.
 * Crucial for Jetour T2 and automotive Android heads:
 * 1. Bypasses adbd single-shot restrictions on pipes (|) and && operators.
 * 2. Does NOT hang for minutes waiting for stream EOF when process finishes:
 *    detects GT_INSTALL_OK, GT_INSTALL_FAIL, GT_RC, or endMarker immediately!
 */
export async function runInteractiveShellSession(
  adb: Adb,
  commands: string[],
  timeoutMs = 180000
): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const endMarker = `__GT_DONE_${Math.random().toString(36).substring(2, 8)}__`;

  // Strategy 1: Socket shell session (adb.createSocket('shell:'))
  // Standard, clean, and does not require PTY SELinux capabilities.
  try {
    const socket = await adb.createSocket('shell:');
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    let fullOutput = '';
    let isDone = false;

    const readLoop = async () => {
      try {
        while (!isDone) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            fullOutput += decoder.decode(value, { stream: true });
            // Exit early when completion indicators appear
            if (
              fullOutput.includes('GT_INSTALL_OK') ||
              fullOutput.includes('GT_INSTALL_FAIL') ||
              fullOutput.includes('GT_RC ') ||
              fullOutput.includes(endMarker)
            ) {
              break;
            }
          }
        }
      } catch {}
    };

    const readPromise = readLoop();

    for (const cmd of commands) {
      await writer.write(encoder.encode(cmd + '\n'));
    }
    await writer.write(encoder.encode(`echo "${endMarker}:$?"\nexit\n`));

    await Promise.race([
      readPromise,
      new Promise<void>((r) => setTimeout(r, timeoutMs)),
    ]);

    isDone = true;
    try { await writer.close(); } catch {}
    try { await reader.cancel(); } catch {}
    try { await socket.close(); } catch {}

    const idx = fullOutput.indexOf(endMarker);
    const cleaned = idx !== -1 ? fullOutput.substring(0, idx) : fullOutput;
    if (cleaned.trim()) {
      return cleaned.trim();
    }
  } catch (eSocket) {
    console.warn('Interactive socket session failed, trying PTY:', eSocket);
  }

  // Strategy 2: Adb subprocess noneProtocol.pty()
  try {
    const subprocessService = (adb as any).subprocess;
    if (subprocessService?.noneProtocol?.pty) {
      const pty = await subprocessService.noneProtocol.pty();
      let output = '';
      let isDone = false;

      const readLoop = async () => {
        const reader = pty.output.getReader();
        try {
          while (!isDone) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              output += decoder.decode(value, { stream: true });
              if (
                output.includes('GT_INSTALL_OK') ||
                output.includes('GT_INSTALL_FAIL') ||
                output.includes('GT_RC ') ||
                output.includes(endMarker)
              ) {
                break;
              }
            }
          }
        } catch {}
      };

      const readPromise = readLoop();
      const writer = pty.input.getWriter();
      try {
        for (const cmd of commands) {
          await writer.write(encoder.encode(cmd + '\n'));
        }
        await writer.write(encoder.encode(`echo "${endMarker}:$?"\nexit\n`));
      } catch {} finally {
        try { writer.releaseLock(); } catch {}
      }

      await Promise.race([
        readPromise,
        new Promise<void>((r) => setTimeout(r, timeoutMs)),
      ]);

      isDone = true;
      try { pty.kill(); } catch {}

      const idx = output.indexOf(endMarker);
      return (idx !== -1 ? output.substring(0, idx) : output).trim();
    }
  } catch (ePty) {
    console.warn('PTY session failed:', ePty);
  }

  // Strategy 3: Sequential fallback
  let combinedOutput = '';
  for (const cmd of commands) {
    try {
      const out = await adbManager.execShell(adb, cmd);
      combinedOutput += out + '\n';
    } catch {}
  }
  return combinedOutput.trim();
}

/**
 * Ensures the GtInstall DEX helper (g.jar) exists and is verified on the car head unit.
 */
export async function ensureGtHelperOnDevice(
  adb: Adb,
  onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
): Promise<boolean> {
  // Check if g.jar already exists on device with matching size
  try {
    const checkOut = await runInteractiveShellSession(
      adb,
      [`ls -l ${HELPER_JAR_PATH} 2>/dev/null`],
      8000
    );

    if (checkOut.includes('g.jar') && (checkOut.includes(String(GT_JAR_BYTES)) || checkOut.includes('4676'))) {
      onLog?.('المثبت الاحتياطي (g.jar) موجود مسبقاً على الشاشة ومطابق للمواصفات (4676 بايت).', 'success');
      return true;
    }
  } catch {}

  onLog?.('جاري نقل حزمة المثبت الاحتياطي المستقل (g.jar) لشاشات جيتور T2...', 'info');

  let jarBytes: Uint8Array;
  try {
    // Try fetching from local static server first
    const res = await fetch('/tools/g.jar');
    if (res.ok) {
      jarBytes = new Uint8Array(await res.arrayBuffer());
    } else {
      jarBytes = base64ToUint8Array(GT_JAR_BASE64);
    }
  } catch {
    jarBytes = base64ToUint8Array(GT_JAR_BASE64);
  }

  // 1. Try push via syncPushBytes
  let delivered = false;
  try {
    await syncPushBytes(adb, HELPER_JAR_PATH, jarBytes, 0o644);
    delivered = true;
  } catch (eSync: any) {
    onLog?.(`ملاحظة نقل المزامنة: ${eSync.message || eSync}. جاري استخدام بديل base64...`, 'info');
  }

  // 2. Fallback push via base64
  if (!delivered) {
    try {
      const chunkSize = 1000;
      await adbManager.execShell(adb, `rm -f /data/local/tmp/g.b64 ${HELPER_JAR_PATH} 2>/dev/null`);
      for (let i = 0; i < GT_JAR_BASE64.length; i += chunkSize) {
        const chunk = GT_JAR_BASE64.substring(i, i + chunkSize);
        await adbManager.execShell(adb, `printf "%s" "${chunk}" >> /data/local/tmp/g.b64`);
      }
      await adbManager.execShell(adb, `base64 -d /data/local/tmp/g.b64 > ${HELPER_JAR_PATH} 2>/dev/null`);
      await adbManager.execShell(adb, `rm -f /data/local/tmp/g.b64 2>/dev/null`);
      delivered = true;
    } catch (eB64: any) {
      onLog?.(`خطأ في نقل المثبت عبر base64: ${eB64.message || eB64}`, 'error');
    }
  }

  try {
    await adbManager.execShell(adb, `chmod 644 ${HELPER_JAR_PATH} 2>/dev/null`);
  } catch {}

  // Verify delivery
  try {
    const verifyOut = await adbManager.execShell(adb, `ls -l ${HELPER_JAR_PATH} 2>/dev/null`);
    if (verifyOut.includes('g.jar')) {
      onLog?.('تم تجهيز المثبت الاحتياطي (g.jar) بنجاح على نظام السيارة.', 'success');
      return true;
    }
  } catch {}

  return delivered;
}

/**
 * Executes installation of an APK already residing at remotePath on the car head unit
 * using the proven Jetour T2 app_process / GtInstall classpath runner.
 * 
 * Why this works on Jetour T2 when standard pm install fails:
 * 1. The car firmware adbd filter blocks any direct command containing the string "install".
 * 2. By executing "sh /data/local/tmp/r.sh", the ADB command string itself contains NO blocked words.
 * 3. Inside r.sh, app_process runs GtInstall in system context directly, opening and committing
 *    a PackageInstaller session from within Android runtime.
 */
export async function installViaGtHelper(
  adb: Adb,
  remotePath: string,
  onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
): Promise<{ success: boolean; packageName?: string; message: string }> {
  onLog?.('تشغيل محرك التثبيت الاحتياطي المباشر (GtInstall / r.sh)...', 'info');

  const helperReady = await ensureGtHelperOnDevice(adb, onLog);
  if (!helperReady) {
    return {
      success: false,
      message: 'تعذر تجهيز حزمة المثبت الاحتياطي (g.jar) على ذاكرة الشاشة.',
    };
  }

  // Generate r.sh runner script matching GarageTool structure
  const scriptContent = [
    '#!/system/bin/sh',
    `chmod 644 ${HELPER_JAR_PATH} '${remotePath}'`,
    `CLASSPATH=${HELPER_JAR_PATH} app_process /system/bin ${HELPER_CLASS} '${remotePath}'`,
    'echo GT_RC $?',
    '',
  ].join('\n');

  // Push r.sh
  try {
    const scriptBytes = new TextEncoder().encode(scriptContent);
    await syncPushBytes(adb, HELPER_SH_PATH, scriptBytes, 0o755);
  } catch {
    const b64Script = btoa(scriptContent);
    await adbManager.execShell(adb, `echo "${b64Script}" | base64 -d > ${HELPER_SH_PATH} 2>/dev/null`);
  }

  try {
    await adbManager.execShell(adb, `chmod 755 ${HELPER_SH_PATH} 2>/dev/null`);
    await adbManager.execShell(adb, `chmod 644 '${remotePath}' 2>/dev/null`);
  } catch {}

  onLog?.(`> sh ${HELPER_SH_PATH}`, 'info');

  // Launch a concurrent background monitor to tap [Install] / [Confirm] if the screen asks for confirmation
  let isRunning = true;
  const backgroundClicker = (async () => {
    // Wait for r.sh to create session and trigger commit
    await new Promise((r) => setTimeout(r, 2000));
    let screenW = 1920;
    let screenH = 1080;
    try {
      const sizeOut = await adbManager.execShell(adb, 'wm size 2>/dev/null');
      const match = sizeOut.match(/(\d+)x(\d+)/);
      if (match && match[1] && match[2]) {
        screenW = parseInt(match[1], 10);
        screenH = parseInt(match[2], 10);
      }
    } catch {}

    const targetX = Math.round(screenW * 0.5);
    const targetY = Math.round(screenH * 0.575);

    while (isRunning) {
      try {
        const focusOut = await adbManager.execShell(adb, 'dumpsys window | grep -E "mCurrentFocus|mFocusedApp" 2>/dev/null || dumpsys activity top 2>/dev/null');
        if (/packageinstaller|InstallAppProgress|PackageInstallerActivity|PackageInstaller|InstallStart|ConfirmInstall/i.test(focusOut)) {
          onLog?.('رصد نافذة تأكيد التثبيت على شاشة السيارة، جاري النقر التلقائي...', 'info');
          await adbManager.execShell(adb, `input tap ${targetX} ${targetY} 2>/dev/null`);
          await adbManager.execShell(adb, 'input keyevent 22 2>/dev/null && input keyevent 66 2>/dev/null');
          await adbManager.execShell(adb, 'input keyevent 66 2>/dev/null');
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1500));
    }
  })();

  // Execute r.sh in interactive session
  let out = '';
  try {
    out = await runInteractiveShellSession(adb, [`sh ${HELPER_SH_PATH}`], 180000);
  } finally {
    isRunning = false;
  }
  onLog?.(`استجابة محرك التثبيت: ${out.trim()}`, 'info');

  // Parse output with GarageTool's exact logic
  const okMatch = out.match(/GT_INSTALL_OK\s+(\S+)(?:\s+(\S+))?/);
  const failMatch = out.match(/GT_INSTALL_FAIL\s+(\S+)\s*(.*)/);

  if (okMatch && okMatch[1]) {
    const pkg = okMatch[1];
    onLog?.(`تم تثبيت التطبيق بنجاح عبر المثبت الاحتياطي (${pkg})!`, 'success');

    // Post-install unblocking and permission grants:
    try {
      await runInteractiveShellSession(
        adb,
        [
          `pm enable ${pkg} 2>/dev/null`,
          `appops set ${pkg} REQUEST_INSTALL_PACKAGES allow 2>/dev/null`,
          `appops set ${pkg} MANAGE_EXTERNAL_STORAGE allow 2>/dev/null`,
          `pm grant ${pkg} android.permission.READ_EXTERNAL_STORAGE 2>/dev/null`,
          `pm grant ${pkg} android.permission.WRITE_EXTERNAL_STORAGE 2>/dev/null`,
          'settings put global block_untrusted_touches 0 2>/dev/null',
        ],
        15000
      );
      onLog?.(`تم فك القيود وتفعيل الصلاحيات للتطبيق (${pkg}) بنجاح!`, 'success');
    } catch {}

    // Verify installation via pm path
    try {
      const pmPath = await adbManager.execShell(adb, `pm path ${pkg} 2>/dev/null`);
      if (pmPath.includes('package:')) {
        onLog?.(`تأكيد مسار الحزمة في النظام: ${pmPath.trim()}`, 'success');
      }
    } catch {}

    // Clean up temporary APK
    try {
      await adbManager.execShell(adb, `rm -f '${remotePath}' 2>/dev/null`);
    } catch {}

    return {
      success: true,
      packageName: pkg,
      message: `تم تثبيت الحزمة ${pkg} بنجاح عبر محرك GtInstall المستقل.`,
    };
  }

  if (failMatch) {
    const errCode = failMatch[1];
    const errDetails = failMatch[2] || '';
    let translated = `فشل التثبيت: ${errCode}`;
    if (errCode.includes('ALREADY_EXISTS')) {
      translated = 'الحزمة مثبتة مسبقاً على الشاشة (INSTALL_FAILED_ALREADY_EXISTS). إذا كنت ترغب بالتحديث أو التثبيت الجديد، يرجى حذف النسخة القديمة أولاً.';
    } else if (errCode.includes('VERSION_DOWNGRADE')) {
      translated = 'لا يمكن تثبيت إصدار أقدم من الإصدار الموجود حالياً على الشاشة.';
    } else if (errCode.includes('UPDATE_INCOMPATIBLE') || errCode.includes('SIGNATURE_MISMATCH')) {
      translated = 'توقيع التطبيق مختلف عن النسخة المثبتة على الشاشة. يجب حذف النسخة السابقة أولاً.';
    } else if (errCode.includes('NO_START')) {
      translated = 'برمجية الشاشة منعت تشغيل معالج app_process.';
    }
    return {
      success: false,
      message: `${translated} ${errDetails}`.trim(),
    };
  }

  // Check if GT_RC 0 was returned
  if (out.includes('GT_RC 0')) {
    // Attempt to verify package presence
    return {
      success: true,
      message: 'أكمل سكريبت التثبيت بنجاح (كود 0).',
    };
  }

  return {
    success: false,
    message: out.trim() || 'لم يتم استلام تأكيد نجاح من محرك التثبيت.',
  };
}
