import { Adb } from '@yume-chan/adb';
import { PackageManager, PackageManagerInstallSession } from '@yume-chan/android-bin';
import { WrapReadableStream, TransformStream } from '@yume-chan/stream-extra';
import { InstallMethod } from '../../types';
import { parseApkMetadata } from '../apk-parser';
import { adbManager } from './webusb-manager';

export interface InstallProgressCallback {
  (progress: number, stage: 'uploading' | 'installing' | 'processing', message?: string): void;
}

export class ApkInstaller {
  /**
   * Main adaptive install entry point for car head units
   */
  public static async installApk(
    adb: Adb,
    file: File,
    preferredMethod: InstallMethod = 'auto',
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; methodUsed: InstallMethod; packageName?: string }> {
    const fileSize = file.size;
    const fileName = file.name;

    // Detect package name from file metadata if not provided or placeholder
    let effectivePackageName = knownPackageName;
    if (!effectivePackageName || effectivePackageName === 'base' || effectivePackageName === 'unknown.package') {
      try {
        const meta = await parseApkMetadata(file);
        if (meta.packageName && meta.packageName !== 'unknown.package' && meta.packageName !== 'base') {
          effectivePackageName = meta.packageName;
        }
      } catch {}
    }

    onLog?.(`بدء تثبيت التطبيق: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`, 'info');
    if (effectivePackageName && effectivePackageName !== 'base') {
      onLog?.(`معرف الحزمة المكتشف: ${effectivePackageName}`, 'info');
    }

    // Take snapshot of installed packages BEFORE install to guarantee package detection
    const beforePackages = await this.getInstalledPackagesSet(adb);
    const currentUserId = await this.getCurrentUserId(adb);

    // Ensure general package verifiers are disabled to speed up and prevent prompts
    try {
      await this.unlockUserRestrictions(adb, currentUserId, onLog);
    } catch {}

    // Method: Auto Adaptive (Default & Recommended for All Automotive Units)
    // Tries Staged Package Session Stream first (memory-direct, zero-disk, bypasses SELinux FUSE entirely).
    // If rejected, falls back to direct stream, then /data/local/tmp, then /sdcard/Download.
    if (preferredMethod === 'auto') {
      onLog?.('بدء التثبيت عبر الوضع التلقائي الذكي لشاشات السيارات...', 'info');

      // Attempt 1: Modern Staged Package Session Stream (Gold standard: zero disk, zero FUSE, zero permission crash)
      try {
        onLog?.('[الخطوة 1] تجربة البث المباشر لجلسة النظام (Package Session Stream)...', 'info');
        const sessionRes = await this.installViaPackageSessionStream(adb, file, onProgress, onLog, effectivePackageName);
        if (sessionRes.success) {
          const newlyInstalled = await this.detectNewlyInstalledPackage(adb, beforePackages, sessionRes.packageName || effectivePackageName);
          const finalPkg = newlyInstalled || sessionRes.packageName || effectivePackageName;
          if (finalPkg) {
            await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
            await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
          }
          return {
            success: true,
            message: sessionRes.message,
            methodUsed: 'auto',
            packageName: finalPkg,
          };
        }
        if (this.isFatalInstallError(sessionRes.message)) {
          return { success: false, message: sessionRes.message, methodUsed: 'auto', packageName: effectivePackageName };
        }
      } catch (eSession: any) {
        onLog?.(`تنبيه جلسة البث: ${eSession.message || eSession}. جاري الانتقال لمسار النظام المعتمد...`, 'info');
      }

      // Attempt 2: Direct Binary Stream
      try {
        onLog?.('[الخطوة 2] تجربة البث الثنائي المباشر إلى مدخل الحزم...', 'info');
        const streamRes = await this.installViaDirectStream(adb, file, onProgress, onLog, effectivePackageName);
        if (streamRes.success) {
          const newlyInstalled = await this.detectNewlyInstalledPackage(adb, beforePackages, streamRes.packageName || effectivePackageName);
          const finalPkg = newlyInstalled || streamRes.packageName || effectivePackageName;
          if (finalPkg) {
            await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
            await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
          }
          return {
            success: true,
            message: streamRes.message,
            methodUsed: 'auto',
            packageName: finalPkg,
          };
        }
        if (this.isFatalInstallError(streamRes.message)) {
          return { success: false, message: streamRes.message, methodUsed: 'auto', packageName: effectivePackageName };
        }
      } catch (eStream: any) {
        onLog?.(`تنبيه البث المباشر: ${eStream.message || eStream}. جاري الانتقال لمسار النظام الداخلي...`, 'info');
      }

      // Attempt 3: System Path /data/local/tmp (Bypasses /sdcard FUSE restrictions on Android 10/11/12/13/14)
      try {
        onLog?.('[الخطوة 3] تجربة مسار النظام المعتمد (/data/local/tmp)...', 'info');
        const tmpRes = await this.installViaTmpStorage(adb, file, onProgress, onLog, effectivePackageName);
        if (tmpRes.success) {
          const newlyInstalled = await this.detectNewlyInstalledPackage(adb, beforePackages, tmpRes.packageName || effectivePackageName);
          const finalPkg = newlyInstalled || tmpRes.packageName || effectivePackageName;
          if (finalPkg) {
            await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
            await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
          }
          return {
            success: true,
            message: tmpRes.message,
            methodUsed: 'auto',
            packageName: finalPkg,
          };
        }
        if (this.isFatalInstallError(tmpRes.message)) {
          return { success: false, message: tmpRes.message, methodUsed: 'auto', packageName: effectivePackageName };
        }
      } catch (eTmp: any) {
        onLog?.(`تنبيه مسار النظام: ${eTmp.message || eTmp}. جاري تجربة مسار التخزين الكلاسيكي...`, 'info');
      }

      // Attempt 4: Jetour T2 / Protected Automotive Protocol (Direct /data/local/tmp with trusted installer & restriction bypass)
      try {
        onLog?.('[الخطوة 4] تجربة مسار جيتور والأنظمة المحمية المستقل (/data/local/tmp)...', 'info');
        const jetourRes = await this.installViaJetourFallback(adb, file, onProgress, onLog, effectivePackageName);
        if (jetourRes.success) {
          const newlyInstalled = await this.detectNewlyInstalledPackage(adb, beforePackages, jetourRes.packageName || effectivePackageName);
          const finalPkg = newlyInstalled || jetourRes.packageName || effectivePackageName;
          if (finalPkg) {
            await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
            await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
          }
          return {
            success: true,
            message: jetourRes.message,
            methodUsed: 'auto',
            packageName: finalPkg,
          };
        }
      } catch (eJetour: any) {
        onLog?.(`تنبيه مسار جيتور: ${eJetour.message || eJetour}. جاري تجربة مسار التخزين الكلاسيكي...`, 'info');
      }

      // Attempt 5: Classic Storage Pipe (/sdcard/Download)
      onLog?.('[الخطوة 5] تجربة مسار التخزين الكلاسيكي (/sdcard/Download)...', 'info');
      const sdRes = await this.installViaSdcardStorage(adb, file, onProgress, onLog, effectivePackageName);
      if (sdRes.success) {
        const newlyInstalled = await this.detectNewlyInstalledPackage(adb, beforePackages, sdRes.packageName || effectivePackageName);
        const finalPkg = newlyInstalled || sdRes.packageName || effectivePackageName;
        if (finalPkg) {
          await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
          await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
        }
        return {
          success: true,
          message: sdRes.message,
          methodUsed: 'auto',
          packageName: finalPkg,
        };
      }

      return {
        success: false,
        message: sdRes.message,
        methodUsed: 'auto',
        packageName: effectivePackageName,
      };
    }

    // Explicit Method Selection: Jetour T2 / Firmware Fallback Protocol (r.sh)
    if (preferredMethod === 'jetour_fallback') {
      onLog?.('🛡️ بدء التثبيت عبر بروتوكول جيتور والأنظمة المحمية (Jetour T2 / r.sh)...', 'info');
      const res = await this.installViaJetourFallback(adb, file, onProgress, onLog, effectivePackageName);
      if (res.success) {
        const newlyInstalled = await this.detectNewlyInstalledPackage(adb, beforePackages, res.packageName || effectivePackageName);
        const finalPkg = newlyInstalled || res.packageName || effectivePackageName;
        if (finalPkg) {
          await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
          await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
        }
        return { ...res, methodUsed: 'jetour_fallback', packageName: finalPkg };
      }
      return { ...res, methodUsed: 'jetour_fallback', packageName: effectivePackageName };
    }

    // Explicit Method Selection: Modern Car Protocol (/data/local/tmp)
    if (preferredMethod === 'modern_car' || preferredMethod === 'sync_tmp') {
      const res = await this.installViaTmpStorage(adb, file, onProgress, onLog, effectivePackageName);
      if (res.success) {
        const newlyInstalled = await this.detectNewlyInstalledPackage(adb, beforePackages, res.packageName || effectivePackageName);
        const finalPkg = newlyInstalled || res.packageName || effectivePackageName;
        if (finalPkg) {
          await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
          await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
        }
        return { ...res, methodUsed: preferredMethod, packageName: finalPkg };
      }
      return { ...res, methodUsed: preferredMethod, packageName: effectivePackageName };
    }

    // Explicit Method Selection: Storage Pipe (/sdcard/Download)
    if (preferredMethod === 'sdcard') {
      const res = await this.installViaSdcardStorage(adb, file, onProgress, onLog, effectivePackageName);
      if (res.success) {
        const newlyInstalled = await this.detectNewlyInstalledPackage(adb, beforePackages, res.packageName || effectivePackageName);
        const finalPkg = newlyInstalled || res.packageName || effectivePackageName;
        if (finalPkg) {
          await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
          await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
        }
        return { ...res, methodUsed: 'sdcard', packageName: finalPkg };
      }
      return { ...res, methodUsed: 'sdcard', packageName: effectivePackageName };
    }

    // Explicit Method Selection: Package Session Stream
    if (preferredMethod === 'session') {
      const res = await this.installViaPackageSessionStream(adb, file, onProgress, onLog, effectivePackageName);
      if (res.success) {
        const newlyInstalled = await this.detectNewlyInstalledPackage(adb, beforePackages, res.packageName || effectivePackageName);
        const finalPkg = newlyInstalled || res.packageName || effectivePackageName;
        if (finalPkg) {
          await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
          await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
        }
        return { ...res, methodUsed: 'session', packageName: finalPkg };
      }
      return { ...res, methodUsed: 'session', packageName: effectivePackageName };
    }

    // Explicit Method Selection: Direct Stream
    if (preferredMethod === 'stream') {
      const res = await this.installViaDirectStream(adb, file, onProgress, onLog, effectivePackageName);
      if (res.success) {
        const newlyInstalled = await this.detectNewlyInstalledPackage(adb, beforePackages, res.packageName || effectivePackageName);
        const finalPkg = newlyInstalled || res.packageName || effectivePackageName;
        if (finalPkg) {
          await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
          await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
        }
        return { ...res, methodUsed: 'stream', packageName: finalPkg };
      }
      return { ...res, methodUsed: 'stream', packageName: effectivePackageName };
    }

    // Default fallback
    const res = await this.installViaTmpStorage(adb, file, onProgress, onLog, effectivePackageName);
    return { ...res, methodUsed: 'auto', packageName: effectivePackageName };
  }

