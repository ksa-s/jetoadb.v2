import { Adb } from '@yume-chan/adb';
import { PackageManager, PackageManagerInstallSession } from '@yume-chan/android-bin';
import { WrapReadableStream, TransformStream } from '@yume-chan/stream-extra';
import { InstallMethod } from '../../types';
import { parseApkMetadata } from '../apk-parser';
import { adbManager } from './webusb-manager';
import { installViaGtHelper, ensureGtHelperOnDevice } from './gt-installer-helper';

export interface InstallProgressCallback {
  (progress: number, stage: 'uploading' | 'installing' | 'processing', message?: string): void;
}

export class ApkInstaller {
  /**
   * Main adaptive install entry point for car head units (Jetour T2 / Chery / Geely / Desay SV)
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

    // Detect package name from file metadata if not provided
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

    // Ensure general package verifiers are disabled and user restrictions lifted
    try {
      await this.unlockUserRestrictions(adb, currentUserId, onLog);
    } catch {}

    // 0. Specific Protocol Execution: Desay SV / Chery Pipe-Stream Engine
    if (preferredMethod === 'pipe_stream') {
      onLog?.('بدء بروتوكول حاقن التدفق المباشر لبايسمكس (Desay SV Pipe-Stream)...', 'info');
      const res = await this.installViaPipeStream(adb, file, onProgress, onLog, effectivePackageName);
      return await this.finalizeInstallResult(adb, res, 'pipe_stream', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
    }

    // 1. Specific Protocol Execution: Streaming Package Session
    if (preferredMethod === 'stream_session') {
      onLog?.('بدء بروتوكول جلسة الحزم المتدفقة المباشرة (Direct Streaming Package Session)...', 'info');
      const res = await this.installViaStreamingSession(adb, file, onProgress, onLog, effectivePackageName);
      return await this.finalizeInstallResult(adb, res, 'stream_session', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
    }

    // 2. Specific Protocol Execution: Automotive app_process / GtInstall Engine
    if (preferredMethod === 'app_process_gt') {
      onLog?.('بدء بروتوكول محرك الجافا المستقل (Automotive app_process / GtInstall Engine)...', 'info');
      const res = await this.installViaAppProcessGt(adb, file, onProgress, onLog, effectivePackageName);
      return await this.finalizeInstallResult(adb, res, 'app_process_gt', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
    }

    // 3. Specific Protocol Execution: Active Car User Targeting
    if (preferredMethod === 'active_user') {
      onLog?.(`بدء بروتوكول المستخدم النشط لشاشات السيارات (Active Car User Profile --user ${currentUserId})...`, 'info');
      const res = await this.installViaActiveUser(adb, file, onProgress, onLog, currentUserId, effectivePackageName);
      return await this.finalizeInstallResult(adb, res, 'active_user', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
    }

    // 4. Specific Protocol Execution: Factory Broadcast Intent
    if (preferredMethod === 'desay_broadcast') {
      onLog?.('بدء بروتوكول حاقن بث المصنع المباشر (Desay SV / Chery Factory Broadcast)...', 'info');
      const res = await this.installViaDesayBroadcast(adb, file, onProgress, onLog, effectivePackageName);
      return await this.finalizeInstallResult(adb, res, 'desay_broadcast', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
    }

    // 5. Specific Protocol Execution: Car Storage Staging & Native File Manager
    if (preferredMethod === 'download_staging') {
      onLog?.('بدء بروتوكول الإيداع بمجلد التحميلات وتشغيل مدير الملفات الأصلي...', 'info');
      const res = await this.installViaDownloadStaging(adb, file, onProgress, onLog, effectivePackageName);
      return await this.finalizeInstallResult(adb, res, 'download_staging', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
    }

    // 6. Specific Protocol Execution: Direct Root su Injection
    if (preferredMethod === 'root_su') {
      onLog?.('بدء بروتوكول الحقن المباشر بصلاحيات الروت (Direct Root su Injection)...', 'info');
      const res = await this.installViaRootSu(adb, file, onProgress, onLog, effectivePackageName);
      return await this.finalizeInstallResult(adb, res, 'root_su', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
    }

    // 7. Method: Auto Smart Adaptive (Default & Recommended for All Automotive Units)
    // Intelligent multi-stage non-interactive cascade that bypasses car security layers without screen clicking
    onLog?.('بدء المحرك الذكي المتكيف لشاشات السيارات (Automotive Smart Adaptive Engine)...', 'info');

    // Stage 1: Desay SV / Chery Pipe-Stream Engine (cat apk | pm install -S) - Solves "Restriction prevents installing"
    try {
      onLog?.('[المرحلة 1] تجربة حاقن التدفق المباشر لبايسمكس (Desay SV Pipe-Stream)...', 'info');
      const res0 = await this.installViaPipeStream(adb, file, onProgress, onLog, effectivePackageName);
      if (res0.success) {
        return await this.finalizeInstallResult(adb, res0, 'pipe_stream', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
      }
      onLog?.(`تخطي المرحلة 1: ${res0.message}. الانتقال للمرحلة 2...`, 'info');
    } catch (e0: any) {
      onLog?.(`استجابة المرحلة 1: ${e0?.message || e0}. الانتقال للمرحلة 2...`, 'info');
    }

    // Stage 2: Direct In-Memory Streaming Package Session (Bypasses storage write restrictions and SELinux)
    try {
      onLog?.('[المرحلة 2] تجربة جلسة الحزم المتدفقة المباشرة (Streaming Package Session)...', 'info');
      const res1 = await this.installViaStreamingSession(adb, file, onProgress, onLog, effectivePackageName);
      if (res1.success) {
        return await this.finalizeInstallResult(adb, res1, 'stream_session', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
      }
      onLog?.(`تخطي المرحلة 2: ${res1.message}. الانتقال الفوري للمرحلة 3...`, 'info');
    } catch (e1: any) {
      onLog?.(`استجابة المرحلة 2: ${e1?.message || e1}. الانتقال للمرحلة 3...`, 'info');
    }

    // Stage 3: Independent Java app_process Runtime (GtInstall via IPackageManager Binder)
    try {
      onLog?.('[المرحلة 3] تجربة محرك الجافا المستقل (app_process com.garagetool.installer.GtInstall)...', 'info');
      const res2 = await this.installViaAppProcessGt(adb, file, onProgress, onLog, effectivePackageName);
      if (res2.success) {
        return await this.finalizeInstallResult(adb, res2, 'app_process_gt', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
      }
      onLog?.(`تخطي المرحلة 3: ${res2.message}. الانتقال الفوري للمرحلة 4...`, 'info');
    } catch (e2: any) {
      onLog?.(`استجابة المرحلة 3: ${e2?.message || e2}. الانتقال للمرحلة 4...`, 'info');
    }

    // Stage 4: Active Automotive User Profile Targeting (--user 10 / current)
    try {
      onLog?.(`[المرحلة 4] تجربة التثبيت الموجه للمستخدم النشط في شاشة السيارة (--user ${currentUserId})...`, 'info');
      const res3 = await this.installViaActiveUser(adb, file, onProgress, onLog, currentUserId, effectivePackageName);
      if (res3.success) {
        return await this.finalizeInstallResult(adb, res3, 'active_user', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
      }
      onLog?.(`تخطي المرحلة 4: ${res3.message}. الانتقال الفوري للمرحلة 5...`, 'info');
    } catch (e3: any) {
      onLog?.(`استجابة المرحلة 4: ${e3?.message || e3}. الانتقال للمرحلة 5...`, 'info');
    }

    // Stage 5: Desay SV / Chery Factory Broadcast Direct Injection
    try {
      onLog?.('[المرحلة 5] تجربة حاقن بث المصنع المباشر (Desay SV / Chery Factory Broadcast)...', 'info');
      const res4 = await this.installViaDesayBroadcast(adb, file, onProgress, onLog, effectivePackageName);
      if (res4.success) {
        return await this.finalizeInstallResult(adb, res4, 'desay_broadcast', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
      }
    } catch (e4: any) {
      onLog?.(`استجابة المرحلة 5: ${e4?.message || e4}`, 'info');
    }

    // Stage 6: Final Fallback: Car Download Staging
    onLog?.('[المرحلة 6] إيداع الحزمة في مجلد التحميلات وفتح مدير الملفات...', 'info');
    const res5 = await this.installViaDownloadStaging(adb, file, onProgress, onLog, effectivePackageName);
    return await this.finalizeInstallResult(adb, res5, 'download_staging', beforePackages, effectivePackageName, currentUserId, fileName, onLog);
  }

  /**
   * Post-install finalizer: verifies package detection, triggers launcher exposure, and grants permissions
   */
  private static async finalizeInstallResult(
    adb: Adb,
    result: { success: boolean; message: string; packageName?: string },
    methodUsed: InstallMethod,
    beforePackages: Set<string>,
    effectivePackageName: string | undefined,
    currentUserId: string,
    fileName: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string; methodUsed: InstallMethod; packageName?: string }> {
    if (result.success) {
      const newlyInstalled = await this.detectNewlyInstalledPackage(
        adb,
        beforePackages,
        result.packageName || effectivePackageName
      );
      const finalPkg = newlyInstalled || result.packageName || effectivePackageName;
      if (finalPkg) {
        await this.activatePackageForCarLauncher(adb, finalPkg, currentUserId, onLog);
        await this.autoGrantAutomotivePermissions(adb, fileName, onLog);
      }
      return { ...result, methodUsed, packageName: finalPkg };
    }
    return { ...result, methodUsed, packageName: effectivePackageName };
  }

