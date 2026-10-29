// Structural view of the DSH host services this plugin touches. Only the
// members it calls; host values are read defensively where shapes vary.

export interface Logger {
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
}

/** One exact authenticated route on the Host Connection's `/api` channel; owner principals only. */
export interface FetchRoute {
  readonly path: string;
  readonly methods: readonly string[];
  readonly requestBody: 'buffered';
  readonly fetch: (request: Request) => Promise<Response>;
}

export interface ConnectionService {
  readonly fetch: { register(route: FetchRoute): unknown };
}

export interface ManagementError {
  readonly code: string;
  readonly diagnostic?: string;
}

/** What `installBundle`, `removeBundle` and `setBundleEnabled` answer when called in process. */
export interface ChangeResult {
  readonly application: 'cancelled' | 'failed' | 'applied' | 'restart-required' | 'overridden';
  readonly error?: ManagementError;
  readonly version?: string;
  readonly packageResult?: { readonly output: string; readonly logPath: string };
}

export interface Bundle {
  readonly name: string;
  readonly version?: string;
  readonly source?: string;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly removable: boolean;
}

export interface PluginManager {
  listBundles(): Promise<readonly Bundle[]>;
  removeBundle(name: string): Promise<ChangeResult>;
  installBundle(spec: string, options?: { readonly enabled?: boolean; readonly saveExact?: boolean }): Promise<ChangeResult>;
  setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult>;
}

export interface PackageManagerCommand {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface ProfileContext {
  readonly dir: string;
  readonly packageManager?: PackageManagerCommand;
}

export interface HostContext {
  readonly connection: ConnectionService;
  readonly pluginManager: PluginManager;
  readonly profileContext: ProfileContext;
  readonly logger: Logger;
}
