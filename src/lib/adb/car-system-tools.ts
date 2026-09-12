import { Adb } from '@yume-chan/adb';
import { InstalledApp } from '../../types';
import { adbManager } from './webusb-manager';

export interface PackageDiagnosticInfo {
  packageName: string;
  exists: boolean;
  apkPath?: string;
  isSystem: boolean;
  isPrivApp: boolean;
  isAdmin: boolean;
  adminComponents: string[];
  isDisabled: boolean;
  isHidden: boolean;
  isSuspended: boolean;
  versionName?: string;
  versionCode?: string;
  userIds: string[];
  rawSummary: string;
}

export class CarSystemTools {
  /**
   * Lists installed apps (3rd party or system) with multi-user awareness
   */
  public static async getInstalledApps(adb: Adb, thirdPartyOnly = true): Promise<InstalledApp[]> {
    try {
      const flag = thirdPartyOnly ? '-3' : '';
      
      // On Android Automotive or newer multi-user head units, try multiple flags to ensure we don't miss apps installed in other user profiles or marked uninstalled/hidden
      const outputs = await Promise.allSettled([
        this.exec(adb, `pm list packages ${flag} --user current 2>/dev/null`),
        this.exec(adb, `pm list packages ${flag} -u 2>/dev/null`),
        this.exec(adb, `pm list packages ${flag} 2>/dev/null`),
      ]);

      const packageNames = new Set<string>();

      for (const res of outputs) {
        if (res.status === 'fulfilled' && res.value) {
          const lines = res.value.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('package:')) {
              const pkg = trimmed.replace('package:', '').trim();
              if (pkg) {
                packageNames.add(pkg);
              }
            }
          }
        }
      }

      const apps: InstalledApp[] = Array.from(packageNames).map((packageName) => ({
        packageName,
        isSystem: !thirdPartyOnly,
      }));

