// Minimal shape of the DSH client ModuleLoader used by this plugin.
interface ClientContext {
  effect(factory: () => () => void, label?: string): void;
}

interface ClientPlugin {
  name: string;
  inject: string[];
  apply(ctx: ClientContext): void;
}

interface Window {
  __ModuleLoader__: {
    load(entry: { id: string; factory: () => ClientPlugin }): void;
  };
}
