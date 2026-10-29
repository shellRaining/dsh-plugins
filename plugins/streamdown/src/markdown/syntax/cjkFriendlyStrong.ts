/**
 * Ported from @deepseek-ai/dsh-client-ui-primitives 0.2.1-rc.3
 * (`markdown/cjkFriendlyStrong`, MIT, Copyright (c) 2026 DeepSeek) so the
 * streaming renderer parses `**` exactly like the host MarkdownText.
 *
 * Let asterisk strong emphasis close after punctuation when CJK prose
 * continues without whitespace.
 */
import { attention } from 'micromark-core-commonmark';
import { unicodePunctuation } from 'micromark-util-character';
import { classifyCharacter } from 'micromark-util-classify-character';
import { codes, constants } from 'micromark-util-symbol';
import type { Code, Construct, Extension, State, Tokenizer } from 'micromark-util-types';

const cjkCharacter = new RegExp([
  '\\p{Script_Extensions=Han}',
  '\\p{Script_Extensions=Hiragana}',
  '\\p{Script_Extensions=Katakana}',
  '\\p{Script_Extensions=Hangul}',
  '\\p{Script_Extensions=Bopomofo}',
].join('|'), 'u');

function isCjkCharacter(code: Code): boolean {
  return code !== null && code >= 0 && cjkCharacter.test(String.fromCodePoint(code));
}

const tokenizeCjkFriendlyAttention: Tokenizer = function (effects, ok, nok) {
  const configured = this.parser.constructs.attentionMarkers.null;
  if (configured === undefined) throw new Error('micromark CommonMark attention markers are unavailable');
  const attentionMarkers: readonly Code[] = configured;
  const previous = this.previous;
  const before = classifyCharacter(previous);
  let marker: Code = codes.eof;
  return start;

  function start(code: Code): State | undefined {
    if (code !== codes.asterisk) return nok(code);
    marker = code;
    effects.enter('attentionSequence');
    return inside(code);
  }

  function inside(code: Code): State | undefined {
    if (code === marker) {
      effects.consume(code);
      return inside;
    }
    const token = effects.exit('attentionSequence');
    const after = classifyCharacter(code);
    const open = !after || (after === constants.characterGroupPunctuation && Boolean(before)) || attentionMarkers.includes(code);
    const commonMarkClose = !before || (before === constants.characterGroupPunctuation && Boolean(after)) || attentionMarkers.includes(previous);
    const cjkStrongClose = token.end.offset - token.start.offset >= 2 && unicodePunctuation(previous) && isCjkCharacter(code);
    token._open = open;
    token._close = commonMarkClose || cjkStrongClose;
    return ok(code);
  }
};

const cjkFriendlyAttention: Construct = {
  name: 'cjkFriendlyAttention',
  ...(attention.resolveAll === undefined ? {} : { resolveAll: attention.resolveAll }),
  tokenize: tokenizeCjkFriendlyAttention,
};

const cjkFriendlyStrongExtension: Extension = { text: { [codes.asterisk]: cjkFriendlyAttention } };

/** Micromark syntax extension for punctuation-delimited CJK strong emphasis. */
export function cjkFriendlyStrong(): Extension {
  return cjkFriendlyStrongExtension;
}