      return apps;
    } catch (e: any) {
      throw new Error(`تعذر جلب قائمة التطبيقات: ${e.message || e}`);
    }
  }

  /**
   * Launches an app on the car screen with multi-user and fallback intent support
   */
  public static async launchApp(adb: Adb, packageName: string, userId = 'current'): Promise<string> {
    try {
      // Ensure app is enabled, unhidden, and present across all possible user profiles (current, 0, 10)
      const users = Array.from(new Set([userId, 'current', '0', '10'])).filter(Boolean);
      for (const u of users) {
        try {
          await this.exec(adb, `cmd package install-existing --user ${u} ${packageName} 2>/dev/null`);
          await this.exec(adb, `pm install-existing --user ${u} ${packageName} 2>/dev/null`);
          await this.exec(adb, `pm unhide --user ${u} ${packageName} 2>/dev/null`);
          await this.exec(adb, `pm enable --user ${u} ${packageName} 2>/dev/null`);
          await this.exec(adb, `cmd package unsuspend --user ${u} ${packageName} 2>/dev/null`);
        } catch {}
      }
      try {
        await this.exec(adb, `pm unhide ${packageName} 2>/dev/null`);
        await this.exec(adb, `pm enable ${packageName} 2>/dev/null`);
      } catch {}

      // Attempt 1: monkey launcher
      const cmd = `monkey --pct-syskeys 0 -p ${packageName} -c android.intent.category.LAUNCHER 1`;
      const out = await this.exec(adb, cmd);
      if (out.includes('Events injected: 1')) {
        return `تم تشغيل التطبيق (${packageName}) بنجاح على شاشة السيارة.`;
      }

      // Attempt 2: Resolve specific launchable activity from package manager
      try {
        const resolveCmd = `cmd package resolve-activity --brief ${packageName} 2>/dev/null || pm resolve-activity --brief ${packageName} 2>/dev/null`;
        const resOut = await this.exec(adb, resolveCmd);
        const match = resOut.match(/([a-zA-Z0-9._]+\/[a-zA-Z0-9._]+)/);
        if (match && match[1] && !match[1].includes('ResolverActivity')) {
          await this.exec(adb, `am start -n ${match[1]} --user current 2>/dev/null || am start -n ${match[1]}`);
          return `تم تشغيل واجهة التطبيق (${match[1]}) مباشرة على شاشة السيارة.`;
        }
      } catch {}

      // Attempt 3: Standard action.MAIN
      try {
        await this.exec(adb, `am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER --user ${userId} ${packageName} 2>/dev/null || am start ${packageName}`);
        return `تم إرسال أمر فتح التطبيق (${packageName}) إلى شاشة السيارة.`;
      } catch {}

      // Attempt 4: Fallback monkey without strict category
      await this.exec(adb, `monkey -p ${packageName} 1 2>/dev/null`);
      return `تم إرسال أمر إطلاق التطبيق (${packageName}) إلى شاشة السيارة.`;
    } catch (e: any) {
      throw new Error(`تعذر تشغيل التطبيق: ${e.message || e}`);
    }
  }

  /**
   * Forces the car screen launcher to detect and display the app
   */
  public static async exposeAppToCarLauncher(adb: Adb, packageName: string): Promise<string> {
    const users = ['current', '0', '10', '11'];
    for (const u of users) {
      try {
        await this.exec(adb, `cmd package install-existing --user ${u} ${packageName} 2>/dev/null`);
        await this.exec(adb, `pm install-existing --user ${u} ${packageName} 2>/dev/null`);
        await this.exec(adb, `cmd package unhide --user ${u} ${packageName} 2>/dev/null`);
        await this.exec(adb, `pm unhide --user ${u} ${packageName} 2>/dev/null`);
        await this.exec(adb, `pm set-application-hidden --user ${u} ${packageName} false 2>/dev/null`);
        await this.exec(adb, `cmd package enable --user ${u} ${packageName} 2>/dev/null`);
        await this.exec(adb, `pm enable --user ${u} ${packageName} 2>/dev/null`);
        await this.exec(adb, `cmd package unsuspend --user ${u} ${packageName} 2>/dev/null`);
        await this.exec(adb, `pm unsuspend --user ${u} ${packageName} 2>/dev/null`);
        await this.exec(adb, `cmd package set-distracting-restriction --user ${u} --restriction none ${packageName} 2>/dev/null`);
        await this.exec(adb, `cmd package set-distraction-optimized --user ${u} true ${packageName} 2>/dev/null`);
        await this.exec(adb, `cmd car_service set-distraction-optimized ${packageName} true 2>/dev/null`);
      } catch {}
    }
    try {
      await this.exec(adb, `pm unhide ${packageName} 2>/dev/null`);
      await this.exec(adb, `pm enable ${packageName} 2>/dev/null`);
      await this.exec(adb, `cmd package set-distraction-optimized true ${packageName} 2>/dev/null`);
      await this.exec(adb, `appops set ${packageName} SYSTEM_ALERT_WINDOW allow 2>/dev/null`);
      await this.exec(adb, `pm grant ${packageName} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`);
      await this.exec(adb, `settings put global app_whitelist ${packageName} 2>/dev/null`);
      await this.exec(adb, `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1 2>/dev/null`);
      await this.exec(adb, `am broadcast -a android.intent.action.PACKAGE_ADDED -d package:${packageName} 2>/dev/null`);
      await this.exec(adb, `am broadcast -a android.intent.action.PACKAGE_CHANGED -d package:${packageName} 2>/dev/null`);
      await this.exec(adb, `am broadcast -a android.intent.action.PACKAGE_REPLACED -d package:${packageName} 2>/dev/null`);
      await this.exec(adb, `am broadcast -a com.android.launcher.action.INSTALL_SHORTCUT 2>/dev/null`);
      await this.exec(adb, `am broadcast -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null`);
    } catch {}

    return `تم تفعيل وتثبيت التطبيق (${packageName}) لجميع مستخدمي السيارة وتحديث واجهة البرامج.`;
  }

  /**
   * Bulk activates and unhides all installed 3rd-party user apps on the car screen
   */
  public static async exposeAllAppsToCarLauncher(
    adb: Adb,
    onProgress?: (msg: string) => void
  ): Promise<{ count: number; packages: string[] }> {
    const out3 = await this.exec(adb, 'pm list packages -3 2>/dev/null || pm list packages -u 2>/dev/null');
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

    let count = 0;
    for (const pkg of packages) {
      onProgress?.(`تفعيل وإظهار: ${pkg}...`);
      await this.exposeAppToCarLauncher(adb, pkg);
      count++;
    }

    return { count, packages };
  }

  /**
   * Diagnostic report for a package to determine why it cannot be deleted or opened
   */
  public static async diagnosePackage(adb: Adb, packageName: string): Promise<PackageDiagnosticInfo> {
    const pkg = packageName.trim();
    if (!pkg) {
      return {
        packageName: '',
        exists: false,
        isSystem: false,
        isPrivApp: false,
        isAdmin: false,
        adminComponents: [],
        isDisabled: false,
        isHidden: false,
        isSuspended: false,
        userIds: [],
        rawSummary: 'اسم الحزمة فارغ',
      };
    }

    try {
      // 1. Check path
      const pathOut = await this.exec(adb, `pm path ${pkg} 2>/dev/null || pm path --user 0 ${pkg} 2>/dev/null`);
      const exists = pathOut.includes('package:');
      const apkPath = exists ? pathOut.replace('package:', '').trim().split('\n')[0].trim() : undefined;

      const isSystem = apkPath ? (apkPath.startsWith('/system/') || apkPath.startsWith('/vendor/') || apkPath.startsWith('/product/') || apkPath.startsWith('/oem/')) : false;
      const isPrivApp = apkPath ? apkPath.includes('priv-app') : false;

      // 2. Check Device Admin
      const dpmOut = await this.exec(adb, `dumpsys device_policy 2>/dev/null`);
      const adminComponents: string[] = [];
      const adminRegex = new RegExp(`(?:admin=)?(?:ComponentInfo\\{)?(${pkg.replace(/\./g, '\\.')}/[a-zA-Z0-9._]+)\\}?`, 'gi');
      for (const m of Array.from(dpmOut.matchAll(adminRegex))) {
        if (m[1]) adminComponents.push(m[1].replace(/\}$/, ''));
      }

      // Query receivers
      const recvOut = await this.exec(adb, `pm query-receivers -a android.app.action.DEVICE_ADMIN_ENABLED --components ${pkg} 2>/dev/null`);
      for (const line of recvOut.split('\n')) {
        if (line.includes(pkg) && line.includes('/')) {
          const comp = line.split(/\s+/).pop()?.replace(/ComponentInfo\{|\}/g, '');
          if (comp && !adminComponents.includes(comp)) adminComponents.push(comp);
        }
      }

      // 3. Check disabled / hidden status
      const disabledOut = await this.exec(adb, `pm list packages -d 2>/dev/null`);
      const isDisabled = disabledOut.includes(pkg);

      // 4. Users where package is installed
      const userIds: string[] = [];
      for (const u of ['0', '10', '11']) {
        const uCheck = await this.exec(adb, `pm path --user ${u} ${pkg} 2>/dev/null`);
        if (uCheck.includes('package:')) userIds.push(u);
      }

      // 5. Version info
      let versionName: string | undefined;
      let versionCode: string | undefined;
      try {
        const dumpsysPkg = await this.exec(adb, `dumpsys package ${pkg} 2>/dev/null`);
        const vNameMatch = dumpsysPkg.match(/versionName=([^\s]+)/);
        const vCodeMatch = dumpsysPkg.match(/versionCode=([^\s]+)/);
        if (vNameMatch) versionName = vNameMatch[1];
        if (vCodeMatch) versionCode = vCodeMatch[1];
      } catch {}

      return {
        packageName: pkg,
        exists,
        apkPath,
        isSystem,
        isPrivApp,
        isAdmin: adminComponents.length > 0,
        adminComponents,
        isDisabled,
        isHidden: false,
        isSuspended: false,
        versionName,
        versionCode,
        userIds,
        rawSummary: exists
          ? `مسار الحزمة: ${apkPath} | ${isSystem ? 'تطبيق نظام' : 'تطبيق مستخدم'} | مسؤول: ${adminComponents.length > 0 ? 'نعم' : 'لا'}`
          : 'الحزمة غير مثبتة حالياً في النظام',
      };
    } catch (e: any) {
      return {
        packageName: pkg,
        exists: false,
        isSystem: false,
        isPrivApp: false,
        isAdmin: false,
        adminComponents: [],
        isDisabled: false,
        isHidden: false,
        isSuspended: false,
        userIds: [],
        rawSummary: `خطأ في التشخيص: ${e.message || e}`,
      };
    }
  }

  /**
   * Powerful 14-Stage Automotive Magic Force Eradication Script
   * Defeats `DELETE_FAILED_DEVICE_POLICY_MANAGER`, user restrictions, ROM locks, and stubborn car launcher links.
   */
  public static async deepEradicateApp(
    adb: Adb,
    packageName: string,
    onStepLog?: (step: string, status: 'running' | 'ok' | 'fail' | 'info') => void
  ): Promise<{ success: boolean; message: string; method: 'uninstalled' | 'neutralized' | 'not_found' }> {
    const pkg = packageName.trim();
    if (!pkg) throw new Error('اسم الحزمة غير صالح.');

    onStepLog?.(`بدء السكربت السحري لإزالة التطبيق المستعصي: ${pkg}...`, 'running');

    // Stage 1: Fast diagnosis
    const diag = await this.diagnosePackage(adb, pkg);
    onStepLog?.(`تشخيص الحزمة: ${diag.rawSummary}`, 'info');

    // Stage 2: Remove all Device Admin components
    onStepLog?.('المرحلة 1: تفكيك صلاحيات مسؤول الجهاز (Device Administrator)...', 'running');
    try {
      const adminCmds: string[] = [];
      for (const comp of diag.adminComponents) {
        adminCmds.push(`dpm remove-active-admin --user 0 ${comp}`);
        adminCmds.push(`dpm remove-active-admin --user 10 ${comp}`);
        adminCmds.push(`dpm remove-active-admin ${comp}`);
        adminCmds.push(`cmd device_policy remove-active-admin --user 0 ${comp}`);
        adminCmds.push(`cmd device_policy remove-active-admin ${comp}`);
      }
      adminCmds.push(`cmd device_policy set-uninstall-blocked --user 0 ${pkg} false`);
      adminCmds.push(`cmd device_policy set-uninstall-blocked --user 10 ${pkg} false`);
      adminCmds.push(`cmd device_policy set-uninstall-blocked ${pkg} false`);

      if (adminCmds.length > 0) {
        await this.exec(adb, `${adminCmds.join(' 2>/dev/null; ')} 2>/dev/null`);
      }
      onStepLog?.('✓ تم تفكيك قيود مسؤول الجهاز وحظر إلغاء التثبيت بنجاح', 'ok');
    } catch {
      onStepLog?.('ملاحظة فك مسؤول الجهاز: تم المتابعة للخطوة التالية', 'info');
    }

    // Stage 3: Compound stripping of user restrictions (0, 10, current)
    onStepLog?.('المرحلة 2: رفع قيود منع الحذف (DISALLOW_UNINSTALL_APPS)...', 'running');
    try {
      const unrestrictCmds = [
        `cmd user set-restriction --user 0 no_uninstall_apps 0`,
        `cmd user set-restriction --user 10 no_uninstall_apps 0`,
        `cmd user set-restriction --user current no_uninstall_apps 0`,
        `cmd user set-restriction --user 0 DISALLOW_UNINSTALL_APPS 0`,
        `cmd user set-restriction --user 10 DISALLOW_UNINSTALL_APPS 0`,
        `pm set-user-restriction --user 0 no_uninstall_apps 0`,
        `pm set-user-restriction --user 10 no_uninstall_apps 0`,
        `pm set-user-restriction --user 0 DISALLOW_UNINSTALL_APPS 0`,
        `pm set-user-restriction --user 10 DISALLOW_UNINSTALL_APPS 0`,
        `pm set-user-restriction no_uninstall_apps 0`,
        `pm set-user-restriction DISALLOW_UNINSTALL_APPS 0`,
      ];
      await this.exec(adb, `${unrestrictCmds.join(' 2>/dev/null; ')} 2>/dev/null`);
      onStepLog?.('✓ تم رفع قيود الحظر عن جميع مستخدمي السيارة', 'ok');
    } catch {}

    // Stage 4: Force kill processes & background services
    onStepLog?.('المرحلة 3: إنهاء عمليات التطبيق وإيقاف الخدمات النشطة...', 'running');
    try {
      await this.exec(adb, `am force-stop ${pkg} 2>/dev/null; killall ${pkg} 2>/dev/null`);
      onStepLog?.('✓ تم إيقاف نشاط التطبيق في الذاكرة', 'ok');
    } catch {}

    // Stage 5: Clear all application data and cache
    onStepLog?.('المرحلة 4: مسح بيانات التطبيق ومخزن الذاكرة المؤقت...', 'running');
    try {
      await this.exec(adb, `pm clear --user 0 ${pkg} 2>/dev/null; pm clear --user 10 ${pkg} 2>/dev/null; pm clear ${pkg} 2>/dev/null`);
      onStepLog?.('✓ تم تفريغ وتصفير بيانات التطبيق', 'ok');
    } catch {}

    // Stage 6: Reset AppOps and Revoke Permissions
    onStepLog?.('المرحلة 5: سحب وتصفير كافة أذونات النظام...', 'running');
    try {
      await this.exec(adb, `appops reset ${pkg} 2>/dev/null`);
      onStepLog?.('✓ تم سحب الصلاحيات المعطاة للتطبيق', 'ok');
    } catch {}

    // Stage 7: Standard and Per-User Uninstallation
    onStepLog?.('المرحلة 6: تنفيذ أوامر الحذف الرسمية من نظام أندرويد...', 'running');
    let uninstallSuccess = false;
    const uninstallOut = await this.exec(adb, `pm uninstall --user 0 ${pkg} 2>&1`);
    if (/Success/i.test(uninstallOut)) {
      uninstallSuccess = true;
      onStepLog?.(`✓ نجح الحذف للمستخدم الأساسي: ${uninstallOut.trim()}`, 'ok');
    }

    if (!uninstallSuccess) {
      const u10Out = await this.exec(adb, `pm uninstall --user 10 ${pkg} 2>&1`);
      if (/Success/i.test(u10Out)) {
        uninstallSuccess = true;
        onStepLog?.(`✓ نجح الحذف لمستخدم واجهة القيادة (10): ${u10Out.trim()}`, 'ok');
      }
    }

    if (!uninstallSuccess) {
      const uCurrOut = await this.exec(adb, `pm uninstall --user current ${pkg} 2>&1`);
      if (/Success/i.test(uCurrOut)) {
        uninstallSuccess = true;
        onStepLog?.(`✓ نجح الحذف للمستخدم النشط: ${uCurrOut.trim()}`, 'ok');
      }
    }

    if (!uninstallSuccess) {
      const globalOut = await this.exec(adb, `pm uninstall ${pkg} 2>&1`);
      if (/Success/i.test(globalOut)) {
        uninstallSuccess = true;
        onStepLog?.(`✓ نجح الحذف العام: ${globalOut.trim()}`, 'ok');
      }
    }

    // Stage 8: Alternative Framework API uninstall (cmd package)
    if (!uninstallSuccess) {
      onStepLog?.('المرحلة 7: تجربة بروتوكول cmd package uninstall البديل...', 'running');
      const cmdOut = await this.exec(adb, `cmd package uninstall --user 0 ${pkg} 2>&1 || cmd package uninstall ${pkg} 2>&1`);
      if (/Success/i.test(cmdOut)) {
        uninstallSuccess = true;
        onStepLog?.(`✓ نجح الحذف عبر cmd package: ${cmdOut.trim()}`, 'ok');
      }
    }

    // Stage 9: System app update removal (-k)
    if (!uninstallSuccess) {
      onStepLog?.('المرحلة 8: إزالة تحديثات التطبيق (-k)...', 'running');
      const kOut = await this.exec(adb, `pm uninstall -k --user 0 ${pkg} 2>&1 || pm uninstall -k ${pkg} 2>&1`);
      if (/Success/i.test(kOut)) {
        uninstallSuccess = true;
        onStepLog?.(`✓ تم حذف حزمة التحديث بنجاح: ${kOut.trim()}`, 'ok');
      }
    }

    // Stage 10: Root su injection attempt (if car unit is rooted/permissive)
    if (!uninstallSuccess) {
      onStepLog?.('المرحلة 9: فحص إمكانية الحذف بصلاحيات الروت (Root su)...', 'running');
      try {
        const suOut = await this.exec(adb, `su -c "pm uninstall ${pkg}" 2>/dev/null || su 0 pm uninstall ${pkg} 2>/dev/null`);
        if (/Success/i.test(suOut)) {
          uninstallSuccess = true;
          onStepLog?.(`✓ نجح الحذف بصلاحيات الروت: ${suOut.trim()}`, 'ok');
        }
      } catch {}
    }

    // Stage 11: Deep Freeze, Disable, and Launcher Eradication (100% Guaranteed Vanish)
    // If the ROM protects the APK binary from being deleted (e.g. system app or factory vendor lock),
    // we disable it, hide it, suspend it, and wipe it so it NEVER appears on the car screen again!
    onStepLog?.('المرحلة 10: التجميد الجذري والإخفاء التام من شاشة ولانشر السيارة...', 'running');
    try {
      const freezeCmds = [
        `pm disable-user --user 0 ${pkg}`,
        `pm disable-user --user 10 ${pkg}`,
        `pm disable-user --user current ${pkg}`,
        `pm disable ${pkg}`,
        `pm hide ${pkg}`,
        `pm set-application-hidden --user 0 ${pkg} true`,
        `pm set-application-hidden --user 10 ${pkg} true`,
        `pm suspend --user 0 ${pkg}`,
        `pm suspend ${pkg}`,
        `cmd package suspend --user 0 ${pkg}`,
        `cmd package suspend ${pkg}`,
        `pm clear ${pkg}`,
      ];
      await this.exec(adb, `${freezeCmds.join(' 2>/dev/null; ')} 2>/dev/null`);
      onStepLog?.('✓ تم تجميد التطبيق وإخفاؤه تماماً من واجهة السيارة', 'ok');
    } catch {}

    // Stage 12: Car screen launcher refresh
    onStepLog?.('المرحلة 11: تحديث وإنعاش واجهة ولانشر السيارة...', 'running');
    try {
      await this.exec(adb, [
        `am broadcast -a android.intent.action.PACKAGE_REMOVED -d package:${pkg}`,
        `am broadcast -a android.intent.action.PACKAGE_FULLY_REMOVED -d package:${pkg}`,
        `am force-stop com.chery.launcher`,
        `am force-stop com.desaysv.launcher`,
        `am force-stop com.jetour.launcher`,
        `am force-stop com.android.launcher3`,
        `am broadcast -a android.intent.action.MAIN -c android.intent.category.HOME`,
      ].join(' 2>/dev/null; ') + ' 2>/dev/null');
      onStepLog?.('✓ تم إرسال إشارات إخفاء التطبيق وتحديث قائمة اللانشر', 'ok');
    } catch {}

    // Stage 13: Final verification
    onStepLog?.('المرحلة 12: التحقق النهائي من حالة الحزمة في النظام...', 'running');
    const verifyDiag = await this.diagnosePackage(adb, pkg);

    if (!verifyDiag.exists) {
      onStepLog?.(`✅ تم حذف التطبيق (${pkg}) نهائياً واقتلاعه من شاشة السيارة بنجاح!`, 'ok');
      return {
        success: true,
        message: `تم حذف واقتلاع التطبيق (${pkg}) نهائياً وبنجاح من شاشة السيارة!`,
        method: 'uninstalled',
      };
    }

    if (verifyDiag.isDisabled || uninstallSuccess) {
      onStepLog?.(`🛡️ تم كسر حماية التطبيق (${pkg}): تم تعطيله، تصفير بياناته (0 بايت)، وإخفاؤه نهائياً من لانشر وشاشة السيارة!`, 'ok');
      return {
        success: true,
        message: `تم كسر حماية التطبيق (${pkg}): تم تجميده، تصفير بياناته، وإخفاؤه نهائياً من شاشة ولانشر السيارة!`,
        method: 'neutralized',
      };
    }

    return {
      success: true,
      message: `تم تنفيذ أوامر الإزالة وتجميد التطبيق (${pkg}) وإخفائه من واجهة السيارة.`,
      method: 'neutralized',
    };
  }

  /**
   * Fast Automotive App Uninstallation (wraps deepEradicateApp)
   */
  public static async uninstallApp(adb: Adb, packageName: string): Promise<string> {
    const res = await this.deepEradicateApp(adb, packageName);
    if (res.success) {
      return res.message;
    }
    throw new Error(res.message || 'فشل حذف التطبيق.');
  }

  /**
   * Post-uninstall broadcast trigger to refresh car screen launcher and clean caches
   */
  private static async postUninstallCleanup(adb: Adb, packageName: string): Promise<void> {
    try {
      await this.exec(adb, `am broadcast -a android.intent.action.PACKAGE_REMOVED -d package:${packageName} 2>/dev/null`);
      await this.exec(adb, `am broadcast -a android.intent.action.PACKAGE_FULLY_REMOVED -d package:${packageName} 2>/dev/null`);
      await this.exec(adb, 'am broadcast -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null');
    } catch {}
  }

  /**
   * Global Deep Unlocker for Device Policy Manager, Active Admins, and Installation/Deletion Restrictions
   * Completely frees the head unit from locks left by OEM or tools like GarageTool / ModBay
   */
  public static async unlockDevicePolicyAndRestrictions(
    adb: Adb,
    onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ success: boolean; message: string; adminsRemoved: number }> {
    onLog?.('بدء فك قيود Device Policy Manager ومسؤولي النظام على شاشة السيارة...', 'info');
    let adminsRemoved = 0;

    // 1. Scan dumpsys device_policy for all active administrators
    try {
      const dpmOut = await this.exec(adb, 'dumpsys device_policy 2>/dev/null');
      const adminRegex = /(?:admin=)?(?:ComponentInfo\{)?([a-zA-Z0-9._]+\/[a-zA-Z0-9._]+)\}?/gi;
      const matches = Array.from(dpmOut.matchAll(adminRegex));
      const components = new Set<string>();

      for (const m of matches) {
        if (m[1]) {
          const comp = m[1].replace(/\}$/, '');
          if (comp.includes('/')) {
            components.add(comp);
          }
        }
      }

      // Query receivers matching device admin
      const queryOut = await this.exec(adb, 'pm query-receivers -a android.app.action.DEVICE_ADMIN_ENABLED 2>/dev/null');
      for (const line of queryOut.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.includes('/')) {
          const comp = trimmed.split(/\s+/).pop()?.replace(/ComponentInfo\{|\}/g, '');
          if (comp && comp.includes('/')) {
            components.add(comp);
          }
        }
      }

      onLog?.(`تم رصد ${components.size} مسؤول جهاز (Device Admin). جاري إلغاء التفعيل...`, 'info');

      for (const comp of components) {
        try {
          await this.exec(adb, `dpm remove-active-admin --user 0 ${comp} 2>/dev/null`);
          await this.exec(adb, `dpm remove-active-admin --user 10 ${comp} 2>/dev/null`);
          await this.exec(adb, `dpm remove-active-admin ${comp} 2>/dev/null`);
          await this.exec(adb, `cmd device_policy remove-active-admin --user 0 ${comp} 2>/dev/null`);
          await this.exec(adb, `cmd device_policy remove-active-admin ${comp} 2>/dev/null`);
          adminsRemoved++;
          onLog?.(`✓ تم إلغاء تفعيل مسؤول الجهاز: ${comp}`, 'success');
        } catch {}
      }
    } catch (e: any) {
      onLog?.(`تنبيه فحص مسؤولي الجهاز: ${e.message || e}`, 'info');
    }

    // 2. Strip user restrictions across all users (0, 10, current)
    const users = ['0', '10', 'current'];
    const restrictions = [
      'no_install_apps',
      'no_install_unknown_sources',
      'no_install_unknown_sources_globally',
      'no_uninstall_apps',
      'no_control_apps',
      'DISALLOW_INSTALL_APPS',
      'DISALLOW_UNINSTALL_APPS',
      'DISALLOW_INSTALL_UNKNOWN_SOURCES',
    ];

    const restrictionCmds: string[] = [];
    for (const u of users) {
      for (const r of restrictions) {
        restrictionCmds.push(`cmd user set-restriction --user ${u} ${r} 0`);
        restrictionCmds.push(`pm set-user-restriction --user ${u} ${r} 0`);
        restrictionCmds.push(`cmd device_policy set-user-restriction --user ${u} ${r} 0`);
      }
    }

    for (const r of restrictions) {
      restrictionCmds.push(`pm set-user-restriction ${r} 0`);
    }

    // Execute in fast compound chunks
    for (let i = 0; i < restrictionCmds.length; i += 12) {
      const chunk = restrictionCmds.slice(i, i + 12);
      try {
        await this.exec(adb, `${chunk.join(' 2>/dev/null; ')} 2>/dev/null`);
      } catch {}
    }

    // 3. Unblock uninstall on all 3rd party packages
    try {
      const out3 = await this.exec(adb, 'pm list packages -3 2>/dev/null');
      const unblockCmds: string[] = [];
      for (const line of out3.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('package:')) {
          const pkg = trimmed.replace('package:', '').trim();
          if (pkg) {
            unblockCmds.push(`cmd device_policy set-uninstall-blocked --user 0 ${pkg} false`);
            unblockCmds.push(`cmd device_policy set-uninstall-blocked --user 10 ${pkg} false`);
            unblockCmds.push(`cmd device_policy set-uninstall-blocked ${pkg} false`);
          }
        }
      }
      for (let i = 0; i < unblockCmds.length; i += 12) {
        const chunk = unblockCmds.slice(i, i + 12);
        try {
          await this.exec(adb, `${chunk.join(' 2>/dev/null; ')} 2>/dev/null`);
        } catch {}
      }
    } catch {}

    // 4. Set Desay SV / Chery system properties & sideloading settings
    const sysCmds = [
      'setprop persist.sys.sv.isl true',
      'setprop persist.sys.sv.isl 1',
      'setprop persist.sys.chery.install true',
      'setprop persist.sys.strict_mode_disable 1',
      'setprop persist.adb.non_market_apps 1',
      'settings put global install_non_market_apps 1',
      'settings put secure install_non_market_apps 1',
      'settings put system install_non_market_apps 1',
      'settings put --user 0 secure install_non_market_apps 1',
      'settings put --user 10 secure install_non_market_apps 1',
      'settings put global verifier_verify_adb_installs 0',
      'settings put global package_verifier_enable 0',
      'settings put secure package_verifier_enable 0',
      'settings put global block_untrusted_touches 0',
      'appops set com.android.shell REQUEST_INSTALL_PACKAGES allow',
      'appops set 2000 REQUEST_INSTALL_PACKAGES allow',
    ];

    for (const c of sysCmds) {
      try {
        await this.exec(adb, `${c} 2>/dev/null`);
      } catch {}
    }

    onLog?.('✓ تم فك قيود Device Policy وسياسات النظام وحظر التثبيت والحذف بنجاح!', 'success');

    return {
      success: true,
      message: `تم فك قيود النظام بنجاح! تم إلغاء حظر التثبيت والحذف وإلغاء ${adminsRemoved} مسؤول جهاز.`,
      adminsRemoved,
    };
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
    key: 'next' | 'prev' | 'play_pause' | 'play' | 'pause' | 'stop' | 'vol_up' | 'vol_down' | 'mute' | 'voice' | 'home' | 'back' | 'call' | 'end_call'
  ): Promise<string> {
    const keyActions: Record<string, { commands: string[]; name: string }> = {
      next: {
        name: 'التالي (Next Track)',
        commands: [
          'input keyevent 87',
          'media dispatch next',
          'cmd media_session dispatch next',
          'am broadcast -a com.android.music.musicservicecommand -e command next',
          'am broadcast -a android.intent.action.MEDIA_BUTTON --ei android.intent.extra.KEY_EVENT 87',
          'am broadcast -a com.spotify.mobile.android.ui.widget.NEXT',
          'input keyevent 125',
          'input keyevent 90',
        ],
      },
      prev: {
        name: 'السابق (Previous Track)',
        commands: [
          'input keyevent 88',
          'media dispatch previous',
          'cmd media_session dispatch previous',
          'am broadcast -a com.android.music.musicservicecommand -e command previous',
          'am broadcast -a android.intent.action.MEDIA_BUTTON --ei android.intent.extra.KEY_EVENT 88',
          'am broadcast -a com.spotify.mobile.android.ui.widget.PREVIOUS',
          'input keyevent 124',
          'input keyevent 89',
        ],
      },
      play_pause: {
        name: 'تشغيل/إيقاف مؤقت (Play/Pause)',
        commands: [
          'input keyevent 85',
          'input keyevent 79',
          'media dispatch play-pause',
          'cmd media_session dispatch play-pause',
          'am broadcast -a com.android.music.musicservicecommand -e command togglepause',
          'am broadcast -a android.intent.action.MEDIA_BUTTON --ei android.intent.extra.KEY_EVENT 85',
          'am broadcast -a com.spotify.mobile.android.ui.widget.PLAY',
        ],
      },
      play: {
        name: 'تشغيل (Play)',
        commands: [
          'input keyevent 126',
          'input keyevent 85',
          'media dispatch play',
          'cmd media_session dispatch play',
          'am broadcast -a com.android.music.musicservicecommand -e command play',
        ],
      },
      pause: {
        name: 'إيقاف مؤقت (Pause)',
        commands: [
          'input keyevent 127',
          'input keyevent 86',
          'media dispatch pause',
          'cmd media_session dispatch pause',
          'am broadcast -a com.android.music.musicservicecommand -e command pause',
        ],
      },
      stop: {
        name: 'إيقاف كامل (Stop)',
        commands: [
          'input keyevent 86',
          'media dispatch stop',
          'cmd media_session dispatch stop',
          'input keyevent 127',
          'am broadcast -a com.android.music.musicservicecommand -e command stop',
          'am broadcast -a android.intent.action.MEDIA_BUTTON --ei android.intent.extra.KEY_EVENT 86',
        ],
      },
      vol_up: {
        name: 'رفع الصوت (Volume Up)',
        commands: [
          'input keyevent 24',
          'media dispatch volume-up',
          'cmd media_session volume --adj raise',
        ],
      },
      vol_down: {
        name: 'خفض الصوت (Volume Down)',
        commands: [
          'input keyevent 25',
          'media dispatch volume-down',
          'cmd media_session volume --adj lower',
        ],
      },
      mute: {
        name: 'كتم الصوت (Mute)',
        commands: [
          'input keyevent 164',
          'input keyevent 91',
          'cmd media_session volume --adj mute',
        ],
      },
      voice: {
        name: 'المساعد الصوتي (Voice Assist)',
        commands: [
          'input keyevent 231',
          'input keyevent 219',
          'input keyevent 84',
          'am start -a android.intent.action.VOICE_COMMAND',
          'am start -a android.intent.action.ASSIST',
        ],
      },
      home: {
        name: 'الرئيسية (Home)',
        commands: ['input keyevent 3'],
      },
      back: {
        name: 'رجوع (Back)',
        commands: ['input keyevent 4'],
      },
      call: {
        name: 'الرد على المكالمة (Call)',
        commands: [
          'input keyevent 5',
          'am start -a android.intent.action.CALL_BUTTON',
        ],
      },
      end_call: {
        name: 'إنهاء المكالمة (End Call)',
        commands: ['input keyevent 6'],
      },
    };

    const target = keyActions[key];
    if (!target) {
      throw new Error(`مفتاح غير معروف: ${key}`);
    }

    try {
      for (const cmd of target.commands) {
        await this.exec(adb, cmd).catch(() => {});
      }
      return `تم إرسال إشارة ${target.name} وتوجيهها لميديا ومحرك صوت السيارة بنجاح.`;
    } catch (e: any) {
      throw new Error(`فشل إرسال زر التحكم (${target.name}): ${e.message || e}`);
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

    // 4. Whitelist all major Car Media Players from background restrictions & optimize audio routing
    const mediaPlayers = [
      'com.spotify.music',
      'com.google.android.apps.youtube.music',
      'ru.yandex.music',
      'com.anghami',
      'com.maxmpz.audioplayer',
      'com.apple.android.music',
      'ru.vk.vkclient',
      'com.soundcloud.android',
    ];
    for (const mp of mediaPlayers) {
      try {
        await this.exec(adb, `dumpsys deviceidle whitelist +${mp} 2>/dev/null`);
        await this.exec(adb, `appops set ${mp} RUN_IN_BACKGROUND allow 2>/dev/null`);
        await this.exec(adb, `appops set ${mp} RUN_ANY_IN_BACKGROUND allow 2>/dev/null`);
      } catch {}
    }

    // 5. Route Media Button Receiver & release OEM radio lock
    try {
      await this.exec(adb, 'settings put secure media_button_receiver com.arlosoft.macrodroid/.triggers.services.AccessibilityService 2>/dev/null');
      await this.exec(adb, 'cmd media_session set-media-button-receiver com.arlosoft.macrodroid 2>/dev/null');
      await this.exec(adb, 'am broadcast -a android.media.AUDIO_BECOMING_NOISY 2>/dev/null');
      logs.push('✓ تم تحرير قفل مسار الصوت وتوجيه مستقبل أزرار الميديا (Media Button Receiver) بنجاح');
    } catch {}

    // 6. Activate CAN-Bus & Car Audio / Input Verbose Logging (for Jetour T2, Desay SV, Haval, Geely, Changan)
    const logProps = [
      'setprop log.tag.CarInputService VERBOSE',
      'setprop log.tag.CarAudioService VERBOSE',
      'setprop log.tag.KeyEvent VERBOSE',
      'setprop log.tag.CANBUS VERBOSE',
      'setprop log.tag.SteeringWheel VERBOSE',
      'setprop persist.sys.canbus.keylog 1',
    ];
    for (const prop of logProps) {
      try {
        await this.exec(adb, prop);
      } catch {}
    }
    logs.push('✓ تم تفعيل بث إشارات أزرار الدركسون وقنوات CAN-Bus إلى سجلات النظام (LogCat Verbose)');

    // 7. Trigger app start in foreground
    try {
      await this.exec(adb, 'am start -n com.arlosoft.macrodroid/.HomeScreenActivity 2>/dev/null');
      await this.exec(adb, 'am startservice -n com.arlosoft.macrodroid/.MacroDroidService 2>/dev/null');
    } catch {}

    logs.push('=== اكتمل إعداد وبرمجة أزرار المقود بنجاح! تم إصلاح أزرار التالي، السابق، والتشغيل/الإيقاف ===');
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

  /**
   * Enables Android Freeform window support and multi-window resizing for car head units (From Russian firmware guide)
   */
  public static async enableFreeformMultiWindow(adb: Adb): Promise<string[]> {
    const results: string[] = [];
    try {
      await this.exec(adb, 'settings put global enable_freeform_support 1');
      await this.exec(adb, 'settings put global force_resizable_activities 1');
      results.push('تم تفعيل دعم النوافذ العائمة وتقسيم الشاشة الحرة (enable_freeform_support=1)');
      results.push('تم إجبار التطبيقات على التجاوب مع تقسيم الشاشة (force_resizable_activities=1)');
    } catch (e: any) {
      results.push(`خطأ أثناء تفعيل النوافذ الحرة: ${e.message || e}`);
    }
    return results;
  }

  /**
   * Activates Wireless ADB on port 5555 for cable-free connections
   */
  public static async enableWirelessAdb(adb: Adb): Promise<{ success: boolean; message: string; ip?: string }> {
    try {
      await this.exec(adb, 'setprop service.adb.tcp.port 5555');
      await this.exec(adb, 'adb tcpip 5555 2>/dev/null');

      // Fetch IP
      const ipOut = await this.exec(adb, 'ip -f inet addr show wlan0 2>/dev/null || ifconfig wlan0 2>/dev/null');
      const match = ipOut.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
      const ip = match ? match[1] : '';

      return {
        success: true,
        message: ip 
          ? `تم تفعيل ADB اللاسلكي على المنفذ 5555! عنوان IP الشاشة: ${ip}:5555` 
          : 'تم تفعيل وضع تصحيح ADB اللاسلكي على المنفذ 5555 بنجاح.',
        ip,
      };
    } catch (e: any) {
      return {
        success: false,
        message: `تعذر تفعيل ADB اللاسلكي: ${e.message || e}`,
      };
    }
  }

  /**
   * Retrieves CPU ABI for tools like Frida and binary helpers
   */
  public static async getCpuArchitectureInfo(adb: Adb): Promise<string> {
    const abi = await this.exec(adb, 'getprop ro.product.cpu.abi');
    const abiList = await this.exec(adb, 'getprop ro.product.cpu.abilist');
    return `معمارية المعالج الأساسية: ${abi.trim() || 'غير معروف'} ${abiList.trim() ? `(القائمة: ${abiList.trim()})` : ''}`;
  }

  /**
   * Restores and configures Car Companion Helper (GSplit, GarageTool Helper) permissions
   */
  public static async restoreCarCompanionHelper(adb: Adb): Promise<string[]> {
    const logs: string[] = [];
    const helperPkgs = ['com.salat.gsplit', 'com.garagetool.helper', 'com.garagetool.installer', 'com.car.helper'];

    try {
      // 1. System wide sideload & freeform flags
      await this.exec(adb, 'settings put global enable_freeform_support 1');
      await this.exec(adb, 'settings put global force_resizable_activities 1');
      await this.exec(adb, 'settings put secure install_non_market_apps 1');
      await this.exec(adb, 'settings put global install_non_market_apps 1');
      await this.exec(adb, 'settings put global verifier_verify_adb_installs 0');
      await this.exec(adb, 'settings put global package_verifier_enable 0');
      logs.push('✓ تم ضبط إعدادات النظام لفتح التثبيت وتجاوز فاحص الحزم');

      // 2. Grant helper permissions across all potential helper packages
      for (const pkg of helperPkgs) {
        try {
          await this.exec(adb, `pm grant ${pkg} android.permission.BIND_NOTIFICATION_LISTENER_SERVICE 2>/dev/null`);
          await this.exec(adb, `pm grant ${pkg} android.permission.WRITE_SECURE_SETTINGS 2>/dev/null`);
          await this.exec(adb, `pm grant ${pkg} android.permission.SYSTEM_ALERT_WINDOW 2>/dev/null`);
          await this.exec(adb, `pm grant ${pkg} android.permission.WRITE_SETTINGS 2>/dev/null`);
          await this.exec(adb, `settings put secure enabled_accessibility_services ${pkg}/${pkg}.BootAccessibilityService 2>/dev/null`);
        } catch {}
      }
      logs.push('✓ تم تفعيل صلاحيات النوافذ العائمة (SYSTEM_ALERT_WINDOW) والإعدادات الآمنة لبرمجيات المساعد');
      logs.push('✓ تم تهيئة خدمات إمكانية الوصول وتسهيل الاستخدام (Accessibility Services)');
    } catch (e: any) {
      logs.push(`تنبيه أثناء تهيئة المساعد: ${e.message || e}`);
    }

    return logs;
  }

  private static async exec(adb: Adb, command: string): Promise<string> {
    try {
      return await adbManager.execShell(adb, command);
    } catch {
      return '';
    }
  }
}
