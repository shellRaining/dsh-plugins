import type { ComponentType } from 'react';

/** Structural subset of the DSH client slot API consumed by this plugin. */
export interface MarkProps { size?: number | undefined }
export interface ClientContext {
  slots: {
    inject(name: string, factory: () => (() => void)): () => void;
    register<P extends object>(definition: { name: string; priority: number }, component: ComponentType<P>): () => void;
  };
}
