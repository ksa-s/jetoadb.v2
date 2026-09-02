import { Adb, AdbDaemonTransport } from '@yume-chan/adb';
import {
  AdbWebUsbBackend,
  AdbWebUsbBackendManager,
} from '@yume-chan/adb-backend-webusb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { DeviceInfo } from '../../types';

export class WebUsbAdbManager {
  private adb: Adb | null = null;
  private backend: AdbWebUsbBackend | null = null;
  private transport: AdbDaemonTransport | null = null;
  private credentialStore: AdbWebCredentialStore;

  constructor() {
    this.credentialStore = new AdbWebCredentialStore('sam_software_car_adb');
  }

  public isWebUsbSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.usb !== 'undefined' &&
      AdbWebUsbBackendManager.BROWSER !== undefined
    );
  }

  public async getAvailableDevices(): Promise<AdbWebUsbBackend[]> {
    if (!this.isWebUsbSupported()) return [];
    try {
      const devices = await AdbWebUsbBackendManager.BROWSER?.getDevices();
      return devices || [];
    } catch {
      return [];
    }
  }

  public async requestAndConnect(
    onProgress?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ adb: Adb; deviceInfo: DeviceInfo }> {
    if (!this.isWebUsbSupported()) {
      throw new Error(
        'المتصفح الحالي لا يدعم WebUSB. يرجى استخدام Google Chrome أو Microsoft Edge على جهاز كمبيوتر أو هاتف يدعم OTG.'
      );
    }

    onProgress?.('جاري طلب إذن USB من المتصفح...', 'info');

    const backend = await AdbWebUsbBackendManager.BROWSER?.requestDevice();
    if (!backend) {
      throw new Error('لم يتم اختيار أي جهاز USB أو تم إلغاء الطلب.');
    }

    this.backend = backend;
    return this.connectToBackend(backend, onProgress);
  }

  public async connectToBackend(
    backend: AdbWebUsbBackend,
    onProgress?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  ): Promise<{ adb: Adb; deviceInfo: DeviceInfo }> {
    onProgress?.(`الاتصال بـ ${backend.serial || 'جهاز السيارة'}...`, 'info');

    const connection = (await backend.connect()) as any;

    onProgress?.('المصادقة وتأكيد مفاتيح RSA على شاشة السيارة...', 'info');

    const transport = await AdbDaemonTransport.authenticate({
      serial: backend.serial,
      connection,
      credentialStore: this.credentialStore,
    });

    this.transport = transport;
    const adb = new Adb(transport);
    this.adb = adb;

    onProgress?.('تم إنشاء اتصال ADB بنجاح! جاري قراءة مواصفات الشاشة...', 'success');

    const deviceInfo = await this.fetchDeviceInfo(adb, backend.serial);
    return { adb, deviceInfo };
  }

  public async fetchDeviceInfo(adb: Adb, serial: string): Promise<DeviceInfo> {
    const getProp = async (prop: string): Promise<string> => {
      try {
        const out = await this.execShell(adb, `getprop ${prop}`);
        return out.trim();
      } catch {
        return '';
      }
    };

    const [
      model,
      brand,
      manufacturer,
      androidVersion,
      sdkVersion,
      cpuAbi,
      buildDisplay,
      displaySizeRaw,
      densityRaw,
    ] = await Promise.all([
      getProp('ro.product.model'),
      getProp('ro.product.brand'),
      getProp('ro.product.manufacturer'),
      getProp('ro.build.version.release'),
      getProp('ro.build.version.sdk'),
      getProp('ro.product.cpu.abi'),
      getProp('ro.build.display.id'),
      this.safeExec(adb, 'wm size'),
      this.safeExec(adb, 'wm density'),
    ]);

    const cleanDisplay = displaySizeRaw.replace(/.*Physical size:\s*/i, '').trim();
    const cleanDensity = densityRaw.replace(/.*Physical density:\s*/i, '').trim();

    return {
      serial: serial || (await getProp('ro.serialno')) || 'car-headunit',
      model: model || 'Android Head Unit',
      brand: brand || manufacturer || 'Automotive',
      manufacturer: manufacturer || brand || 'Unknown',
      androidVersion: androidVersion || 'Android',
      sdkVersion: sdkVersion || '29',
      cpuAbi: cpuAbi || 'arm64-v8a',
      buildDisplay: buildDisplay || undefined,
      displaySize: cleanDisplay || undefined,
      density: cleanDensity || undefined,
    };
  }

  public async execShell(adb: Adb, command: string, timeoutMs = 45000): Promise<string> {
    const cleanCommand = command.trim();
    if (!cleanCommand) return '';

    // Strategy 1: Direct createSocketAndWait with shell: prefix (fastest, standard)
    try {
      const output = await Promise.race([
        adb.createSocketAndWait(`shell:${cleanCommand}`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ADB_TIMEOUT')), timeoutMs)),
      ]);
      return (output || '').trim();
    } catch (e1: any) {
      const errStr1 = e1?.message || String(e1);
      
      // Strategy 2: Interactive shell session fallback (bypasses adbd exec/pipe/socket restrictions)
      try {
        await new Promise((r) => setTimeout(r, 100));
        const socket = await adb.createSocket('shell:');
        const writer = socket.writable.getWriter();
        const reader = socket.readable.getReader();
        const decoder = new TextDecoder();
        const endMarker = `__SAM_DONE_${Math.random().toString(36).substring(2, 7)}__`;

        const cmdPayload = new TextEncoder().encode(`${cleanCommand}\necho "${endMarker}:$?"\n`);
        await writer.write(cmdPayload);

        let fullOutput = '';
        const readPromise = (async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              fullOutput += decoder.decode(value, { stream: true });
              if (fullOutput.includes(endMarker)) {
                break;
              }
            }
          }
        })();

        await Promise.race([
          readPromise,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('INTERACTIVE_TIMEOUT')), timeoutMs)),
        ]);

        try { await writer.close(); } catch {}
        try { await reader.cancel(); } catch {}
        try { await socket.close(); } catch {}

        const markerIdx = fullOutput.indexOf(endMarker);
        let clean = markerIdx !== -1 ? fullOutput.substring(0, markerIdx) : fullOutput;
        if (clean.startsWith(cleanCommand)) {
          clean = clean.substring(cleanCommand.length);
        }
        return clean.trim();
      } catch (e2: any) {
        // Strategy 3: exec: prefix
        try {
          await new Promise((r) => setTimeout(r, 100));
          const output3 = await adb.createSocketAndWait(`exec:${cleanCommand}`);
          return (output3 || '').trim();
        } catch {
          // Strategy 4: Subprocess noneProtocol
          try {
            const parts = cleanCommand.split(' ');
            const output4 = await adb.subprocess.noneProtocol.spawnWaitText(parts);
            return (output4 || '').trim();
          } catch (e4: any) {
            throw new Error(`خطأ في تنفيذ الأمر عبر Shell: ${e4?.message || e2?.message || errStr1}`);
          }
        }
      }
    }
  }

  private async safeExec(adb: Adb, command: string): Promise<string> {
    try {
      return await this.execShell(adb, command);
    } catch {
      return '';
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.adb) {
        await this.adb.close();
      }
      if (this.transport) {
        await this.transport.close();
      }
    } catch (e) {
      console.warn('Error during disconnect', e);
    } finally {
      this.adb = null;
      this.backend = null;
      this.transport = null;
    }
  }

  public getAdb(): Adb | null {
    return this.adb;
  }
}

export const adbManager = new WebUsbAdbManager();
