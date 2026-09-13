/**
 * Direct in-browser APK AXML & Manifest parser.
 * Directly derived from GarageTool's webadb.js implementation.
 * Reads AndroidManifest.xml from an APK (ZIP file) using DecompressionStream and parses binary AXML,
 * extracting package name and requested permissions (uses-permission).
 */

export interface ParsedApkManifest {
  package: string | null;
  permissions: string[];
}

export async function extractManifestFromApk(buf: Uint8Array): Promise<Uint8Array> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('الملف ليس بتنسيق APK أو ZIP صالح');

  const cdOffset = dv.getUint32(eocd + 16, true);
  const cdCount = dv.getUint16(eocd + 10, true);
  let p = cdOffset;

  for (let i = 0; i < cdCount; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const fname = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));

    if (fname === 'AndroidManifest.xml') {
      const lnameLen = dv.getUint16(localOff + 26, true);
      const lextraLen = dv.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lnameLen + lextraLen;
      const comp = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return comp.slice();
      if (method === 8) {
        if (typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('deflate-raw');
          const ab = await new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer();
          return new Uint8Array(ab);
        }
        return comp.slice();
      }
      throw new Error(`طريقة ضغط غير مدعومة: ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('لم يتم العثور على AndroidManifest.xml داخل الحزمة');
}

export function parseAxml(buf: Uint8Array): ParsedApkManifest {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const sp = 8;
  const stringCount = dv.getUint32(sp + 8, true);
  const isUtf8 = (dv.getUint32(sp + 16, true) & 0x100) !== 0;
  const strDataBase = sp + dv.getUint32(sp + 20, true);
  const strOffsetsBase = sp + 28;
  const strings: string[] = [];

  for (let i = 0; i < stringCount; i++) {
    let pos = strDataBase + dv.getUint32(strOffsetsBase + i * 4, true);
    let str: string;
    if (isUtf8) {
      let clen = buf[pos++];
      if (clen & 0x80) clen = ((clen & 0x7f) << 8) | buf[pos++];
      let blen = buf[pos++];
      if (blen & 0x80) blen = ((blen & 0x7f) << 8) | buf[pos++];
      str = new TextDecoder('utf-8').decode(buf.subarray(pos, pos + blen));
    } else {
      let clen = dv.getUint16(pos, true);
      pos += 2;
      if (clen & 0x8000) {
        clen = ((clen & 0x7fff) << 16) | dv.getUint16(pos, true);
        pos += 2;
      }
      str = new TextDecoder('utf-16le').decode(buf.subarray(pos, pos + clen * 2));
    }
    strings.push(str);
  }

  let o = sp + dv.getUint32(sp + 4, true);
  let pkg: string | null = null;
  const perms: string[] = [];

  while (o + 8 <= buf.length) {
    const type = dv.getUint16(o, true);
    const size = dv.getUint32(o + 4, true);
    if (size < 8) break;

    if (type === 0x0102) {
      const elName = strings[dv.getUint32(o + 20, true)];
      const attrBase = o + 16 + dv.getUint16(o + 24, true);
      const attrCount = dv.getUint16(o + 28, true);
      const attrs: Record<string, any> = {};

      for (let a = 0; a < attrCount; a++) {
        const ab = attrBase + a * 20;
        const aName = strings[dv.getUint32(ab + 4, true)];
        const rawValIdx = dv.getUint32(ab + 8, true);
        const dataType = dv.getUint8(ab + 15);
        const data = dv.getUint32(ab + 16, true);
        attrs[aName] = dataType === 0x03 ? strings[data] : (rawValIdx !== 0xffffffff ? strings[rawValIdx] : data);
      }

      if (elName === 'manifest' && attrs.package) pkg = attrs.package;
      if (elName === 'uses-permission' && attrs.name) perms.push(attrs.name);
    }
    o += size;
  }

  return { package: pkg, permissions: perms };
}

/**
 * Builds the exact automotive permission grant command sequence from permissions defined in the APK.
 * Matches GarageTool webadb.js rules:
 * - Special AppOps (SYSTEM_ALERT_WINDOW, REQUEST_INSTALL_PACKAGES, MANAGE_EXTERNAL_STORAGE, WRITE_SETTINGS, PACKAGE_USAGE_STATS)
 * - Strict Location sequence: standard fine/coarse location first, then ACCESS_BACKGROUND_LOCATION
 * - location_mode 3 (GPS + Network) trigger
 * - monkey launcher trigger so app icon immediately registers in the car launcher
 */
export function buildAutomotiveGrantCommands(pkg: string, permissions: string[]): string[] {
  const APPOPS: Record<string, string> = {
    'android.permission.SYSTEM_ALERT_WINDOW': 'SYSTEM_ALERT_WINDOW',
    'android.permission.REQUEST_INSTALL_PACKAGES': 'REQUEST_INSTALL_PACKAGES',
    'android.permission.MANAGE_EXTERNAL_STORAGE': 'MANAGE_EXTERNAL_STORAGE',
    'android.permission.WRITE_SETTINGS': 'WRITE_SETTINGS',
    'android.permission.PACKAGE_USAGE_STATS': 'GET_USAGE_STATS',
  };

  const RUNTIME = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
  ];

  const GEO = new Set([
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
  ]);

  const permSet = new Set(permissions);
  const cmds: string[] = [];

  // 1. AppOps
  for (const [perm, op] of Object.entries(APPOPS)) {
    if (permSet.has(perm)) {
      cmds.push(`appops set ${pkg} ${op} allow`);
    }
  }

  // 2. Write Secure Settings
  if (permSet.has('android.permission.WRITE_SECURE_SETTINGS')) {
    cmds.push(`pm grant ${pkg} android.permission.WRITE_SECURE_SETTINGS`);
  }

  // 3. Runtime Permissions in strict order
  for (const perm of RUNTIME) {
    if (permSet.has(perm)) {
      cmds.push(`pm grant ${pkg} ${perm}`);
    }
  }

  // 4. If any location permission was requested, enable location_mode 3
  if (RUNTIME.some(p => GEO.has(p) && permSet.has(p))) {
    cmds.push('settings put secure location_mode 3');
    cmds.push('settings put secure location_providers_allowed +gps,network');
  }

  // 5. Open once via monkey so the car launcher detects the intent filter and registers it
  cmds.push(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);

  return cmds;
}

export async function parseApkFile(file: File): Promise<ParsedApkManifest> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const manifestBytes = await extractManifestFromApk(bytes);
  return parseAxml(manifestBytes);
}
