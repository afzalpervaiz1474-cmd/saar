import pkg from '../../package.json';

export const APP_NAME = 'ShieldForge Antivirus';
/** Single source of truth for the displayed version (kept in sync with Cargo.toml / tauri.conf.json). */
export const APP_VERSION = pkg.version as string;
export const PRODUCT_TAGLINE = 'Security console';

/** Phase identifier, shown in About & Diagnostics and in the sidebar footer. */
export const PHASE = 'Phase 1 - UI, native interfaces and honest component status';

/** Native command names. Must match the `#[tauri::command]` functions in `src-tauri/src/commands`. */
export const COMMANDS = {
  appInfo: 'get_app_info',
  protectionStatus: 'get_protection_status',
  scannerDescriptor: 'get_scanner_descriptor',
  scanStart: 'scan_start',
  scanProgress: 'scan_progress',
  scanCancel: 'scan_cancel',
  scanResults: 'scan_results',
  quarantineList: 'quarantine_list',
  quarantineRestore: 'quarantine_restore',
  quarantineDelete: 'quarantine_delete',
  updateStatus: 'update_status',
  updateCheck: 'update_check',
  historyList: 'history_list',
  auditList: 'audit_list',
} as const;

export const STORAGE_KEYS = {
  settings: 'shieldforge.settings.v1',
  audit: 'shieldforge.audit.v1',
} as const;

/** Bound on locally cached audit/history entries to keep storage bounded. */
export const MAX_AUDIT_ENTRIES = 500;
