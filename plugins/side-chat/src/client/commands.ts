// `/side` and `/btw` in the main composer. A `/` input-trigger source whose
// leading-input claim opens a new side-chat tab and hands it the text after
// the command as its first message. The line is settled in the browser: it
// never reaches the host command registry, the main transcript or the model.
import { IconNewChatOutlineRegular, IconQuestionOutlineRegular, rankByName } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  CommandClaim,
  CommandOutcome,
  TriggerCandidate,
  TriggerOutcome,
  TriggerSession,
  TriggerSource,
  Translate,
} from './host.ts';

const COMMANDS = ['side', 'btw'] as const;
type CommandName = (typeof COMMANDS)[number];

/** Same grammar as host commands: slash at byte 0, lowercase name, then end or whitespace. */
const LEADING_COMMAND = /^\/([a-z0-9_-]+)(?=\s|$)/;

function commandOf(token: string): CommandName | undefined {
  const name = LEADING_COMMAND.exec(token)?.[1];
  return COMMANDS.find(command => command === name);
}

export interface SideChatCommandOptions {
  readonly t: Translate;
  /** Whether the session may fork a side chat (false for subagent views). */
  readonly eligible: (sessionId: string) => boolean;
  /** Open a new side-chat tab beside the session; throws when that is impossible. */
  readonly open: (sessionId: string, prompt: string) => void;
}

/**
 * Build the `/` source. Registered after the shell's command source, so a host
 * command of the same name keeps priority on Enter.
 */
export function sideChatSource({ t, eligible, open }: SideChatCommandOptions): TriggerSource {
  const claim = (session: TriggerSession, name: CommandName): CommandClaim => ({
    name,
    token: `/${name} `,
    hint: t('command.hint'),
    submit: (args: string): Promise<CommandOutcome> => {
      try {
        open(session.sessionId, args.trim());
        return Promise.resolve({ kind: 'success' });
      } catch {
        return Promise.resolve({ kind: 'error', text: t('command.unavailable') });
      }
    },
  });
  const claimOf = (session: TriggerSession, token: string): CommandClaim | undefined => {
    const name = commandOf(token);
    return name === undefined || !eligible(session.sessionId) ? undefined : claim(session, name);
  };
  const rows = (): readonly TriggerCandidate[] => [
    { name: 'side', label: t('command.side.label'), description: t('command.side.description'), icon: IconNewChatOutlineRegular },
    { name: 'btw', label: t('command.btw.label'), description: t('command.btw.description'), icon: IconQuestionOutlineRegular },
  ];
  return {
    trigger: '/',
    name: 'side-chat',
    // After the shell's commands, before skills.
    order: 1,
    // The rows read as more commands; a separate group title would only repeat them.
    showGroupTitle: false,
    candidates: (session, request) => {
      if (request.position !== 'leading' || !eligible(session.sessionId)) return Promise.resolve([]);
      return Promise.resolve(rankByName(rows(), request.query));
    },
    onPick: ({ candidate, session }): TriggerOutcome => {
      const found = claimOf(session, `/${candidate.name}`);
      return found === undefined ? undefined : { claim: found };
    },
    matchSpace: (session, token): TriggerOutcome => {
      const found = claimOf(session, token);
      return found === undefined ? undefined : { claim: found };
    },
    matchClaim: (session, token) => Promise.resolve(claimOf(session, token)),
    matchEnter: (session, line, _signal, envelope) => {
      const found = claimOf(session, line);
      if (found === undefined) return Promise.resolve(undefined);
      // A refusal keeps the draft and the attachment cards in place.
      if (envelope.attachments > 0) return Promise.reject(new Error(t('command.attachments')));
      return Promise.resolve({ claim: found });
    },
  };
}