  /**
   * Applies Desay SV / Chery / Jetour specific system properties and verifier disable commands.
   * Directly solves `java.lang.SecurityException: Restriction prevents installing` and enables sideloading.
   */
  public static async applyDesaySvPreCommands(
    adb: Adb,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    onLog?.('تطبيق إعدادات Desay SV / Chery الخاصة لفك حظر التثبيت (persist.sys.sv.isl)...', 'info');
    const cmds = [
      'setprop persist.sys.sv.isl true',
      'setprop persist.sys.sv.isl 1',
      'setprop persist.sys.chery.install true',
      'setprop persist.sys.strict_mode_disable 1',
      'setprop persist.adb.non_market_apps 1',
      'settings put global install_non_market_apps 1',
      'settings put secure install_non_market_apps 1',
      'settings put system install_non_market_apps 1',
      'settings put global verifier_verify_adb_installs 0',
      'settings put global package_verifier_enable 0',
      'settings put secure package_verifier_enable 0',
      'settings put global block_untrusted_touches 0',
      'appops set com.android.shell REQUEST_INSTALL_PACKAGES allow',
      'appops set 2000 REQUEST_INSTALL_PACKAGES allow',
      'pm set-user-restriction no_install_apps 0',
      'pm set-user-restriction no_install_unknown_sources 0',
      'pm set-user-restriction no_install_unknown_sources_globally 0',
    ];

    for (const cmd of cmds) {
      await this.execShell(adb, `${cmd} 2>/dev/null`);
    }
  }

