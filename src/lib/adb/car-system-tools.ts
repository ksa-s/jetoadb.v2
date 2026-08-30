import { Adb } from '@yume-chan/adb';
import { InstalledApp } from '../../types';

export class CarSystemTools {
  /**
   * Lists installed apps (3rd party or system)
   */
  public static async getInstalledApps(adb: Adb, thirdPartyOnly = true): Promise<InstalledApp[]> {
    try {
      const flag = thirdPartyOnly ? '-3' : '';
      const cmd = `pm list packages ${flag}`;
      const output = await this.exec(adb, cmd);

      const lines = output.split('\n');
      const apps: InstalledApp[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('package:')) {
          const packageName = trimmed.replace('package:', '').trim();
          if (packageName) {
            apps.push({
              packageName,
              isSystem: !thirdPartyOnly,
            });
          }
        }
      }

      return apps;
    } catch (e: any) {
      throw new Error(`تعذر جلب قائمة التطبيقات: ${e.message || e}`);
    }
  }

  /**
   * Launches an app on the car screen
   */
  public static async launchApp(adb: Adb, packageName: string): Promise<string> {
    try {
      // Use monkey tool to launch default intent
      const cmd = `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
      const out = await this.exec(adb, cmd);
      if (out.includes('No activities found')) {
        // Fallback: try am start
        return await this.exec(adb, `am start ${packageName}`);
      }
      return 'تم إرسال أمر تشغيل التطبيق إلى الشاشة.';
    } catch (e: any) {
      throw new Error(`تعذر تشغيل التطبيق: ${e.message || e}`);
    }
  }

  /**
   * Uninstalls an app from the car screen
   */
  public static async uninstallApp(adb: Adb, packageName: string): Promise<string> {
    try {
      const out = await this.exec(adb, `pm uninstall ${packageName}`);
      if (out.toLowerCase().includes('success')) {
        return `تم حذف التطبيق (${packageName}) بنجاح من الشاشة.`;
      }
      throw new Error(out);
    } catch (e: any) {
      throw new Error(`فشل حذف التطبيق: ${e.message || e}`);
    }
  }

  /**
   * Clears app cache and data
   */
  public static async clearAppData(adb: Adb, packageName: string): Promise<string> {
    try {
      const out = await this.exec(adb, `pm clear ${packageName}`);
      if (out.toLowerCase().includes('success')) {
        return `تم مسح بيانات التطبيق (${packageName}) بنجاح.`;
      }
      throw new Error(out);
    } catch (e: any) {
      throw new Error(`تعذر مسح بيانات التطبيق: ${e.message || e}`);
    }
  }

  /**
   * Optimizes car head unit for sideloading & unlocks unknown app installs
   */
  public static async unlockCarSideloading(adb: Adb): Promise<string[]> {
    const logs: string[] = [];
    const commands = [
      { cmd: 'settings put secure install_non_market_apps 1', desc: 'تفعيل تثبيت التطبيقات من مصادر خارجية' },
      { cmd: 'settings put global package_verifier_enable 0', desc: 'تعطيل فاحص الحزم الأمني للتثبيت السريع' },
      { cmd: 'settings put global verifier_verify_adb_installs 0', desc: 'تعطيل تدقيق حزم ADB' },
      { cmd: 'settings put global stay_on_while_plugged_in 3', desc: 'إبقاء شاشة السيارة مضاءة أثناء التوصيل' },
    ];

    for (const item of commands) {
      try {
        await this.exec(adb, item.cmd);
        logs.push(`✓ ${item.desc}`);
      } catch (e: any) {
        logs.push(`⚠️ تعذر تطبيق: ${item.desc} (${e.message || e})`);
      }
    }

    return logs;
  }

  /**
   * Adjusts screen density (DPI) for widescreen car displays
   */
  public static async setDisplayDensity(adb: Adb, density: number | 'reset'): Promise<string> {
    try {
      const cmd = density === 'reset' ? 'wm density reset' : `wm density ${density}`;
      await this.exec(adb, cmd);
      return density === 'reset' ? 'تمت استعادة الكثافة الافتراضية للشاشة' : `تم ضبط كثافة الشاشة إلى ${density} DPI`;
    } catch (e: any) {
      throw new Error(`فشل تغيير كثافة الشاشة: ${e.message || e}`);
    }
  }

  /**
   * Adjusts screen resolution
   */
  public static async setDisplaySize(adb: Adb, size: string | 'reset'): Promise<string> {
    try {
      const cmd = size === 'reset' ? 'wm size reset' : `wm size ${size}`;
      await this.exec(adb, cmd);
      return size === 'reset' ? 'تمت استعادة الدقة الافتراضية للشاشة' : `تم ضبط دقة الشاشة إلى ${size}`;
    } catch (e: any) {
      throw new Error(`فشل تغيير دقة الشاشة: ${e.message || e}`);
    }
  }

  /**
   * Reboots the car screen system
   */
  public static async rebootDevice(adb: Adb, mode: 'normal' | 'recovery' | 'soft'): Promise<string> {
    try {
      if (mode === 'soft') {
        await this.exec(adb, 'setprop ctl.restart zygote');
        return 'جاري إعادة تشغيل واجهة النظام (Soft Reboot)...';
      }
      if (mode === 'recovery') {
        await this.exec(adb, 'reboot recovery');
        return 'جاري إعادة التشغيل إلى وضع الريكفري (Recovery)...';
      }
      await this.exec(adb, 'reboot');
      return 'جاري إعادة تشغيل شاشة السيارة...';
    } catch (e: any) {
      throw new Error(`فشل أمر إعادة التشغيل: ${e.message || e}`);
    }
  }

  /**
   * Takes screenshot from device using standard shell and sync
   */
  public static async captureScreenshot(adb: Adb): Promise<Blob> {
    const tempFile = `/sdcard/sam_screenshot_${Date.now()}.png`;
    try {
      // Step 1: Capture screenshot to temp file on car head unit
      await this.exec(adb, `screencap -p "${tempFile}"`);

      // Step 2: Read image via ADB sync
      const sync = await adb.sync();
      const chunks: Uint8Array[] = [];
      try {
        const stream = sync.read(tempFile);
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
      } finally {
        await sync.dispose();
      }

      // Step 3: Delete temp file
      try {
        await this.exec(adb, `rm -f "${tempFile}"`);
      } catch {}

      if (chunks.length === 0) {
        throw new Error('لم يتم استلام أي بيانات للصورة.');
      }

      return new Blob(chunks, { type: 'image/png' });
    } catch (e: any) {
      // Clean up in case of error
      try {
        await this.exec(adb, `rm -f "${tempFile}"`);
      } catch {}
      throw new Error(`تعذر التقاط لقطة الشاشة: ${e.message || e}`);
    }
  }

  /**
   * Grants a runtime permission to a package via pm grant
   */
  public static async grantPermission(adb: Adb, packageName: string, permission: string): Promise<string> {
    try {
      const out = await this.exec(adb, `pm grant ${packageName} ${permission}`);
      if (out && (out.includes('SecurityException') || out.includes('not a runtime permission') || out.includes('Unknown package'))) {
        throw new Error(out);
      }
      return `تم منح الإذن (${permission}) بنجاح.`;
    } catch (e: any) {
      throw new Error(`فشل منح الإذن: ${e.message || e}`);
    }
  }

  /**
   * Revokes a runtime permission from a package
   */
  public static async revokePermission(adb: Adb, packageName: string, permission: string): Promise<string> {
    try {
      const out = await this.exec(adb, `pm revoke ${packageName} ${permission}`);
      if (out && (out.includes('SecurityException') || out.includes('Unknown package'))) {
        throw new Error(out);
      }
      return `تم سحب الإذن (${permission}) بنجاح.`;
    } catch (e: any) {
      throw new Error(`فشل سحب الإذن: ${e.message || e}`);
    }
  }

  /**
   * Sets AppOps permission mode (SYSTEM_ALERT_WINDOW, GET_USAGE_STATS, etc.)
   */
  public static async setAppOp(
    adb: Adb,
    packageName: string,
    opName: string,
    mode: 'allow' | 'deny' | 'ignore' | 'default' = 'allow'
  ): Promise<string> {
    try {
      const out = await this.exec(adb, `appops set ${packageName} ${opName} ${mode}`);
      if (out && out.includes('Error')) {
        throw new Error(out);
      }
      return `تم ضبط تصريح (${opName}) إلى (${mode}) بنجاح.`;
    } catch (e: any) {
      throw new Error(`فشل ضبط AppOps: ${e.message || e}`);
    }
  }

  /**
   * Whitelists an app from battery optimizations (keep running in car background)
   */
  public static async setBatteryOptimizationWhitelist(adb: Adb, packageName: string, enable: boolean = true): Promise<string> {
    try {
      const flag = enable ? `+${packageName}` : `-${packageName}`;
      const out = await this.exec(adb, `dumpsys deviceidle whitelist ${flag}`);
      return enable
        ? `تم استثناء التطبيق (${packageName}) من توفير الطاقة وإبقاؤه نشطاً في الخلفية.`
        : `تمت إزالة التطبيق (${packageName}) من قائمة الاستثناء من توفير الطاقة.`;
    } catch (e: any) {
      throw new Error(`فشل ضبط استثناء البطارية: ${e.message || e}`);
    }
  }

  /**
   * Grants all standard and special permissions required by Car Launchers and Navigation apps
   */
  public static async grantAllEssentialPermissions(
    adb: Adb,
    packageName: string
  ): Promise<{ granted: string[]; errors: string[] }> {
    const granted: string[] = [];
    const errors: string[] = [];

    // 1. Runtime Permissions
    const runtimePermissions = [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.RECORD_AUDIO',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.READ_PHONE_STATE',
      'android.permission.CALL_PHONE',
      'android.permission.CAMERA',
    ];

    for (const perm of runtimePermissions) {
      try {
        await this.exec(adb, `pm grant ${packageName} ${perm}`);
        granted.push(perm);
      } catch (e: any) {
        // Not all apps request all permissions
      }
    }

    // 2. Special AppOps
    const appOps = [
      { op: 'SYSTEM_ALERT_WINDOW', name: 'الظهور فوق التطبيقات الأخرى' },
      { op: 'GET_USAGE_STATS', name: 'الوصول لبيانات الاستخدام' },
      { op: 'WRITE_SETTINGS', name: 'تعديل إعدادات النظام' },
      { op: 'MANAGE_EXTERNAL_STORAGE', name: 'الوصول لجميع الملفات' },
      { op: 'PICTURE_IN_PICTURE', name: 'نافذة صورة داخل صورة' },
      { op: 'REQUEST_INSTALL_PACKAGES', name: 'تثبيت حزم التطبيقات' },
    ];

    for (const opItem of appOps) {
      try {
        await this.exec(adb, `appops set ${packageName} ${opItem.op} allow`);
        granted.push(opItem.name);
      } catch (e: any) {
        errors.push(`${opItem.name}: ${e.message || e}`);
      }
    }

    // 3. WRITE_SECURE_SETTINGS & DUMP
    const systemPerms = [
      'android.permission.WRITE_SECURE_SETTINGS',
      'android.permission.DUMP',
      'android.permission.PACKAGE_USAGE_STATS',
      'android.permission.CHANGE_CONFIGURATION',
    ];

    for (const sp of systemPerms) {
      try {
        await this.exec(adb, `pm grant ${packageName} ${sp}`);
        granted.push(sp);
      } catch (e: any) {
        // Some systems might restrict some
      }
    }

    // 4. Battery Optimization Whitelist
    try {
      await this.exec(adb, `dumpsys deviceidle whitelist +${packageName}`);
      granted.push('استثناء من إغلاق الخلفية وتوفير الطاقة (Battery Whitelist)');
    } catch {}

    return { granted, errors };
  }

  /**
   * Retrieves granted permissions for a given package
   */
  public static async getPackageGrantedPermissions(adb: Adb, packageName: string): Promise<string[]> {
    try {
      const out = await this.exec(adb, `dumpsys package ${packageName}`);
      const granted: string[] = [];
      const lines = out.split('\n');
      let inGrantedSection = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('grantedPermissions:')) {
          inGrantedSection = true;
          continue;
        }
        if (inGrantedSection) {
          if (trimmed.startsWith('android.permission.') || trimmed.startsWith('com.')) {
            granted.push(trimmed);
          } else if (trimmed.includes(':') && !trimmed.startsWith('android.')) {
            inGrantedSection = false;
          }
        }
      }

      return granted;
    } catch {
      return [];
    }
  }

  /**
   * 4PDA Russian Forum Fix: Full permission set for MacroDroid (Steering wheel controls, music switching, T2/Desay SV)
   */
  public static async apply4PdaMacroDroidFix(adb: Adb): Promise<string[]> {
    const logs: string[] = [];
    const pkg = 'com.arlosoft.macrodroid';
    const commands = [
      { cmd: `pm grant ${pkg} android.permission.CHANGE_CONFIGURATION`, desc: 'تغيير إعدادات الواجهة (CHANGE_CONFIGURATION)' },
      { cmd: `pm grant ${pkg} android.permission.WRITE_SECURE_SETTINGS`, desc: 'تعديل إعدادات النظام الآمنة (WRITE_SECURE_SETTINGS)' },
      { cmd: `pm grant ${pkg} android.permission.SYSTEM_ALERT_WINDOW`, desc: 'الظهور فوق الشاشة (SYSTEM_ALERT_WINDOW)' },
      { cmd: `pm grant ${pkg} android.permission.READ_LOGS`, desc: 'قراءة سجلات أزرار المقود LogCat (READ_LOGS)' },
      { cmd: `appops set ${pkg} SYSTEM_ALERT_WINDOW allow`, desc: 'تصريح AppOps للنوافذ العائمة' },
      { cmd: `dumpsys deviceidle whitelist +${pkg}`, desc: 'استثناء من توفير الطاقة وإبقاء الخدمة نشطة بالخلفية' },
    ];

    for (const item of commands) {
      try {
        await this.exec(adb, item.cmd);
        logs.push(`✓ ${item.desc}`);
      } catch (e: any) {
        logs.push(`⚠️ ${item.desc}: ${e.message || e}`);
      }
    }
    return logs;
  }

  /**
   * 4PDA Russian Forum Fix: Permissions for RuStore & App Stores (Install unknown apps + Overlays)
   */
  public static async apply4PdaStoreFix(adb: Adb, packageName = 'ru.vk.store'): Promise<string[]> {
    const logs: string[] = [];
    const commands = [
      { cmd: `pm grant ${packageName} android.permission.REQUEST_INSTALL_PACKAGES`, desc: 'صلاحية تثبيت التطبيقات (REQUEST_INSTALL_PACKAGES)' },
      { cmd: `pm grant ${packageName} android.permission.SYSTEM_ALERT_WINDOW`, desc: 'صلاحية النوافذ المنبثقة (SYSTEM_ALERT_WINDOW)' },
      { cmd: `appops set ${packageName} REQUEST_INSTALL_PACKAGES allow`, desc: 'تفعيل AppOps لتثبيت الحزم' },
      { cmd: `appops set ${packageName} SYSTEM_ALERT_WINDOW allow`, desc: 'تفعيل AppOps للظهور فوق التطبيقات' },
      { cmd: `dumpsys deviceidle whitelist +${packageName}`, desc: 'استثناء المتجر من توفير الطاقة' },
    ];

    for (const item of commands) {
      try {
        await this.exec(adb, item.cmd);
        logs.push(`✓ ${item.desc}`);
      } catch (e: any) {
        logs.push(`⚠️ ${item.desc}: ${e.message || e}`);
      }
    }
    return logs;
  }

  /**
   * 4PDA Russian Forum Fix: Permissions for Yandex Navi & Music (GPS, overlay, battery)
   */
  public static async apply4PdaYandexFix(adb: Adb): Promise<string[]> {
    const logs: string[] = [];
    const packages = ['ru.yandex.yandexnavi', 'ru.yandex.music'];

    for (const pkg of packages) {
      const commands = [
        { cmd: `pm grant ${pkg} android.permission.ACCESS_FINE_LOCATION`, desc: `صلاحية الـ GPS الدقيق لـ ${pkg}` },
        { cmd: `pm grant ${pkg} android.permission.ACCESS_COARSE_LOCATION`, desc: `صلاحية تحديد الموقع لـ ${pkg}` },
        { cmd: `pm grant ${pkg} android.permission.SYSTEM_ALERT_WINDOW`, desc: `الظهور فوق الخرائط لـ ${pkg}` },
        { cmd: `dumpsys deviceidle whitelist +${pkg}`, desc: `استثناء من توفير الطاقة لـ ${pkg}` },
      ];

      for (const item of commands) {
        try {
          await this.exec(adb, item.cmd);
          logs.push(`✓ ${item.desc}`);
        } catch (e: any) {
          logs.push(`⚠️ ${item.desc}: ${e.message || e}`);
        }
      }
    }
    return logs;
  }

  private static async exec(adb: Adb, command: string): Promise<string> {
    try {
      const socket = await adb.createSocket(`shell:${command}`);
      const reader = socket.readable.getReader();
      const decoder = new TextDecoder();
      let output = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) output += decoder.decode(value, { stream: true });
      }
      output += decoder.decode();
      return output.trim();
    } catch (e: any) {
      throw new Error(`خطأ تنفيذ: ${e.message || e}`);
    }
  }
}
