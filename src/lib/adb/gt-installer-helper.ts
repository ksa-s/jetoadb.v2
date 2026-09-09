import { Adb } from '@yume-chan/adb';
import { WrapReadableStream } from '@yume-chan/stream-extra';
import { adbManager } from './webusb-manager';

export const GT_JAR_BASE64 =
  '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';

export const GT_JAR_SHA = '79c557136d1345b167ea429408e4fa08d63d161cd53b6794366ba63cf393fa27';
export const GT_JAR_BYTES = 4676;
export const HELPER_JAR_PATH = '/data/local/tmp/g.jar';
export const HELPER_SH_PATH = '/data/local/tmp/r.sh';
export const HELPER_CLASS = 'com.garagetool.installer.GtInstall';

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Executes a series of commands in an interactive PTY shell session.
 * Crucial for Jetour T2 and protected car head units where single-shot exec
 * blocks pipes (|) and logical operators (&&).
 */
export async function runInteractiveShellSession(
  adb: Adb,
  commands: string[],
  timeoutMs = 180000
): Promise<string> {
  // Strategy 1: Adb subprocess noneProtocol.pty()
  try {
    const subprocessService = (adb as any).subprocess;
    if (subprocessService?.noneProtocol?.pty) {
      const pty = await subprocessService.noneProtocol.pty();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let output = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          pty.kill();
        } catch {}
      }, timeoutMs);

      const readDone = (async () => {
        const reader = pty.output.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) output += decoder.decode(value, { stream: true });
          }
        } catch {}
      })();

      const writer = pty.input.getWriter();
      try {
        for (const cmd of commands) {
          await writer.write(encoder.encode(cmd + '\n'));
        }
        await writer.write(encoder.encode('exit\n'));
      } catch {
      } finally {
        try {
          writer.releaseLock();
        } catch {}
      }

      await readDone;
      clearTimeout(timer);
      if (timedOut) output += '\n[SESSION_TIMEOUT]';
      return output;
    }
  } catch (ePty: any) {
    console.warn('PTY session unavailable, falling back to interactive socket:', ePty);
  }

  // Strategy 2: Raw interactive socket (adb.createSocket('shell:'))
  try {
    const socket = await adb.createSocket('shell:');
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let fullOutput = '';
    const endMarker = `__GT_DONE_${Math.random().toString(36).substring(2, 8)}__`;

    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          fullOutput += decoder.decode(value, { stream: true });
          if (fullOutput.includes(endMarker)) break;
        }
      }
    })();

    for (const cmd of commands) {
      await writer.write(encoder.encode(cmd + '\n'));
    }
    await writer.write(encoder.encode(`echo "${endMarker}"\nexit\n`));

    await Promise.race([
      readPromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SOCKET_TIMEOUT')), timeoutMs)),
    ]);

    try { await writer.close(); } catch {}
    try { await reader.cancel(); } catch {}
    try { await socket.close(); } catch {}

    const idx = fullOutput.indexOf(endMarker);
    return idx !== -1 ? fullOutput.substring(0, idx).trim() : fullOutput.trim();
  } catch (eSocket: any) {
    console.warn('Interactive socket fallback failed, running via execShell:', eSocket);
  }

  // Strategy 3: Sequential execShell fallback
  let combinedOutput = '';
  for (const cmd of commands) {
    try {
      const out = await adbManager.execShell(adb, cmd);
      combinedOutput += out + '\n';
    } catch {}
  }
  return combinedOutput;
}

/**
 * Ensures the GtInstall DEX helper (g.jar) exists and is verified on the car head unit.
 */
