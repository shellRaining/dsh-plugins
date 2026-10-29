import type { MarkdownFileMentions, MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import { createContext, useContext } from 'react';

export interface ImageLabels {
  open: string;
  failed: string;
  dialog: string;
  close: string;
}

/** Per-message capabilities the Markdown components read while rendering. */
export interface MarkdownEnv {
  /** The message is still producing text. */
  streaming: boolean;
  labels: MarkdownLabels;
  imageLabels: ImageLabels;
  /** Inline-code file links; the host provides them once the turn closes. */
  mentions: MarkdownFileMentions | undefined;
  openFile: ((path: string, options?: { line: number }) => void) | undefined;
  /** Workspace root for relative file-image destinations. */
  cwd: string | undefined;
}

const EnvContext = createContext<MarkdownEnv | null>(null);

export const MarkdownEnvProvider = EnvContext.Provider;

export function useMarkdownEnv(): MarkdownEnv {
  const env = useContext(EnvContext);
  if (env === null) throw new Error('dsh-streamdown: Markdown component rendered outside its provider');
  return env;
}

const InLinkContext = createContext(false);

/** Marks content rendered inside an anchor, where nested links are not created. */
export const InLinkProvider = InLinkContext.Provider;

export function useInLink(): boolean {
  return useContext(InLinkContext);
}
