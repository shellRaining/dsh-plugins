/**
 * Ported from @deepseek-ai/dsh-client-ui-primitives 0.2.1-rc.3
 * (`markdown/mathCompatibility`, MIT, Copyright (c) 2026 DeepSeek).
 *
 * TeX backslash delimiters (`\(…\)`, `\[…\]`) and same-line display-dollar
 * blocks as a micromark syntax extension reusing `micromark-extension-math`'s
 * token vocabulary; register `math()` on the same parse so the emitted tokens
 * compile to standard math nodes.
 */
import { factorySpace } from 'micromark-factory-space';
import { markdownLineEnding } from 'micromark-util-character';
import { codes, constants, types } from 'micromark-util-symbol';
import type { Code, Construct, Effects, Extension, Previous, State, TokenizeContext, Tokenizer } from 'micromark-util-types';
import type {} from 'micromark-extension-math';

const previousBackslash: Previous = function (this: TokenizeContext, code: Code): boolean {
  if (code !== codes.backslash) return true;
  const tail = this.events.at(-1);
  if (tail === undefined) return false;
  return tail[1].type === types.characterEscape;
};

const tokenizeBackslashMathText: Tokenizer = function (effects, ok, nok) {
  return start;

  function start(code: Code): State | undefined {
    if (code !== codes.backslash) return nok(code);
    effects.enter('mathText');
    effects.enter('mathTextSequence');
    effects.consume(code);
    return open;
  }
  function open(code: Code): State | undefined {
    if (code !== codes.leftParenthesis) return nok(code);
    effects.consume(code);
    effects.exit('mathTextSequence');
    return between;
  }
  function between(code: Code): State | undefined {
    if (code === codes.eof) return nok(code);
    if (code === codes.backslash) {
      return effects.attempt({ partial: true, tokenize: tokenizeClose }, close, afterCloseAttempt)(code);
    }
    if (markdownLineEnding(code)) {
      effects.enter(types.lineEnding);
      effects.consume(code);
      effects.exit(types.lineEnding);
      return between;
    }
    return dataStart(code);
  }
  function afterCloseAttempt(code: Code): State | undefined {
    return effects.check({ partial: true, tokenize: tokenizeOpen }, nok, dataStart)(code);
  }
  function dataStart(code: Code): State | undefined {
    effects.enter('mathTextData');
    effects.consume(code);
    return code === codes.backslash ? afterDataBackslash : data;
  }
  function afterDataBackslash(code: Code): State | undefined {
    if (code === codes.backslash) {
      effects.consume(code);
      return data;
    }
    return data(code);
  }
  function data(code: Code): State | undefined {
    if (code === codes.eof || code === codes.backslash || markdownLineEnding(code)) {
      effects.exit('mathTextData');
      return between(code);
    }
    effects.consume(code);
    return data;
  }
  function close(code: Code): State | undefined {
    effects.exit('mathText');
    return ok(code);
  }
  function tokenizeClose(this: TokenizeContext, closeEffects: Effects, closeOk: State, closeNok: State): State {
    return slash;
    function slash(code: Code): State | undefined {
      if (code !== codes.backslash) return closeNok(code);
      closeEffects.enter('mathTextSequence');
      closeEffects.consume(code);
      return parenthesis;
    }
    function parenthesis(code: Code): State | undefined {
      if (code !== codes.rightParenthesis) return closeNok(code);
      closeEffects.consume(code);
      closeEffects.exit('mathTextSequence');
      return closeOk;
    }
  }
  function tokenizeOpen(this: TokenizeContext, openEffects: Effects, openOk: State, openNok: State): State {
    return slash;
    function slash(code: Code): State | undefined {
      if (code !== codes.backslash) return openNok(code);
      openEffects.enter(types.chunkString);
      openEffects.consume(code);
      return parenthesis;
    }
    function parenthesis(code: Code): State | undefined {
      if (code !== codes.leftParenthesis) return openNok(code);
      openEffects.consume(code);
      openEffects.exit(types.chunkString);
      return openOk;
    }
  }
};

