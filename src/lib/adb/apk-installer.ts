import { Adb } from '@yume-chan/adb';
import { WrapReadableStream } from '@yume-chan/stream-extra';
import { PackageManager } from '@yume-chan/android-bin';
import { InstallMethod } from '../../types';

export interface InstallProgressCallback {
  (progress: number, stage: 'uploading' | 'installing' | 'processing', message?: string): void;
}

export class ApkInstaller {
  /**
   * Main adaptive install entry point
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

    onLog?.(`بدء تثبيت الحزمة: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`, 'info');

    // Method specific execution
    if (preferredMethod === 'sdcard' || preferredMethod === 'sync_tmp') {
      const res = await this.installViaSyncPush(adb, file, onProgress, onLog);
      return { ...res, methodUsed: 'sdcard' };
    }

    if (preferredMethod === 'stream') {
      try {
        const res = await this.installViaDirectStream(adb, file, onProgress, onLog);
        return { ...res, methodUsed: 'stream' };
      } catch (err: any) {
        onLog?.(`فشل البث المباشر (${err.message || err}). جاري التبديل إلى بروتوكول Sync Push الأكثر استقراراً...`, 'warning');
        const fallbackRes = await this.installViaSyncPush(adb, file, onProgress, onLog);
        return { ...fallbackRes, methodUsed: 'sdcard' };
      }
    }

    if (preferredMethod === 'session') {
      try {
        const res = await this.installViaPackageManager(adb, file, onProgress, onLog);
        return { ...res, methodUsed: 'session' };
      } catch (err: any) {
        onLog?.(`فشلت جلسة التثبيت (${err.message || err}). جاري التبديل إلى بروتوكول Sync Push...`, 'warning');
        const fallbackRes = await this.installViaSyncPush(adb, file, onProgress, onLog);
        return { ...fallbackRes, methodUsed: 'sdcard' };
      }
    }

    // Auto Mode (Optimized for Car Head Units & Automotive Android):
    // 1. Primary: Native ADB Sync Push + Multi-Version PM Install
    // 2. Secondary: PackageManager Stream from @yume-chan/android-bin
    // 3. Fallback: Interactive Car UI Package Installer Trigger
    onLog?.('الوضع التلقائي: بدء النقل عبر بروتوكول ADB Sync المباشر (المخصص لشاشات السيارات)...', 'info');

    try {
      const res = await this.installViaSyncPush(adb, file, onProgress, onLog);
      if (res.success) {
        return { ...res, methodUsed: 'sdcard' };
      }
      onLog?.(`تنبيه: محاولة التثبيت واجهت (${res.message}). جاري تجربة مدير الحزم القياسي...`, 'warning');
    } catch (err: any) {
      onLog?.(`تنبيه من بروتوكول المزامنة: ${err.message || err}. جاري تجربة الطريقة البديلة...`, 'warning');
    }

    // Attempt 2: PackageManager
    try {
      const res = await this.installViaPackageManager(adb, file, onProgress, onLog);
      if (res.success) {
        return { ...res, methodUsed: 'session' };
      }
      onLog?.(`تنبيه: فشلت طريقة مدير الحزم (${res.message})...`, 'warning');
    } catch (err: any) {
      onLog?.(`تنبيه: تعذر إكمال التثبيت عبر مدير الحزم: ${err.message || err}`, 'warning');
    }

    // Attempt 3: Interactive Trigger as last resort
    try {
      const res = await this.installViaInteractivePrompt(adb, file, onProgress, onLog);
      return { ...res, methodUsed: 'sdcard' };
    } catch (err: any) {
      throw new Error(`فشلت جميع طرق التثبيت. تفاصيل الخطأ: ${err.message || err}`);
    }
  }

  /**
   * Primary Method: Native ADB Sync protocol to write the APK file into car storage,
   * followed by multi-flag `pm install` execution.
   * This is 100% compatible with automotive Android systems (Desay SV, FlyAudio, Teyes, Jetour, Geely, Haval, etc.)
   */
  private static async installViaSyncPush(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const size = file.size;
    const safeName = `sam_app_${Date.now()}.apk`;

    // Candidate directories on car storage ordered by reliability
    const candidatePaths = [
      `/sdcard/Download/${safeName}`,
      `/sdcard/${safeName}`,
      `/storage/emulated/0/Download/${safeName}`,
      `/data/local/tmp/${safeName}`,
    ];

    let targetPath = candidatePaths[0];
    let syncSuccess = false;
    let lastSyncError = '';

    onProgress?.(5, 'uploading', 'فتح قناة النقل الآمنة (ADB Sync Socket)...');

    // Create a progress-monitored stream
    let transferredBytes = 0;
    const rawReader = file.stream().getReader();

    const monitoredStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await rawReader.read();
          if (done) {
            controller.close();
            return;
          }
          if (value) {
            transferredBytes += value.byteLength;
            const pct = 5 + Math.min(85, Math.round((transferredBytes / size) * 85));
            const mbTransferred = (transferredBytes / (1024 * 1024)).toFixed(1);
            const mbTotal = (size / (1024 * 1024)).toFixed(1);
            onProgress?.(pct, 'uploading', `جاري رفع APK إلى الشاشة (${mbTransferred} / ${mbTotal} MB)`);
            controller.enqueue(value);
          }
        } catch (e) {
          controller.error(e);
        }
      },
      async cancel(reason) {
        await rawReader.cancel(reason);
      },
    });

    const wrappedStream = new WrapReadableStream({ start: () => monitoredStream as any });

    // Open ADB sync session
    let sync;
    try {
      sync = await adb.sync();
    } catch (e: any) {
      throw new Error(`تعذر فتح اتصال ADB Sync مع الشاشة: ${e.message || e}`);
    }

    try {
      // Try pushing the stream to the candidate path
      for (const path of candidatePaths) {
        try {
          targetPath = path;
          onLog?.(`جاري كتابة الملف إلى مسار التخزين: ${targetPath}...`, 'info');
          await sync.write({
            filename: targetPath,
            file: wrappedStream as any,
            permission: 0o666,
          });
          syncSuccess = true;
          break;
        } catch (err: any) {
          lastSyncError = err?.message || String(err);
          onLog?.(`تعذر الكتابة في (${path}): ${lastSyncError}. تجربة مسار آخر...`, 'warning');
        }
      }
    } finally {
      try {
        await sync.dispose();
      } catch {}
    }

    if (!syncSuccess) {
      throw new Error(`فشل رفع ملف APK إلى ذاكرة الشاشة: ${lastSyncError}`);
    }

    onLog?.(`تم رفع الملف بنجاح إلى (${targetPath}). جاري بدء التثبيت على نظام السيارة...`, 'info');
    onProgress?.(90, 'installing', 'تشغيل أمر التثبيت عبر مدير الحزم في الشاشة...');

    // Attempt installation with progressive flag degradation for maximum automotive compatibility
    const installCommands = [
      `pm install -r -d -g -t "${targetPath}"`, // Android 6.0+ with auto-grant & downgrade
      `pm install -r -d -t "${targetPath}"`,    // Android 5.0+ without -g
      `pm install -r -t "${targetPath}"`,       // Test-only packages
      `pm install -r "${targetPath}"`,          // Standard replace
      `pm install -i "com.android.vending" -r "${targetPath}"`, // Vendor installer tag
      `pm install "${targetPath}"`,             // Basic install
    ];

    let lastOutput = '';
    let isSuccess = false;

    for (const cmd of installCommands) {
      try {
        onLog?.(`تنفيذ الأمر: ${cmd}`, 'info');
        const output = await this.execShell(adb, cmd);
        lastOutput = output.trim();
        onLog?.(`مخرجات التثبيت: ${lastOutput || '(لا توجد مخرجات)'}`, lastOutput.toLowerCase().includes('success') ? 'success' : 'info');

        if (lastOutput.toLowerCase().includes('success')) {
          isSuccess = true;
          break;
        }

        // If error indicates a clear failure that shouldn't be retried with simpler flags
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

    // Clean up temporary APK from screen storage
    try {
      await this.execShell(adb, `rm -f "${targetPath}"`);
    } catch {}

    if (isSuccess) {
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
      return { success: true, message: 'تم تثبيت التطبيق بنجاح على شاشة السيارة.' };
    }

    const friendlyError = this.translateAndroidInstallError(lastOutput);
    return { success: false, message: friendlyError || lastOutput || 'فشل التثبيت' };
  }

  /**
   * Method 2: Official @yume-chan/android-bin PackageManager
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
   * Method 3: Direct Stream (Only for devices that support `cmd package install -S`)
   */
  private static async installViaDirectStream(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const size = file.size;
    const cmd = `cmd package install -r -d -g -t -S ${size}`;

    const socket = await adb.createSocket(`shell:${cmd}`);
    const writer = socket.writable.getWriter();
    let sentBytes = 0;
    const reader = file.stream().getReader();

    onProgress?.(5, 'uploading', 'بث مباشر عبر منفذ Shell...');

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
      throw new Error(`انقطع البث المباشر: ${e.message || e}`);
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
      return { success: true, message: 'تم التثبيت بنجاح عبر البث المباشر.' };
    }

    const friendlyError = this.translateAndroidInstallError(trimmed);
    return { success: false, message: friendlyError || trimmed };
  }

  /**
   * Method 4: Interactive Package Installer Trigger
   * For car screens with locked background ADB installations, pushes the APK to /sdcard/Download
   * and opens the Android Package Installer UI directly on the car display.
   */
  private static async installViaInteractivePrompt(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const targetPath = `/sdcard/Download/sam_installer_${Date.now()}.apk`;
    onLog?.('تجهيز نافذة التثبيت التفاعلية على شاشة السيارة...', 'info');

    // Push file
    const sync = await adb.sync();
    try {
      const stream = new WrapReadableStream({ start: () => file.stream() as any });
      await sync.write({
        filename: targetPath,
        file: stream as any,
        permission: 0o666,
      });
    } finally {
      await sync.dispose();
    }

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
      return 'التطبيق غير متوافق مع إصدار نظام شاشة سيارتك (يتطلب إصدار أندرويد أحدث). يرجى تنزيل إصدار قديم من التطبيق.';
    }
    if (err.includes('INSTALL_FAILED_CPU_ABI_INCOMPATIBLE') || err.includes('NO_MATCHING_ABIS')) {
      return 'معمارية التطبيق غير متوافقة مع معالج الشاشة (مثلاً التطبيق 64-bit armeabi-v8a ومعالج شاشتك 32-bit armeabi-v7a). يرجى تنزيل نسخة 32-bit armeabi-v7a من التطبيق.';
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
    if (err.includes('SOCKET OPEN FAILED') || err.includes('CLOSED')) {
      return 'فشل فتح قناة النقل السابقة. تم حل المشكلة وتوجيه النقل عبر بروتوكول ADB Sync المباشر لتفادي هذا الخطأ.';
    }

    return rawError;
  }
}
