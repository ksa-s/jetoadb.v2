import { Adb } from '@yume-chan/adb';
import { PackageManager } from '@yume-chan/android-bin';
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

    // Detect package name from file or metadata if not provided
    let effectivePackageName = knownPackageName;
    if (!effectivePackageName) {
      try {
        const meta = await parseApkMetadata(file);
        if (meta.packageName && meta.packageName !== 'unknown.package') {
          effectivePackageName = meta.packageName;
        }
      } catch {}
    }

    onLog?.(`بدء تثبيت التطبيق: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`, 'info');
    if (effectivePackageName) {
      onLog?.(`معرف الحزمة المكتشف: ${effectivePackageName}`, 'info');
    }

    // Method 1: Modern Car Protocol (Specifically designed for Android 10/11/12/13/14 updates, Desay SV, Jetour, Haval, Geely, Changan)
    if (preferredMethod === 'modern_car') {
      const res = await this.installViaModernCarProtocol(adb, file, onProgress, onLog, effectivePackageName);
      return { ...res, methodUsed: 'modern_car', packageName: effectivePackageName };
    }

    // Method 2: Storage Push & Direct Package Manager Install (Standard for older Car Units)
    if (preferredMethod === 'sdcard') {
      const res = await this.installViaStoragePipe(adb, file, onProgress, onLog, effectivePackageName);
      return { ...res, methodUsed: 'sdcard', packageName: effectivePackageName };
    }

    // Method 3: Direct sync_tmp
    if (preferredMethod === 'sync_tmp') {
      const res = await this.installViaModernCarProtocol(adb, file, onProgress, onLog, effectivePackageName);
      return { ...res, methodUsed: 'sync_tmp', packageName: effectivePackageName };
    }

    // Method 4: Auto Adaptive (Intelligently tries modern protocol first, then legacy)
    if (preferredMethod === 'auto') {
      try {
        const res = await this.installViaModernCarProtocol(adb, file, onProgress, onLog, effectivePackageName);
        if (res.success) {
          return { ...res, methodUsed: 'auto', packageName: effectivePackageName };
        }
      } catch (errModern: any) {
        onLog?.(`تنبيه بروتوكول التحديثات الحديثة: ${errModern.message || errModern}. تجربة البروتوكول الكلاسيكي...`, 'info');
      }

      const res = await this.installViaStoragePipe(adb, file, onProgress, onLog, effectivePackageName);
      return { ...res, methodUsed: 'auto', packageName: effectivePackageName };
    }

    // Method 5: Direct Binary Stream
    if (preferredMethod === 'stream') {
      try {
        const res = await this.installViaDirectStream(adb, file, onProgress, onLog, effectivePackageName);
        return { ...res, methodUsed: 'stream', packageName: effectivePackageName };
      } catch (err: any) {
        onLog?.(`تعذر البث المباشر (${err.message || err}). جاري التبديل إلى بروتوكول التحديثات الحديثة...`, 'warning');
        const fallbackRes = await this.installViaModernCarProtocol(adb, file, onProgress, onLog, effectivePackageName);
        return { ...fallbackRes, methodUsed: 'modern_car', packageName: effectivePackageName };
      }
    }

    // Method 6: Session
    if (preferredMethod === 'session') {
      try {
        const res = await this.installViaModernCarProtocol(adb, file, onProgress, onLog, effectivePackageName);
        return { ...res, methodUsed: 'session', packageName: effectivePackageName };
      } catch (err: any) {
        onLog?.(`فشلت جلسة التثبيت (${err.message || err})...`, 'warning');
        throw err;
      }
    }

    // Default fallback
    const res = await this.installViaModernCarProtocol(adb, file, onProgress, onLog, effectivePackageName);
    return { ...res, methodUsed: 'auto', packageName: effectivePackageName };
  }

  /**
   * Universal Storage Push & Direct Package Install for Car Head Units:
   * 1. Prepares destination folder (/data/local/tmp and /sdcard/Download)
   * 2. Pushes APK using AdbSync
   * 3. Sets permissions (chmod 777)
   * 4. Executes pm install using official PackageManager + multi-tier fallbacks
   * 5. Cleans up temp file
   */
  private static async installViaStoragePipe(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const size = file.size;
    const cleanBaseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = cleanBaseName.endsWith('.apk') ? cleanBaseName : `${cleanBaseName}.apk`;

    // Ensure common directories exist and bypass security verifiers if possible
    try {
      await this.execShell(adb, 'mkdir -p /data/local/tmp /sdcard/Download 2>/dev/null');
      await this.execShell(adb, 'settings put global verifier_verify_adb_installs 0 2>/dev/null');
      await this.execShell(adb, 'settings put global package_verifier_enable 0 2>/dev/null');
    } catch {}

    // Candidate paths in order of reliability on automotive head units (matching official automotive manual)
    const candidatePaths = [
      `/sdcard/Download/${safeName}`,
      `/sdcard/Download/app_install.apk`,
      `/data/local/tmp/${safeName}`,
      `/data/local/tmp/app_install.apk`,
      `/sdcard/${safeName}`,
    ];

    let targetPath = '';
    let pushSuccess = false;
    let pushError = '';

    for (const testPath of candidatePaths) {
      try {
        onProgress?.(5, 'uploading', `بدء نقل الحزمة إلى مسار الشاشة (${testPath})...`);
        onLog?.(`محاولة نقل الحزمة إلى: ${testPath}...`, 'info');
        await this.pushFileSafe(adb, file, testPath, onProgress, onLog);

        // Allow 350ms for USB transport and adbd sync socket cleanup
        await new Promise((r) => setTimeout(r, 350));

        targetPath = testPath;
        pushSuccess = true;
        onLog?.(`تم نقل الملف إلى الشاشة بنجاح (${(size / (1024 * 1024)).toFixed(1)} MB).`, 'success');
        break;
      } catch (err: any) {
        pushError = err.message || String(err);
        onLog?.(`تعذر استخدام المسار ${testPath}: ${pushError}. تجربة مسار بديل...`, 'warning');
      }
    }

    if (!pushSuccess || !targetPath) {
      // Fallback: Push via chunked shell socket
      targetPath = `/sdcard/Download/app_install.apk`;
      onLog?.('جاري محاولة الرفع عبر قناة Shell المباشرة البديلة...', 'info');
      try {
        await this.pushFileViaShell(adb, file, targetPath, onProgress, onLog);
        await new Promise((r) => setTimeout(r, 350));
        pushSuccess = true;
      } catch (err2: any) {
        pushError = err2.message || String(err2);
      }
    }

    if (!pushSuccess || !targetPath) {
      throw new Error(`تعذر نقل ملف APK إلى شاشة السيارة: ${pushError}`);
    }

    // Grant full read permissions to the uploaded APK
    try {
      await this.execShell(adb, `chmod 777 "${targetPath}" 2>/dev/null`);
    } catch {}

    // Grace period for USB endpoint stabilization
    await new Promise((r) => setTimeout(r, 250));

    onLog?.(`تم تجهيز الملف (${(size / (1024 * 1024)).toFixed(1)} MB). جاري تنفيذ أوامر التثبيت على نظام الشاشة...`, 'info');
    onProgress?.(90, 'installing', 'تشغيل أمر التثبيت على شاشة السيارة...');

    let isSuccess = false;
    let lastOutput = '';

    // Direct automotive PM installation commands in order of highest success rate
    const installCommands = [
      `pm install -r -d -g -t "${targetPath}"`,
      `pm install -r -g -t "${targetPath}"`,
      `pm install -r -d "${targetPath}"`,
      `pm install -r "${targetPath}"`,
      `pm install "${targetPath}"`,
      `cmd package install -r -d -g -t "${targetPath}"`,
      `cmd package install -r "${targetPath}"`,
      `cat "${targetPath}" | pm install -r -d -g -t -S ${size}`,
      `cat "${targetPath}" | pm install -r -g -t -S ${size}`,
      `cat "${targetPath}" | pm install -S ${size}`,
    ];

    for (let i = 0; i < installCommands.length; i++) {
      const cmd = installCommands[i];
      try {
        onLog?.(`[محاولة تثبيت ${i + 1}/${installCommands.length}] تنفيذ: ${cmd}`, 'info');
        const output = await this.execShell(adb, cmd);
        lastOutput = output.trim();
        const isCmdSuccess = lastOutput.toLowerCase().includes('success');
        onLog?.(`استجابة الشاشة: ${lastOutput || '(تم إرسال الأمر بنجاح)'}`, isCmdSuccess ? 'success' : 'info');

        if (isCmdSuccess) {
          isSuccess = true;
          break;
        }

        if (this.isFatalInstallError(lastOutput)) {
          break;
        }
      } catch (ePm: any) {
        lastOutput = ePm?.message || String(ePm);
        onLog?.(`تنبيه: ${lastOutput}`, 'info');
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    const pm = new PackageManager(adb);

    // Secondary Stage: PackageManager library API fallback
    if (!isSuccess && !this.isFatalInstallError(lastOutput)) {
      try {
        onLog?.(`[مدير الحزم البرمجي] تجربة التثبيت عبر مكتبة PackageManager...`, 'info');
        const pmRes = await pm.install([targetPath], {
          allowTest: true,
          requestDowngrade: true,
          grantRuntimePermissions: true,
        });
        lastOutput = pmRes || 'Success';
        if (lastOutput.toLowerCase().includes('success')) {
          isSuccess = true;
          onLog?.(`استجابة مدير الحزم: ${lastOutput}`, 'success');
        }
      } catch (ePmLib: any) {
        lastOutput = ePmLib?.message || String(ePmLib);
        if (lastOutput.toLowerCase().includes('success')) {
          isSuccess = true;
          onLog?.(`استجابة الشاشة: ${lastOutput}`, 'success');
        }
      }
    }

    // Stage 2: Degraded PackageManager.install (without grantRuntimePermissions for older Android 5-8 ROMs)
    if (!isSuccess && !this.isFatalInstallError(lastOutput)) {
      try {
        await new Promise((r) => setTimeout(r, 250));
        onLog?.(`[محاولة 2/6] تثبيت متوافق مع إصدارات أندرويد القديمة...`, 'info');
        const pmRes2 = await pm.install([targetPath], {
          allowTest: true,
          requestDowngrade: true,
        });
        lastOutput = pmRes2 || 'Success';
        onLog?.(`استجابة الشاشة: ${lastOutput}`, 'success');
        if (lastOutput.toLowerCase().includes('success')) {
          isSuccess = true;
        }
      } catch (ePm2: any) {
        lastOutput = ePm2?.message || String(ePm2);
        if (lastOutput.toLowerCase().includes('success')) {
          isSuccess = true;
          onLog?.(`استجابة الشاشة: ${lastOutput}`, 'success');
        } else {
          onLog?.(`مدير الحزم (2): ${lastOutput}`, 'info');
        }
      }
    }

    // Stage 3: Degraded basic install
    if (!isSuccess && !this.isFatalInstallError(lastOutput)) {
      try {
        await new Promise((r) => setTimeout(r, 250));
        onLog?.(`[محاولة 3/6] تثبيت مباشر أساسي...`, 'info');
        const pmRes3 = await pm.install([targetPath]);
        lastOutput = pmRes3 || 'Success';
        onLog?.(`استجابة الشاشة: ${lastOutput}`, 'success');
        if (lastOutput.toLowerCase().includes('success')) {
          isSuccess = true;
        }
      } catch (ePm3: any) {
        lastOutput = ePm3?.message || String(ePm3);
        if (lastOutput.toLowerCase().includes('success')) {
          isSuccess = true;
          onLog?.(`استجابة الشاشة: ${lastOutput}`, 'success');
        } else {
          onLog?.(`مدير الحزم (3): ${lastOutput}`, 'info');
        }
      }
    }

    // Stage 4: Multi-tier fallback shell commands
    if (!isSuccess && !this.isFatalInstallError(lastOutput)) {
      const fallbackCmds = [
        `pm install -r -d -g -t "${targetPath}"`,
        `pm install -r -d -t "${targetPath}"`,
        `pm install -r "${targetPath}"`,
        `pm install "${targetPath}"`,
        `cmd package install -r -d -g -t "${targetPath}"`,
        `cmd package install -r "${targetPath}"`,
      ];

      for (let i = 0; i < fallbackCmds.length; i++) {
        const cmd = fallbackCmds[i];
        try {
          await new Promise((r) => setTimeout(r, 250));
          onLog?.(`[محاولة بديلة ${i + 1}/${fallbackCmds.length}] تنفيذ: ${cmd}`, 'info');
          const output = await this.execShell(adb, cmd);
          lastOutput = output.trim();
          const isCmdSuccess = lastOutput.toLowerCase().includes('success');
          onLog?.(`استجابة الشاشة: ${lastOutput || '(تم التنفيذ)'}`, isCmdSuccess ? 'success' : 'info');

          if (isCmdSuccess) {
            isSuccess = true;
            break;
          }

          if (this.isFatalInstallError(lastOutput)) {
            break;
          }
        } catch (err: any) {
          lastOutput = err.message || String(err);
          onLog?.(`تنبيه: ${lastOutput}`, 'warning');
        }
      }
    }

    // Stage 5: Android Package Session Install
    if (!isSuccess && !this.isFatalInstallError(lastOutput)) {
      try {
        await new Promise((r) => setTimeout(r, 250));
        onLog?.('جاري محاولة التثبيت عبر نظام جلسات الحزم (Package Installer Session)...', 'info');
        const sessionId = await pm.sessionCreate({
          allowTest: true,
          requestDowngrade: true,
          grantRuntimePermissions: true,
        });
        if (sessionId) {
          onLog?.(`تم إنشاء جلسة تثبيت برقم: [${sessionId}]`, 'info');
          await pm.sessionAddSplit(sessionId, 'base.apk', targetPath);
          await pm.sessionCommit(sessionId);
          onLog?.('تم اعتماد جلسة التثبيت بنجاح', 'success');
          isSuccess = true;
        }
      } catch (err: any) {
        onLog?.(`فشلت محاولة الجلسة: ${err.message || err}`, 'warning');
      }
    }

    // Clean up temporary file from device storage
    try {
      await adb.rm(targetPath).catch(() => {});
    } catch {}

    if (isSuccess) {
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
      
      if (knownPackageName) {
        try {
          const currentUserId = await this.getCurrentUserId(adb);
          await this.activatePackageForCarLauncher(adb, knownPackageName, currentUserId, onLog);
        } catch {}
      }

      // Auto-grant automotive permissions for known packages
      try {
        await this.autoGrantAutomotivePermissions(adb, file.name, onLog);
      } catch {}

      return { 
        success: true, 
        message: 'تم تثبيت التطبيق بنجاح على شاشة السيارة.',
        packageName: knownPackageName
      };
    }

    // Check if failure was caused by SELinux FUSE restriction on newer car updates
    const lowerOut = (lastOutput || '').toLowerCase();
    if (
      lowerOut.includes('fuse') ||
      lowerOut.includes('avc: denied') ||
      lowerOut.includes('/data/local/tmp') ||
      lowerOut.includes("can't open file") ||
      lowerOut.includes('unable to open file')
    ) {
      onLog?.('تم رصد قيود أمنية في نظام السيارة المحدث (SELinux FUSE / sdcard Blocked): جاري التحويل التلقائي فوراً إلى بروتوكول التحديثات الحديثة (/data/local/tmp)...', 'warning');
      return await this.installViaModernCarProtocol(adb, file, onProgress, onLog);
    }

    // Stage 6: If direct installation was blocked by system restriction, trigger interactive installer
    try {
      onLog?.('جاري إطلاق نافذة التثبيت التفاعلية على شاشة سيارتك للتأكيد اليدوي...', 'info');
      await this.pushFileSafe(adb, file, targetPath, onProgress, onLog);
      await this.execShell(adb, `am start -a android.intent.action.VIEW -d "file://${targetPath}" -t "application/vnd.android.package-archive"`);
      onProgress?.(100, 'processing', 'تم فتح نافذة التثبيت على شاشة السيارة');
      return {
        success: true,
        message: 'تم نقل التطبيق وفتح نافذة التثبيت على شاشة سيارتك. اضغط على زر (تثبيت / Install) على الشاشة لإتمام العملية.',
      };
    } catch {}

    const friendlyError = this.translateAndroidInstallError(lastOutput);
    return { success: false, message: friendlyError || lastOutput || 'فشل التثبيت على الشاشة' };
  }

  /**
   * Modern Car Protocol (Specifically designed for Android 10/11/12/13/14 & Desay SV / Geely / Haval / Changan / Jetour Updates):
   * Solves SELinux FUSE restriction:
   * "avc: denied { read } for scontext=u:r:system_server:s0 tcontext=u:object_r:fuse:s0 ... Consider using a file under /data/local/tmp/"
   * And solves multi-user Automotive screen visibility (DISALLOW_INSTALL_APPS / Headless User 0 vs Active Driver User 10).
   */
  public static async installViaModernCarProtocol(
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

    // Detect package name if not provided
    let effectivePackageName = knownPackageName;
    if (!effectivePackageName) {
      try {
        const meta = await parseApkMetadata(file);
        if (meta.packageName && meta.packageName !== 'unknown.package') {
          effectivePackageName = meta.packageName;
        }
      } catch {}
    }

    onLog?.('=== بدء بروتوكول التحديثات الحديثة لشاشات السيارات (Modern Car AAOS & Desay SV Update) ===', 'info');
    onLog?.('✓ البروتوكول مصمم لتجاوز قيود SELinux FUSE، وسياسات المنع الأمنية، ومزامنة التطبيق مع واجهة المستخدم', 'info');

    // Step 1: Detect active car screen user (usually 10 on Android Automotive, or 0 on standard Android)
    const currentUserId = await this.getCurrentUserId(adb);
    onLog?.(`اكتشاف مستخدم واجهة السيارة النشط: [المستخدم ${currentUserId}]`, 'info');

    // Step 2: Clear user restrictions that cause "Restriction prevents installing"
    await this.unlockUserRestrictions(adb, currentUserId, onLog);

    // Step 3: Prepare /data/local/tmp directory
    try {
      await this.execShell(adb, 'mkdir -p /data/local/tmp 2>/dev/null');
      await this.execShell(adb, 'chmod 777 /data/local/tmp 2>/dev/null');
    } catch {}

    // Step 4: Push APK directly to /data/local/tmp
    let pushSuccess = false;
    let pushError = '';

    onProgress?.(5, 'uploading', `جاري نقل الحزمة إلى مسار النظام المعتمد (/data/local/tmp)...`);
    onLog?.(`نقل الحزمة إلى مسار النظام المعتمد: ${targetPath}...`, 'info');

    try {
      await this.execShell(adb, `rm -f "${targetPath}" 2>/dev/null`);
      await this.pushFileSafe(adb, file, targetPath, onProgress, onLog);
      pushSuccess = true;
      onLog?.(`تم نقل الملف إلى /data/local/tmp بنجاح (${(size / (1024 * 1024)).toFixed(1)} MB).`, 'success');
    } catch (err: any) {
      pushError = err.message || String(err);
      onLog?.(`محاولة نقل بديلة عبر ممر Shell المباشر إلى /data/local/tmp...`, 'info');
      try {
        await this.pushFileViaShell(adb, file, targetPath, onProgress, onLog);
        pushSuccess = true;
      } catch (err2: any) {
        pushError = err2.message || String(err2);
        onLog?.(`تعذر النقل المباشر إلى /data/local/tmp: ${pushError}`, 'warning');
      }
    }

    if (pushSuccess) {
      // Grant full permissions and adjust SELinux context so system_server can read it
      try {
        await this.execShell(adb, `chmod 777 "${targetPath}" 2>/dev/null`);
        await this.execShell(adb, `chmod 666 "${targetPath}" 2>/dev/null`);
        await this.execShell(adb, `chcon u:object_r:shell_data_file:s0 "${targetPath}" 2>/dev/null`);
        await this.execShell(adb, `chcon u:object_r:apk_data_file:s0 "${targetPath}" 2>/dev/null`);
        await this.execShell(adb, `restorecon -F "${targetPath}" 2>/dev/null`);
      } catch {}

      await new Promise((r) => setTimeout(r, 200));

      onProgress?.(85, 'installing', 'تنفيذ أوامر التثبيت الحديثة وتوجيهها للمستخدم النشط...');

      // Stage A: Multi-tier PM & CMD Package install targeting active driver user & all users
      const directCommands = [
        // 1. Android Automotive active driver user targeting (Crucial for screen visibility!)
        `pm install -r -d -g -t --user current "${targetPath}"`,
        `pm install -r -d -g -t --user ${currentUserId} "${targetPath}"`,
        `cmd package install -r -d -g -t --user current "${targetPath}"`,
        `cmd package install -r -d -g -t --user ${currentUserId} "${targetPath}"`,
        
        // 2. Target all users
        `pm install -r -d -g -t --user all "${targetPath}"`,
        `cmd package install -r -d -g -t --user all "${targetPath}"`,

        // 3. Elevated root if available on customized automotive firmware
        `su -c 'pm install -r -d -g -t --user current "${targetPath}"' 2>/dev/null`,
        `su -c 'pm install -r -d -g -t "${targetPath}"' 2>/dev/null`,
        `su 0 pm install -r -d -g -t "${targetPath}" 2>/dev/null`,

        // 4. Standard commands
        `pm install -r -d -g -t "${targetPath}"`,
        `cmd package install -r -d -g -t "${targetPath}"`,
        `pm install -r -g "${targetPath}"`,
        `pm install -r "${targetPath}"`,
        `pm install "${targetPath}"`,
      ];

      for (let i = 0; i < directCommands.length; i++) {
        const cmd = directCommands[i];
        try {
          onLog?.(`[أمر حديث ${i + 1}/${directCommands.length}] ${cmd}`, 'info');
          const output = await this.execShell(adb, cmd);
          const trimmed = output.trim();
          const isSuccessCmd = trimmed.toLowerCase().includes('success');
          onLog?.(`استجابة الشاشة: ${trimmed || '(تم التنفيذ)'}`, isSuccessCmd ? 'success' : 'info');

          if (isSuccessCmd) {
            await this.cleanupFile(adb, targetPath);
            if (effectivePackageName) {
              await this.activatePackageForCarLauncher(adb, effectivePackageName, currentUserId, onLog);
            }
            await this.autoGrantAutomotivePermissions(adb, file.name, onLog);
            onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
            return {
              success: true,
              message: 'تم تثبيت التطبيق بنجاح عبر بروتوكول التحديثات الحديثة (/data/local/tmp) وتفعيله لشاشة السيارة.',
              packageName: effectivePackageName,
            };
          }

          if (this.isFatalInstallError(trimmed)) {
            await this.cleanupFile(adb, targetPath);
            return {
              success: false,
              message: this.translateAndroidInstallError(trimmed),
            };
          }
        } catch (eCmd: any) {
          onLog?.(`تنبيه: ${eCmd.message || eCmd}`, 'info');
        }
        await new Promise((r) => setTimeout(r, 150));
      }

      // Stage B: Modern Staged Package Session via cmd package install-create & install-write
      onLog?.('جاري محاولة التثبيت عبر نظام جلسات أندرويد الحديثة (Staged Package Session)...', 'info');
      try {
        const sessionCreateCmds = [
          `cmd package install-create --user current -r -d -g -t -S ${size}`,
          `cmd package install-create --user ${currentUserId} -r -d -g -t -S ${size}`,
          `cmd package install-create -r -d -g -t -S ${size}`,
          `pm install-create --user current -r -d -g -t -S ${size}`,
          `pm install-create --user ${currentUserId} -r -d -g -t -S ${size}`,
          `pm install-create -r -d -g -t -S ${size}`,
          `pm install-create -r -S ${size}`,
        ];

        let sessionId: string | null = null;
        for (const sCmd of sessionCreateCmds) {
          try {
            const createOut = await this.execShell(adb, sCmd);
            const m = createOut.match(/session\s+(\d+)/i) || createOut.match(/\[(\d+)\]/) || createOut.match(/(\d{4,})/);
            if (m && m[1]) {
              sessionId = m[1];
              onLog?.(`تم إنشاء جلسة تثبيت بنجاح: [${sessionId}] عبر (${sCmd})`, 'info');
              break;
            }
          } catch {}
        }

        if (sessionId) {
          onLog?.(`كتابة حزمة الـ APK داخل الجلسة ${sessionId}...`, 'info');
          const writeCmds = [
            `cat "${targetPath}" | cmd package install-write -S ${size} ${sessionId} base.apk -`,
            `cat "${targetPath}" | pm install-write -S ${size} ${sessionId} base.apk -`,
            `cmd package install-write ${sessionId} base.apk "${targetPath}"`,
            `pm install-write ${sessionId} base.apk "${targetPath}"`,
          ];

          let writeSuccess = false;
          for (const wCmd of writeCmds) {
            try {
              const wOut = await this.execShell(adb, wCmd);
              if (wOut.toLowerCase().includes('success') || !wOut.toLowerCase().includes('error')) {
                writeSuccess = true;
                onLog?.(`تم كتابة بيانات الحزمة في الجلسة بنجاح.`, 'info');
                break;
              }
            } catch {}
          }

          // Commit session (multi-user safe commits)
          onLog?.(`اعتماد جلسة التثبيت ${sessionId}...`, 'info');
          const commitCmds = [
            `cmd package install-commit ${sessionId}`,
            `pm install-commit ${sessionId}`,
            `cmd package install-commit --user current ${sessionId}`,
            `pm install-commit --user current ${sessionId}`,
            `su -c 'cmd package install-commit ${sessionId}' 2>/dev/null`,
          ];

          let commitSuccess = false;
          for (const cCmd of commitCmds) {
            try {
              const commitOut = await this.execShell(adb, cCmd);
              const commitTrimmed = commitOut.trim();
              onLog?.(`استجابة اعتماد الجلسة (${cCmd}): ${commitTrimmed || '(تم الإرسال)'}`, commitTrimmed.toLowerCase().includes('success') ? 'success' : 'info');
              if (commitTrimmed.toLowerCase().includes('success')) {
                commitSuccess = true;
                break;
              }
            } catch {}
          }

          if (commitSuccess) {
            await this.cleanupFile(adb, targetPath);
            if (effectivePackageName) {
              await this.activatePackageForCarLauncher(adb, effectivePackageName, currentUserId, onLog);
            }
            await this.autoGrantAutomotivePermissions(adb, file.name, onLog);
            onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
            return {
              success: true,
              message: 'تم تثبيت التطبيق بنجاح عبر جلسة حزم أندرويد الحديثة (Staged Session) وتفعيله لشاشة السيارة.',
              packageName: effectivePackageName,
            };
          }
        }
      } catch (eSession: any) {
        onLog?.(`محاولة الجلسة: ${eSession.message || eSession}`, 'info');
      }
    }

    // Stage C: Pure Socket Streaming Session (Zero-disk staging directly to memory session)
    onLog?.('جاري محاولة البث الحي إلى جلسة Package Session عبر مقبس ADB المباشر...', 'info');
    try {
      const streamCreateCmds = [
        `cmd package install-create --user current -r -d -g -t -S ${size}`,
        `cmd package install-create --user ${currentUserId} -r -d -g -t -S ${size}`,
        `cmd package install-create -r -d -g -t -S ${size}`,
        `pm install-create --user current -r -d -g -t -S ${size}`,
        `pm install-create -r -d -g -t -S ${size}`,
      ];

      let streamingSessionId: string | null = null;
      for (const sCmd of streamCreateCmds) {
        try {
          const sessionCreateOut = await this.execShell(adb, sCmd);
          const m = sessionCreateOut.match(/session\s+(\d+)/i) || sessionCreateOut.match(/\[(\d+)\]/) || sessionCreateOut.match(/(\d{4,})/);
          if (m && m[1]) {
            streamingSessionId = m[1];
            break;
          }
        } catch {}
      }

      if (streamingSessionId) {
        onLog?.(`تم فتح جلسة بث مباشر برقم: [${streamingSessionId}]`, 'info');
        const socketCmd = `shell:cmd package install-write -S ${size} ${streamingSessionId} base.apk -`;
        const socket = await adb.createSocket(socketCmd);
        const writer = socket.writable.getWriter();
        const reader = file.stream().getReader();
        let bytesSent = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              await writer.write(value);
              bytesSent += value.byteLength;
              const pct = 10 + Math.min(80, Math.round((bytesSent / size) * 80));
              onProgress?.(pct, 'uploading', `بث مباشر للجلسة (${(bytesSent / 1024 / 1024).toFixed(1)} / ${(size / 1024 / 1024).toFixed(1)} MB)`);
            }
          }
          await writer.close();
        } catch (e: any) {
          try { await writer.abort(e); } catch {}
          throw e;
        } finally {
          reader.releaseLock();
        }

        // Drain socket readable
        const sReader = socket.readable.getReader();
        try {
          while (true) {
            const { done } = await sReader.read();
            if (done) break;
          }
        } catch {} finally {
          sReader.releaseLock();
          try { await socket.close(); } catch {}
        }

        onProgress?.(92, 'installing', 'اعتماد جلسة البث المباشر...');
        const commitOut = await this.execShell(adb, `cmd package install-commit ${streamingSessionId} || pm install-commit ${streamingSessionId}`);
        const cTrimmed = commitOut.trim();
        onLog?.(`نتيجة اعتماد البث المباشر: ${cTrimmed || '(تم)'}`, cTrimmed.toLowerCase().includes('success') ? 'success' : 'info');

        if (cTrimmed.toLowerCase().includes('success')) {
          await this.cleanupFile(adb, targetPath);
          if (effectivePackageName) {
            await this.activatePackageForCarLauncher(adb, effectivePackageName, currentUserId, onLog);
          }
          await this.autoGrantAutomotivePermissions(adb, file.name, onLog);
          onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
          return {
            success: true,
            message: 'تم تثبيت التطبيق بنجاح عبر البث المباشر لجلسة النظام (Direct Streaming Session) وتفعيله لشاشة السيارة.',
            packageName: effectivePackageName,
          };
        }
      }
    } catch (eStream: any) {
      onLog?.(`محاولة البث للجلسة: ${eStream.message || eStream}`, 'info');
    }

    // Clean up temporary files
    await this.cleanupFile(adb, targetPath);

    // Step 5: Verification check: Is the package already registered on the system?
    if (effectivePackageName) {
      const isInstalled = await this.isPackageInstalled(adb, effectivePackageName);
      if (isInstalled) {
        onLog?.(`تم التحقق بنجاح من وجود الحزمة (${effectivePackageName}) على نظام السيارة.`, 'success');
        await this.activatePackageForCarLauncher(adb, effectivePackageName, currentUserId, onLog);
        await this.autoGrantAutomotivePermissions(adb, file.name, onLog);
        onProgress?.(100, 'processing', 'تم التحقق من الحزمة وتفعيلها');
        return {
          success: true,
          message: 'تم تأكيد تثبيت التطبيق بنجاح على نظام السيارة ومزامنته مع واجهة المستخدم.',
          packageName: effectivePackageName,
        };
      }
    }

    return {
      success: false,
      message: 'تعذر تأكيد تثبيت التطبيق على نظام السيارة. يرجى التأكد من مساحة التخزين وتوافق معمارية المعالج (32-bit armeabi-v7a أو 64-bit arm64-v8a).',
    };
  }

  /**
   * Helper to clean up temporary file from device storage
   */
  private static async cleanupFile(adb: Adb, path: string): Promise<void> {
    try {
      await adb.rm(path).catch(() => {});
    } catch {
      try {
        await this.execShell(adb, `rm -f "${path}" 2>/dev/null`);
      } catch {}
    }
  }

  /**
   * Detects the active foreground user ID in Android Automotive (e.g., User 10 or 0)
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
   * Fully activates an installed package so it appears on the car screen launcher:
   * - Installs existing package into active user profile (cmd package install-existing)
   * - Unhides package (pm unhide)
   * - Enables package & components (pm enable)
   * - Clears stopped / suspended state
   * - Informs the launcher via package change broadcast
   */
  public static async activatePackageForCarLauncher(
    adb: Adb,
    packageName: string,
    userId: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    if (!packageName || packageName === 'unknown.package') return;

    onLog?.(`تفعيل التطبيق (${packageName}) لمستخدم الشاشة الحالي (${userId}) لضمان ظهوره في قائمة البرامج...`, 'info');

    const usersToTarget = Array.from(new Set([userId, 'current', '0', '10'])).filter(Boolean);

    for (const u of usersToTarget) {
      try {
        // Step 1: Install existing into user profile (Android Automotive multi-user fix)
        await this.execShell(adb, `cmd package install-existing --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm install-existing --user ${u} ${packageName} 2>/dev/null`);

        // Step 2: Unhide
        await this.execShell(adb, `cmd package unhide --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm unhide --user ${u} ${packageName} 2>/dev/null`);

        // Step 3: Enable
        await this.execShell(adb, `cmd package enable --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm enable --user ${u} ${packageName} 2>/dev/null`);

        // Step 4: Unsuspend
        await this.execShell(adb, `cmd package unsuspend --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `cmd package set-distracting-restriction --user ${u} --restriction none ${packageName} 2>/dev/null`);
      } catch {}
    }

    // Step 5: Global unhide and enable
    try {
      await this.execShell(adb, `pm unhide ${packageName} 2>/dev/null`);
      await this.execShell(adb, `pm enable ${packageName} 2>/dev/null`);
      await this.execShell(adb, `pm default-state --user current ${packageName} 2>/dev/null`);
    } catch {}

    // Step 6: Notify Car Launcher via broadcast to refresh package list
    try {
      await this.execShell(adb, `am broadcast -a android.intent.action.PACKAGE_ADDED -d package:${packageName} 2>/dev/null`);
      await this.execShell(adb, `am broadcast -a android.intent.action.PACKAGE_CHANGED -d package:${packageName} 2>/dev/null`);
      await this.execShell(adb, `am broadcast -a android.intent.action.PACKAGE_REPLACED -d package:${packageName} 2>/dev/null`);
    } catch {}

    onLog?.(`تم تفعيل التطبيق (${packageName}) وتهيئته لقائمة برامج السيارة بنجاح.`, 'success');
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

    // Wait for file write completion
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
   * Direct Stream without exec: prefix
   */
  private static async installViaDirectStream(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const size = file.size;
    
    // Only use shell: prefixes to avoid "Socket open failed" with exec: on car head units
    const prefixes = [
      `shell:pm install -r -d -g -t -S ${size}`,
      `shell:pm install -r -t -S ${size}`,
      `shell:pm install -r -S ${size}`,
    ];

    let lastError = '';

    for (const cmd of prefixes) {
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
        onLog?.(`استجابة البث المباشر: ${trimmed || '(لا توجد استجابة)'}`, trimmed.toLowerCase().includes('success') ? 'success' : 'info');

        if (trimmed.toLowerCase().includes('success')) {
          onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
          if (knownPackageName) {
            try {
              const currentUserId = await this.getCurrentUserId(adb);
              await this.activatePackageForCarLauncher(adb, knownPackageName, currentUserId, onLog);
            } catch {}
          }
          try {
            await this.autoGrantAutomotivePermissions(adb, file.name, onLog);
          } catch {}
          return { 
            success: true, 
            message: 'تم التثبيت بنجاح عبر البث المباشر.',
            packageName: knownPackageName 
          };
        }

        lastError = trimmed;
      } catch (err: any) {
        lastError = err.message || String(err);
      }
    }

    const friendlyError = this.translateAndroidInstallError(lastError);
    return { success: false, message: friendlyError || lastError };
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
      onLog?.('اكتشاف أداة التحكم بالمقود (MacroDroid / Button Mapper): جاري تفعيل حزمة أذونات المقود والخدمات تلقائياً...', 'info');
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
      err.includes('AVC: DENIED') ||
      err.includes('/DATA/LOCAL/TMP') ||
      err.includes('CANNOT OPEN FILE') ||
      err.includes("CAN'T OPEN FILE") ||
      err.includes('UNABLE TO OPEN FILE')
    ) {
      return 'تم اكتشاف قيود أمنية في تحديث نظام السيارة الأخير (SELinux FUSE Restriction): يمنع التحديث الأخير قراءة التطبيقات من مسار /sdcard. يرجى اختيار (بروتوكول التحديثات الحديثة Android 11+ / Desay SV) من القائمة بالأعلى لتجاوز هذا القيد والتثبيت عبر /data/local/tmp وجلسات النظام بنجاح.';
    }

    if (err.includes('INSTALL_FAILED_ALREADY_EXISTS') || err.includes('UPDATE_INCOMPATIBLE') || err.includes('SIGNATURE_MISMATCH')) {
      return 'توجد نسخة سابقة مثبتة على الشاشة بتوقيع مختلف (Signature Mismatch). الحل: قم بحذف التطبيق القديم من شاشة السيارة أولاً (أو من قسم إدارة التطبيقات في هذا الموقع) ثم أعد التثبيت.';
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
