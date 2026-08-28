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

  public async execShell(adb: Adb, command: string): Promise<string> {
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
      return output;
    } catch (e: any) {
      throw new Error(`خطأ أثناء تنفيذ الأمر "${command}": ${e.message || e}`);
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