export async function ensureGtHelperOnDevice(
  adb: Adb,
  onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
): Promise<boolean> {
  // Check if g.jar is already on the head unit and valid
  try {
    const checkOut = await runInteractiveShellSession(
      adb,
      [`sha256sum ${HELPER_JAR_PATH} 2>/dev/null || ls -l ${HELPER_JAR_PATH} 2>/dev/null`],
      15000
    );

    if (checkOut.includes(GT_JAR_SHA) || (checkOut.includes('g.jar') && checkOut.includes(String(GT_JAR_BYTES)))) {
      onLog?.('المثبت الاحتياطي (g.jar) موجود مسبقاً على الشاشة ومطابق للمواصفات (4676 بايت).', 'success');
      return true;
    } else {
      // Clean up any stale or corrupted previous g.jar on the car head unit
      try {
        await runInteractiveShellSession(adb, [`rm -f ${HELPER_JAR_PATH} 2>/dev/null`], 5000);
      } catch {}
    }
  } catch {}

  onLog?.('جاري نقل حزمة المثبت الاحتياطي المستقل (g.jar) لشاشات جيتور T2...', 'info');

  const jarBytes = base64ToUint8Array(GT_JAR_BASE64);

  // 1. Try push via AdbSync
  let delivered = false;
  try {
    const sync = await adb.sync();
    try {
      const readable = new WrapReadableStream<Uint8Array>({
        start: () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(jarBytes);
              controller.close();
            },
          }) as any,
      });

      await sync.write({
        filename: HELPER_JAR_PATH,
        file: readable as any,
        permission: 0o644,
      });
      delivered = true;
    } finally {
      try {
        await sync.dispose();
      } catch {}
    }
  } catch (eSync: any) {
    onLog?.(`ملاحظة نقل المزامنة: ${eSync.message || eSync}. جاري استخدام بديل base64...`, 'info');
  }

  // 2. Fallback push via shell base64
  if (!delivered) {
    try {
      // Chunk base64 into manageable chunks to avoid shell argument length limit
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

  // Set file permissions
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
 * Why this works on Jetour T2 when pm install fails:
 * 1. The firmware adbd blocks any direct shell command line containing the lowercase word "install".
 * 2. By writing a runner script "/data/local/tmp/r.sh", the executed ADB command is "sh /data/local/tmp/r.sh",
 *    which does NOT contain the filtered word.
 * 3. Inside r.sh, app_process invokes GtInstall in system context directly, creating and committing
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

  // Pre-unlock permissions prior to running r.sh
  try {
    await runInteractiveShellSession(
      adb,
      [
        'settings put secure install_non_market_apps 1 2>/dev/null',
        'settings put global install_non_market_apps 1 2>/dev/null',
        'settings put global block_untrusted_touches 0 2>/dev/null',
        'pm set-user-restriction no_install_apps 0 2>/dev/null',
        'appops set com.android.shell REQUEST_INSTALL_PACKAGES allow 2>/dev/null',
        'appops set 2000 REQUEST_INSTALL_PACKAGES allow 2>/dev/null',
      ],
      15000
    );
  } catch {}

  // Generate r.sh runner script exactly as GarageTool does
  // Path to APK is enclosed inside r.sh so the word "install" never appears in ADB command line
  const scriptLines = [
    '#!/system/bin/sh',
    `chmod 644 ${HELPER_JAR_PATH} '${remotePath}'`,
    `CLASSPATH=${HELPER_JAR_PATH} app_process /system/bin ${HELPER_CLASS} '${remotePath}'`,
    'echo GT_RC $?',
    '',
  ];
  const scriptContent = scriptLines.join('\n');

  // Push r.sh to /data/local/tmp/r.sh
  let scriptPushed = false;
  try {
    const sync = await adb.sync();
    try {
      const scriptBytes = new TextEncoder().encode(scriptContent);
      const readable = new WrapReadableStream<Uint8Array>({
        start: () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(scriptBytes);
              controller.close();
            },
          }) as any,
      });

      await sync.write({
        filename: HELPER_SH_PATH,
        file: readable as any,
        permission: 0o755,
      });
      scriptPushed = true;
    } finally {
      try {
        await sync.dispose();
      } catch {}
    }
  } catch {}

  if (!scriptPushed) {
    try {
      // Escape for echo
      const b64Script = btoa(scriptContent);
      await adbManager.execShell(adb, `echo "${b64Script}" | base64 -d > ${HELPER_SH_PATH} 2>/dev/null`);
      await adbManager.execShell(adb, `chmod 755 ${HELPER_SH_PATH} 2>/dev/null`);
    } catch {}
  }

  try {
    await adbManager.execShell(adb, `chmod 755 ${HELPER_SH_PATH} 2>/dev/null`);
    await adbManager.execShell(adb, `chmod 644 '${remotePath}' 2>/dev/null`);
  } catch {}

  onLog?.(`> sh ${HELPER_SH_PATH}`, 'info');

  // Execute r.sh in interactive session
  const out = await runInteractiveShellSession(adb, [`sh ${HELPER_SH_PATH}`], 300000);
  onLog?.(`استجابة محرك التثبيت: ${out.trim()}`, 'info');

  // Parse output for GT_INSTALL_OK <pkg> or GT_INSTALL_FAIL <reason>
  const okMatch = out.match(/GT_INSTALL_OK\s+(\S+)/);
  if (okMatch && okMatch[1]) {
    const pkg = okMatch[1];
    onLog?.(`تم تثبيت التطبيق بنجاح عبر المثبت الاحتياطي (${pkg})!`, 'success');

    // Apply automatic post-install unblocking and permissions grant (similar to GarageTool postInstall)
    try {
      await runInteractiveShellSession(
        adb,
        [
          `appops set ${pkg} REQUEST_INSTALL_PACKAGES allow 2>/dev/null`,
          `appops set ${pkg} MANAGE_EXTERNAL_STORAGE allow 2>/dev/null`,
          `pm grant ${pkg} android.permission.READ_EXTERNAL_STORAGE 2>/dev/null`,
          `pm grant ${pkg} android.permission.WRITE_EXTERNAL_STORAGE 2>/dev/null`,
          'settings put global block_untrusted_touches 0 2>/dev/null',
        ],
        15000
      );
      onLog?.(`تم تفعيل الصلاحيات وفك حظر تثبيت الحزم للتطبيق (${pkg}) بنجاح!`, 'success');
    } catch {}

    // Confirm with pm path
    try {
      const pathOut = await runInteractiveShellSession(adb, [`pm path ${pkg}`], 15000);
      if (pathOut.includes('package:')) {
        onLog?.(`تأكيد مسار الحزمة على النظام: ${pathOut.trim()}`, 'success');
        return {
          success: true,
          packageName: pkg,
          message: `تم تثبيت التطبيق بنجاح (${pkg}) عبر المحرك الاحتياطي المباشر.`,
        };
      }
    } catch {}

    return {
      success: true,
      packageName: pkg,
      message: `تم تثبيت التطبيق بنجاح (${pkg}).`,
    };
  }

  const failMatch = out.match(/GT_INSTALL_FAIL\s+(\S+)\s*(.*)/);
  if (failMatch) {
    const code = failMatch[1];
    const reason = (failMatch[2] || '').trim();
    onLog?.(`فشل المثبت الاحتياطي: ${code} ${reason}`, 'warning');
    return {
      success: false,
      message: `رفض المثبت الاحتياطي التثبيت (${code}): ${reason}`,
    };
  }

  if (!out.includes('GT_')) {
    return {
      success: false,
      message: 'لم يتمكن نظام الشاشة من تشغيل المثبت الاحتياطي (app_process).',
    };
  }

  return {
    success: false,
    message: `استجابة غير متوقعة من المثبت الاحتياطي: ${out.slice(0, 100)}`,
  };
}
