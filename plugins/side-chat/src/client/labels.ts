// Localized chrome for the shell's Cordis-free primitives, rebuilt once per
// locale revision so MarkdownText keeps its streaming cache between chunks.
import type { DiffBlockLabels, MarkdownLabels, TerminalBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from './host.ts';

export type { DiffBlockLabels, MarkdownLabels, TerminalBlockLabels };

/** Every primitive label set the panel needs for one locale revision. */
export interface PanelLabels {
  readonly markdown: MarkdownLabels;
  readonly terminal: TerminalBlockLabels;
  readonly diff: DiffBlockLabels;
}

export function panelLabels(t: Translate): PanelLabels {
  return { markdown: markdownLabels(t), terminal: terminalLabels(t), diff: diffLabels(t) };
}

export function diffLabels(t: Translate): DiffBlockLabels {
  return {
    codeLabel: t('code.title'),
    wrapLabel: t('code.wrap'),
    unwrapLabel: t('code.unwrap'),
    copy: t('code.copy'),
    copied: t('code.copied'),
    collapseAria: t('terminal.collapseAria'),
    collapse: t('terminal.collapse'),
    expandAria: count => t('terminal.expandAria', { count }),
    expand: count => t('terminal.expand', { count }),
  };
}

export function markdownLabels(t: Translate): MarkdownLabels {
  return {
    code: {
      copyLabel: t('code.copy'),
      copiedLabel: t('code.copied'),
      toolbarLabels: { codeLabel: t('code.title'), wrapLabel: t('code.wrap'), unwrapLabel: t('code.unwrap') },
    },
    footnotes: t('markdown.footnotes'),
  };
}

export function terminalLabels(t: Translate): TerminalBlockLabels {
  return {
    commandLine: line => t('terminal.commandLine', { line }),
    signal: signal => t('terminal.signal', { signal }),
    exitCode: code => t('terminal.exitCode', { code }),
    noExitCode: t('terminal.noExitCode'),
    running: t('terminal.running'),
    failed: t('terminal.failed'),
    done: t('terminal.done'),
    copy: t('code.copy'),
    copied: t('code.copied'),
    noOutput: t('terminal.noOutput'),
    collapseAria: t('terminal.collapseAria'),
    collapse: t('terminal.collapse'),
    expandAria: count => t('terminal.expandAria', { count }),
    expand: count => t('terminal.expand', { count }),
  };
}
