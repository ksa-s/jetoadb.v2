export interface DeviceInfo {
  model: string;
  brand: string;
  manufacturer: string;
  androidVersion: string;
  sdkVersion: number | string;
  cpuAbi: string;
  serial: string;
  buildDisplay?: string;
  displaySize?: string;
  displayDensity?: string;
  density?: string;
  batteryLevel?: number;
  ipAddress?: string;
}

export type InstallMethod = 'auto' | 'stream' | 'session' | 'sdcard' | 'sync_tmp';

export interface ApkItem {
  id: string;
  file: File;
  name: string;
  size: number;
  packageName?: string;
  versionName?: string;
  minSdkVersion?: number;
  status: 'idle' | 'parsing' | 'uploading' | 'installing' | 'success' | 'error';
  progress: number;
  errorMessage?: string;
  usedMethod?: InstallMethod;
}

export interface InstalledApp {
  packageName: string;
  isSystem: boolean;
  versionName?: string;
  versionCode?: string;
  label?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'command' | 'output';
  message: string;
  details?: string;
}

export interface CommandPreset {
  id: string;
  name: string;
  command: string;
  description: string;
  category: 'info' | 'install' | 'car' | 'display' | 'system';
}

export interface PermissionDefinition {
  id: string;
  name: string;
  description: string;
  permission: string;
  type: 'pm' | 'appops' | 'battery';
  appOpName?: string;
  category: 'system' | 'overlay' | 'location' | 'storage' | 'sensors' | 'background';
  isSpecial?: boolean;
}
