package com.garagetool.installer;

import android.content.Context;
import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.IBinder;
import android.os.Looper;
import android.os.Parcel;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * GtInstall — Helper Installer via app_process
 * Reconstructed from smali of original g.jar (71.6 KB).
 */
public final class GtInstall {

    private static final long WAIT_SECONDS = 300L;
    private static final CountDownLatch done = new CountDownLatch(1);
    private static volatile int status = -1;
    private static volatile String statusMessage = null;

    // ==================== IntentSender عبر Binder مخصص ====================
    private static IntentSender statusReceiver() throws Exception {
        IBinder binder = new Binder() {
            @Override
            protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) {
                try {
                    data.enforceInterface("android.content.IIntentSender");
                    data.readInt();
                    boolean hasIntent = data.readInt() != 0;
                    Intent intent = hasIntent
                            ? Intent.CREATOR.createFromParcel(data)
                            : null;

                    if (intent != null) {
                        status = intent.getIntExtra("android.content.pm.extra.STATUS", -1);
                        statusMessage = intent.getStringExtra("android.content.pm.extra.STATUS_MESSAGE");
                        done.countDown();
                    }
                } catch (Throwable t) {
                    // ignore
                }
                if (reply != null) reply.writeNoException();
                return true;
            }
        };

        // Binder غير معروف لـ IntentSender — نستخدم reflection
        java.lang.reflect.Constructor<IntentSender> ctor =
                IntentSender.class.getConstructor(IBinder.class);
        ctor.setAccessible(true);
        return ctor.newInstance(binder);
    }

    // ==================== الحصول على سياق النظام ====================
    private static Context systemContext() {
        try {
            Class<?> at = Class.forName("android.app.ActivityThread");
            Object thread = at.getMethod("systemMain").invoke(null);
            return (Context) at.getMethod("getSystemContext").invoke(thread);
        } catch (Throwable t) {
            return null;
        }
    }

    // ==================== طباعة ====================
    private static void say(String msg) {
        System.out.println("GT_ " + msg);
        System.out.flush();
    }

    private static void fail(String code, String msg) {
        System.out.println("GT_INSTALL_FAIL " + code + " " + (msg == null ? "" : msg));
        System.out.flush();
    }

    private static void ok(PackageManager pm, String pkg) {
        int versionCode = -1;
        try {
            versionCode = pm.getPackageInfo(pkg, 0).versionCode;
        } catch (Throwable ignored) {}
        System.out.println("GT_INSTALL_OK " + pkg + " " + versionCode);
        System.out.flush();
    }

    private static boolean installedNow(PackageManager pm, String pkg, PackageInfo expected) {
        try {
            PackageInfo installed = pm.getPackageInfo(pkg, 0);
            if (installed != null && installed.versionCode == expected.versionCode) {
                ok(pm, pkg);
                return true;
            }
        } catch (Throwable ignored) {}
        return false;
    }

    private static String short_(Throwable t) {
        Throwable cause = t.getCause() != null ? t.getCause() : t;
        String msg = cause.getMessage();
        return cause.getClass().getSimpleName() + (msg == null ? "" : ": " + msg);
    }

    // ==================== التشغيل الرئيسي ====================
    private static void run(String[] args) throws Exception {
        if (args == null || args.length < 1 || args[0] == null
                || args[0].trim().isEmpty()) {
            fail("NO_ARG", "укажи путь к APK первым аргументом");
            return;
        }

        File apkFile = new File(args[0].trim());
        if (!apkFile.isFile() || apkFile.length() <= 0) {
            fail("NO_FILE", "не вижу файла " + apkFile.getAbsolutePath());
            return;
        }

        Looper.prepareMainLooper();

        Context context = systemContext();
        if (context == null) {
            fail("NO_CONTEXT", "нет системного контекста, запускать через app_process");
            return;
        }

        PackageManager pm = context.getPackageManager();

        PackageInfo info = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), 0);
        if (info == null || info.packageName == null) {
            fail("BAD_APK", "файл не читается как APK");
            return;
        }

        String pkg = info.packageName;
        say("target " + pkg + " size " + apkFile.length());

        PackageInstaller installer = pm.getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setSize(apkFile.length());

        int sessionId;
        try {
            sessionId = installer.createSession(params);
        } catch (Throwable t) {
            fail("SESSION", short_(t));
            return;
        }
        say("session " + sessionId);

        PackageInstaller.Session session;
        try {
            session = installer.openSession(sessionId);
        } catch (Throwable t) {
            fail("OPEN", short_(t));
            return;
        }

        try {
            FileInputStream fis = new FileInputStream(apkFile);
            try {
                OutputStream out = session.openWrite("base.apk", 0, apkFile.length());
                try {
                    byte[] buf = new byte[65536];
                    long written = 0;
                    int n;
                    while ((n = fis.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        written += n;
                    }
                    out.flush();
                    session.fsync(out);

                    if (written != apkFile.length()) {
                        fail("WRITE", "записано " + written + " из " + apkFile.length());
                        return;
                    }
                    say("written " + written);
                } finally {
                    try { out.close(); } catch (Throwable ignored) {}
                }
            } finally {
                try { fis.close(); } catch (Throwable ignored) {}
            }

            // === إرسال الالتزام ===
            IntentSender sender;
            try {
                sender = statusReceiver();
            } catch (Throwable t) {
                try { session.abandon(); } catch (Throwable ignored) {}
                fail("NO_SENDER", "скрытый конструктор IntentSender недоступен: " + short_(t));
                return;
            }

            try {
                session.commit(sender);
            } catch (Throwable t) {
                try { session.abandon(); } catch (Throwable ignored) {}
                fail("COMMIT", short_(t));
                return;
            } finally {
                try { session.close(); } catch (Throwable ignored) {}
            }

            say("committed, ждём ответ системы");

            // === انتظار النتيجة ===
            boolean signaled = done.await(WAIT_SECONDS, TimeUnit.SECONDS);

            if (!signaled) {
                if (installedNow(pm, pkg, info)) return;
                fail("TIMEOUT", "система не ответила за " + WAIT_SECONDS + " с");
                return;
            }

            if (status == 0) {
                ok(pm, pkg);
                return;
            }

            if (installedNow(pm, pkg, info)) return;

            fail("COMMIT", "status=" + status
                    + (statusMessage == null ? "" : " " + statusMessage));
        } finally {
            try { session.close(); } catch (Throwable ignored) {}
        }
    }

    public static void main(String[] args) {
        try {
            run(args);
        } catch (Throwable t) {
            fail("COMMIT", short_(t));
        }
        System.exit(0);
    }

    private GtInstall() {}
}
