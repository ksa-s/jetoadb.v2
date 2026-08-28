import { Adb } from '@yume-chan/adb';
import { InstallMethod, ApkItem } from '../../types';

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

    // If preferred method is specific, try only that method
    if (preferredMethod === 'stream') {
      const res = await this.installViaDirectStream(adb, file, onProgress, onLog);
      return { ...res, methodUsed: 'stream' };
    }
    if (preferredMethod === 'session') {
      const res = await this.installViaSession(adb, file, onProgress, onLog);
      return { ...res, methodUsed: 'session' };
    }
    if (preferredMethod === 'sdcard') {
      const res = await this.installViaSdCard(adb, file, onProgress, onLog);
      return { ...res, methodUsed: 'sdcard' };
    }

    // Auto Mode: Try Direct Stream -> then Session Stream -> then SDCard Storage
    onLog?.('الوضع التلقائي: محاولة التثبيت المباشر عبر البث السريع (Direct Stream Install)...', 'info');
    try {
      const res = await this.installViaDirectStream(adb, file, onProgress, onLog);
      if (res.success) {
        return { ...res, methodUsed: 'stream' };
      }
      onLog?.(`تنبيه: فشلت طريقة البث المباشر (${res.message}). جاري الانتقال للطريقة البديلة (جلسة التثبيت Session)...`, 'warning');
    } catch (err: any) {
      onLog?.(`تنبيه: تعذر البث المباشر: ${err.message || err}. جاري تجربة طريقة جلسة التثبيت...`, 'warning');
    }

    // Attempt 2: Session streaming
    try {
      const res = await this.installViaSession(adb, file, onProgress, onLog);
      if (res.success) {
        return { ...res, methodUsed: 'session' };
      }
      onLog?.(`تنبيه: فشلت طريقة الجلسة (${res.message}). جاري الانتقال لطريقة وحدة التخزين SDCard...`, 'warning');
    } catch (err: any) {
      onLog?.(`تنبيه: فشلت جلسة التثبيت: ${err.message || err}. جاري تجربة التثبيت عبر ذاكرة الشاشة SDCard...`, 'warning');
    }

    // Attempt 3: SDCard Storage
    try {
      const res = await this.installViaSdCard(adb, file, onProgress, onLog);
      return { ...res, methodUsed: 'sdcard' };
    } catch (err: any) {
      throw new Error(`فشلت جميع طرق التثبيت. سبب الخطأ الأخير: ${err.message || err}`);
    }
  }

  /**
   * Method 1: Direct Stream Install via `cmd package install -S <size>` or `pm install -S <size>`
   * Directly pipes the APK binary into package manager stdin.
   * Completely avoids `/data/local/tmp` and `sync:` socket failure!
   */
  private static async installViaDirectStream(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const size = file.size;
    // Flags: -r (reinstall), -d (downgrade), -g (grant permissions), -t (test packages), -S <size> (stream from stdin)
    const cmd = `cmd package install -r -d -g -t -S ${size}`;
    const fallbackCmd = `pm install -r -d -g -t -S ${size}`;

    let socket;
    try {
      socket = await adb.createSocket(`exec:${cmd}`);
    } catch {
      try {
        socket = await adb.createSocket(`exec:${fallbackCmd}`);
      } catch (e: any) {
        throw new Error(`تعذر فتح قناة البث المباشر (exec socket): ${e.message || e}`);
      }
    }

    onProgress?.(0, 'uploading', 'جاري بث ملف التطبيق مباشرة إلى مدير الحزم...');

    // Pipe file into socket writable
    const writer = socket.writable.getWriter();
    const chunkSize = 128 * 1024; // 128KB chunks for high throughput & stability
    let sentBytes = 0;

    try {
      const reader = file.stream().getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          await writer.write(value);
          sentBytes += value.byteLength;
          const pct = Math.min(99, Math.round((sentBytes / size) * 100));
          onProgress?.(pct, 'uploading', `جاري الإرسال (${(sentBytes / 1024 / 1024).toFixed(1)} / ${(size / 1024 / 1024).toFixed(1)} MB)`);
        }
      }
      await writer.close();
    } catch (e: any) {
      try { await writer.abort(e); } catch {}
      throw new Error(`انقطع إرسال البيانات أثناء البث: ${e.message || e}`);
    }

    onProgress?.(99, 'installing', 'جاري فحص وتثبيت التطبيق على نظام السيارة...');

    // Read result from socket readable
    const decoder = new TextDecoder();
    const socketReader = socket.readable.getReader();
    let output = '';

    try {
      while (true) {
        const { done, value } = await socketReader.read();
        if (done) break;
        if (value) {
          output += decoder.decode(value, { stream: true });
        }
      }
      output += decoder.decode();
    } catch (e: any) {
      throw new Error(`خطأ أثناء قراءة نتيجة التثبيت: ${e.message || e}`);
    }

    const trimmedOutput = output.trim();
    if (trimmedOutput.toLowerCase().includes('success')) {
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
      return { success: true, message: 'تم تثبيت التطبيق بنجاح عبر البث المباشر.' };
    }

    const friendlyError = this.translateAndroidInstallError(trimmedOutput);
    return { success: false, message: friendlyError || trimmedOutput || 'فشل التثبيت دون رسالة محددة' };
  }

  /**
   * Method 2: Package Installer Session Streaming
   * `cmd package install-create` -> `install-write` -> `install-commit`
   */
  private static async installViaSession(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const size = file.size;

    // Step 1: Create Session
    onProgress?.(5, 'processing', 'إنشاء جلسة تثبيت جديدة...');
    let createOut = '';
    try {
      createOut = await this.execCommand(adb, `cmd package install-create -r -d -g -t -S ${size}`);
    } catch {
      createOut = await this.execCommand(adb, `pm install-create -r -d -g -t -S ${size}`);
    }

    const sessionMatch = createOut.match(/\[(\d+)\]/);
    if (!sessionMatch) {
      throw new Error(`تعذر إنشاء جلسة التثبيت: ${createOut}`);
    }
    const sessionId = sessionMatch[1];
    onLog?.(`تم إنشاء جلسة التثبيت رقم: ${sessionId}`, 'info');

    // Step 2: Write APK stream into Session
    try {
      const writeCmd = `cmd package install-write -S ${size} ${sessionId} base.apk -`;
      let writeSocket;
      try {
        writeSocket = await adb.createSocket(`exec:${writeCmd}`);
      } catch {
        writeSocket = await adb.createSocket(`exec:pm install-write -S ${size} ${sessionId} base.apk -`);
      }

      const writer = writeSocket.writable.getWriter();
      let sentBytes = 0;
      const reader = file.stream().getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          await writer.write(value);
          sentBytes += value.byteLength;
          const pct = 5 + Math.min(85, Math.round((sentBytes / size) * 85));
          onProgress?.(pct, 'uploading', `كتابة بيانات الجلسة (${(sentBytes / 1024 / 1024).toFixed(1)} MB)`);
        }
      }
      await writer.close();

      // Read write response
      const writeReader = writeSocket.readable.getReader();
      let writeRes = '';
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await writeReader.read();
        if (done) break;
        if (value) writeRes += dec.decode(value);
      }

      if (writeRes && !writeRes.toLowerCase().includes('success') && writeRes.toLowerCase().includes('failure')) {
        throw new Error(`فشلت كتابة الجلسة: ${writeRes}`);
      }

      // Step 3: Commit Session
      onProgress?.(92, 'installing', 'اعتماد وتثبيت الجلسة على النظام...');
      let commitOut = '';
      try {
        commitOut = await this.execCommand(adb, `cmd package install-commit ${sessionId}`);
      } catch {
        commitOut = await this.execCommand(adb, `pm install-commit ${sessionId}`);
      }

      if (commitOut.toLowerCase().includes('success')) {
        onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
        return { success: true, message: 'تم تثبيت التطبيق بنجاح عبر جلسة التثبيت.' };
      }

      const friendlyError = this.translateAndroidInstallError(commitOut);
      return { success: false, message: friendlyError || commitOut };
    } catch (e: any) {
      // Try to abandon session if failed
      try {
        await this.execCommand(adb, `cmd package install-abandon ${sessionId}`);
      } catch {}
      throw e;
    }
  }

  /**
   * Method 3: SDCard Storage fallback
   * Writes the APK to `/sdcard/Download/app_temp.apk` (which has full user permissions),
   * installs from there with `pm install`, then removes the temporary file.
   */
  private static async installViaSdCard(
    adb: Adb,
    file: File,
    onProgress?: InstallProgressCallback,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string }> {
    const size = file.size;
    const safeName = `sam_app_${Date.now()}.apk`;
    const targetPath = `/sdcard/Download/${safeName}`;

    onLog?.(`جاري نسخ الملف إلى الذاكرة العامة (${targetPath})...`, 'info');
    onProgress?.(10, 'uploading', 'كتابة ملف APK إلى مجلد التنزيلات في الشاشة...');

    // Create a write stream via shell pipe: cat > /sdcard/Download/...
    const socket = await adb.createSocket(`exec:cat > "${targetPath}"`);
    const writer = socket.writable.getWriter();
    let sentBytes = 0;
    const reader = file.stream().getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          await writer.write(value);
          sentBytes += value.byteLength;
          const pct = 10 + Math.min(75, Math.round((sentBytes / size) * 75));
          onProgress?.(pct, 'uploading', `نسخ إلى الذاكرة (${(sentBytes / 1024 / 1024).toFixed(1)} MB)`);
        }
      }
      await writer.close();
    } catch (err: any) {
      try { await writer.abort(err); } catch {}
      throw new Error(`تعذر كتابة الملف إلى الذاكرة: ${err.message || err}`);
    }

    onProgress?.(88, 'installing', 'تشغيل أمر التثبيت من الذاكرة...');
    
    // Run pm install
    const installCmd = `pm install -r -d -g -t "${targetPath}"`;
    const installOutput = await this.execCommand(adb, installCmd);

    // Clean up temporary file
    try {
      await this.execCommand(adb, `rm -f "${targetPath}"`);
    } catch {}

    if (installOutput.toLowerCase().includes('success')) {
      onProgress?.(100, 'processing', 'تم التثبيت بنجاح');
      return { success: true, message: 'تم تثبيت التطبيق بنجاح عبر التخزين الداخلي.' };
    }

    const friendlyError = this.translateAndroidInstallError(installOutput);
    return { success: false, message: friendlyError || installOutput };
  }

  /**
   * Helper to execute a command and return string output
   */
  private static async execCommand(adb: Adb, command: string): Promise<string> {
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
      throw new Error(`خطأ في تنفيذ الأمر (${command}): ${e.message || e}`);
    }
  }

  /**
   * Translates Android `INSTALL_FAILED_*` errors into clear Arabic explanations with fix advice
   */
  public static translateAndroidInstallError(rawError: string): string {
    if (!rawError) return 'حدث خطأ غير معروف أثناء التثبيت.';

    const err = rawError.toUpperCase();

    if (err.includes('INSTALL_FAILED_ALREADY_EXISTS') || err.includes('UPDATE_INCOMPATIBLE')) {
      return 'توجد نسخة سابقة مثبتة بتوقيع مختلف (Signature Mismatch). الحل: قم بحذف التطبيق القديم من الشاشة أولاً ثم أعد التثبيت.';
    }
    if (err.includes('INSTALL_FAILED_VERSION_DOWNGRADE')) {
      return 'لا يمكن تثبيت إصدار أقدم من الإصدار الحالي. قم بحذف التطبيق المثبت أولاً.';
    }
    if (err.includes('INSTALL_FAILED_INVALID_APK') || err.includes('INSTALL_PARSE_FAILED_NOT_APK')) {
      return 'ملف الـ APK تالف أو غير مكتمل التنزيل. يرجى إعادة تنزيل الملف.';
    }
    if (err.includes('INSTALL_FAILED_OLDER_SDK') || err.includes('INSTALL_PARSE_FAILED_MIN_SDK')) {
      return 'التطبيق يتطلب إصدار أندرويد أحدث من نظام شاشة السيارة الحالية.';
    }
    if (err.includes('INSTALL_FAILED_CPU_ABI_INCOMPATIBLE') || err.includes('NO_MATCHING_ABIS')) {
      return 'معمارية التطبيق غير متوافقة مع معالج الشاشة (مثلاً التطبيق 64-bit وشاشة السيارة تدعم 32-bit فقط armeabi-v7a). يرجى تنزيل نسخة 32-bit من التطبيق.';
    }
    if (err.includes('INSTALL_FAILED_INSUFFICIENT_STORAGE')) {
      return 'مساحة تخزين شاشة السيارة ممتلئة. يرجى حذف بعض الملفات أو التطبيقات القديمة لتوفير مساحة.';
    }
    if (err.includes('INSTALL_FAILED_TEST_ONLY')) {
      return 'التطبيق مخصص للاختبار (Test Only)، تم تفعيل خيار -t لتجاوزه.';
    }
    if (err.includes('INSTALL_FAILED_USER_RESTRICTED')) {
      return 'نظام السيارة مقيد من الشركة المصنعة لمنع تثبيت التطبيقات غير المصرح بها (User Restricted).';
    }
    if (err.includes('INSTALL_FAILED_VERIFICATION_FAILURE') || err.includes('VERIFICATION_TIMEOUT')) {
      return 'فشلت أداة التحقق من الحزم في الشاشة. يمكنك تعطيل أداة التحقق من قسم أدوات السيارة.';
    }
    if (err.includes('INSTALL_FAILED_SESSION_INVALID')) {
      return 'جلسة التثبيت غير صالحة أو انتهت مدتها. يرجى المحاولة مرة أخرى.';
    }
    if (err.includes('SOCKET OPEN FAILED') || err.includes('CLOSED')) {
      return 'فشل فتح قناة النقل (Socket open failed) بسبب إغلاق المنفذ أو تعليق قناة USB. تم تجهيز النظام لإعادة الإرسال عبر البث المباشر وتفادي مجلد tmp.';
    }

    return rawError;
  }
}
