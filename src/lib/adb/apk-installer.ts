import { Adb } from '@yume-chan/adb';
import { PushReadableStream, WrapReadableStream } from '@yume-chan/stream-extra';
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

    // Method 1: Explicit 4PDA / SDCard Push & Pipe
    if (preferredMethod === 'sdcard' || preferredMethod === 'sync_tmp') {
      const res = await this.installVia4PdaMethod(adb, file, onProgress, onLog);
      return { ...res, methodUsed: 'sdcard' };
    }

    // Method 2: Direct Shell Stream
    if (preferredMethod === 'stream') {
      try {
        const res = await this.installViaDirectStream(adb, file, onProgress, onLog);
        return { ...res, methodUsed: 'stream' };
      } catch (err: any) {
        onLog?.(`فشل البث المباشر (${err.message || err}). جاري التبديل إلى طريقة 4PDA التلقائية الأكثر استقراراً للشاشات...`, 'warning');
        const fallbackRes = await this.installVia4PdaMethod(adb, file, onProgress, onLog);
        return { ...fallbackRes, methodUsed: 'sdcard' };
      }
    }

    // Method 3: Session
    if (preferredMethod === 'session') {
      try {
        const res = await this.installViaPackageManager(adb, file, onProgress, onLog);
        return { ...res, methodUsed: 'session' };
      } catch (err: any) {
        onLog?.(`فشلت جلسة التثبيت (${err.message || err}). جاري التبديل إلى طريقة 4PDA...`, 'warning');
        const fallbackRes = await this.installVia4PdaMethod(adb, file, onProgress, onLog);
        return { ...fallbackRes, methodUsed: 'sdcard' };
      }
    }

    // Auto Mode (The Proven 4PDA Formula for Desay SV / Jetour T2 / Haval / Geely / Changan):
    // 1. Primary: 4PDA Method (Push to /sdcard/Download + cat app.apk | pm install -S <size>)
    // 2. Secondary: Direct Stream via shell:pm install -S
    // 3. Fallback: PackageManager Stream
    // 4. Fallback: Interactive Car UI Trigger
    onLog?.('الوضع التلقائي (طريقة 4PDA لشاشات السيارات): جاري نقل الـ APK وتثبيته عبر أنابيب cat | pm install -S...', 'info');

    try {
      const res = await this.installVia4PdaMethod(adb, file, onProgress, onLog);
      if (res.success) {
        return { ...res, methodUsed: 'sdcard' };
      }
      onLog?.(`تنبيه: محاولة طريقة 4PDA واجهت (${res.message}). جاري تجربة البث المباشر...`, 'warning');
    } catch (err: any) {
      onLog?.(`تنبيه: ${err.message || err}. جاري تجربة الطريقة البديلة للبث المباشر...`, 'warning');
    }

    // Attempt 2: Direct Shell Stream
    try {
      const res = await this.installViaDirectStream(adb, file, onProgress, onLog);
      if (res.success) {
        return { ...res, methodUsed: 'stream' };
      }
      onLog?.(`تنبيه: فشل البث المباشر (${res.message})...`, 'warning');
    } catch (err: any) {
      onLog?.(`تنبيه: تعذر إكمال البث: ${err.message || err}`, 'warning');
    }

    // Attempt 3: PackageManager
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
   * The 4PDA Method (The Gold Standard for Russian & Chinese Car Head Units):
   * 1. Push APK to /sdcard/Download/app.apk via ADB Sync or chunked shell writer
   * 2. Run `cat /sdcard/Download/app.apk | pm install -i "com.android.vending" -r -d -g -t -S <fileSize>`
   * 3. This completely bypasses SELinux and Automotive storage isolation issues!
   */
  private static async installVia4PdaMethod(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const size = file.size;
    const cleanBaseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = cleanBaseName.endsWith('.apk') ? cleanBaseName : `${cleanBaseName}.apk`;
    const targetPath = `/sdcard/Download/${safeName}`;

    onProgress?.(5, 'uploading', 'بدء نقل ملف APK إلى ذاكرة الشاشة (/sdcard/Download)...');
    onLog?.(`نقل الحزمة إلى مسار التخزين المخصص للسيارة: ${targetPath}...`, 'info');

    // Step 1: Push file using safe chunked sync or shell pipe
    let pushSuccess = false;
    let pushError = '';

    try {
      await this.pushFileSafe(adb, file, targetPath, onProgress, onLog);
      pushSuccess = true;
    } catch (err: any) {
      pushError = err.message || String(err);
      onLog?.(`فشل الرفع عبر بروتوكول Sync: ${pushError}. جاري محاولة الرفع عبر قناة Shell المباشرة...`, 'warning');
      
      // Fallback: Push via chunked shell
      try {
        await this.pushFileViaShell(adb, file, targetPath, onProgress, onLog);
        pushSuccess = true;
      } catch (err2: any) {
        pushError = err2.message || String(err2);
      }
    }

    if (!pushSuccess) {
      throw new Error(`تعذر نقل ملف APK إلى شاشة السيارة: ${pushError}`);
    }

    onLog?.(`تم رفع الملف بنجاح (${(size / (1024 * 1024)).toFixed(1)} MB). جاري تنفيذ أمر تثبيت 4PDA عبر الأنابيب (cat | pm install -S ${size})...`, 'info');
    onProgress?.(90, 'installing', 'تشغيل أمر التثبيت عبر أنابيب Cat PM Install...');

    // Step 2: Run 4PDA cat pipe installation with progressive degradation
    const commandsToTry = [
      `cat "${targetPath}" | pm install -i "com.android.vending" -r -d -g -t -S ${size}`,
      `cat "${targetPath}" | pm install -r -d -g -t -S ${size}`,
      `cat "${targetPath}" | pm install -r -d -t -S ${size}`,
      `cat "${targetPath}" | pm install -r -S ${size}`,
      `cat "${targetPath}" | pm install -S ${size}`,
      `pm install -r -d -g -t "${targetPath}"`,
      `pm install -r -t "${targetPath}"`,
      `pm install -r "${targetPath}"`,
    ];

    let lastOutput = '';
    let isSuccess = false;

    for (const cmd of commandsToTry) {
      try {
        onLog?.(`تنفيذ الأمر: ${cmd}`, 'info');
        const output = await this.execShell(adb, cmd);
        lastOutput = output.trim();
        onLog?.(`مخرجات الشاشة: ${lastOutput || '(لا توجد استجابة)'}`, lastOutput.toLowerCase().includes('success') ? 'success' : 'info');

        if (lastOutput.toLowerCase().includes('success')) {
          isSuccess = true;
          break;
        }

        // Fatal errors that shouldn't be retried with simpler flags
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

    // Step 3: Clean up temporary file from /sdcard/Download
    try {
      await this.execShell(adb, `rm -f "${targetPath}"`);
    } catch {}

    if (isSuccess) {
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
      
      // Auto-grant 4PDA post-install permissions for common packages
      try {
        await this.autoGrant4PdaPermissions(adb, file.name, onLog);
      } catch {}

      return { 
        success: true, 
        message: 'تم تثبيت التطبيق بنجاح على شاشة السيارة عبر بروتوكول 4PDA المباشر.' 
      };
    }

    const friendlyError = this.translateAndroidInstallError(lastOutput);
    return { success: false, message: friendlyError || lastOutput || 'فشل التثبيت' };
  }

  /**
   * Pushes a file to device storage using AdbSync with PushReadableStream & controlled chunk sizes
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
      const stream = new PushReadableStream<Uint8Array>(async (action) => {
        const reader = file.stream().getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              await action.enqueue(value);
              transferredBytes += value.byteLength;
              const pct = 5 + Math.min(85, Math.round((transferredBytes / size) * 85));
              const mbTransferred = (transferredBytes / (1024 * 1024)).toFixed(1);
              const mbTotal = (size / (1024 * 1024)).toFixed(1);
              onProgress?.(pct, 'uploading', `جاري رفع APK إلى الشاشة (${mbTransferred} / ${mbTotal} MB)`);
            }
          }
        } finally {
          reader.releaseLock();
        }
      });

      await sync.write({
        filename: targetPath,
        file: stream as any,
        permission: 0o666,
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

    // Open a shell socket that pipes stdin to targetPath
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
   * Direct Shell Pipe (Zero Storage Required) - streams APK directly into `cmd package install -S` or `pm install -S`
   */
  private static async installViaDirectStream(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const size = file.size;
    const cmd = `pm install -i "com.android.vending" -r -d -g -t -S ${size}`;

    onLog?.(`بدء البث المباشر للشاشة: ${cmd}...`, 'info');
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
        await this.autoGrant4PdaPermissions(adb, file.name, onLog);
      } catch {}
      return { success: true, message: 'تم التثبيت بنجاح عبر البث المباشر.' };
    }

    const friendlyError = this.translateAndroidInstallError(trimmed);
    return { success: false, message: friendlyError || trimmed };
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
    const targetPath = `/sdcard/Download/sam_installer_${Date.now()}.apk`;
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
   * Automatically grants 4PDA recommended permissions for known car applications & stores
   */
  private static async autoGrant4PdaPermissions(
    adb: Adb,
    fileName: string,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<void> {
    const lower = fileName.toLowerCase();

    // RuStore or App Stores
    if (lower.includes('rustore') || lower.includes('store') || lower.includes('market') || lower.includes('aurora')) {
      onLog?.('اكتشاف متجر تطبيقات (RuStore/App Store): جاري تطبيق أذونات تثبيت الحزم والنوافذ المنبثقة تلقائياً (4PDA)...', 'info');
      const pkgs = ['ru.vk.store', 'com.aurora.store', 'com.android.vending'];
      for (const p of pkgs) {
        try {
          await this.execShell(adb, `pm grant ${p} android.permission.REQUEST_INSTALL_PACKAGES`);
          await this.execShell(adb, `pm grant ${p} android.permission.SYSTEM_ALERT_WINDOW`);
          await this.execShell(adb, `appops set ${p} REQUEST_INSTALL_PACKAGES allow`);
          await this.execShell(adb, `appops set ${p} SYSTEM_ALERT_WINDOW allow`);
        } catch {}
      }
    }

    // MacroDroid (Steering wheel controls / T2 / Desay SV)
    if (lower.includes('macro') || lower.includes('droid')) {
      onLog?.('اكتشاف MacroDroid (التحكم من المقود والوسائط): جاري تفعيل أذونات 4PDA الخمسة الكاملة...', 'info');
      const mdPkg = 'com.arlosoft.macrodroid';
      try {
        await this.execShell(adb, `pm grant ${mdPkg} android.permission.CHANGE_CONFIGURATION`);
        await this.execShell(adb, `pm grant ${mdPkg} android.permission.WRITE_SECURE_SETTINGS`);
        await this.execShell(adb, `pm grant ${mdPkg} android.permission.SYSTEM_ALERT_WINDOW`);
        await this.execShell(adb, `pm grant ${mdPkg} android.permission.READ_LOGS`);
        await this.execShell(adb, `dumpsys deviceidle whitelist +${mdPkg}`);
        await this.execShell(adb, `appops set ${mdPkg} SYSTEM_ALERT_WINDOW allow`);
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
    if (!rawError) return 'حدث خطأ غير مححدد أثناء التثبيت.';

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
