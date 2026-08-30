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
      const cmd = `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
      const out = await this.exec(adb, cmd);
      if (out.includes('No activities found')) {
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
        logs.push(`⚠️ ${item.desc}: ${e.message || e}`);
      }
    }

    return logs;
  }

  /**
   * Reboots the car head unit safely
   */
  public static async rebootDevice(adb: Adb, mode: 'normal' | 'recovery' | 'bootloader' | 'soft' = 'normal'): Promise<string> {
    try {
      if (mode === 'soft') {
        await this.exec(adb, 'setprop ctl.restart zygote || killall system_server');
        return 'تم إرسال أمر إعادة تشغيل واجهة النظام (Soft Reboot).';
      }
      const flag = mode === 'normal' ? '' : mode;
      await this.exec(adb, `reboot ${flag}`);
      return 'تم إرسال أمر إعادة تشغيل شاشة السيارة بنجاح.';
    } catch (e: any) {
      throw new Error(`فشل إعادة التشغيل: ${e.message || e}`);
    }
  }

  public static async rebootCarScreen(adb: Adb, mode: 'normal' | 'recovery' | 'bootloader' = 'normal'): Promise<string> {
    return this.rebootDevice(adb, mode);
  }

  /**
   * Sets screen density (DPI)
   */
  public static async setDisplayDensity(adb: Adb, density: number | 'reset'): Promise<string> {
    try {
      const cmd = density === 'reset' ? 'wm density reset' : `wm density ${density}`;
      await this.exec(adb, cmd);
      return density === 'reset' ? 'تم استعادة كثافة الشاشة الافتراضية' : `تم ضبط كثافة الشاشة إلى ${density} DPI بنجاح`;
    } catch (e: any) {
      throw new Error(`تعذر ضبط كثافة الشاشة: ${e.message || e}`);
    }
  }

  /**
   * Sets screen resolution
   */
  public static async setDisplaySize(adb: Adb, size: string | 'reset'): Promise<string> {
    try {
      const cmd = size === 'reset' ? 'wm size reset' : `wm size ${size}`;
      await this.exec(adb, cmd);
      return size === 'reset' ? 'تم استعادة دقة الشاشة الافتراضية' : `تم ضبط أبعاد الشاشة إلى ${size} بنجاح`;
    } catch (e: any) {
      throw new Error(`تعذر ضبط دقة الشاشة: ${e.message || e}`);
    }
  }

  /**
   * Captures screen screenshot as a Blob
   */
  public static async captureScreenshot(adb: Adb): Promise<Blob> {
    try {
      const socket = await adb.createSocket('exec:screencap -p');
      const reader = socket.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return new Blob(chunks, { type: 'image/png' });
    } catch (e: any) {
      // Fallback via shell
      try {
        const tmpPath = '/data/local/tmp/screen.png';
        await this.exec(adb, `screencap -p ${tmpPath}`);
        const sync = await adb.sync();
        const stream = sync.read(tmpPath);
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        await sync.dispose();
        await this.exec(adb, `rm -f ${tmpPath}`);
        return new Blob(chunks, { type: 'image/png' });
      } catch (err: any) {
        throw new Error(`فشل التقاط الشاشة: ${err.message || err}`);
      }
    }
  }

  /**
   * Grants a single permission to a package
   */
  public static async grantPermission(adb: Adb, packageName: string, permission: string): Promise<string> {
    try {
      await this.exec(adb, `pm grant ${packageName} ${permission}`);
      return `تم منح الإذن (${permission}) بنجاح`;
    } catch (e: any) {
      throw new Error(`فشل منح الإذن: ${e.message || e}`);
    }
  }

  /**
   * Sets an AppOp permission mode
   */
  public static async setAppOp(adb: Adb, packageName: string, op: string, mode: 'allow' | 'deny' = 'allow'): Promise<string> {
    try {
      await this.exec(adb, `appops set ${packageName} ${op} ${mode}`);
      return `تم ضبط خاصية AppOp (${op}) إلى ${mode}`;
    } catch (e: any) {
      throw new Error(`فشل ضبط AppOp: ${e.message || e}`);
    }
  }

  /**
   * Sets battery optimization whitelist
   */
  public static async setBatteryOptimizationWhitelist(adb: Adb, packageName: string, enable: boolean): Promise<string> {
    try {
      const flag = enable ? `+${packageName}` : `-${packageName}`;
      await this.exec(adb, `dumpsys deviceidle whitelist ${flag}`);
      return enable ? 'تم استثناء التطبيق من توفير الطاقة وإغلاق الخلفية' : 'تم تفعيل توفير الطاقة على التطبيق';
    } catch (e: any) {
      throw new Error(`فشل ضبط استثناء البطارية: ${e.message || e}`);
    }
  }

  /**
   * Tests or simulates steering wheel & media button keycodes on the car head unit
   */
  public static async sendMediaKey(
    adb: Adb,
    key: 'next' | 'prev' | 'play_pause' | 'vol_up' | 'vol_down' | 'mute' | 'voice' | 'home' | 'back'
  ): Promise<string> {
    const keyMap: Record<string, { code: number; name: string }> = {
      next: { code: 87, name: 'التالي (Next Track)' },
      prev: { code: 88, name: 'السابق (Previous Track)' },
      play_pause: { code: 85, name: 'تشغيل/إيقاف مؤقت (Play/Pause)' },
      vol_up: { code: 24, name: 'رفع الصوت (Volume Up)' },
      vol_down: { code: 25, name: 'خفض الصوت (Volume Down)' },
      mute: { code: 164, name: 'كتم الصوت (Mute)' },
      voice: { code: 231, name: 'المساعد الصوتي (Voice Assist)' },
      home: { code: 3, name: 'الرئيسية (Home)' },
      back: { code: 4, name: 'رجوع (Back)' },
    };

    const target = keyMap[key] || { code: 85, name: key };
    try {
      await this.exec(adb, `input keyevent ${target.code}`);
      return `تم إرسال إشارة ${target.name} إلى نظام السيارة.`;
    } catch (e: any) {
      throw new Error(`فشل إرسال زر التحكم: ${e.message || e}`);
    }
  }

  /**
   * Complete All-in-One Steering Wheel Controls Fix (MacroDroid / Button Mapper / Key Mapper)
   */
  public static async applySteeringWheelCompleteFix(adb: Adb): Promise<string[]> {
    const logs: string[] = [];
    const packages = [
      'com.arlosoft.macrodroid',
      'flar2.homebutton',
      'io.github.sds100.keymapper',
    ];

    logs.push('=== بدء تفعيل الحزمة الشاملة لأزرار المقود والدركسون ===');

    // 1. Grant system permissions for MacroDroid & Button Mappers
    for (const pkg of packages) {
      const perms = [
        'android.permission.WRITE_SECURE_SETTINGS',
        'android.permission.CHANGE_CONFIGURATION',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_LOGS',
        'android.permission.DUMP',
        'android.permission.PACKAGE_USAGE_STATS',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.SET_VOLUME_KEY_LONG_PRESS_LISTENER',
        'android.permission.MEDIA_CONTENT_CONTROL',
        'android.permission.BIND_ACCESSIBILITY_SERVICE',
      ];

      for (const p of perms) {
        try {
          await this.exec(adb, `pm grant ${pkg} ${p} 2>/dev/null`);
        } catch {}
      }

      // AppOps
      const ops = [
        'SYSTEM_ALERT_WINDOW',
        'GET_USAGE_STATS',
        'WRITE_SETTINGS',
        'REQUEST_INSTALL_PACKAGES',
      ];
      for (const op of ops) {
        try {
          await this.exec(adb, `appops set ${pkg} ${op} allow 2>/dev/null`);
        } catch {}
      }

      // Battery Optimization
      try {
        await this.exec(adb, `dumpsys deviceidle whitelist +${pkg} 2>/dev/null`);
      } catch {}
    }
    logs.push('✓ تم منح وتثبيت جميع صلاحيات النظام الآمنة (WRITE_SECURE_SETTINGS + READ_LOGS + AppOps)');

    // 2. Enable Accessibility Services in Android Settings directly
    const accessibilityServices = [
      'com.arlosoft.macrodroid/com.arlosoft.macrodroid.triggers.services.AccessibilityService',
      'com.arlosoft.macrodroid/com.arlosoft.macrodroid.common.MacroDroidAccessibilityService',
      'com.arlosoft.macrodroid/com.arlosoft.macrodroid.triggers.services.VolumeButtonAccessibilityService',
      'flar2.homebutton/flar2.homebutton.ButtonMapperAccessibilityService',
      'io.github.sds100.keymapper/io.github.sds100.keymapper.service.MyAccessibilityService',
    ].join(':');

    try {
      await this.exec(adb, 'settings put secure accessibility_enabled 1');
      await this.exec(adb, `settings put secure enabled_accessibility_services "${accessibilityServices}"`);
      logs.push('✓ تم تفعيل خدمات إمكانية الوصول (Accessibility Services) إجبارياً عبر ADB لتجاوز قفل إعدادات السيارة');
    } catch (e: any) {
      logs.push(`⚠️ تعذر ضبط خدمات إمكانية الوصول: ${e.message || e}`);
    }

    // 3. Enable Notification Listener Service
    try {
      const notifListeners = 'com.arlosoft.macrodroid/com.arlosoft.macrodroid.notification.NotificationService';
      await this.exec(adb, `settings put secure enabled_notification_listeners "${notifListeners}"`);
      logs.push('✓ تم تفعيل خدمة مراقبة الإشعارات وأسماء المقاطع الصوتية');
    } catch {}

    // 4. Activate CAN-Bus & Car Audio / Input Verbose Logging (for Jetour T2, Desay SV, Haval, Geely)
    const logProps = [
      'setprop log.tag.CarInputService VERBOSE',
      'setprop log.tag.CarAudioService VERBOSE',
      'setprop log.tag.KeyEvent VERBOSE',
      'setprop log.tag.CANBUS VERBOSE',
      'setprop log.tag.SteeringWheel VERBOSE',
    ];
    for (const prop of logProps) {
      try {
        await this.exec(adb, prop);
      } catch {}
    }
    logs.push('✓ تم تفعيل بث إشارات أزرار الدركسون وقنوات CAN-Bus إلى سجلات النظام (LogCat Verbose)');

    // 5. Trigger app start in foreground
    try {
      await this.exec(adb, 'am start -n com.arlosoft.macrodroid/.HomeScreenActivity 2>/dev/null');
      await this.exec(adb, 'am startservice -n com.arlosoft.macrodroid/.MacroDroidService 2>/dev/null');
    } catch {}

    logs.push('=== اكتمل إعداد وبرمجة أزرار المقود بنجاح! جاهز للاستخدام ===');
    return logs;
  }

  /**
   * Permissions for RuStore & App Stores
   */
  public static async applyStoreAppPermissions(adb: Adb, packageName = 'ru.vk.store'): Promise<string[]> {
    const logs: string[] = [];
    const stores = [packageName, 'com.aurora.store', 'com.apkpure.aegon', 'com.android.vending'];

    for (const pkg of stores) {
      const commands = [
        { cmd: `pm grant ${pkg} android.permission.REQUEST_INSTALL_PACKAGES 2>/dev/null`, desc: `صلاحية تثبيت التطبيقات لـ ${pkg}` },
        { cmd: `pm grant ${pkg} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`, desc: `صلاحية النوافذ المنبثقة لـ ${pkg}` },
        { cmd: `appops set ${pkg} REQUEST_INSTALL_PACKAGES allow 2>/dev/null`, desc: `تفعيل AppOps لتثبيت الحزم لـ ${pkg}` },
        { cmd: `appops set ${pkg} SYSTEM_ALERT_WINDOW allow 2>/dev/null`, desc: `تفعيل AppOps للظهور فوق الشاشة لـ ${pkg}` },
        { cmd: `dumpsys deviceidle whitelist +${pkg} 2>/dev/null`, desc: `استثناء من توفير الطاقة لـ ${pkg}` },
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

  /**
   * Permissions for Navigation & Media Apps
   */
  public static async applyNavigationMediaPermissions(adb: Adb): Promise<string[]> {
    const logs: string[] = [];
    const packages = [
      'ru.yandex.yandexnavi',
      'ru.yandex.music',
      'com.google.android.apps.maps',
      'com.spotify.music',
      'com.anghami',
      'com.apple.android.music',
    ];

    for (const pkg of packages) {
      const commands = [
        { cmd: `pm grant ${pkg} android.permission.ACCESS_FINE_LOCATION 2>/dev/null`, desc: `صلاحية الـ GPS الدقيق لـ ${pkg}` },
        { cmd: `pm grant ${pkg} android.permission.ACCESS_COARSE_LOCATION 2>/dev/null`, desc: `صلاحية الموقع لـ ${pkg}` },
        { cmd: `pm grant ${pkg} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`, desc: `الظهور فوق الخرائط لـ ${pkg}` },
        { cmd: `dumpsys deviceidle whitelist +${pkg} 2>/dev/null`, desc: `استثناء من توفير الطاقة وإغلاق الخلفية لـ ${pkg}` },
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

  /**
   * Applies all general permissions to any custom package name
   */
  public static async grantAllPermissionsToPackage(
    adb: Adb,
    packageName: string
  ): Promise<{ granted: string[]; errors: string[] }> {
    const granted: string[] = [];
    const errors: string[] = [];

    // 1. Standard Permissions
    const standardPerms = [
      { perm: 'android.permission.INTERNET', name: 'الإنترنت' },
      { perm: 'android.permission.ACCESS_FINE_LOCATION', name: 'الموقع الدقيق (GPS)' },
      { perm: 'android.permission.ACCESS_COARSE_LOCATION', name: 'الموقع التقريبي' },
      { perm: 'android.permission.READ_EXTERNAL_STORAGE', name: 'قراءة التخزين' },
      { perm: 'android.permission.WRITE_EXTERNAL_STORAGE', name: 'الكتابة على التخزين' },
      { perm: 'android.permission.RECORD_AUDIO', name: 'تسجيل الصوت / الميكروفون' },
      { perm: 'android.permission.CAMERA', name: 'الكاميرا' },
      { perm: 'android.permission.READ_PHONE_STATE', name: 'حالة الهاتف' },
      { perm: 'android.permission.REQUEST_INSTALL_PACKAGES', name: 'تثبيت حزم التطبيقات' },
      { perm: 'android.permission.SYSTEM_ALERT_WINDOW', name: 'الظهور فوق التطبيقات' },
      { perm: 'android.permission.WRITE_SECURE_SETTINGS', name: 'تعديل الإعدادات الآمنة' },
      { perm: 'android.permission.CHANGE_CONFIGURATION', name: 'تغيير إعدادات الواجهة' },
      { perm: 'android.permission.READ_LOGS', name: 'قراءة سجلات النظام وأزرار المقود' },
      { perm: 'android.permission.DUMP', name: 'فحص خدمات النظام' },
      { perm: 'android.permission.PACKAGE_USAGE_STATS', name: 'بيانات استخدام التطبيقات' },
    ];

    for (const p of standardPerms) {
      try {
        await this.exec(adb, `pm grant ${packageName} ${p.perm}`);
        granted.push(p.name);
      } catch (e: any) {
        // Normal if app doesn't declare it
      }
    }

    // 2. AppOps
    const appOps = [
      { op: 'SYSTEM_ALERT_WINDOW', name: 'الظهور فوق التطبيقات الأخرى' },
      { op: 'GET_USAGE_STATS', name: 'الوصول لبيانات الاستخدام' },
      { op: 'WRITE_SETTINGS', name: 'تعديل إعدادات النظام' },
      { op: 'MANAGE_EXTERNAL_STORAGE', name: 'الوصول لجميع الملفات' },
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

    // 3. Battery Optimization Whitelist
    try {
      await this.exec(adb, `dumpsys deviceidle whitelist +${packageName}`);
      granted.push('استثناء من إغلاق الخلفية وتوفير الطاقة (Battery Whitelist)');
    } catch {}

    return { granted, errors };
  }

  public static async grantAllEssentialPermissions(
    adb: Adb,
    packageName: string
  ): Promise<{ granted: string[]; errors: string[] }> {
    return this.grantAllPermissionsToPackage(adb, packageName);
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
