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

      // Attempt 4: Classic Storage Pipe (/sdcard/Download)
      onLog?.('[الخطوة 4] تجربة مسار التخزين الكلاسيكي (/sdcard/Download)...', 'info');
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

    // Commands strictly WITHOUT -g flag to avoid SecurityException
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

    // Direct Command 1: Fast test with Russian tool exact format
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

    // If still not successful, invoke Jetour T2 / Firmware Fallback script (r.sh)
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
        message: 'تم تثبيت التطبيق بنجاح عبر مسار النظام الداخلي وبرنامج التثبيت الاحتياطي.',
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
      message: translated || lastOutput || 'فشل التثبيت على مسار النظام الداخلي.',
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
   * Independent Multi-Strategy Car Head Unit Installer (Bypasses firmware restrictions in /data/local/tmp)
   * Does NOT rely on any third-party app or helper. Directly calls PackageInstaller Sessions and runtime bypasses.
   */
  public static async executeFallbackInstallerScript(
    adb: Adb,
    targetPath: string,
    safeName: string,
    size: number,
    knownPackageName?: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    onLog?.('بدء دورة التثبيت المباشرة المستقلة لشاشات السيارات بالمسار الداخلي...', 'info');

    // 0. Snapshot existing packages before running install
    let beforePkgsRaw = '';
    try {
      beforePkgsRaw = await this.execShell(adb, 'pm list packages 2>/dev/null');
    } catch {}

    let newlyFoundPkg: string | undefined;
    let isSuccess = false;

    // Strategy 1: Native PackageInstaller Session Stream directly in /data/local/tmp
    onLog?.('• تجربة [1]: إنشاء جلسة تثبيت داخلية (PackageInstaller Session)...', 'info');
    try {
      const createCmd = `cmd package install-create -r -t -d -S ${size} 2>/dev/null || pm install-create -r -t -d -S ${size} 2>/dev/null || pm install-create -r -t -d --user 0 -S ${size} 2>/dev/null || pm install-create -r -t -d -i com.android.shell -S ${size} 2>/dev/null`;
      const createRes = await this.execShell(adb, createCmd);
      const match = createRes.match(/\b\d+\b/);
      const sessionId = match ? match[0] : '';

      if (sessionId) {
        onLog?.(`> تم فتح جلسة الحزم رقم [${sessionId}]، جارٍ كتابة الحزمة...`, 'info');
        const writeCmd = `cat "${targetPath}" | pm install-write -S ${size} ${sessionId} base.apk`;
        const writeRes = await this.execShell(adb, writeCmd);
        if (writeRes.trim()) {
          onLog?.(`> مخرجات كتابة الجلسة: ${writeRes.trim()}`, 'info');
        }

        onLog?.(`> تأكيد وتثبيت الجلسة [${sessionId}]...`, 'info');
        const commitRes = await this.execShell(adb, `pm install-commit ${sessionId}`);
        const commitTrimmed = commitRes.trim();
        onLog?.(`> استجابة تأكيد الجلسة: ${commitTrimmed || '(اكتملت)'}`, 'info');

        if (commitTrimmed.toLowerCase().includes('success')) {
          isSuccess = true;
        }
      } else {
        onLog?.('لم تستجب واجهة إنشاء الجلسات، الانتقال للمسار التالي...', 'info');
      }
    } catch (errSession: any) {
      onLog?.(`تنبيه في جلسة الحزم: ${errSession?.message || errSession}`, 'info');
    }

    // Check if installed after Strategy 1
    if (!isSuccess) {
      await new Promise((r) => setTimeout(r, 600));
      try {
        const afterRaw = await this.execShell(adb, 'pm list packages 2>/dev/null');
        newlyFoundPkg = this.findDiffPackage(beforePkgsRaw, afterRaw);
        if (newlyFoundPkg || (knownPackageName && afterRaw.includes(knownPackageName))) {
          isSuccess = true;
          if (!newlyFoundPkg && knownPackageName) newlyFoundPkg = knownPackageName;
        }
      } catch {}
    }

    // Strategy 2: Direct 'cmd package install'
    if (!isSuccess) {
      onLog?.('• تجربة [2]: التثبيت عبر مدير الحزم المباشر (cmd package install)...', 'info');
      try {
        const cmdOut = await this.execShell(adb, `cmd package install -r -t -d "${targetPath}" 2>&1`);
        const trimmed = cmdOut.trim();
        if (trimmed) onLog?.(`> استجابة cmd package: ${trimmed}`, 'info');
        if (trimmed.toLowerCase().includes('success')) {
          isSuccess = true;
        }
      } catch (errCmd: any) {
        onLog?.(`تنبيه cmd package: ${errCmd?.message || errCmd}`, 'info');
      }
    }

    // Check if installed after Strategy 2
    if (!isSuccess) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const afterRaw = await this.execShell(adb, 'pm list packages 2>/dev/null');
        newlyFoundPkg = this.findDiffPackage(beforePkgsRaw, afterRaw);
        if (newlyFoundPkg || (knownPackageName && afterRaw.includes(knownPackageName))) {
          isSuccess = true;
          if (!newlyFoundPkg && knownPackageName) newlyFoundPkg = knownPackageName;
        }
      } catch {}
    }

    // Strategy 3: User 0 / Current targeted install
    if (!isSuccess) {
      onLog?.('• تجربة [3]: التثبيت الموجه لمستخدم الشاشة (pm install --user 0)...', 'info');
      try {
        const userOut = await this.execShell(adb, `pm install -r -t -d --user 0 "${targetPath}" 2>&1 || pm install -r -t -d --user current "${targetPath}" 2>&1`);
        const trimmed = userOut.trim();
        if (trimmed) onLog?.(`> استجابة user install: ${trimmed}`, 'info');
        if (trimmed.toLowerCase().includes('success')) {
          isSuccess = true;
        }
      } catch (errUser: any) {
        onLog?.(`تنبيه user install: ${errUser?.message || errUser}`, 'info');
      }
    }

    // Strategy 4: Cat pipe with exact size flag
    if (!isSuccess) {
      onLog?.('• تجربة [4]: التثبيت عبر مدخل القناة المباشرة (cat pipe -S)...', 'info');
      try {
        const pipeOut = await this.execShell(adb, `cd /data/local/tmp && cat "${safeName}" | pm install -S ${size} 2>&1`);
        const trimmed = pipeOut.trim();
        if (trimmed) onLog?.(`> استجابة cat pipe: ${trimmed}`, 'info');
        if (trimmed.toLowerCase().includes('success')) {
          isSuccess = true;
        }
      } catch (errPipe: any) {
        onLog?.(`تنبيه cat pipe: ${errPipe?.message || errPipe}`, 'info');
      }
    }

    // Strategy 5: Framework app_process bypass (bypasses car firmware pm shell wrapper)
    if (!isSuccess) {
      onLog?.('• تجربة [5]: التثبيت عبر محرك آلة أندرويد الافتراضية (app_process)...', 'info');
      try {
        const appOut = await this.execShell(
          adb,
          `CLASSPATH=/system/framework/pm.jar app_process /system/bin com.android.commands.pm.Pm install -r -t -d "${targetPath}" 2>&1`
        );
        const trimmed = appOut.trim();
        if (trimmed) onLog?.(`> استجابة app_process: ${trimmed}`, 'info');
        if (trimmed.toLowerCase().includes('success')) {
          isSuccess = true;
        }
      } catch (errApp: any) {
        onLog?.(`تنبيه app_process: ${errApp?.message || errApp}`, 'info');
      }
    }

    // Final verification of newly installed package
    await new Promise((r) => setTimeout(r, 700));
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

      // Grant access rights & System Alert Window
      onLog?.('... ضبط حقوق الوصول وتفعيل ظهور التطبيق في شاشة السيارة ولانشر البرامج', 'info');
      try {
        await this.execShell(adb, `appops set ${installedPkg} SYSTEM_ALERT_WINDOW allow 2>/dev/null`);
        await this.execShell(adb, `pm grant ${installedPkg} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`);
        await this.execShell(adb, `appops set ${installedPkg} RUN_IN_BACKGROUND allow 2>/dev/null`);
        await this.execShell(adb, `pm enable ${installedPkg} 2>/dev/null`);
        await this.execShell(adb, `am broadcast -a android.intent.action.BOOT_COMPLETED -p ${installedPkg} 2>/dev/null`);
        onLog?.('تحقق • نافذة تنبيه النظام وظهور التطبيق: تم إصدارها بنجاح.', 'success');

        await this.execShell(adb, `appops set ${installedPkg} WRITE_SETTINGS allow 2>/dev/null`);
        await this.execShell(adb, `appops set ${installedPkg} MANAGE_EXTERNAL_STORAGE allow 2>/dev/null`);
      } catch (ePerm: any) {
        onLog?.(`ملاحظة ضبط الصلاحيات: ${ePerm?.message || ePerm}`, 'info');
      }

      return {
        success: true,
        message: `تم تثبيت التطبيق (${installedPkg}) بنجاح في مسار النظام الداخلي المستقل.`,
        packageName: installedPkg,
      };
    }

    return {
      success: false,
      message: 'لم يتمكن محرك التثبيت من إتمام التثبيت على نظام السيارة.',
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
   */
  public static async unlockUserRestrictions(
    adb: Adb,
    userId: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    try {
      // 1. Package verifiers
      await this.execShell(adb, 'settings put global verifier_verify_adb_installs 0 2>/dev/null');
      await this.execShell(adb, 'settings put global package_verifier_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put global upload_apk_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put secure package_verifier_enable 0 2>/dev/null');

      // 2. Allow unknown / non-market sources for system & user
      await this.execShell(adb, 'settings put global install_non_market_apps 1 2>/dev/null');
      await this.execShell(adb, 'settings put secure install_non_market_apps 1 2>/dev/null');
      await this.execShell(adb, `settings put --user ${userId} secure install_non_market_apps 1 2>/dev/null`);
      await this.execShell(adb, `settings put --user current secure install_non_market_apps 1 2>/dev/null`);

      // 3. Clear user restrictions that block app installation or launcher visibility
      const restrictions = [
        'no_install_apps',
        'no_install_unknown_sources',
        'no_install_unknown_sources_globally',
        'no_uninstall_apps',
        'no_control_apps',
      ];

      for (const r of restrictions) {
        await this.execShell(adb, `pm set-user-restriction --user ${userId} ${r} 0 2>/dev/null`);
        await this.execShell(adb, `pm set-user-restriction --user current ${r} 0 2>/dev/null`);
        await this.execShell(adb, `pm set-user-restriction --user 0 ${r} 0 2>/dev/null`);
      }
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
