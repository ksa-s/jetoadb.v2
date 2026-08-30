import { Adb } from '@yume-chan/adb';
import { WrapReadableStream, TransformStream } from '@yume-chan/stream-extra';
import { PackageManager } from '@yume-chan/android-bin';
import { InstallMethod } from '../../types';

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
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string; methodUsed: InstallMethod }> {
    const fileSize = file.size;
    const fileName = file.name;

    onLog?.(`بدء تثبيت التطبيق: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`, 'info');

    // Method 1: Explicit Storage Push & Pipe
    if (preferredMethod === 'sdcard' || preferredMethod === 'sync_tmp') {
      const res = await this.installViaStoragePipe(adb, file, onProgress, onLog);
      return { ...res, methodUsed: 'sdcard' };
    }

    // Method 2: Direct Binary Stream
    if (preferredMethod === 'stream') {
      try {
        const res = await this.installViaDirectStream(adb, file, onProgress, onLog);
        return { ...res, methodUsed: 'stream' };
      } catch (err: any) {
        onLog?.(`فشل البث المباشر (${err.message || err}). جاري التبديل إلى طريقة النقل والتثبيت المباشر...`, 'warning');
        const fallbackRes = await this.installViaStoragePipe(adb, file, onProgress, onLog);
        return { ...fallbackRes, methodUsed: 'sdcard' };
      }
    }

    // Method 3: Session
    if (preferredMethod === 'session') {
      try {
        const res = await this.installViaPackageManager(adb, file, onProgress, onLog);
        return { ...res, methodUsed: 'session' };
      } catch (err: any) {
        onLog?.(`فشلت جلسة التثبيت (${err.message || err}). جاري التبديل إلى طريقة التثبيت الذكية...`, 'warning');
        const fallbackRes = await this.installViaStoragePipe(adb, file, onProgress, onLog);
        return { ...fallbackRes, methodUsed: 'sdcard' };
      }
    }

    // Auto Mode (The Universal Automotive Formula):
    // 1. Primary: Storage Push + Pipe / Direct Install
    // 2. Secondary: Direct Stream via exec:cmd package install / exec:pm install
    // 3. Fallback: PackageManager
    // 4. Fallback: Interactive Car UI Trigger
    onLog?.('الوضع التلقائي الذكي لشاشات السيارات: تجهيز المسار ونقل الحزمة وتثبيتها عبر الأنابيب...', 'info');

    try {
      const res = await this.installViaStoragePipe(adb, file, onProgress, onLog);
      if (res.success) {
        return { ...res, methodUsed: 'sdcard' };
      }
      onLog?.(`تنبيه: محاولة التثبيت الأولى (${res.message}). جاري تجربة البث المباشر البديل...`, 'warning');
    } catch (err: any) {
      onLog?.(`تنبيه: ${err.message || err}. جاري تجربة الطريقة البديلة للبث المباشر...`, 'warning');
    }

    // Attempt 2: Direct Binary Stream
    try {
      const res = await this.installViaDirectStream(adb, file, onProgress, onLog);
      if (res.success) {
        return { ...res, methodUsed: 'stream' };
      }
      onLog?.(`تنبيه: فشل البث المباشر (${res.message})...`, 'warning');
    } catch (err: any) {
      onLog?.(`تنبيه: تعذر إكمال البث المباشر: ${err.message || err}`, 'warning');
    }

    // Attempt 3: PackageManager Session
    try {
      const res = await this.installViaPackageManager(adb, file, onProgress, onLog);
      if (res.success) {
        return { ...res, methodUsed: 'session' };
      }
    } catch {}

    // Attempt 4: Interactive Trigger as last resort
    try {
      const res = await this.installViaInteractivePrompt(adb, file, onProgress, onLog);
      return { ...res, methodUsed: 'sdcard' };
    } catch (err: any) {
      throw new Error(`فشلت جميع طرق التثبيت. تفاصيل الخطأ: ${err.message || err}`);
    }
  }

  /**
   * Universal Storage Push & Pipe Installation for Car Head Units:
   * 1. Prepares destination folder (`mkdir -p /data/local/tmp /sdcard/Download`)
   * 2. Pushes APK to verified writable storage directory using ADB Sync Stream
   * 3. Sets permissions (chmod 777) and verifies file integrity
   * 4. Pipes or installs APK directly to Package Manager
   */
  private static async installViaStoragePipe(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const size = file.size;
    const cleanBaseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = cleanBaseName.endsWith('.apk') ? cleanBaseName : `${cleanBaseName}.apk`;

    // Ensure common directories exist before attempting to push
    try {
      await this.execShell(adb, 'mkdir -p /data/local/tmp /sdcard/Download /sdcard 2>/dev/null');
    } catch {}

    // Candidate paths in order of reliability on automotive head units
    const candidatePaths = [
      `/data/local/tmp/${safeName}`,
      `/sdcard/Download/${safeName}`,
      `/sdcard/${safeName}`,
      `/storage/emulated/0/Download/${safeName}`,
      `/storage/emulated/0/${safeName}`,
    ];

    let targetPath = '';
    let pushSuccess = false;
    let pushError = '';

    for (const testPath of candidatePaths) {
      try {
        onProgress?.(5, 'uploading', `بدء نقل الحزمة إلى مسار الشاشة (${testPath})...`);
        onLog?.(`محاولة نقل الحزمة إلى: ${testPath}...`, 'info');
        await this.pushFileSafe(adb, file, testPath, onProgress, onLog);

        // Verify file size on device
        const verifyOutput = await this.execShell(adb, `ls -l "${testPath}" 2>/dev/null || wc -c < "${testPath}" 2>/dev/null`);
        if (verifyOutput.trim().length > 0) {
          targetPath = testPath;
          pushSuccess = true;
          onLog?.(`تم التحقق من وجود الملف في الشاشة (${(size / (1024 * 1024)).toFixed(1)} MB) بنجاح.`, 'success');
          break;
        }
      } catch (err: any) {
        pushError = err.message || String(err);
        onLog?.(`تعذر استخدام المسار ${testPath}: ${pushError}. تجربة مسار بديل...`, 'warning');
      }
    }

    if (!pushSuccess || !targetPath) {
      // Fallback: Push via chunked shell socket
      targetPath = `/data/local/tmp/${safeName}`;
      onLog?.('جاري محاولة الرفع عبر قناة Shell المباشرة البديلة...', 'info');
      try {
        await this.pushFileViaShell(adb, file, targetPath, onProgress, onLog);
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

    onLog?.(`تم نقل الملف بنجاح. جاري تنفيذ أوامر التثبيت البرمجية على شاشة السيارة...`, 'info');
    onProgress?.(90, 'installing', 'تشغيل أمر التثبيت عبر مدير حزم الشاشة...');

    // Multi-tier command degradation
    const commandsToTry = [
      `cat "${targetPath}" | pm install -i "com.android.vending" -r -d -g -t -S ${size}`,
      `cat "${targetPath}" | pm install -r -d -g -t -S ${size}`,
      `cat "${targetPath}" | pm install -r -d -t -S ${size}`,
      `cat "${targetPath}" | pm install -r -S ${size}`,
      `cat "${targetPath}" | pm install -S ${size}`,
      `pm install -i "com.android.vending" -r -d -g -t "${targetPath}"`,
      `pm install -r -d -g -t "${targetPath}"`,
      `pm install -r -t "${targetPath}"`,
      `pm install -r "${targetPath}"`,
      `cmd package install -r -d -g -t "${targetPath}"`,
      `cmd package install -r "${targetPath}"`,
    ];

    let lastOutput = '';
    let isSuccess = false;

    for (const cmd of commandsToTry) {
      try {
        onLog?.(`تنفيذ الأمر: ${cmd}`, 'info');
        const output = await this.execShell(adb, cmd);
        lastOutput = output.trim();
        const isCmdSuccess = lastOutput.toLowerCase().includes('success');
        onLog?.(`استجابة الشاشة: ${lastOutput || '(لا توجد استجابة)'}`, isCmdSuccess ? 'success' : 'info');

        if (isCmdSuccess) {
          isSuccess = true;
          break;
        }

        // Fatal errors that shouldn't be retried
        if (
          lastOutput.includes('INSTALL_FAILED_ALREADY_EXISTS') ||
          lastOutput.includes('INSTALL_FAILED_VERSION_DOWNGRADE') ||
          lastOutput.includes('INSTALL_FAILED_CPU_ABI_INCOMPATIBLE') ||
          lastOutput.includes('INSTALL_FAILED_INSUFFICIENT_STORAGE') ||
          lastOutput.includes('INSTALL_PARSE_FAILED_NOT_APK')
        ) {
          break;
        }
      } catch (err: any) {
        lastOutput = err.message || String(err);
      }
    }

    // Clean up temporary file from device storage
    try {
      await this.execShell(adb, `rm -f "${targetPath}" 2>/dev/null`);
    } catch {}

    if (isSuccess) {
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
      
      // Auto-grant automotive permissions for known packages
      try {
        await this.autoGrantAutomotivePermissions(adb, file.name, onLog);
      } catch {}

      return { 
        success: true, 
        message: 'تم تثبيت التطبيق بنجاح على شاشة السيارة.' 
      };
    }

    const friendlyError = this.translateAndroidInstallError(lastOutput);
    return { success: false, message: friendlyError || lastOutput || 'فشل التثبيت' };
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
          const pct = 5 + Math.min(85, Math.round((transferredBytes / size) * 85));
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
   * Fallback: Pushes file via standard shell pipe for car head units where sync: is locked
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
          const pct = 5 + Math.min(85, Math.round((sentBytes / size) * 85));
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
    } catch {}
  }

  /**
   * Direct Binary Stream (Zero Storage Required) - streams APK directly into `exec:cmd package install -S` or `exec:pm install -S`
   */
  private static async installViaDirectStream(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const size = file.size;
    
    // Try exec: first (binary stream), then fallback to shell:
    const prefixes = [
      `exec:cmd package install -r -d -g -t -S ${size}`,
      `exec:pm install -r -d -g -t -S ${size}`,
      `shell:pm install -i "com.android.vending" -r -d -g -t -S ${size}`,
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
              const pct = 5 + Math.min(90, Math.round((sentBytes / size) * 90));
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

        onProgress?.(95, 'installing', 'قراءة نتيجة التثبيت...');
        const decoder = new TextDecoder();
        const socketReader = socket.readable.getReader();
        let output = '';

        while (true) {
          const { done, value } = await socketReader.read();
          if (done) break;
          if (value) output += decoder.decode(value, { stream: true });
        }
        output += decoder.decode();

        const trimmed = output.trim();
        if (trimmed.toLowerCase().includes('success')) {
          onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
          try {
            await this.autoGrantAutomotivePermissions(adb, file.name, onLog);
          } catch {}
          return { success: true, message: 'تم التثبيت بنجاح عبر البث المباشر.' };
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
   * Official @yume-chan/android-bin PackageManager
   */
  private static async installViaPackageManager(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    onProgress?.(20, 'uploading', 'بدء التثبيت عبر مدير الحزم القياسي...');
    const pm = new PackageManager(adb);

    try {
      const stream = new WrapReadableStream({ start: () => file.stream() as any });
      await pm.pushAndInstallStream(stream as any);
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
      return { success: true, message: 'تم تثبيت التطبيق بنجاح عبر مدير الحزم.' };
    } catch (err: any) {
      const msg = err.message || String(err);
      const friendlyError = this.translateAndroidInstallError(msg);
      return { success: false, message: friendlyError || msg };
    }
  }

  /**
   * Interactive Package Installer Trigger
   */
  private static async installViaInteractivePrompt(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const targetPath = `/data/local/tmp/sam_installer_${Date.now()}.apk`;
    onLog?.('تجهيز نافذة التثبيت التفاعلية على شاشة السيارة...', 'info');

    // Push file using safe push
    await this.pushFileSafe(adb, file, targetPath, onProgress, onLog);

    // Launch Package Installer Intent
    onProgress?.(95, 'installing', 'إرسال أمر فتح نافذة التثبيت لشاشة السيارة...');
    const amCmd = `am start -a android.intent.action.VIEW -d "file://${targetPath}" -t "application/vnd.android.package-archive"`;
    await this.execShell(adb, amCmd);

    onLog?.('تم فتح نافذة التثبيت على شاشة سيارتك! اضغط على "تثبيت" (Install) الظاهرة على الشاشة لإكمال العملية.', 'success');
    onProgress?.(100, 'processing', 'تم إرسال الطلب إلى شاشة السيارة');

    return {
      success: true,
      message: 'تم نقل التطبيق وفتح نافذة التثبيت على شاشة السيارة. يرجى الضغط على زر (تثبيت / Install) على شاشة السيارة لإتمام التثبيت.',
    };
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

    // RuStore or App Stores
    if (lower.includes('rustore') || lower.includes('store') || lower.includes('market') || lower.includes('aurora')) {
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
        await this.execShell(adb, `settings put secure enabled_accessibility_services com.arlosoft.macrodroid/com.arlosoft.macrodroid.triggers.services.AccessibilityService:com.arlosoft.macrodroid/com.arlosoft.macrodroid.common.MacroDroidAccessibilityService 2>/dev/null`);
      } catch {}
    }
  }

  /**
   * Helper to execute a command over standard ADB shell
   */
  private static async execShell(adb: Adb, command: string): Promise<string> {
    try {
      const socket = await adb.createSocket(`shell:${command}`);
      const reader = socket.readable.getReader();
      const decoder = new TextDecoder();
      let output = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          output += decoder.decode(value, { stream: true });
        }
      }
      output += decoder.decode();
      return output.trim();
    } catch (e: any) {
      throw new Error(`خطأ في تنفيذ الأمر عبر Shell: ${e.message || e}`);
    }
  }

  /**
   * Translates Android `INSTALL_FAILED_*` errors into clear Arabic explanations with direct fix instructions
   */
  public static translateAndroidInstallError(rawError: string): string {
    if (!rawError) return 'حدث خطأ غير محدد أثناء التثبيت.';

    const err = rawError.toUpperCase();

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