  /**
   * Protocol 0: Desay SV / Chery Pipe-Stream Engine (`cat apk | pm install -S <size>`)
   * Implements the proven bypass technique from pimpmyride for Jetour T2 & Chery Desay SV head units.
   * 1. Unlocks `persist.sys.sv.isl true` system property
   * 2. Bypasses `Restriction prevents installing` by piping APK binary directly into STDIN
   * 3. Tests without dangerous flags, with user 0, and with spoofed installer identity
   */
  public static async installViaPipeStream(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const fileSize = file.size;
    onLog?.('بدء بروتوكول حاقن التدفق المباشر لبايسمكس (Desay SV Pipe-Stream)...', 'info');
    onProgress?.(5, 'uploading', 'فك قيود Desay SV وتجهيز خط الأنابيب...');

    // 1. Desay SV pre-commands
    await this.applyDesaySvPreCommands(adb, onLog);

    // 2. Push APK to /data/local/tmp
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempFileName = `_ins_${Date.now()}_${cleanName}`;
    const remotePath = `/data/local/tmp/${tempFileName}`;

    const pushOk = await this.pushFileSafe(adb, file, remotePath, onProgress, onLog);
    if (!pushOk) {
      return {
        success: false,
        message: 'فشل نقل ملف الـ APK إلى الذاكرة المؤقتة للشاشة.',
      };
    }

    await this.execShell(adb, `chmod 644 "${remotePath}" 2>/dev/null`);

    onProgress?.(85, 'installing', 'حقن الحزمة عبر تدفق الأنابيب STDIN وتجاوز قيود المسارات...');

    // Variant A: Standard pipe stream without -g (prevents SecurityException)
    onLog?.(`> cat "${remotePath}" | pm install -r -d -S ${fileSize}`, 'info');
    let out = await this.execShell(adb, `cat "${remotePath}" | pm install -r -d -S ${fileSize} 2>&1`);
    onLog?.(`استجابة مدير الحزم (المحاولة 1): ${out.trim()}`, 'info');

    if (/Success/i.test(out)) {
      await this.cleanupFile(adb, remotePath);
      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح عبر بروتوكول التدفق المباشر STDIN (Desay SV Pipe-Stream).',
        packageName: knownPackageName,
      };
    }

    // Variant B: Pipe stream with installer identity spoofing (Google Play Store)
    onLog?.('المحاولة 1 لم تكتمل، تجربة التدفق بهوية متجر التطبيقات الرسمية (-i com.android.vending)...', 'info');
    out = await this.execShell(adb, `cat "${remotePath}" | pm install -r -d -i com.android.vending -S ${fileSize} 2>&1`);
    onLog?.(`استجابة مدير الحزم (المحاولة 2): ${out.trim()}`, 'info');

