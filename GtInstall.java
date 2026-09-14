package com.garagetool.installer;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;

public class GtInstall {
    public static void main(String[] args) {
        if (args.length < 1) {
            System.out.println("GT_INSTALL_FAIL NO_ARGS");
            System.out.println("GT_RC 1");
            return;
        }

        String apkPath = args[0];
        File apkFile = new File(apkPath);

        if (!apkFile.exists()) {
            System.out.println("GT_INSTALL_FAIL NO_FILE");
            System.out.println("GT_RC 1");
            return;
        }

        try {
            Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
            Object activityThread = null;
            Context context = null;

            // المحاولة 1: currentActivityThread
            try {
                activityThread = activityThreadClass.getMethod("currentActivityThread").invoke(null);
            } catch (Exception e1) {
                // المحاولة 2: systemMain
                try {
                    activityThread = activityThreadClass.getMethod("systemMain").invoke(null);
                } catch (Exception e2) {
                    System.out.println("GT_INSTALL_FAIL NO_ACTIVITY_THREAD");
                    System.out.println("GT_RC 1");
                    return;
                }
            }

            // الحصول على Context
            try {
                context = (Context) activityThreadClass.getMethod("getSystemContext").invoke(activityThread);
            } catch (Exception e) {
                try {
                    context = (Context) activityThreadClass.getMethod("getApplication").invoke(activityThread);
                } catch (Exception e2) {
                    System.out.println("GT_INSTALL_FAIL NO_CONTEXT: " + e.getMessage());
                    System.out.println("GT_RC 1");
                    return;
                }
            }

            if (context == null) {
                System.out.println("GT_INSTALL_FAIL NULL_CONTEXT");
                System.out.println("GT_RC 1");
                return;
            }

            PackageInstaller installer = context.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL
            );
            params.setInstallLocation(1);

            int sessionId = installer.createSession(params);
            PackageInstaller.Session session = installer.openSession(sessionId);

            long size = apkFile.length();
            OutputStream out = session.openWrite("base.apk", 0, size);
            FileInputStream in = new FileInputStream(apkFile);
            byte[] buffer = new byte[65536];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            session.fsync(out);
            in.close();
            out.close();

            Intent intent = new Intent("com.garagetool.INSTALL_RESULT");
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= 31) {
                try {
                    flags |= PendingIntent.class.getField("FLAG_MUTABLE").getInt(null);
                } catch (Exception e) {
                    // تجاهل
                }
            }
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, sessionId, intent, flags
            );

            session.commit(pendingIntent.getIntentSender());
            session.close();

            String pkgName = context.getPackageManager()
                .getPackageArchiveInfo(apkPath, 0).packageName;

            System.out.println("GT_INSTALL_OK " + pkgName);
            System.out.println("GT_RC 0");

        } catch (Exception e) {
            System.out.println("GT_INSTALL_FAIL EXCEPTION " + e.getMessage());
            System.out.println("GT_RC 1");
        }
    }
}