function createMathFlow(marker: number, openMarker: number, closeMarker: number, multiline: boolean): Construct {
  const tokenize: Tokenizer = function (effects, ok, nok) {
    const self = this;
    let oddBackslashRun = false;
    const tail = self.events.at(-1);
    const initialSize = tail?.[1].type === types.linePrefix ? tail[2].sliceSerialize(tail[1], true).length : 0;
    return start;

    function start(code: Code): State | undefined {
      if (code !== marker) return nok(code);
      effects.enter('mathFlow');
      effects.enter('mathFlowFence');
      effects.enter('mathFlowFenceSequence');
      effects.consume(code);
      return open;
    }
    function open(code: Code): State | undefined {
      if (code !== openMarker) return nok(code);
      effects.consume(code);
      effects.exit('mathFlowFenceSequence');
      effects.exit('mathFlowFence');
      return marker === codes.dollarSign ? afterDollarOpen : content;
    }
    function afterDollarOpen(code: Code): State | undefined {
      return code === codes.dollarSign ? nok(code) : content(code);
    }
    function content(code: Code): State | undefined {
      if (code === codes.eof) return nok(code);
      if (code === marker && (marker !== codes.dollarSign || !oddBackslashRun)) {
        return effects.attempt({ partial: true, tokenize: tokenizeClosingFence }, closed, afterClosingFenceAttempt)(code);
      }
      if (markdownLineEnding(code)) {
        return multiline ? effects.attempt(nonLazyContinuation, afterContinuation, nok)(code) : nok(code);
      }
      return valueStart(code);
    }
    function afterClosingFenceAttempt(code: Code): State | undefined {
      return marker === codes.backslash
        ? effects.check({ partial: true, tokenize: tokenizeOpeningFence }, nok, markerValueStart)(code)
        : markerValueStart(code);
    }
    function afterContinuation(code: Code): State | undefined {
      return effects.attempt(
        { partial: true, tokenize: tokenizeClosingFence },
        closed,
        initialSize ? factorySpace(effects, content, types.linePrefix, initialSize + 1) : content,
      )(code);
    }
    function valueStart(code: Code): State | undefined {
      effects.enter('mathFlowValue');
      oddBackslashRun = code === codes.backslash;
      effects.consume(code);
      return value;
    }
    function markerValueStart(code: Code): State | undefined {
      effects.enter('mathFlowValue');
      oddBackslashRun = false;
      effects.consume(code);
      return valueAfterMarker;
    }
    function valueAfterMarker(code: Code): State | undefined {
      if (code === marker) {
        effects.consume(code);
        return value;
      }
      return value(code);
    }
    function value(code: Code): State | undefined {
      if (code === codes.eof || code === marker || markdownLineEnding(code)) {
        effects.exit('mathFlowValue');
        return content(code);
      }
      oddBackslashRun = code === codes.backslash ? !oddBackslashRun : false;
      effects.consume(code);
      return value;
    }
    function closed(code: Code): State | undefined {
      effects.exit('mathFlow');
      return ok(code);
    }
    function tokenizeClosingFence(this: TokenizeContext, closeEffects: Effects, closeOk: State, closeNok: State): State {
      return factorySpace(closeEffects, sequenceStart, types.linePrefix, constants.tabSize);
      function sequenceStart(code: Code): State | undefined {
        if (code !== marker) return closeNok(code);
        closeEffects.enter('mathFlowFence');
        closeEffects.enter('mathFlowFenceSequence');
        closeEffects.consume(code);
        return sequenceEnd;
      }
      function sequenceEnd(code: Code): State | undefined {
        if (code !== closeMarker) return closeNok(code);
        closeEffects.consume(code);
        closeEffects.exit('mathFlowFenceSequence');
        return factorySpace(closeEffects, after, types.whitespace);
      }
      function after(code: Code): State | undefined {
        if (code !== codes.eof && !markdownLineEnding(code)) return closeNok(code);
        closeEffects.exit('mathFlowFence');
        return closeOk(code);
      }
    }
    function tokenizeOpeningFence(this: TokenizeContext, openEffects: Effects, openOk: State, openNok: State): State {
      return sequenceStart;
      function sequenceStart(code: Code): State | undefined {
        if (code !== marker) return openNok(code);
        openEffects.enter(types.chunkString);
        openEffects.consume(code);
        return sequenceEnd;
      }
      function sequenceEnd(code: Code): State | undefined {
        if (code !== openMarker) return openNok(code);
        openEffects.consume(code);
        openEffects.exit(types.chunkString);
        return openOk;
      }
    }
  };
  return {
    concrete: true,
    name: marker === codes.dollarSign ? 'sameLineDollarMathFlow' : 'backslashMathFlow',
    tokenize,
  };
}

const tokenizeNonLazyContinuation: Tokenizer = function (effects, ok, nok) {
  const self = this;
  return start;
  function start(code: Code): State | undefined {
    if (code === codes.eof) return ok(code);
    if (!markdownLineEnding(code)) return nok(code);
    effects.enter(types.lineEnding);
    effects.consume(code);
    effects.exit(types.lineEnding);
    return lineStart;
  }
  function lineStart(code: Code): State | undefined {
    return self.parser.lazy[self.now().line] ? nok(code) : ok(code);
  }
};

const nonLazyContinuation: Construct = { partial: true, tokenize: tokenizeNonLazyContinuation };

const backslashMathText: Construct = {
  name: 'backslashMathText',
  previous: previousBackslash,
  tokenize: tokenizeBackslashMathText,
};

const backslashMath: Extension = {
  flow: {
    [codes.backslash]: createMathFlow(codes.backslash, codes.leftSquareBracket, codes.rightSquareBracket, true),
    [codes.dollarSign]: createMathFlow(codes.dollarSign, codes.dollarSign, codes.dollarSign, false),
  },
  text: { [codes.backslash]: backslashMathText },
};

/** Micromark syntax extension for TeX backslash and same-line `$$` delimiters. */
export function mathCompatibility(): Extension {
  return backslashMath;
}