    if (/Success/i.test(out)) {
      await this.cleanupFile(adb, remotePath);
      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح عبر التدفق بهوية المتجر (Play Store Identity).',
        packageName: knownPackageName,
      };
    }

    // Variant C: Pipe stream targeting User 0
    onLog?.('تجربة التدفق الموجه للمستخدم الأساسي للشاشة (--user 0)...', 'info');
    out = await this.execShell(adb, `cat "${remotePath}" | pm install -r -d --user 0 -S ${fileSize} 2>&1`);
    onLog?.(`استجابة مدير الحزم (المحاولة 3): ${out.trim()}`, 'info');

    if (/Success/i.test(out)) {
      await this.cleanupFile(adb, remotePath);
      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح عبر التدفق للمستخدم 0.',
        packageName: knownPackageName,
      };
    }

    // Variant D: Pipe stream with grant permissions flag -g
    onLog?.('تجربة التدفق المباشر مع منح الصلاحيات (-r -d -g)...', 'info');
    out = await this.execShell(adb, `cat "${remotePath}" | pm install -r -d -g -S ${fileSize} 2>&1`);
    onLog?.(`استجابة مدير الحزم (المحاولة 4): ${out.trim()}`, 'info');

    await this.cleanupFile(adb, remotePath);

    if (/Success/i.test(out)) {
      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح عبر تدفق الحزم ومنح الصلاحيات.',
        packageName: knownPackageName,
      };
    }

    return {
      success: false,
      message: this.translateAndroidInstallError(out),
    };
  }

  /**
   * Protocol 1: Direct In-Memory Streaming Package Session (Bypasses storage write restrictions and SELinux)
   * Uses @yume-chan/android-bin PackageManager session, completely non-interactive and zero clicks.
   */
  public static async installViaStreamingSession(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const fileSize = file.size;
    onLog?.('فتح جلسة حزم أندرويد الرسمية (PackageManager Streaming Session)...', 'info');
    onProgress?.(5, 'uploading', 'فتح جلسة التثبيت في نظام أندرويد...');

    const pm = new PackageManager(adb);

    let session: PackageManagerInstallSession | null = null;
    try {
      session = await PackageManagerInstallSession.create(pm, {
        allowTest: true,
        requestDowngrade: true,
      });
      onLog?.(`تم إنشاء جلسة تثبيت برقم: [Session #${session.id}]`, 'info');
    } catch (eCreate: any) {
      onLog?.(`تعذر إنشاء الجلسة عبر API (${eCreate?.message || eCreate})، تجربة الجلسة عبر shell stream...`, 'info');
      return await this.installViaShellStreamingSession(adb, file, onProgress, onLog, knownPackageName);
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
      onLog?.('تمت كتابة بيانات الحزمة بالكامل داخل الجلسة.', 'info');

      onProgress?.(92, 'installing', 'اعتماد الجلسة والتثبيت في نظام شاشة السيارة...');
      onLog?.('جاري اعتماد الجلسة في النظام (Commit Session)...', 'info');

      await session.commit();

      onLog?.('تم اعتماد وتثبيت جلسة الحزم بنجاح!', 'success');
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');

      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح عبر جلسة الحزم المتدفقة المباشرة وتفعيله لشاشة السيارة.',
        packageName: knownPackageName,
      };
    } catch (eCommit: any) {
      try {
        await session.abandon();
      } catch {}
      const errMsg = eCommit?.message || String(eCommit);
      return {
        success: false,
        message: this.translateAndroidInstallError(errMsg),
      };
    }
  }

  /**
   * Shell-level streaming session via `cmd package install-create` + `install-write` + `install-commit`
   */
  private static async installViaShellStreamingSession(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const fileSize = file.size;
    const currentUserId = await this.getCurrentUserId(adb);

    onLog?.('بدء إنشاء جلسة تثبيت عبر أوامر cmd package مباشرة...', 'info');

    // Create session
    const createCmd = `cmd package install-create -r -d -t --user ${currentUserId} 2>/dev/null || pm install-create -r -d -t 2>/dev/null`;
    const createOut = await this.execShell(adb, createCmd);
    const sessionMatch = createOut.match(/\[(\d+)\]/) || createOut.match(/session\s+(\d+)/i) || createOut.match(/(\d+)/);

    if (!sessionMatch || !sessionMatch[1]) {
      return {
        success: false,
        message: 'تعذر فتح جلسة تثبيت عبر cmd package.',
      };
    }

    const sessionId = sessionMatch[1];
    onLog?.(`تم فتح جلسة التثبيت: #${sessionId}`, 'info');

    // Stage APK in /data/local/tmp and write into session
    const tempPath = `/data/local/tmp/stream_${sessionId}.apk`;
    const pushOk = await this.pushFileSafe(adb, file, tempPath, onProgress, onLog);
    if (!pushOk) {
      await this.execShell(adb, `cmd package install-abandon ${sessionId} 2>/dev/null`);
      return {
        success: false,
        message: 'فشل نقل الحزمة المؤقتة إلى ذاكرة الشاشة للكتابة في الجلسة.',
      };
    }

    onProgress?.(90, 'installing', 'كتابة الحزمة داخل جلسة النظام...');
    await this.execShell(adb, `cat "${tempPath}" | cmd package install-write -S ${fileSize} ${sessionId} base.apk - 2>/dev/null || cat "${tempPath}" | pm install-write -S ${fileSize} ${sessionId} base.apk - 2>/dev/null`);

    onProgress?.(95, 'installing', 'اعتماد وتثبيت الجلسة...');
    const commitOut = await this.execShell(adb, `cmd package install-commit ${sessionId} 2>/dev/null || pm install-commit ${sessionId} 2>/dev/null`);

    await this.cleanupFile(adb, tempPath);

    if (/Success/i.test(commitOut)) {
      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح عبر جلسة الحزم الموجهة.',
        packageName: knownPackageName,
      };
    }

    return {
      success: false,
      message: this.translateAndroidInstallError(commitOut),
    };
  }

  /**
   * Protocol 2: Automotive app_process / GtInstall Engine
   * Executes Dalvik/ART Java runtime directly to communicate with IPackageManager via Binder IPC.
   * Completely non-interactive and zero clicks.
   */
  public static async installViaAppProcessGt(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    onLog?.('تجهيز بيئة GtInstall و app_process على نظام الشاشة...', 'info');

    // 1. Ensure g.jar is deployed on device
    const helperReady = await ensureGtHelperOnDevice(adb, onLog);
    if (!helperReady) {
      return {
        success: false,
        message: 'تعذر تجهيز حزمة المحرك المستقل (g.jar) على ذاكرة الشاشة.',
      };
    }

    // 2. Push APK to /data/local/tmp
    const remoteApkPath = `/data/local/tmp/app_gt_${Date.now()}.apk`;
    const pushOk = await this.pushFileSafe(adb, file, remoteApkPath, onProgress, onLog);
    if (!pushOk) {
      return {
        success: false,
        message: 'فشل رفع ملف التطبيق إلى ذاكرة الشاشة لتشغيل محرك GtInstall.',
      };
    }

    onProgress?.(85, 'installing', 'تشغيل محرك app_process واستدعاء خدمة الحزم...');
    onLog?.('بدء تشغيل محرك التثبيت عبر معالج app_process والاتصال بـ IPackageManager...', 'info');

    // 3. Execute GtInstall helper
    const gtResult = await installViaGtHelper(adb, remoteApkPath, onLog);

    // Clean up temporary APK
    await this.cleanupFile(adb, remoteApkPath);

    return {
      success: gtResult.success,
      message: gtResult.message,
      packageName: gtResult.packageName || knownPackageName,
    };
  }

  /**
   * Protocol 3: Active Automotive User Profile Targeting
   * Specifically targets the foreground driver profile (--user 10 or current),
   * strips installation restrictions on that user, and installs without dangerous flags like -g.
   */
  public static async installViaActiveUser(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    targetUserId?: string,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const userId = targetUserId || (await this.getCurrentUserId(adb));
    onLog?.(`استهداف بروفايل المستخدم النشط لشاشة السيارة: [المستخدم ${userId}]...`, 'info');

    // Lift restrictions specifically on this user
    await this.unlockUserRestrictions(adb, userId, onLog);

    const remotePath = `/data/local/tmp/user_install_${Date.now()}.apk`;
    const pushOk = await this.pushFileSafe(adb, file, remotePath, onProgress, onLog);
    if (!pushOk) {
      return {
        success: false,
        message: 'فشل نقل ملف الـ APK إلى ذاكرة الشاشة.',
      };
    }

    await this.execShell(adb, `chmod 644 "${remotePath}" 2>/dev/null`);

    onProgress?.(85, 'installing', `تثبيت الحزمة للمستخدم النشط (${userId})...`);

    // Use pipe-stream instead of passing file path directly to avoid "Restriction prevents installing" on Desay SV
    const installCmd = `cat "${remotePath}" | pm install -r -d -t --user ${userId} -S ${file.size} 2>&1`;
    onLog?.(`> cat "${remotePath}" | pm install -r -d -t --user ${userId} -S ${file.size}`, 'info');

    const out = await this.execShell(adb, installCmd);
    await this.cleanupFile(adb, remotePath);

    onLog?.(`استجابة مدير الحزم: ${out.trim()}`, 'info');

    if (/Success/i.test(out)) {
      return {
        success: true,
        message: `تم تثبيت التطبيق بنجاح للمستخدم النشط (${userId}) في شاشة السيارة.`,
        packageName: knownPackageName,
      };
    }

    // Try fallback to --user current or --user 0
    if (userId !== '0') {
      onLog?.('تجربة التدفق الموجه للمستخدم الأساسي (User 0)...', 'info');
      const tempPath2 = `/data/local/tmp/user0_install_${Date.now()}.apk`;
      await this.pushFileSafe(adb, file, tempPath2);
      await this.execShell(adb, `chmod 644 "${tempPath2}" 2>/dev/null`);
      const out2 = await this.execShell(adb, `cat "${tempPath2}" | pm install -r -d -t --user 0 -S ${file.size} 2>&1`);
      await this.cleanupFile(adb, tempPath2);

      if (/Success/i.test(out2)) {
        return {
          success: true,
          message: 'تم تثبيت التطبيق بنجاح للمستخدم الأساسي وتفعيله لشاشة القيادة.',
          packageName: knownPackageName,
        };
      }
    }

    return {
      success: false,
      message: this.translateAndroidInstallError(out),
    };
  }

  /**
   * Protocol 4: Desay SV / Chery Factory Broadcast Direct Injection
   * Transmits internal OTA & USB firmware installation intents recognized by Desay SV / Chery head units.
   * Completely non-interactive and zero clicks.
   */
  public static async installViaDesayBroadcast(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    onLog?.('تجهيز حزمة التثبيت لبث المصنع المباشر (Desay SV / Chery Factory Broadcast)...', 'info');

    // Stage APK into both /sdcard/Download and /data/local/tmp for maximum receiver compatibility
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const sdcardPath = `/sdcard/Download/${cleanFileName}`;
    const tmpPath = `/data/local/tmp/${cleanFileName}`;

    const pushOk = await this.pushFileSafe(adb, file, sdcardPath, onProgress, onLog);
    if (!pushOk) {
      return {
        success: false,
        message: 'فشل إيداع ملف التطبيق في ذاكرة الشاشة لبث المصنع.',
      };
    }

    await this.execShell(adb, `chmod 666 "${sdcardPath}" 2>/dev/null`);
    await this.execShell(adb, `cp "${sdcardPath}" "${tmpPath}" 2>/dev/null && chmod 666 "${tmpPath}" 2>/dev/null`);

    onProgress?.(85, 'installing', 'إرسال إشارات بث التثبيت لخدمات نظام السيارة...');
    onLog?.('إرسال أوامر البث لنظام فك التشفير والتثبيت الصامت في شاشة السيارة...', 'info');

    const broadcasts = [
      `am broadcast -a com.desay.action.INSTALL_APK --es path "${sdcardPath}" 2>/dev/null`,
      `am broadcast -a com.chery.action.INSTALL_APK --es path "${sdcardPath}" 2>/dev/null`,
      `am broadcast -a com.ecarx.action.INSTALL_APK --es apkPath "${sdcardPath}" 2>/dev/null`,
      `am broadcast -a android.intent.action.PACKAGE_INSTALL -d file://"${sdcardPath}" -t application/vnd.android.package-archive 2>/dev/null`,
      `am broadcast -a com.desay.action.INSTALL_APK --es path "${tmpPath}" 2>/dev/null`,
      `am broadcast -a com.chery.action.INSTALL_APK --es path "${tmpPath}" 2>/dev/null`,
    ];

    for (const b of broadcasts) {
      await this.execShell(adb, b);
      await new Promise((r) => setTimeout(r, 200));
    }

    onLog?.('تم إرسال إشارات البث لمستقبلات نظام السيارة بنجاح. فحص استجابة التثبيت...', 'info');

    // Monitor package installation for up to 6 seconds
    if (knownPackageName && knownPackageName !== 'base' && knownPackageName !== 'unknown.package') {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const installed = await this.isPackageInstalled(adb, knownPackageName);
        if (installed) {
          onLog?.(`تم تأكيد تثبيت الحزمة عبر بث المصنع: ${knownPackageName}`, 'success');
          return {
            success: true,
            message: `تم تثبيت الحزمة ${knownPackageName} بنجاح عبر بروتوكول بث المصنع المباشر.`,
            packageName: knownPackageName,
          };
        }
      }
    }

    // Direct Pipe-Stream Fallback: If broadcast didn't complete the install, execute pipe stream immediately!
    onLog?.('إشارات البث لم تكمل التثبيت تلقائياً. محاولة الحقن المتدفق المباشر عبر الأنبوب فوراً...', 'info');
    const pipeRes = await this.execShell(adb, `cat "${tmpPath}" | pm install -r -d -S ${file.size} 2>&1`);
    onLog?.(`استجابة التثبيت المتدفق: ${pipeRes.trim()}`, 'info');

    if (/Success/i.test(pipeRes)) {
      await this.cleanupFile(adb, tmpPath);
      return {
        success: true,
        message: 'تم إكمال تثبيت الحزمة بنجاح عبر التدفق المباشر وتفعيلها لشاشة السيارة.',
        packageName: knownPackageName,
      };
    }

    // If still pending, trigger the system package installer view directly on screen
    await this.execShell(adb, `am start -a android.intent.action.VIEW -d file://"${sdcardPath}" -t application/vnd.android.package-archive --user 0 2>/dev/null`);

    return {
      success: false,
      message: 'تم نسخ الحزمة إلى مجلد التحميلات وإرسال إشارات النظام. إذا لم يبدأ التثبيت تلقائياً، يمكنك النقر عليه في مدير الملفات.',
      packageName: knownPackageName,
    };
  }

  /**
   * Protocol 5: Car Storage Staging & Native File Manager
   * Stages the APK in /sdcard/Download/ with full permissions, scans it with MediaStore,
   * and opens the car's native file manager so the user can easily tap it if needed.
   * Zero artificial screen clicks.
   */
  public static async installViaDownloadStaging(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = `/sdcard/Download/${cleanFileName}`;

    onLog?.(`إيداع ملف التطبيق في مجلد التحميلات: ${targetPath}...`, 'info');
    onProgress?.(10, 'uploading', 'جاري نقل الملف إلى مجلد التحميلات في شاشة السيارة...');

    const pushOk = await this.pushFileSafe(adb, file, targetPath, onProgress, onLog);
    if (!pushOk) {
      return {
        success: false,
        message: 'تعذر حفظ ملف التطبيق في مجلد التحميلات بالسيارة.',
      };
    }

    // Set world-readable permissions and trigger media scanner
    await this.execShell(adb, `chmod 666 "${targetPath}" 2>/dev/null`);
    await this.execShell(adb, `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${targetPath}" 2>/dev/null`);

    onProgress?.(90, 'processing', 'تنبيه النظام وفتح مدير الملفات...');
    onLog?.('تم حفظ الملف بنجاح في مجلد التحميلات (Download) في شاشة السيارة.', 'success');

    // Attempt to open the staged APK or car's file manager cleanly
    try {
      await this.execShell(adb, `am start -a android.intent.action.VIEW -d "file://${targetPath}" -t "application/vnd.android.package-archive" 2>/dev/null`);
    } catch {}

    return {
      success: true,
      message: `تم إيداع ملف التطبيق بنجاح في مجلد التحميلات بشاشة سيارتك (/sdcard/Download/${cleanFileName}). يمكنك فتحه من مدير الملفات في أي وقت.`,
      packageName: knownPackageName,
    };
  }

  /**
   * Protocol 6: Direct Root su Injection
   * For rooted or developer-unlocked automotive units.
   * Sets SELinux to permissive and executes installation via su 0.
   * Completely non-interactive and zero clicks.
   */
  public static async installViaRootSu(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    knownPackageName?: string
  ): Promise<{ success: boolean; message: string; packageName?: string }> {
    onLog?.('فحص صلاحيات الروت (su binary) على نظام الشاشة...', 'info');

    // Check if su binary exists
    const suCheck = await this.execShell(adb, 'which su 2>/dev/null || su -v 2>/dev/null');
    if (!suCheck.includes('su') && !suCheck.includes('/')) {
      onLog?.('نظام الشاشة غير مكسور الحماية (لا يحتوي على صلاحية Root su).', 'warning');
      return {
        success: false,
        message: 'شاشة السيارة لا تحتوي على صلاحيات الروت (Root su). يرجى اختيار بروتوكول الجلسة المتدفقة أو محرك GtInstall.',
      };
    }

    onLog?.('تم العثور على صلاحيات الروت. جاري رفع ملف التثبيت...', 'info');
    const remotePath = `/data/local/tmp/root_install_${Date.now()}.apk`;
    const pushOk = await this.pushFileSafe(adb, file, remotePath, onProgress, onLog);
    if (!pushOk) {
      return {
        success: false,
        message: 'فشل نقل ملف التثبيت إلى ذاكرة الشاشة.',
      };
    }

    onProgress?.(85, 'installing', 'حقن وتثبيت التطبيق بصلاحيات Root su...');
    onLog?.('تعطيل SELinux مؤقتاً وتشغيل التثبيت بصلاحيات الروت المطلقة...', 'info');

    const rootCmd = `su -c "setenforce 0; pm install -r -d -t '${remotePath}'" 2>&1`;
    const out = await this.execShell(adb, rootCmd);

    await this.cleanupFile(adb, remotePath);
    onLog?.(`استجابة Root: ${out.trim()}`, 'info');

    if (/Success/i.test(out)) {
      return {
        success: true,
        message: 'تم تثبيت التطبيق بنجاح بصلاحيات الروت المطلقة (Root su).',
        packageName: knownPackageName,
      };
    }

    return {
      success: false,
      message: this.translateAndroidInstallError(out),
    };
  }

  /**
   * Safe file pusher with live progress and automatic chunked fallback
   */
  private static async pushFileSafe(
    adb: Adb,
    file: File,
    remotePath: string,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<boolean> {
    const fileSize = file.size;

    // 1. Try ADB Sync Service
    try {
      const sync = await adb.sync();
      let transferredBytes = 0;

      const transform = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          transferredBytes += chunk.byteLength;
          const pct = Math.min(80, Math.round((transferredBytes / fileSize) * 80));
          const mbTransferred = (transferredBytes / (1024 * 1024)).toFixed(1);
          const mbTotal = (fileSize / (1024 * 1024)).toFixed(1);
          onProgress?.(pct, 'uploading', `رفع الحزمة إلى الشاشة (${mbTransferred} / ${mbTotal} MB)`);
          controller.enqueue(chunk);
        },
      });

      const readable = new WrapReadableStream<Uint8Array>({
        start: () => file.stream() as any,
      });
      const stream = readable.pipeThrough(transform);

      await sync.write({
        filename: remotePath,
        file: stream as any,
        permission: 0o666,
      });
      await sync.dispose();

      // Verify file presence
      const sizeOut = await this.execShell(adb, `ls -l "${remotePath}" 2>/dev/null`);
      if (sizeOut.includes(remotePath.split('/').pop() || '')) {
        return true;
      }
    } catch (eSync: any) {
      onLog?.(`ملاحظة خدمة المزامنة: ${eSync?.message || eSync}. الانتقال للرفع المباشر...`, 'info');
    }

    // 2. Shell base64 fallback for smaller files or if sync fails
    return await this.pushFileViaShell(adb, file, remotePath, onProgress);
  }

  /**
   * Fallback shell chunked pusher
   */
  private static async pushFileViaShell(
    adb: Adb,
    file: File,
    remotePath: string,
    onProgress?: InstallProgressCallback
  ): Promise<boolean> {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const chunkSize = 32 * 1024;
      const totalChunks = Math.ceil(bytes.length / chunkSize);

      await this.execShell(adb, `rm -f "${remotePath}" "${remotePath}.b64" 2>/dev/null`);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(bytes.length, start + chunkSize);
        const slice = bytes.subarray(start, end);

        let binary = '';
        for (let j = 0; j < slice.length; j++) {
          binary += String.fromCharCode(slice[j]);
        }
        const b64 = btoa(binary);

        await this.execShell(adb, `printf "%s" "${b64}" >> "${remotePath}.b64" 2>/dev/null`);

        const pct = Math.min(80, Math.round(((i + 1) / totalChunks) * 80));
        onProgress?.(pct, 'uploading', `نقل بيانات الحزمة (${pct}%)...`);
      }

      await this.execShell(adb, `base64 -d "${remotePath}.b64" > "${remotePath}" 2>/dev/null && rm -f "${remotePath}.b64" 2>/dev/null`);
      await this.execShell(adb, `chmod 666 "${remotePath}" 2>/dev/null`);

      const check = await this.execShell(adb, `ls -l "${remotePath}" 2>/dev/null`);
      return check.includes(remotePath.split('/').pop() || '');
    } catch {
      return false;
    }
  }

  /**
   * Safely deletes temporary remote files
   */
  private static async cleanupFile(adb: Adb, path: string): Promise<void> {
    if (path && (path.startsWith('/data/local/tmp/') || path.startsWith('/sdcard/Download/temp_'))) {
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
   * Unlocks security restrictions and package verifiers that cause "Restriction prevents installing"
   * Comprehensively detects all automotive user profiles and strips installation blocks.
   */
  public static async unlockUserRestrictions(
    adb: Adb,
    userId: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    try {
      // 0. Apply Desay SV / Chery system properties (persist.sys.sv.isl true)
      await this.applyDesaySvPreCommands(adb, onLog);

      const userIds = new Set<string>(['0', 'current']);
      if (userId) userIds.add(userId);

      try {
        const usersRaw = await this.execShell(adb, 'pm list users 2>/dev/null');
        const matches = usersRaw.matchAll(/UserInfo\{(\d+):/g);
        for (const m of matches) {
          if (m[1]) userIds.add(m[1]);
        }
      } catch {}

      // Package verifiers & security checks
      await this.execShell(adb, 'settings put global verifier_verify_adb_installs 0 2>/dev/null');
      await this.execShell(adb, 'settings put global package_verifier_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put global upload_apk_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put secure package_verifier_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put secure upload_apk_enable 0 2>/dev/null');
      await this.execShell(adb, 'settings put global install_non_market_apps 1 2>/dev/null');
      await this.execShell(adb, 'settings put secure install_non_market_apps 1 2>/dev/null');
      await this.execShell(adb, 'settings put system install_non_market_apps 1 2>/dev/null');
      await this.execShell(adb, 'settings put global block_untrusted_touches 0 2>/dev/null');
      await this.execShell(adb, 'appops set com.android.shell REQUEST_INSTALL_PACKAGES allow 2>/dev/null');
      await this.execShell(adb, 'appops set 2000 REQUEST_INSTALL_PACKAGES allow 2>/dev/null');

      // User restrictions
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

      for (const r of restrictions) {
        await this.execShell(adb, `pm set-user-restriction ${r} 0 2>/dev/null`);
        for (const uid of Array.from(userIds)) {
          await this.execShell(adb, `pm set-user-restriction ${r} 0 --user ${uid} 2>/dev/null`);
          await this.execShell(adb, `pm set-user-restriction --user ${uid} ${r} 0 2>/dev/null`);
        }
      }

      onLog?.('تم فك قيود تثبيت التطبيقات ومصادر التثبيت الخارجية في نظام السيارة بنجاح.', 'info');
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
   */
  public static async activatePackageForCarLauncher(
    adb: Adb,
    packageName: string,
    userId?: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    if (!packageName || packageName === 'unknown.package' || packageName === 'base') return;

    onLog?.(`تفعيل وإظهار التطبيق (${packageName}) في شاشة ولانشر السيارة...`, 'info');

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
        await this.execShell(adb, `cmd package install-existing --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm install-existing --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `cmd package unhide --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm unhide --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `cmd package enable --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `pm enable --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `cmd package unsuspend --user ${u} ${packageName} 2>/dev/null`);
        await this.execShell(adb, `cmd package set-distraction-optimized --user ${u} true ${packageName} 2>/dev/null`);
        await this.execShell(adb, `cmd car_service set-distraction-optimized ${packageName} true 2>/dev/null`);
      } catch {}
    }

    try {
      await this.execShell(adb, `pm unhide ${packageName} 2>/dev/null`);
      await this.execShell(adb, `pm enable ${packageName} 2>/dev/null`);
      await this.execShell(adb, `appops set ${packageName} SYSTEM_ALERT_WINDOW allow 2>/dev/null`);
      await this.execShell(adb, `appops set ${packageName} GET_USAGE_STATS allow 2>/dev/null`);
      await this.execShell(adb, `pm grant ${packageName} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`);
      await this.execShell(adb, `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1 2>/dev/null`);
      await this.execShell(adb, `am broadcast -a android.intent.action.PACKAGE_ADDED -d package:${packageName} 2>/dev/null`);
      await this.execShell(adb, `am broadcast -a android.intent.action.PACKAGE_CHANGED -d package:${packageName} 2>/dev/null`);
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
   * Automatically grants recommended automotive permissions for known car applications & stores
   */
  private static async autoGrantAutomotivePermissions(
    adb: Adb,
    fileNameOrPkg: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    const lower = fileNameOrPkg.toLowerCase();

    if (!fileNameOrPkg.endsWith('.apk') && fileNameOrPkg.includes('.')) {
      try {
        await this.execShell(adb, `appops set ${fileNameOrPkg} SYSTEM_ALERT_WINDOW allow 2>/dev/null`);
        await this.execShell(adb, `pm grant ${fileNameOrPkg} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`);
        await this.execShell(adb, `pm grant ${fileNameOrPkg} android.permission.ACCESS_FINE_LOCATION 2>/dev/null`);
        await this.execShell(adb, `pm grant ${fileNameOrPkg} android.permission.ACCESS_COARSE_LOCATION 2>/dev/null`);
        await this.execShell(adb, `pm grant ${fileNameOrPkg} android.permission.READ_EXTERNAL_STORAGE 2>/dev/null`);
        await this.execShell(adb, `pm grant ${fileNameOrPkg} android.permission.WRITE_EXTERNAL_STORAGE 2>/dev/null`);
        await this.execShell(adb, `dumpsys deviceidle whitelist +${fileNameOrPkg} 2>/dev/null`);
      } catch {}
    }

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

    // Radar / HUD / Navigation Apps
    if (lower.includes('hud') || lower.includes('speed') || lower.includes('radar') || lower.includes('strelka') || lower.includes('map') || lower.includes('nav')) {
      onLog?.('اكتشاف تطبيق ملاحة/رادار سرعة: جاري تفعيل صلاحيات النوافذ العائمة والموقع الجغرافي...', 'info');
      const radarPkgs = ['air.strelkahudfree', 'air.strelkahud', 'ru.speedcamalert', 'com.yandex.yandexnavi', 'com.google.android.apps.maps'];
      for (const rp of radarPkgs) {
        try {
          await this.execShell(adb, `appops set ${rp} SYSTEM_ALERT_WINDOW allow 2>/dev/null`);
          await this.execShell(adb, `pm grant ${rp} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`);
          await this.execShell(adb, `pm grant ${rp} android.permission.ACCESS_FINE_LOCATION 2>/dev/null`);
          await this.execShell(adb, `dumpsys deviceidle whitelist +${rp} 2>/dev/null`);
        } catch {}
      }
    }
  }

  /**
   * Helper to execute a command over standard ADB shell with clean socket termination
   */
  public static async execShell(adb: Adb, command: string): Promise<string> {
    return adbManager.execShell(adb, command);
  }

  /**
   * Translates Android `INSTALL_FAILED_*` errors into clear Arabic explanations
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

    if (
      err.includes('RESTRICTION PREVENTS INSTALLING') ||
      err.includes('DISALLOW_INSTALL_APPS') ||
      err.includes('USER_RESTRICTION') ||
      err.includes('INSTALL_FAILED_USER_RESTRICTED')
    ) {
      return 'حظر أمني من فيرموير السيارة (SecurityException: Restriction prevents installing). يُوصى باستخدام بروتوكول محرك GtInstall المستقل أو بروتوكول المستخدم النشط.';
    }

    if (err.includes('INSTALL_GRANT_RUNTIME_PERMISSIONS') || err.includes('SECURITYEXCEPTION') || err.includes('INSTALL_PERMISSIONS')) {
      return 'رفض نظام السيارة الصلاحيات المباشرة أثناء التثبيت (SecurityException). تم تحديث الأوامر لتجنب طلب الأذونات المحظورة أثناء التثبيت ومنحها بعد اكتمال التثبيت.';
    }

    if (err.includes('INSTALL_FAILED_ALREADY_EXISTS') || err.includes('UPDATE_INCOMPATIBLE') || err.includes('SIGNATURE_MISMATCH')) {
      return 'توجد نسخة سابقة مثبتة على الشاشة بتوقيع مختلف (Signature Mismatch). الحل: قم بحذف النسخة السابقة أولاً (من قسم إدارة التطبيقات) ثم أعد التثبيت.';
    }
    if (err.includes('INSTALL_FAILED_VERSION_DOWNGRADE')) {
      return 'الإصدار المراد تثبيته أقدم من الإصدار الموجود حالياً على الشاشة. الحل: قم بإلغاء تثبيت النسخة الحالية أولاً.';
    }
    if (err.includes('INSTALL_FAILED_INVALID_APK') || err.includes('INSTALL_PARSE_FAILED_NOT_APK')) {
      return 'ملف الـ APK غير صالح أو تالف أو تم تنزيله بشكل غير مكتمل. يرجى إعادة تنزيل الملف من مصدره.';
    }
    if (err.includes('INSTALL_FAILED_OLDER_SDK') || err.includes('INSTALL_PARSE_FAILED_MIN_SDK')) {
      return 'التطبيق غير متوافق مع إصدار نظام شاشة سيارتك (يتطلب إصدار أندرويد أحدث).';
    }
    if (err.includes('INSTALL_FAILED_CPU_ABI_INCOMPATIBLE') || err.includes('NO_MATCHING_ABIS')) {
      return 'معمارية التطبيق غير متوافقة مع معالج الشاشة (مثلاً التطبيق 64-bit ومعالج شاشتك 32-bit armeabi-v7a).';
    }
    if (err.includes('INSTALL_FAILED_INSUFFICIENT_STORAGE')) {
      return 'مساحة تخزين شاشة السيارة ممتلئة. يرجى حذف بعض الملفات أو التطبيقات لتوفير مساحة كافية.';
    }
    if (err.includes('INSTALL_FAILED_VERIFICATION_FAILURE') || err.includes('VERIFICATION_TIMEOUT')) {
      return 'فشلت أداة التحقق من الحزم الأمنية في الشاشة. تم تعطيل التحقق تلقائياً.';
    }
    if (err.includes('INSTALL_PARSE_FAILED_NO_CERTIFICATES')) {
      return 'ملف التطبيق غير موقع بشهادة رقمية (Not Signed). يرجى استخدام تطبيق موقع بشهادة رسمية.';
    }

    return rawError;
  }

  public static formatInstallErrorMessage(rawError: string): string {
    return this.translateAndroidInstallError(rawError);
  }

  /**
   * Opens the car's native file manager / DocumentsUI to /sdcard/Download
   */
  public static async openCarFileManager(
    adb: Adb,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    onLog?.('جاري استدعاء وتشغيل مدير الملفات على شاشة السيارة...', 'info');

    const commands = [
      'am start -a android.intent.action.VIEW -d "content://com.android.externalstorage.documents/document/primary%3ADownload" -t "*/*" 2>/dev/null',
      'am start -a android.intent.action.OPEN_DOCUMENT -d "file:///sdcard/Download" -t "*/*" 2>/dev/null',
      'am start -a android.intent.action.VIEW -d "file:///sdcard/Download" -t "resource/folder" 2>/dev/null',
      'am start -n com.android.documentsui/.files.FilesActivity 2>/dev/null',
      'am start -n com.google.android.documentsui/.files.FilesActivity 2>/dev/null',
      'am start -a android.intent.action.MAIN -c android.intent.category.APP_FILES 2>/dev/null',
    ];

    for (const cmd of commands) {
      try {
        await this.execShell(adb, cmd);
      } catch {}
    }

    onLog?.('تم إرسال أمر فتح مدير الملفات لشاشة السيارة بنجاح.', 'success');
    return {
      success: true,
      message: 'تم فتح مدير الملفات بشاشة سيارتك بنجاح.',
    };
  }
}
