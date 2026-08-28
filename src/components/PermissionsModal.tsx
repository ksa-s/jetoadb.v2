import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { Adb } from '@yume-chan/adb';
import { PermissionsCard } from './PermissionsCard';
import { InstalledApp } from '../types';

interface PermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  adb: Adb | null;
  isConnected: boolean;
  onLog: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  installedApps?: InstalledApp[];
}

export const PermissionsModal: React.FC<PermissionsModalProps> = ({
  isOpen,
  onClose,
  adb,
  isConnected,
  onLog,
  installedApps = [],
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-6 max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                قسم أذونات وتصاريح التطبيقات (Permissions Manager)
              </h3>
              <p className="text-xs text-slate-400">
                منح وتعديل أذونات النظام، الظهور فوق التطبيقات، الـ GPS، والبطارية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-950/40">
          <PermissionsCard
            adb={adb}
            isConnected={isConnected}
            onLog={onLog}
            installedApps={installedApps}
          />
        </div>
      </div>
    </div>
  );
};