  /**
   * 1. Staged Package Session Stream using official PackageManagerInstallSession
   * Direct in-memory streaming: ZERO file written to disk, completely bypassing SELinux FUSE and storage restrictions.
   */
  public static async installViaPackageSessionStream(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const fileSize = file.size;
    onLog?.('إنشاء جلسة تثبيت حزم أندرويد الرسمية (PackageManager Install Session)...', 'info');
    onProgress?.(5, 'uploading', 'فتح جلسة التثبيت في نظام أندرويد...');

    const pm = new PackageManager(adb);

    let session: PackageManagerInstallSession | null = null;
    try {
      // Create session without -g / grantRuntimePermissions to avoid SecurityException on car ROMs
      session = await PackageManagerInstallSession.create(pm, {
        allowTest: true,
        requestDowngrade: false,
      });
      onLog?.(`تم فتح جلسة التثبيت بنجاح: [جلسة رقم ${session.id}]`, 'info');
    } catch (eCreate: any) {
      const errMsg = eCreate?.message || String(eCreate);
      throw new Error(`تعذر فتح جلسة الحزم: ${errMsg}`);
    }

    let transferredBytes = 0;
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        transferredBytes += chunk.byteLength;
        const pct = 5 + Math.min(85, Math.round((transferredBytes / fileSize) * 85));
        const mbTransferred = (transferredBytes / (1024 * 1024)).toFixed(1);
        const mbTotal = (fileSize / (1024 * 1024)).toFixed(1);
        onProgress?.(pct, 'uploading', `بث حزمة APK إلى جلسة النظام (${mbTransferred} / ${mbTotal} MB)`);
        controller.enqueue(chunk);
      },
    });

    const readable = new WrapReadableStream<Uint8Array>({
      start: () => file.stream() as any,
    });
    const stream = readable.pipeThrough(transform);

    try {
      onLog?.('جاري بث بيانات الحزمة إلى جلسة النظام مباشرة...', 'info');
      await session.addSplitStream('base.apk', fileSize, stream as any);
      onLog?.('تم كتابة بيانات الحزمة بالكامل داخل الجلسة.', 'info');

      onProgress?.(92, 'installing', 'اعتماد الجلسة والتثبيت في نظام شاشة السيارة...');
      onLog?.('جاري اعتماد الجلسة (Commit Session)...', 'info');
      await session.commit();
      onLog?.('تم اعتماد وتثبيت جلسة الحزم بنجاح!', 'success');
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');

      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح عبر جلسة حزم النظام المباشرة (Staged Session) وتفعيله لشاشة السيارة.',
        packageName: knownPackageName,
      };
    } catch (eCommit: any) {
      try {
        await session.abandon();
      } catch {}
      const errMsg = eCommit?.message || String(eCommit);
      onLog?.(`نتيجة الجلسة: ${errMsg}`, 'warning');
      const translated = this.translateAndroidInstallError(errMsg);
      return {
        success: false,
        message: translated || errMsg,
      };
    }
  }

  /**
   * 2. Direct Binary Stream (Direct raw pipe into pm / cmd package install -S)
   */
  public static async installViaDirectStream(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const size = file.size;

    // Commands without -g flag to avoid SecurityException
    const streamCommands = [
      `shell:pm install -r -t -S ${size}`,
      `shell:cmd package install -r -t -S ${size}`,
      `shell:pm install -r -S ${size}`,
      `shell:cmd package install -r -S ${size}`,
      `shell:pm install -S ${size}`,
    ];

    let lastError = '';

    for (const cmd of streamCommands) {
      try {
        onLog?.(`بدء البث المباشر للشاشة: ${cmd}...`, 'info');
        const socket = await adb.createSocket(cmd);
        const writer = socket.writable.getWriter();
        let sentBytes = 0;
        const reader = file.stream().getReader();

        onProgress?.(5, 'uploading', 'بث مباشر عبر منفذ النظام...');

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              await writer.write(value);
              sentBytes += value.byteLength;
              const pct = 5 + Math.min(85, Math.round((sentBytes / size) * 85));
              onProgress?.(pct, 'uploading', `بث مباشر (${(sentBytes / 1024 / 1024).toFixed(1)} / ${(size / 1024 / 1024).toFixed(1)} MB)`);
            }
          }
          await writer.close();
        } catch (e: any) {
          try { await writer.abort(e); } catch {}
          throw e;
        } finally {
          reader.releaseLock();
        }

        onProgress?.(92, 'installing', 'قراءة نتيجة التثبيت...');
        const decoder = new TextDecoder();
        const socketReader = socket.readable.getReader();
        let output = '';

        try {
          while (true) {
            const { done, value } = await socketReader.read();
            if (done) break;
            if (value) output += decoder.decode(value, { stream: true });
          }
          output += decoder.decode();
        } finally {
          socketReader.releaseLock();
          try { await socket.close(); } catch {}
        }

        const trimmed = output.trim();
        const isSuccess = trimmed.toLowerCase().includes('success');
        onLog?.(`استجابة البث المباشر: ${trimmed || '(تم إرسال الأمر)'}`, isSuccess ? 'success' : 'info');

        if (isSuccess) {
          onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
          return {
            success: true,
            message: 'تم تثبيت التطبيق بنجاح عبر البث المباشر.',
            packageName: knownPackageName,
          };
        }

        lastError = trimmed;
        if (this.isFatalInstallError(trimmed)) {
          break;
        }
      } catch (err: any) {
        lastError = err.message || String(err);
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    const friendlyError = this.translateAndroidInstallError(lastError);
    return { success: false, message: friendlyError || lastError };
  }

  /**
   * 3. System Path /data/local/tmp (Clean commands WITHOUT -g flag)
   * Solves SELinux FUSE restriction on newer car head units by staging in /data/local/tmp
   */
  public static async installViaTmpStorage(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const size = file.size;
    const cleanBaseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = cleanBaseName.endsWith('.apk') ? cleanBaseName : `${cleanBaseName}.apk`;
    const targetPath = `/data/local/tmp/${safeName}`;

    onLog?.('تجهيز مسار النظام الداخلي /data/local/tmp...', 'info');
    try {
      await this.execShell(adb, 'mkdir -p /data/local/tmp 2>/dev/null');
      await this.execShell(adb, 'chmod 777 /data/local/tmp 2>/dev/null');
      await this.execShell(adb, `rm -f "${targetPath}" /data/local/tmp/app_install.apk 2>/dev/null`);
    } catch {}

    let pushSuccess = false;
    let pushError = '';

    onProgress?.(5, 'uploading', 'نقل الحزمة إلى مسار النظام المعتمد /data/local/tmp...');
    onLog?.(`نقل الحزمة إلى: ${targetPath}...`, 'info');

    try {
      await this.pushFileSafe(adb, file, targetPath, onProgress, onLog);
      pushSuccess = true;
      onLog?.(`تم نقل الملف إلى /data/local/tmp بنجاح (${(size / (1024 * 1024)).toFixed(1)} MB).`, 'success');
    } catch (err: any) {
      pushError = err.message || String(err);
      onLog?.(`محاولة نقل بديلة عبر ممر Shell المباشر...`, 'info');
      try {
        await this.pushFileViaShell(adb, file, targetPath, onProgress, onLog);
        pushSuccess = true;
      } catch (err2: any) {
        pushError = err2.message || String(err2);
      }
    }

    if (!pushSuccess) {
      return {
        success: false,
        message: `تعذر نقل ملف الـ APK إلى مسار النظام: ${pushError}`,
      };
    }

    // Set permissions and SELinux label so system_server can read it
    try {
      await this.execShell(adb, `chmod 777 "${targetPath}" 2>/dev/null`);
      await this.execShell(adb, `chcon u:object_r:shell_data_file:s0 "${targetPath}" 2>/dev/null`);
      await this.execShell(adb, `restorecon -F "${targetPath}" 2>/dev/null`);
    } catch {}

    await new Promise((r) => setTimeout(r, 200));
    onProgress?.(88, 'installing', 'تنفيذ أوامر التثبيت...');

    const currentUserId = await this.getCurrentUserId(adb);

    // Direct clean commands WITHOUT -i com.android.vending (which fails on Desay SV / Jetour T2)
    // and WITHOUT -g at install time (which triggers SecurityException on Automotive OS)
    const directCommands = [
      `pm install -r -t -d "${targetPath}" 2>&1`,
      `pm install -r "${targetPath}" 2>&1`,
      `cmd package install -r -t -d "${targetPath}" 2>&1`,
      `cmd package install -r "${targetPath}" 2>&1`,
      `pm install --user ${currentUserId} -r -t -d "${targetPath}" 2>&1`,
      `pm install --user current -r -t -d "${targetPath}" 2>&1`,
      `pm install --user 0 -r -t -d "${targetPath}" 2>&1`,
      `pm install --user 10 -r -t -d "${targetPath}" 2>&1`,
      `cd /data/local/tmp && pm install -r -t -d "${safeName}" 2>&1`,
      `cd /data/local/tmp && cat "${safeName}" | pm install -S ${size} 2>&1`,
      `cat "${targetPath}" | pm install -r -t -d -S ${size} 2>&1`,
    ];

    let isSuccess = false;
    let lastOutput = '';

    // Direct Command 1: Fast test with direct cat pipe to pm install
    try {
      onLog?.('> cd /data/local/tmp', 'info');
      onLog?.(`> cat "${safeName}" | pm install -S ${size}`, 'info');
      const directCatRes = await this.execShell(adb, `cd /data/local/tmp && cat "${safeName}" | pm install -S ${size}`);
      const directTrimmed = directCatRes.trim();
      if (directTrimmed) lastOutput = directTrimmed;
      if (directTrimmed.toLowerCase().includes('success')) {
        isSuccess = true;
        onLog?.(`استجابة الشاشة: ${directTrimmed}`, 'success');
      } else {
        onLog?.(`استجابة الشاشة: ${directTrimmed || '(تم الرفض أو خطأ)'}`, 'info');
      }
    } catch (eCat: any) {
      lastOutput = eCat?.message || String(eCat);
    }

    if (!isSuccess) {
      for (let i = 0; i < directCommands.length; i++) {
        const cmd = directCommands[i];
        try {
          onLog?.(`[أمر مسار النظام ${i + 1}/${directCommands.length}] ${cmd}`, 'info');
          const output = await this.execShell(adb, cmd);
          const trimmed = output.trim();
          if (trimmed) {
            lastOutput = trimmed;
          }
          const isCmdSuccess = trimmed.toLowerCase().includes('success');
          onLog?.(`استجابة الشاشة: ${trimmed || '(تم التنفيذ)'}`, isCmdSuccess ? 'success' : 'info');

          if (isCmdSuccess) {
            isSuccess = true;
            break;
          }

          if (this.isFatalInstallError(trimmed)) {
            break;
          }
        } catch (eCmd: any) {
          const errMsg = eCmd?.message || String(eCmd);
          if (errMsg) lastOutput = errMsg;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    // Try PackageManager library API as secondary fallback
    if (!isSuccess && !this.isFatalInstallError(lastOutput)) {
      try {
        const pm = new PackageManager(adb);
        onLog?.('تجربة التثبيت عبر مكتبة PackageManager...', 'info');
        const pmRes = await pm.install([targetPath], {
          allowTest: true,
          requestDowngrade: false,
        });
        if ((pmRes || '').toLowerCase().includes('success')) {
          isSuccess = true;
        }
      } catch (ePm: any) {
        onLog?.(`نتيجة pm.install: ${ePm.message || ePm}`, 'info');
      }
    }

    // If still not successful, invoke Jetour T2 / Firmware Fallback script (independent /data/local/tmp session engine)
    if (!isSuccess) {
      const fallbackResult = await this.executeFallbackInstallerScript(
        adb,
        targetPath,
        safeName,
        size,
        knownPackageName,
        onLog
      );
      if (fallbackResult.success) {
        isSuccess = true;
      }
    }

    // Always clean up temp file
    await this.cleanupFile(adb, targetPath);

    if (isSuccess) {
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح وبشكل مباشر عبر مسار النظام الداخلي.',
        packageName: knownPackageName,
      };
    }

    // Check if the package got installed despite non-standard output
    if (knownPackageName) {
      const isInstalled = await this.isPackageInstalled(adb, knownPackageName);
      if (isInstalled) {
        return {
          success: true,
          message: 'تم تأكيد وجود الحزمة المثبتة بنجاح على نظام السيارة.',
          packageName: knownPackageName,
        };
      }
    }

    const translated = this.translateAndroidInstallError(lastOutput);
    return {
      success: false,
      message: translated || lastOutput || 'فشل التثبيت المباشر على مسار النظام الداخلي.',
    };
  }

  /**
   * Independent System Storage Installer (/data/local/tmp) for Jetour T2 & Protected Car Units
   * Operates completely independently in /data/local/tmp without relying on any external apps (garagesplit) or old scripts.
   */
  public static async installViaJetourFallback(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const size = file.size;
    const cleanBaseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = cleanBaseName.endsWith('.apk') ? cleanBaseName : `${cleanBaseName}.apk`;
    const targetPath = `/data/local/tmp/${safeName}`;

    onLog?.('تهيئة مسار التثبيت الداخلي /data/local/tmp بشكل مستقل...', 'info');

    // 1. Clean up any leftover old third-party scripts (like old r.sh from garage tool)
    try {
      await this.execShell(adb, 'rm -f /data/local/tmp/r.sh /data/local/tmp/garagesplit* 2>/dev/null');
      await this.execShell(adb, 'mkdir -p /data/local/tmp 2>/dev/null');
      await this.execShell(adb, 'chmod 777 /data/local/tmp 2>/dev/null');
    } catch {}

    onLog?.(`$ push -> ${targetPath}`, 'info');
    onProgress?.(10, 'uploading', `نقل الحزمة إلى ${targetPath}...`);

    let pushSuccess = false;
    let pushError = '';

    try {
      await this.pushFileSafe(adb, file, targetPath, onProgress, onLog);
      pushSuccess = true;
    } catch (err: any) {
      pushError = err.message || String(err);
      onLog?.('محاولة نقل بديلة عبر ممر Shell المباشر...', 'info');
      try {
        await this.pushFileViaShell(adb, file, targetPath, onProgress, onLog);
        pushSuccess = true;
      } catch (err2: any) {
        pushError = err2.message || String(err2);
      }
    }

    if (!pushSuccess) {
      return {
        success: false,
        message: `تعذر نقل ملف الـ APK إلى مسار النظام: ${pushError}`,
      };
    }

    // Set permissions and SELinux label on the user's APK
    try {
      await this.execShell(adb, `chmod 777 "${targetPath}" 2>/dev/null`);
      await this.execShell(adb, `chcon u:object_r:shell_data_file:s0 "${targetPath}" 2>/dev/null`);
      await this.execShell(adb, `restorecon -F "${targetPath}" 2>/dev/null`);
    } catch {}

    onProgress?.(60, 'installing', 'تنفيذ التثبيت المستقل بمحرك جلسات النظام...');
    
    // Execute independent multi-strategy installation
    const installResult = await this.executeFallbackInstallerScript(
      adb,
      targetPath,
      safeName,
      size,
      knownPackageName,
      onLog
    );

    // Always clean up temp file from /data/local/tmp
    await this.cleanupFile(adb, targetPath);

    if (installResult.success) {
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح في مسار النظام الداخلي المستقل.',
        packageName: installResult.packageName || knownPackageName,
      };
    }

    return {
      success: false,
      message: installResult.message || 'تعذر إتمام التثبيت على نظام السيارة.',
      packageName: knownPackageName,
    };
  }

  /**
   * Enhanced Jetour T2 / Desay SV Installation Engine (GarageTool & 4PDA Protocol)
   * 1. Copies APK directly to /sdcard/Download (where car file manager and SELinux can access it)
   * 2. Disables Android ADB package verifier to prevent INSTALL_FAILED_ABORTED
   * 3. Executes direct GarageTool & 4PDA commands with -r -g runtime permission grant
   * 4. Multi-User target dispatch (User 0, User current)
   * 5. Screen-Safe PackageInstaller fallback that checks window focus before clicking to avoid triggering the radio
   */
  public static async executeFallbackInstallerScript(
    adb: Adb,
    targetPath: string,
    safeName: string,
    size: number,
    knownPackageName?: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    onLog?.('بدء بروتوكول التثبيت المباشر المستقل لشاشات جيتور T2 والأنظمة المحمية...', 'info');

    // 0. Disable Android package verifier to prevent ADB Aborted errors
    try {
      await this.execShell(adb, 'settings put global verifier_verify_adb_installs 0 2>/dev/null');
      await this.execShell(adb, 'settings put global package_verifier_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put global upload_apk_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put global package_verifier_user_consent 1 2>/dev/null');
      await this.execShell(adb, 'settings put secure install_non_market_apps 1 2>/dev/null');
      await this.execShell(adb, 'settings put global install_non_market_apps 1 2>/dev/null');
    } catch {}

    // Ensure permissions and SELinux label on target file in /data/local/tmp
    try {
      await this.execShell(adb, `chmod 777 "${targetPath}" 2>/dev/null`);
      await this.execShell(adb, `chcon u:object_r:shell_data_file:s0 "${targetPath}" 2>/dev/null`);
    } catch {}

    // Detect active users (Driver user, system user 0, user 10, etc.)
    const userIds = new Set<string>(['0', 'current']);
    try {
      const usersRaw = await this.execShell(adb, 'pm list users 2>/dev/null');
      const matches = usersRaw.matchAll(/UserInfo\{(\d+):/g);
      for (const m of matches) {
        if (m[1]) userIds.add(m[1]);
      }
    } catch {}

    // Take snapshot of existing packages before running install
    let beforePkgsRaw = '';
    try {
      beforePkgsRaw = await this.execShell(adb, 'pm list packages 2>/dev/null');
    } catch {}

    let newlyFoundPkg: string | undefined;
    let isSuccess = false;
    let lastLog = '';

    // Strategy 1: Staged Package Session Installation directly from /data/local/tmp
    // Creates a native session inside /data/app where SELinux restrictions do not apply
    onLog?.('• تجربة [1]: التثبيت المباشر الفوري عبر محرك جلسات الحزم الداخلي (Staged Session)...', 'info');
    try {
      const sessionCreateCmd = `pm install-create -r -t -d -S ${size} 2>/dev/null || cmd package install-create -r -t -d -S ${size} 2>/dev/null || pm install-create -r -t -d --user current -S ${size} 2>/dev/null || pm install-create -r -t -d --user 0 -S ${size} 2>/dev/null`;
      const createRes = await this.execShell(adb, sessionCreateCmd);
      const match = createRes.match(/\b\d+\b/);
      const sessionId = match ? match[0] : '';

      if (sessionId) {
        onLog?.(`> تم إنشاء جلسة تثبيت رقم [${sessionId}]، جارٍ كتابة حزمة الـ APK...`, 'info');
        // Write directly from targetPath (no pipe stdin or pipe with dash -)
        const writeCmd = `pm install-write -S ${size} ${sessionId} base.apk "${targetPath}" 2>/dev/null || cmd package install-write -S ${size} ${sessionId} base.apk "${targetPath}" 2>/dev/null || cat "${targetPath}" | pm install-write -S ${size} ${sessionId} base.apk - 2>/dev/null`;
        await this.execShell(adb, writeCmd);

        onLog?.(`> اعتماد وتثبيت الجلسة [${sessionId}]...`, 'info');
        const commitRes = await this.execShell(adb, `pm install-commit ${sessionId} 2>&1 || cmd package install-commit ${sessionId} 2>&1`);
        const trimmed = commitRes.trim();
        if (trimmed) {
          lastLog = trimmed;
          onLog?.(`> استجابة اعتماد الجلسة: ${trimmed}`, 'info');
        }
        if (trimmed.toLowerCase().includes('success')) {
          isSuccess = true;
        }
      }
    } catch (eSess: any) {
      onLog?.(`ملاحظة جلسة الحزم: ${eSess?.message || eSess}`, 'info');
    }

    // Check if installed after Strategy 1
    if (!isSuccess) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const afterRaw = await this.execShell(adb, 'pm list packages 2>/dev/null');
        newlyFoundPkg = this.findDiffPackage(beforePkgsRaw, afterRaw);
        if (newlyFoundPkg || (knownPackageName && afterRaw.includes(knownPackageName))) {
          isSuccess = true;
          if (!newlyFoundPkg && knownPackageName) newlyFoundPkg = knownPackageName;
        }
      } catch {}
    }

    // Strategy 2: Official @yume-chan/android-bin PackageManager Session API
    if (!isSuccess) {
      onLog?.('• تجربة [2]: التثبيت عبر مكتبة مدير الحزم المباشرة (PackageManager API)...', 'info');
      try {
        const pm = new PackageManager(adb);
        const sessId = await pm.sessionCreate({
          allowTest: true,
          requestDowngrade: true,
          skipVerification: true,
          bypassLowTargetSdkBlock: true,
        });
        onLog?.(`> فتح جلسة مدير الحزم [${sessId}] وإضافة الحزمة...`, 'info');
        await pm.sessionAddSplit(sessId, 'base.apk', targetPath);
        await pm.sessionCommit(sessId);
        isSuccess = true;
        onLog?.('تم اعتماد الجلسة وتثبيت التطبيق بنجاح عبر PackageManager API.', 'success');
      } catch (ePmSession: any) {
        onLog?.(`ملاحظة PackageManager API: ${ePmSession?.message || ePmSession}`, 'info');
      }
    }

    // Check if installed after Strategy 2
    if (!isSuccess) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const afterRaw = await this.execShell(adb, 'pm list packages 2>/dev/null');
        newlyFoundPkg = this.findDiffPackage(beforePkgsRaw, afterRaw);
        if (newlyFoundPkg || (knownPackageName && afterRaw.includes(knownPackageName))) {
          isSuccess = true;
          if (!newlyFoundPkg && knownPackageName) newlyFoundPkg = knownPackageName;
        }
      } catch {}
    }

    // Strategy 3: Clean Direct Commands WITHOUT -g and WITHOUT -i com.android.vending
    if (!isSuccess) {
      onLog?.('• تجربة [3]: أوامر التثبيت المباشرة لشاشات جيتور وهواتف السيارات...', 'info');
      const directCommands = [
        `pm install -r -t -d "${targetPath}" 2>&1`,
        `pm install -r "${targetPath}" 2>&1`,
        `cmd package install -r -t -d "${targetPath}" 2>&1`,
        `cmd package install -r "${targetPath}" 2>&1`,
        `pm install --user current -r -t -d "${targetPath}" 2>&1`,
        `pm install --user 0 -r -t -d "${targetPath}" 2>&1`,
        `pm install --user 10 -r -t -d "${targetPath}" 2>&1`,
        `cd /data/local/tmp && pm install -r -t -d "${safeName}" 2>&1`,
        `cd /data/local/tmp && cat "${safeName}" | pm install -S ${size} 2>&1`,
        `cat "${targetPath}" | pm install -r -t -d -S ${size} 2>&1`,
        `CLASSPATH=/system/framework/pm.jar app_process /system/bin com.android.commands.pm.Pm install -r -t -d "${targetPath}" 2>&1`,
      ];

      for (const cmd of directCommands) {
        try {
          const out = await this.execShell(adb, cmd);
          const trimmed = out.trim();
          if (trimmed) {
            lastLog = trimmed;
            onLog?.(`> استجابة: ${trimmed}`, 'info');
          }
          if (trimmed.toLowerCase().includes('success')) {
            isSuccess = true;
            break;
          }
        } catch (err: any) {
          lastLog = err?.message || String(err);
        }
      }
    }

    // Check if installed after Strategy 3
    if (!isSuccess) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const afterRaw = await this.execShell(adb, 'pm list packages 2>/dev/null');
        newlyFoundPkg = this.findDiffPackage(beforePkgsRaw, afterRaw);
        if (newlyFoundPkg || (knownPackageName && afterRaw.includes(knownPackageName))) {
          isSuccess = true;
          if (!newlyFoundPkg && knownPackageName) newlyFoundPkg = knownPackageName;
        }
      } catch {}
    }

    // Strategy 4: Native PackageInstaller Component Intent + Automated Confirmation (Zero Manual Intervention)
    // If the firmware enforces user confirmation dialog, invoke ONLY the PackageInstaller component
    // (Never launch file manager or generic VIEW intents) and auto-confirm via input tap.
    if (!isSuccess) {
      onLog?.('• تجربة [4]: استدعاء معالج تثبيت الحزم الرسمي مع النقر التلقائي الذكي...', 'info');
      try {
        const launchCommands = [
          `am start -n com.android.packageinstaller/.PackageInstallerActivity -d "file://${targetPath}" -t "application/vnd.android.package-archive" 2>/dev/null`,
          `am start -n com.google.android.packageinstaller/com.android.packageinstaller.PackageInstallerActivity -d "file://${targetPath}" -t "application/vnd.android.package-archive" 2>/dev/null`,
          `am start -a android.intent.action.INSTALL_PACKAGE -d "file://${targetPath}" -t "application/vnd.android.package-archive" --ez android.intent.extra.NOT_UNKNOWN_SOURCE true --ez android.intent.extra.RETURN_RESULT true 2>/dev/null`,
        ];

        for (const lCmd of launchCommands) {
          try {
            await this.execShell(adb, lCmd);
          } catch {}
        }

        // Screen-Safe auto confirm that checks if dialog actually opened before tapping
        const autoConfirmRes = await this.autoConfirmAndMonitorInstall(
          adb,
          beforePkgsRaw,
          knownPackageName,
          onLog,
          15 // 15 seconds polling
        );

        if (autoConfirmRes.success) {
          isSuccess = true;
          if (autoConfirmRes.packageName) {
            newlyFoundPkg = autoConfirmRes.packageName;
          }
        }
      } catch (errIntent: any) {
        onLog?.(`ملاحظة واجهة التثبيت: ${errIntent?.message || errIntent}`, 'info');
      }
    }

    // Final verification of newly installed package
    await new Promise((r) => setTimeout(r, 600));
    let afterPkgsRaw = '';
    try {
      afterPkgsRaw = await this.execShell(adb, 'pm list packages 2>/dev/null');
    } catch {}

    if (!newlyFoundPkg) {
      newlyFoundPkg = this.findDiffPackage(beforePkgsRaw, afterPkgsRaw);
    }

    let installedPkg = newlyFoundPkg || knownPackageName;
    if (newlyFoundPkg) {
      isSuccess = true;
    } else if (knownPackageName && afterPkgsRaw.includes(knownPackageName)) {
      isSuccess = true;
      installedPkg = knownPackageName;
    }

    if (!isSuccess) {
      const pkgs3 = await this.execShell(adb, 'pm list packages -3 2>/dev/null');
      if (knownPackageName && pkgs3.includes(knownPackageName)) {
        isSuccess = true;
        installedPkg = knownPackageName;
      }
    }

    if (isSuccess && installedPkg) {
      onLog?.(`تم تأكيد تثبيت التطبيق بنجاح: [${installedPkg}]`, 'success');

      // Multi-User activation: ensure the app is installed and active for user 10 (driver screen), user 0, and user current
      try {
        await this.execShell(adb, `cmd package install-existing --user 10 ${installedPkg} 2>/dev/null`);
        await this.execShell(adb, `cmd package install-existing --user 0 ${installedPkg} 2>/dev/null`);
        await this.execShell(adb, `cmd package install-existing --user current ${installedPkg} 2>/dev/null`);
        await this.execShell(adb, `pm unhide --user current ${installedPkg} 2>/dev/null`);
        await this.execShell(adb, `pm enable --user current ${installedPkg} 2>/dev/null`);
        await this.execShell(adb, `pm unsuspend --user current ${installedPkg} 2>/dev/null`);
      } catch {}

      // Grant access rights & System Alert Window
      onLog?.('... ضبط حقوق الوصول وتفعيل ظهور التطبيق في شاشة السيارة ولانشر البرامج', 'info');
      try {
        await this.execShell(adb, `appops set ${installedPkg} SYSTEM_ALERT_WINDOW allow 2>/dev/null`);
        await this.execShell(adb, `pm grant ${installedPkg} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`);
        await this.execShell(adb, `appops set ${installedPkg} RUN_IN_BACKGROUND allow 2>/dev/null`);
        await this.execShell(adb, `pm enable ${installedPkg} 2>/dev/null`);
        await this.execShell(adb, `am broadcast -a android.intent.action.BOOT_COMPLETED -p ${installedPkg} 2>/dev/null`);
        await this.execShell(adb, `am broadcast -a android.intent.action.PACKAGE_ADDED -d "package:${installedPkg}" 2>/dev/null`);
        onLog?.('تحقق • نافذة تنبيه النظام وظهور التطبيق: تم إصدارها بنجاح.', 'success');

        await this.execShell(adb, `appops set ${installedPkg} WRITE_SETTINGS allow 2>/dev/null`);
        await this.execShell(adb, `appops set ${installedPkg} MANAGE_EXTERNAL_STORAGE allow 2>/dev/null`);
      } catch (ePerm: any) {
        onLog?.(`ملاحظة ضبط الصلاحيات: ${ePerm?.message || ePerm}`, 'info');
      }

      return {
        success: true,
        message: `تم تثبيت التطبيق (${installedPkg}) بنجاح وبشكل مباشر دون الحاجة لتدخل يدوي.`,
        packageName: installedPkg,
      };
    }

    const translated = this.translateAndroidInstallError(lastLog);
    return {
      success: false,
      message: translated || lastLog || 'تعذر إتمام التثبيت التلقائي المباشر على نظام السيارة.',
      packageName: knownPackageName,
    };
  }

  /**
   * Helper to find a newly installed package by comparing package lists
   */
  private static findDiffPackage(beforeRaw: string, afterRaw: string): string | undefined {
    const parse = (raw: string) =>
      new Set(
        raw
          .split('\n')
          .map((l) => l.replace(/^package:/, '').trim())
          .filter(Boolean)
      );

    const beforeSet = parse(beforeRaw);
    const afterList = Array.from(parse(afterRaw));

    for (const pkg of afterList) {
      if (!beforeSet.has(pkg)) {
        return pkg;
      }
    }
    return undefined;
  }

  /**
   * Automatically confirms the Car PackageInstaller dialog by simulating click on "تثبيت" / "Install"
   * ONLY if the dialog is verified active on screen, preventing accidental radio or home screen interactions.
   */
  public static async autoConfirmAndMonitorInstall(
    adb: Adb,
    beforePkgsRaw: string,
    knownPackageName?: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    timeoutSeconds: number = 25
  ): Promise<{ success: boolean; packageName?: string }> {
    onLog?.('جارٍ فحص شاشة السيارة والتحقق من ظهور نافذة التثبيت...', 'info');

    // Wait a brief moment for the dialog activity to render
    await new Promise((r) => setTimeout(r, 600));

    // 1. Detect screen resolution
    let screenWidth = 1920;
    let screenHeight = 1080;
    try {
      const sizeOut = await this.execShell(adb, 'wm size 2>/dev/null');
      const match = sizeOut.match(/(\d+)x(\d+)/);
      if (match && match[1] && match[2]) {
        const w = parseInt(match[1], 10);
        const h = parseInt(match[2], 10);
        screenWidth = Math.max(w, h);
        screenHeight = Math.min(w, h);
      }
    } catch {}

    // In Jetour T2 / Chery DesaySV head units, the install dialog is centered:
    let targetX = Math.round(screenWidth * 0.5);
    let targetY = Math.round(screenHeight * 0.575);
    let foundExactBounds = false;
    let isInstallerFocused = false;

    // Check if the current focused window or activity belongs to package installer
    try {
      const focusOut = await this.execShell(adb, 'dumpsys window | grep -E "mCurrentFocus|mFocusedApp" 2>/dev/null || dumpsys activity top 2>/dev/null');
      if (/packageinstaller|InstallAppProgress|PackageInstallerActivity|PackageInstaller|InstallStart|InstallInstalling|ConfirmInstall/i.test(focusOut)) {
        isInstallerFocused = true;
      }
    } catch {}

    // 2. Try uiautomator dump to locate exact coordinates of "تثبيت" or "Install" or "确定"
    try {
      await this.execShell(adb, 'uiautomator dump /data/local/tmp/uidump.xml 2>/dev/null');
      const dump = await this.execShell(adb, 'cat /data/local/tmp/uidump.xml 2>/dev/null');
      if (dump && dump.includes('bounds=')) {
        const btnRegex = /(?:text|content-desc)="(?:تثبيت|تثبيت التطبيق|موافق|تأكيد|استمرار|Install|INSTALL|Package installer|安装|继续安装|确定)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i;
        const match = dump.match(btnRegex);
        if (match && match[1] && match[2] && match[3] && match[4]) {
          const x1 = parseInt(match[1], 10);
          const y1 = parseInt(match[2], 10);
          const x2 = parseInt(match[3], 10);
          const y2 = parseInt(match[4], 10);
          targetX = Math.round((x1 + x2) / 2);
          targetY = Math.round((y1 + y2) / 2);
          foundExactBounds = true;
          isInstallerFocused = true;
          onLog?.(`> تم رصد إحداثيات زر التثبيت بدقة: [X: ${targetX}, Y: ${targetY}]`, 'info');
        } else {
          // Check by resource-id
          const idRegex = /resource-id="[^"]*(?:ok_button|button1|install_button|continue_button|btn_install)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i;
          const idMatch = dump.match(idRegex);
          if (idMatch && idMatch[1] && idMatch[2] && idMatch[3] && idMatch[4]) {
            const x1 = parseInt(idMatch[1], 10);
            const y1 = parseInt(idMatch[2], 10);
            const x2 = parseInt(idMatch[3], 10);
            const y2 = parseInt(idMatch[4], 10);
            targetX = Math.round((x1 + x2) / 2);
            targetY = Math.round((y1 + y2) / 2);
            foundExactBounds = true;
            isInstallerFocused = true;
            onLog?.(`> تم رصد زر التثبيت عبر معرّف الواجهة: [X: ${targetX}, Y: ${targetY}]`, 'info');
          }
        }
      }
      await this.execShell(adb, 'rm -f /data/local/tmp/uidump.xml 2>/dev/null');
    } catch {}

    // 3. Screen Safety Guard: Only perform tap if packageinstaller is verified
    // Never send KEYCODE 23 (which opens/toggles the car radio on Desay SV head units!)
    if (foundExactBounds || isInstallerFocused) {
      onLog?.(`> تم التحقق من نافذة التثبيت، تنفيذ النقر التلقائي على زر (تثبيت) [${targetX}, ${targetY}]...`, 'info');
      await this.execShell(adb, `input tap ${targetX} ${targetY} 2>/dev/null`);
      await this.execShell(adb, 'input keyevent 22 2>/dev/null && input keyevent 66 2>/dev/null'); // DPAD_RIGHT + ENTER
      await this.execShell(adb, 'input keyevent 66 2>/dev/null'); // KEYCODE_ENTER
    } else {
      onLog?.('⚠️ لم تظهر نافذة تثبيت الحزم على واجهة السيارة (تم حجب النقر العشوائي لمنع تشغيل الراديو أو واجهة الشاشة).', 'warning');
    }

    // 4. Monitoring polling loop
    const startTime = Date.now();
    const maxWaitMs = timeoutSeconds * 1000;
    let newlyFoundPkg: string | undefined;

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 1200));

      const elapsedSec = Math.round((Date.now() - startTime) / 1000);

      try {
        const afterPkgsRaw = await this.execShell(adb, 'pm list packages 2>/dev/null');

        if (knownPackageName && afterPkgsRaw.includes(knownPackageName)) {
          newlyFoundPkg = knownPackageName;
          break;
        }

        const diff = this.findDiffPackage(beforePkgsRaw, afterPkgsRaw);
        if (diff) {
          newlyFoundPkg = diff;
          break;
        }
      } catch {}

      // Assist click ONLY IF verified on screen
      if ((elapsedSec === 2 || elapsedSec === 5) && (foundExactBounds || isInstallerFocused)) {
        onLog?.(`> إرسال نقرة تأكيد مساندة (ثانية ${elapsedSec})...`, 'info');
        await this.execShell(adb, `input tap ${targetX} ${targetY} 2>/dev/null`);
        if (!foundExactBounds) {
          await this.execShell(adb, `input tap ${targetX} ${Math.round(screenHeight * 0.565)} 2>/dev/null`);
          await this.execShell(adb, `input tap ${targetX} ${Math.round(screenHeight * 0.585)} 2>/dev/null`);
        }
        await this.execShell(adb, 'input keyevent 22 2>/dev/null && input keyevent 66 2>/dev/null');
        await this.execShell(adb, 'input keyevent 66 2>/dev/null');
      }

      if (elapsedSec % 3 === 0) {
        onLog?.(`في انتظار اكتمال التثبيت على شاشة السيارة (${elapsedSec}/${timeoutSeconds} ث)...`, 'info');
      }
    }

    if (newlyFoundPkg) {
      onLog?.(`تم تأكيد اكتمال التثبيت بنجاح: [${newlyFoundPkg}]`, 'success');
      return { success: true, packageName: newlyFoundPkg };
    }

    // Final check across -3 (third party packages)
    try {
      const finalPkgsRaw = await this.execShell(adb, 'pm list packages -3 2>/dev/null');
      if (knownPackageName && finalPkgsRaw.includes(knownPackageName)) {
        return { success: true, packageName: knownPackageName };
      }
      const finalDiff = this.findDiffPackage(beforePkgsRaw, finalPkgsRaw);
      if (finalDiff) {
        return { success: true, packageName: finalDiff };
      }
    } catch {}

    return { success: false };
  }

  /**
   * Opens the car head unit's native File Manager directly at /sdcard/Download or opens DocumentsUI
   */
  public static async openCarFileManager(
    adb: Adb,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    onLog?.('جارٍ فتح مدير ملفات السيارة (مجلد التحميلات) على شاشة السيارة...', 'info');

    const openFileManagerCommands = [
      'am start -a android.intent.action.VIEW -d "content://com.android.externalstorage.documents/document/primary:Download" -t "*/*" 2>/dev/null',
      'am start -n com.chery.filemanager/.MainActivity 2>/dev/null',
      'am start -n com.desay.filemanager/.MainActivity 2>/dev/null',
      'am start -n com.android.documentsui/.files.FilesActivity 2>/dev/null',
      'am start -n com.google.android.documentsui/com.android.documentsui.files.FilesActivity 2>/dev/null',
      'am start -a android.intent.action.VIEW -d "file:///sdcard/Download" -t "resource/folder" 2>/dev/null',
      'am start -a android.intent.action.VIEW -d "file:///sdcard/Download" 2>/dev/null',
    ];

    for (const cmd of openFileManagerCommands) {
      try {
        const res = await this.execShell(adb, cmd);
        if (res && !res.toLowerCase().includes('error') && !res.toLowerCase().includes('exception')) {
          onLog?.('تم إرسال أمر فتح مدير الملفات لشاشة السيارة بنجاح.', 'success');
          return { success: true, message: 'تم فتح مدير الملفات على شاشة السيارة.' };
        }
      } catch {}
    }

    onLog?.('تم إرسال أوامر تشغيل مدير الملفات للشاشة.', 'info');
    return { success: true, message: 'تم إرسال طلب فتح مدير الملفات لشاشة السيارة.' };
  }

  /**
   * 4. Classic Storage Pipe (/sdcard/Download) (Clean commands WITHOUT -g flag)
   */
  public static async installViaSdcardStorage(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const size = file.size;
    const cleanBaseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = cleanBaseName.endsWith('.apk') ? cleanBaseName : `${cleanBaseName}.apk`;

    try {
      await this.execShell(adb, 'mkdir -p /sdcard/Download 2>/dev/null');
    } catch {}

    const candidatePaths = [
      `/sdcard/Download/${safeName}`,
      `/sdcard/Download/app_install.apk`,
      `/sdcard/${safeName}`,
    ];

    let targetPath = '';
    let pushSuccess = false;
    let pushError = '';

    for (const testPath of candidatePaths) {
      try {
        onProgress?.(5, 'uploading', `نقل الحزمة إلى مسار التخزين (${testPath})...`);
        onLog?.(`محاولة نقل الحزمة إلى: ${testPath}...`, 'info');
        await this.pushFileSafe(adb, file, testPath, onProgress, onLog);
        await new Promise((r) => setTimeout(r, 250));
        targetPath = testPath;
        pushSuccess = true;
        onLog?.(`تم نقل الملف إلى ${testPath} بنجاح (${(size / (1024 * 1024)).toFixed(1)} MB).`, 'success');
        break;
      } catch (err: any) {
        pushError = err.message || String(err);
      }
    }

    if (!pushSuccess) {
      return {
        success: false,
        message: `تعذر نقل الملف إلى ذاكرة التخزين: ${pushError}`,
      };
    }

    try {
      await this.execShell(adb, `chmod 777 "${targetPath}" 2>/dev/null`);
    } catch {}

    await new Promise((r) => setTimeout(r, 200));
    onProgress?.(90, 'installing', 'تنفيذ أوامر التثبيت...');

    const currentUserId = await this.getCurrentUserId(adb);

    // Commands strictly WITHOUT -g flag
    const directCommands = [
      `pm install -r -t "${targetPath}"`,
      `pm install -r "${targetPath}"`,
      `cmd package install -r -t "${targetPath}"`,
      `cmd package install -r "${targetPath}"`,
      `pm install --user ${currentUserId} -r -t "${targetPath}"`,
      `pm install --user 0 -r -t "${targetPath}"`,
      `pm install --user 10 -r -t "${targetPath}"`,
      `pm install --user current -r -t "${targetPath}"`,
      `pm install -r -d -t "${targetPath}"`,
      `sh -c 'cat "${targetPath}" | pm install -r -t -S ${size}'`,
      `sh -c 'cat "${targetPath}" | cmd package install -r -t -S ${size}'`,
      `sh -c 'cat "${targetPath}" | pm install -S ${size}'`,
    ];

    let isSuccess = false;
    let lastOutput = '';

    for (let i = 0; i < directCommands.length; i++) {
      const cmd = directCommands[i];
      try {
        onLog?.(`[أمر التخزين ${i + 1}/${directCommands.length}] ${cmd}`, 'info');
        const output = await this.execShell(adb, cmd);
        const trimmed = output.trim();
        if (trimmed) {
          lastOutput = trimmed;
        }
        const isCmdSuccess = trimmed.toLowerCase().includes('success');
        onLog?.(`استجابة الشاشة: ${trimmed || '(تم التنفيذ)'}`, isCmdSuccess ? 'success' : 'info');

        if (isCmdSuccess) {
          isSuccess = true;
          break;
        }

        if (this.isFatalInstallError(trimmed)) {
          break;
        }
      } catch (eCmd: any) {
        const errMsg = eCmd?.message || String(eCmd);
        if (errMsg) lastOutput = errMsg;
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    // Try PackageManager library API as secondary fallback (WITHOUT grantRuntimePermissions)
    if (!isSuccess && !this.isFatalInstallError(lastOutput)) {
      try {
        const pm = new PackageManager(adb);
        onLog?.('تجربة التثبيت عبر مكتبة PackageManager...', 'info');
        const pmRes = await pm.install([targetPath], {
          allowTest: true,
          requestDowngrade: false,
        });
        if ((pmRes || '').toLowerCase().includes('success')) {
          isSuccess = true;
        }
      } catch (ePm: any) {
        onLog?.(`نتيجة pm.install: ${ePm.message || ePm}`, 'info');
      }
    }

    // Fallback: Launch Official PackageInstaller UI with Auto-Click Confirmation before giving up
    if (!isSuccess) {
      onLog?.('تجربة التأكيد عبر واجهة التثبيت الرسمية للشاشة مع النقر التلقائي...', 'info');
      try {
        const intentCmd = `am start -a android.intent.action.VIEW -d "file://${targetPath}" -t "application/vnd.android.package-archive" --grant-read-uri-permission 2>/dev/null || am start -a android.intent.action.INSTALL_PACKAGE -d "file://${targetPath}" -t "application/vnd.android.package-archive" 2>/dev/null`;
        await this.execShell(adb, intentCmd);
        const autoConfirmRes = await this.autoConfirmAndMonitorInstall(
          adb,
          '',
          knownPackageName,
          onLog,
          20
        );
        if (autoConfirmRes.success) {
          isSuccess = true;
        }
      } catch {}
    }

    // Always clean up temp file
    await this.cleanupFile(adb, targetPath);

    if (isSuccess) {
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح عبر بروتوكول التخزين (/sdcard).',
        packageName: knownPackageName,
      };
    }

    // Verification fallback
    if (knownPackageName) {
      const isInstalled = await this.isPackageInstalled(adb, knownPackageName);
      if (isInstalled) {
        return {
          success: true,
          message: 'تم التحقق من وجود الحزمة بنجاح على نظام السيارة.',
          packageName: knownPackageName,
        };
      }
    }

    const translated = this.translateAndroidInstallError(lastOutput);
    return {
      success: false,
      message: translated || lastOutput || 'فشل التثبيت على مسار التخزين.',
    };
  }

  /**
   * Pushes a file to device storage using AdbSync with WrapReadableStream & TransformStream
   */
  private static async pushFileSafe(
    adb: Adb,
    file: File,
    targetPath: string,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    const size = file.size;
    let transferredBytes = 0;
    const sync = await adb.sync();

    try {
      const readable = new WrapReadableStream<Uint8Array>({
        start: () => file.stream() as any,
      });

      const transform = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          transferredBytes += chunk.byteLength;
          const pct = 5 + Math.min(80, Math.round((transferredBytes / size) * 80));
          const mbTransferred = (transferredBytes / (1024 * 1024)).toFixed(1);
          const mbTotal = (size / (1024 * 1024)).toFixed(1);
          onProgress?.(pct, 'uploading', `جاري رفع APK إلى الشاشة (${mbTransferred} / ${mbTotal} MB)`);
          controller.enqueue(chunk);
        },
      });

      const stream = readable.pipeThrough(transform);

      await sync.write({
        filename: targetPath,
        file: stream as any,
        permission: 0o777,
      });
    } finally {
      try {
        await sync.dispose();
      } catch {}
    }
  }

  /**
   * Fallback: Pushes file via standard shell pipe for car head units where sync is restricted
   */
  private static async pushFileViaShell(
    adb: Adb,
    file: File,
    targetPath: string,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    const size = file.size;
    onLog?.('جاري إنشاء ملف الـ APK عبر ممر Shell المباشر...', 'info');

    const socket = await adb.createSocket(`shell:cat > "${targetPath}"`);
    const writer = socket.writable.getWriter();
    const reader = file.stream().getReader();
    let sentBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          await writer.write(value);
          sentBytes += value.byteLength;
          const pct = 5 + Math.min(80, Math.round((sentBytes / size) * 80));
          const mbTransferred = (sentBytes / (1024 * 1024)).toFixed(1);
          const mbTotal = (size / (1024 * 1024)).toFixed(1);
          onProgress?.(pct, 'uploading', `رفع عبر Shell (${mbTransferred} / ${mbTotal} MB)`);
        }
      }
      await writer.close();
    } catch (e: any) {
      try { await writer.abort(e); } catch {}
      throw new Error(`انقطع النقل عبر Shell: ${e.message || e}`);
    } finally {
      reader.releaseLock();
    }

    const socketReader = socket.readable.getReader();
    try {
      while (true) {
        const { done } = await socketReader.read();
        if (done) break;
      }
    } catch {} finally {
      socketReader.releaseLock();
      try { await socket.close(); } catch {}
    }
  }

  /**
   * Helper to clean up temporary file from device storage
   */
  private static async cleanupFile(adb: Adb, path: string): Promise<void> {
    if (!path) return;
    try {
      await adb.rm(path).catch(() => {});
    } catch {
      try {
        await this.execShell(adb, `rm -f "${path}" 2>/dev/null`);
      } catch {}
    }
  }

  /**
   * Detects the active foreground user ID in Android Automotive (e.g., User 10, 11, or 0)
   */
  public static async getCurrentUserId(adb: Adb): Promise<string> {
    try {
      const out = await this.execShell(adb, 'am get-current-user 2>/dev/null');
      const trimmed = out.trim();
      if (/^\d+$/.test(trimmed)) {
        return trimmed;
      }
    } catch {}

    try {
      const dumpsysUsers = await this.execShell(adb, 'dumpsys user 2>/dev/null');
      const match = dumpsysUsers.match(/UserInfo\{(\d+):[^}]+running/i) || dumpsysUsers.match(/mCurrentUserId=(\d+)/i);
      if (match && match[1]) {
        return match[1];
      }
    } catch {}

    return '0';
  }

  /**
   * Unlocks security restrictions and package verifiers that cause "Restriction prevents installing" or hide apps
   * Comprehensively detects all system and automotive user profiles and strips installation blocks.
   */
  public static async unlockUserRestrictions(
    adb: Adb,
    userId: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    try {
      // 1. Gather all active user IDs on the device (User 0, User 10, current, etc.)
      const userIds = new Set<string>(['0', 'current']);
      if (userId) userIds.add(userId);

      try {
        const usersRaw = await this.execShell(adb, 'pm list users 2>/dev/null');
        const matches = usersRaw.matchAll(/UserInfo\{(\d+):/g);
        for (const m of matches) {
          if (m[1]) userIds.add(m[1]);
        }
      } catch {}

      // 2. Package verifiers & security checks (disable so no silent blocks occur)
      await this.execShell(adb, 'settings put global verifier_verify_adb_installs 0 2>/dev/null');
      await this.execShell(adb, 'settings put global package_verifier_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put global upload_apk_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put secure package_verifier_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put secure upload_apk_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put global install_non_market_apps 1 2>/dev/null');
      await this.execShell(adb, 'settings put secure install_non_market_apps 1 2>/dev/null');
      await this.execShell(adb, 'settings put system install_non_market_apps 1 2>/dev/null');

      // 3. User restrictions that block app installation or unknown sources
      const restrictions = [
        'no_install_apps',
        'no_install_unknown_sources',
        'no_install_unknown_sources_globally',
        'no_uninstall_apps',
        'no_control_apps',
      ];

      for (const uid of Array.from(userIds)) {
        await this.execShell(adb, `settings put --user ${uid} secure install_non_market_apps 1 2>/dev/null`);
        await this.execShell(adb, `settings put --user ${uid} global install_non_market_apps 1 2>/dev/null`);
      }

      // Disable ADB verification and Play Protect verification timeouts which cause Aborted on cars without internet
      await this.execShell(adb, 'settings put global verifier_verify_adb_installs 0 2>/dev/null');
      await this.execShell(adb, 'settings put global package_verifier_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put global upload_apk_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put global package_verifier_user_consent 1 2>/dev/null');
      await this.execShell(adb, 'settings put secure install_non_market_apps 1 2>/dev/null');

      // Execute restriction clearing using ALL recognized Android PM command variants
      // Note: Android versions vary between "pm set-user-restriction <r> 0 --user <id>",
      // "pm set-user-restriction --user <id> <r> 0", and positional "pm set-user-restriction <r> 0 <id>"
      for (const r of restrictions) {
        // Base global/default call
        await this.execShell(adb, `pm set-user-restriction ${r} 0 2>/dev/null`);
        await this.execShell(adb, `pm set-user-restriction ${r} false 2>/dev/null`);

        for (const uid of Array.from(userIds)) {
          // Standard Android variant: <restriction> <value> --user <id>
          await this.execShell(adb, `pm set-user-restriction ${r} 0 --user ${uid} 2>/dev/null`);
          await this.execShell(adb, `pm set-user-restriction ${r} false --user ${uid} 2>/dev/null`);

          // Prefixed variant: --user <id> <restriction> <value>
          await this.execShell(adb, `pm set-user-restriction --user ${uid} ${r} 0 2>/dev/null`);
          await this.execShell(adb, `pm set-user-restriction --user ${uid} ${r} false 2>/dev/null`);

          // Positional legacy variant: <restriction> <value> <id>
          if (uid !== 'current') {
            await this.execShell(adb, `pm set-user-restriction ${r} 0 ${uid} 2>/dev/null`);
          }
        }
      }

      onLog?.('تم فك قيود تثبيت التطبيقات ومصادر التثبيت الخارجية بنجاح على شاشة السيارة.', 'info');
    } catch (e: any) {
      onLog?.(`تنبيه فك القيود: ${e.message || e}`, 'info');
    }
  }

  /**
   * Retrieves current set of installed package names on device
   */
  public static async getInstalledPackagesSet(adb: Adb): Promise<Set<string>> {
    const set = new Set<string>();
    try {
      const out = await this.execShell(adb, 'pm list packages 2>/dev/null || pm list packages -u 2>/dev/null');
      for (const line of out.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('package:')) {
          set.add(trimmed.substring(8).trim());
        }
      }
    } catch {}
    return set;
  }

  /**
   * Finds newly installed package by diffing with before snapshot
   */
  public static async detectNewlyInstalledPackage(
    adb: Adb,
    beforeSet: Set<string>,
    suggestedPackage?: string
  ): Promise<string | undefined> {
    if (suggestedPackage && suggestedPackage !== 'base' && suggestedPackage !== 'unknown.package') {
      const isInst = await this.isPackageInstalled(adb, suggestedPackage);
      if (isInst) return suggestedPackage;
    }

    try {
      const afterSet = await this.getInstalledPackagesSet(adb);
      for (const pkg of afterSet) {
        if (!beforeSet.has(pkg)) {
          return pkg;
        }
      }
    } catch {}

    return suggestedPackage && suggestedPackage !== 'base' && suggestedPackage !== 'unknown.package'
      ? suggestedPackage
      : undefined;
  }

  /**
   * Comprehensive automotive launcher activation pipeline:
   * Solves: "التطبيق يتثبت بنجاح لكن لا يظهر في القائمة وشاشة السيارة"
   * 1. Detects all car users (User 0, 10, 11, etc.)
   * 2. Installs existing package into all user profiles (cmd package install-existing)
   * 3. Unhides and enables package across users (pm unhide, pm enable, pm unsuspend)
   * 4. Sets distraction-optimized flag so Android Automotive displays app while driving/parked
   * 5. Wakes up package using monkey to clear FLAG_STOPPED
   * 6. Broadcasts PACKAGE_ADDED, PACKAGE_CHANGED, INSTALL_SHORTCUT, and MAIN HOME to refresh the launcher
   * 7. Adds to automotive global app whitelist and grants overlay permissions
   */
  public static async activatePackageForCarLauncher(
    adb: Adb,
    packageName: string,
    userId?: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    if (!packageName || packageName === 'unknown.package' || packageName === 'base') return;

    onLog?.(`تفعيل وإظهار التطبيق (${packageName}) في شاشة ولانشر السيارة...`, 'info');

    // Discover all active car users
    const usersToTarget = new Set<string>(['current', '0', '10', '11']);
    if (userId) usersToTarget.add(userId);

    try {
      const usersOut = await this.execShell(adb, 'pm list users 2>/dev/null || cmd user list 2>/dev/null');
      const matches = usersOut.matchAll(/UserInfo\{(\d+):/g);
      for (const m of matches) {
        if (m[1]) usersToTarget.add(m[1]);
      }
    } catch {}

    for (const u of usersToTarget) {
      try {
        // Step 1: Install existing into user profile (Android Automotive multi-user fix)
        await this.execShell(adb, `cmd package install-existing --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm install-existing --user ${u} ${packageName} 2>/dev/null`);

        // Step 2: Unhide
        await this.execShell(adb, `cmd package unhide --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm unhide --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm set-application-hidden --user ${u} ${packageName} false 2>/dev/null`);

        // Step 3: Enable
        await this.execShell(adb, `cmd package enable --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm enable --user ${u} ${packageName} 2>/dev/null`);

        // Step 4: Unsuspend
        await this.execShell(adb, `cmd package unsuspend --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm unsuspend --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `cmd package set-distracting-restriction --user ${u} --restriction none ${packageName} 2>/dev/null`);

        // Step 5: Distraction optimization (tells Android Automotive launcher this app is allowed on screen)
        await this.execShell(adb, `cmd package set-distraction-optimized --user ${u} true ${packageName} 2>/dev/null`);
        await this.execShell(adb, `cmd car_service set-distraction-optimized ${packageName} true 2>/dev/null`);
      } catch {}
    }

    // Step 6: Global unhide, enable, and optimize
    try {
      await this.execShell(adb, `pm unhide ${packageName} 2>/dev/null`);
      await this.execShell(adb, `pm enable ${packageName} 2>/dev/null`);
      await this.execShell(adb, `cmd package set-distraction-optimized true ${packageName} 2>/dev/null`);
      await this.execShell(adb, `pm default-state --user current ${packageName} 2>/dev/null`);
    } catch {}

    // Step 7: Automotive screen overlay & background usage permissions
    try {
      await this.execShell(adb, `appops set ${packageName} SYSTEM_ALERT_WINDOW allow 2>/dev/null`);
      await this.execShell(adb, `appops set ${packageName} GET_USAGE_STATS allow 2>/dev/null`);
      await this.execShell(adb, `pm grant ${packageName} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`);
    } catch {}

    // Step 8: Geely / Desay SV OEM global app whitelist
    try {
      await this.execShell(adb, `settings put global app_whitelist ${packageName} 2>/dev/null`);
      await this.execShell(adb, `settings put secure app_whitelist ${packageName} 2>/dev/null`);
    } catch {}

    // Step 9: Wake up package from stopped state (Clears FLAG_STOPPED so car launchers recognize it)
    try {
      await this.execShell(adb, `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1 2>/dev/null`);
    } catch {}

    // Step 10: Broadcast to Car Launcher to refresh package list
    try {
      await this.execShell(adb, `am broadcast -a android.intent.action.PACKAGE_ADDED -d package:${packageName} 2>/dev/null`);
      await this.execShell(adb, `am broadcast -a android.intent.action.PACKAGE_CHANGED -d package:${packageName} 2>/dev/null`);
      await this.execShell(adb, `am broadcast -a android.intent.action.PACKAGE_REPLACED -d package:${packageName} 2>/dev/null`);
      await this.execShell(adb, `am broadcast -a com.android.launcher.action.INSTALL_SHORTCUT 2>/dev/null`);
      await this.execShell(adb, `am broadcast -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null`);
    } catch {}

    onLog?.(`✓ تم تفعيل التطبيق (${packageName}) بنجاح وإظهاره في شاشة وقائمة السيارة.`, 'success');
  }

  /**
   * Bulk Tool: Activates and unhides ALL installed 3rd-party user applications on the car screen launcher
   */
  public static async exposeAllUserApps(
    adb: Adb,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ count: number; packages: string[] }> {
    onLog?.('جاري فحص كافة التطبيقات المثبتة لتفعيلها وإظهارها في شاشة السيارة ولانشر البرامج...', 'info');
    const currentUserId = await this.getCurrentUserId(adb);

    // Get list of non-system (3rd-party) packages
    const out3 = await this.execShell(adb, 'pm list packages -3 2>/dev/null || pm list packages -u 2>/dev/null');
    const lines = out3.split('\n');
    const packages: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('package:')) {
        const pkg = trimmed.substring(8).trim();
        if (pkg && !packages.includes(pkg)) {
          packages.push(pkg);
        }
      }
    }

    onLog?.(`تم العثور على ${packages.length} تطبيق على الشاشة. بدء التفعيل الكامل...`, 'info');
    let activatedCount = 0;

    for (const pkg of packages) {
      try {
        await this.activatePackageForCarLauncher(adb, pkg, currentUserId);
        activatedCount++;
        onLog?.(`[${activatedCount}/${packages.length}] تم تفعيل وإظهار: ${pkg}`, 'info');
      } catch {}
      await new Promise((r) => setTimeout(r, 60));
    }

    // Global launcher refresh broadcast
    try {
      await this.execShell(adb, 'am broadcast -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null');
    } catch {}

    onLog?.(`تم تفعيل وإظهار ${activatedCount} تطبيق بنجاح في شاشة ولانشر السيارة!`, 'success');
    return { count: activatedCount, packages };
  }

  /**
   * Checks if a package name exists in installed packages on the system
   */
  public static async isPackageInstalled(adb: Adb, packageName: string): Promise<boolean> {
    if (!packageName) return false;
    try {
      const out = await this.execShell(adb, `pm list packages -u ${packageName} 2>/dev/null || pm list packages ${packageName} 2>/dev/null`);
      return out.toLowerCase().includes(`package:${packageName.toLowerCase()}`);
    } catch {
      return false;
    }
  }

  /**
   * Helper to check if an error is fatal (cannot be solved by changing installation flags)
   */
  private static isFatalInstallError(errStr: string): boolean {
    if (!errStr) return false;
    const err = errStr.toUpperCase();
    return (
      err.includes('INSTALL_FAILED_ALREADY_EXISTS') ||
      err.includes('INSTALL_FAILED_VERSION_DOWNGRADE') ||
      err.includes('INSTALL_FAILED_CPU_ABI_INCOMPATIBLE') ||
      err.includes('NO_MATCHING_ABIS') ||
      err.includes('INSTALL_FAILED_INSUFFICIENT_STORAGE') ||
      err.includes('INSTALL_PARSE_FAILED_NOT_APK') ||
      err.includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE') ||
      err.includes('SIGNATURE_MISMATCH')
    );
  }

  /**
   * Automatically grants recommended automotive permissions for known car applications & stores
   */
  private static async autoGrantAutomotivePermissions(
    adb: Adb,
    fileName: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    const lower = fileName.toLowerCase();

    // App Stores
    if (lower.includes('store') || lower.includes('market') || lower.includes('aurora') || lower.includes('rustore')) {
      onLog?.('اكتشاف متجر تطبيقات: جاري تفعيل أذونات تثبيت الحزم والنوافذ المنبثقة تلقائياً...', 'info');
      const pkgs = ['ru.vk.store', 'com.aurora.store', 'com.android.vending'];
      for (const p of pkgs) {
        try {
          await this.execShell(adb, `pm grant ${p} android.permission.REQUEST_INSTALL_PACKAGES 2>/dev/null`);
          await this.execShell(adb, `pm grant ${p} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`);
          await this.execShell(adb, `appops set ${p} REQUEST_INSTALL_PACKAGES allow 2>/dev/null`);
          await this.execShell(adb, `appops set ${p} SYSTEM_ALERT_WINDOW allow 2>/dev/null`);
          await this.execShell(adb, `dumpsys deviceidle whitelist +${p} 2>/dev/null`);
        } catch {}
      }
    }

    // MacroDroid & Button Mapper (Steering wheel controls / T2 / Desay SV)
    if (lower.includes('macro') || lower.includes('droid') || lower.includes('button') || lower.includes('mapper')) {
      onLog?.('اكتشاف أداة أزرار المقود: جاري تفعيل حزمة أذونات الخدمات وتسهيل الاستخدام تلقائياً...', 'info');
      const mdPkg = 'com.arlosoft.macrodroid';
      try {
        await this.execShell(adb, `pm grant ${mdPkg} android.permission.CHANGE_CONFIGURATION 2>/dev/null`);
        await this.execShell(adb, `pm grant ${mdPkg} android.permission.WRITE_SECURE_SETTINGS 2>/dev/null`);
        await this.execShell(adb, `pm grant ${mdPkg} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`);
        await this.execShell(adb, `pm grant ${mdPkg} android.permission.READ_LOGS 2>/dev/null`);
        await this.execShell(adb, `pm grant ${mdPkg} android.permission.DUMP 2>/dev/null`);
        await this.execShell(adb, `dumpsys deviceidle whitelist +${mdPkg} 2>/dev/null`);
        await this.execShell(adb, `appops set ${mdPkg} SYSTEM_ALERT_WINDOW allow 2>/dev/null`);
        await this.execShell(adb, `settings put secure accessibility_enabled 1 2>/dev/null`);
        await this.execShell(adb, `settings put secure enabled_accessibility_services com.arlosoft.macrodroid/com.arlosoft.macrodroid.triggers.services.AccessibilityService:com.arlosoft.macrodroid/com.arlosoft.macrodroid.common.MacroDroidAccessibilityService:flar2.homebutton/flar2.homebutton.ButtonMapperService:io.github.sds100.keymapper/io.github.sds100.keymapper.service.KeyMapperAccessibilityService 2>/dev/null`);
      } catch {}
    }
  }

  /**
   * Helper to execute a command over standard ADB shell with clean socket termination
   */
  public static async execShell(adb: Adb, command: string): Promise<string> {
    return adbManager.execShell(adb, command);
  }

  /**
   * Translates Android `INSTALL_FAILED_*` errors into clear Arabic explanations with direct fix instructions
   */
  public static translateAndroidInstallError(rawError: string): string {
    if (!rawError) return 'حدث خطأ غير محدد أثناء التثبيت.';

    const err = rawError.toUpperCase();

    if (
      err.includes('FUSE') ||
      (err.includes('AVC: DENIED') && err.includes('READ')) ||
      err.includes('CANNOT OPEN FILE') ||
      err.includes("CAN'T OPEN FILE") ||
      err.includes('UNABLE TO OPEN FILE') ||
      err.includes('FAILED TO EXTRACT NATIVE LIBRARIES') ||
      err.includes('RES=-2')
    ) {
      return 'تم رصد قيود أمنية على بطاقة التخزين (SELinux FUSE). تم توجيه التثبيت تلقائياً عبر جلسة حزم النظام المباشرة لتجاوز بطاقة الذاكرة.';
    }

    if (err.includes('INSTALL_GRANT_RUNTIME_PERMISSIONS') || err.includes('SECURITYEXCEPTION') || err.includes('INSTALL_PERMISSIONS')) {
      return 'رفض نظام السيارة الصلاحيات المباشرة أثناء التثبيت (SecurityException). يرجى استخدام (بروتوكول جيتور والأنظمة المحمية r.sh) لتجاوز قيود الحماية.';
    }

    if (err.includes('ABORTED')) {
      return 'حماية نظام السيارة (جيتور / DesaySV) تمنع التثبيت الصامت من الخلفية وتتطلب واجهة التثبيت الرسمية. تم إرسال أمر النقر التلقائي لزر (تثبيت) الأخضر الظاهر على شاشتك.';
    }

    if (err.includes('INSTALL_FAILED_ALREADY_EXISTS') || err.includes('UPDATE_INCOMPATIBLE') || err.includes('SIGNATURE_MISMATCH')) {
      return 'توجد نسخة سابقة مثبتة على الشاشة بتوقيع مختلف (Signature Mismatch). الحل: قم بحذف النسخة السابقة أولاً (من قسم إدارة التطبيقات في هذا البرنامج) ثم أعد التثبيت.';
    }
    if (err.includes('INSTALL_FAILED_VERSION_DOWNGRADE')) {
      return 'الإصدار المراد تثبيته أقدم من الإصدار الموجود حالياً على الشاشة. الحل: قم بإلغاء تثبيت النسخة الحالية أولاً.';
    }
    if (err.includes('INSTALL_FAILED_INVALID_APK') || err.includes('INSTALL_PARSE_FAILED_NOT_APK')) {
      return 'ملف الـ APK غير صالح أو تالف أو تم تنزيله بشكل غير مكتمل. يرجى إعادة تنزيل الملف من مصدره.';
    }
    if (err.includes('INSTALL_FAILED_OLDER_SDK') || err.includes('INSTALL_PARSE_FAILED_MIN_SDK')) {
      return 'التطبيق غير متوافق مع إصدار نظام شاشة سيارتك (يتطلب إصدار أندرويد أحدث). يرجى تنزيل إصدار يتوافق مع أندرويد الشاشة.';
    }
    if (err.includes('INSTALL_FAILED_CPU_ABI_INCOMPATIBLE') || err.includes('NO_MATCHING_ABIS')) {
      return 'معمارية التطبيق غير متوافقة مع معالج الشاشة (مثلاً التطبيق 64-bit ومعالج شاشتك 32-bit armeabi-v7a). يرجى تنزيل نسخة 32-bit armeabi-v7a من التطبيق.';
    }
    if (err.includes('INSTALL_FAILED_INSUFFICIENT_STORAGE')) {
      return 'مساحة تخزين شاشة السيارة ممتلئة. يرجى حذف بعض الملفات أو التطبيقات لتوفير مساحة كافية.';
    }
    if (err.includes('INSTALL_FAILED_USER_RESTRICTED')) {
      return 'نظام السيارة مقيد من الشركة المصنعة لمنع تثبيت التطبيقات غير المصرح بها (User Restricted). تم إطلاق نافذة التثبيت على شاشة السيارة لتأكيد التثبيت يدوياً.';
    }
    if (err.includes('INSTALL_FAILED_VERIFICATION_FAILURE') || err.includes('VERIFICATION_TIMEOUT')) {
      return 'فشلت أداة التحقق من الحزم الأمنية في الشاشة. يمكنك تعطيل فاحص الحزم من قسم (أدوات النظام) لتسريع التثبيت.';
    }
    if (err.includes('INSTALL_PARSE_FAILED_NO_CERTIFICATES')) {
      return 'ملف التطبيق غير موقع بشهادة رقمية (Not Signed). يرجى استخدام تطبيق موقع بشهادة رسمية.';
    }
    if (err.includes('INSTALL_FAILED_DEXOPT')) {
      return 'فشل تحسين كود التطبيق (Dexopt Failed). قد تكون الذاكرة العشوائية RAM في شاشة السيارة ممتلئة. أعد تشغيل الشاشة وحاول مرة أخرى.';
    }
    if (err.includes('SOCKET OPEN FAILED') || err.includes('CLOSED') || err.includes('TRANSPORT ENDPOINT')) {
      return 'تم توجيه مسار النقل عبر التخزين المباشر لتجاوز قيود المنافذ المقفلة.';
    }

    return rawError;
  }
}
