(function (root) {
  'use strict';

  const API = root.RoCodeAPI || (typeof require === 'function' ? require('./roblox-api-db.js') : null);

  const KEYWORD_SET = new Set([
    'and', 'break', 'continue', 'do', 'else', 'elseif', 'end',
    'false', 'for', 'function', 'if', 'in', 'local', 'nil',
    'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'
  ]);

  // Note: in Luau, `continue`, `type`, `export`, `typeof` are contextual keywords!
  // Wait: `continue` is contextual in Luau (can be statement `continue`, though virtually always used as keyword).
  // Let's treat `continue` cautiously: inside loops as statement when not followed by `=` or `(` or `.` or `:` or `[`!
  const HARD_KEYWORDS = new Set([
    'and', 'break', 'do', 'else', 'elseif', 'end',
    'false', 'for', 'function', 'if', 'in', 'local', 'nil',
    'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'
  ]);

  const BUILTIN_GLOBALS = new Set([
    'game', 'workspace', 'script', 'plugin', 'shared', '_G', 'Enum',
    'Instance', 'Vector3', 'Vector2', 'CFrame', 'Color3', 'BrickColor',
    'UDim', 'UDim2', 'TweenInfo', 'RaycastParams', 'OverlapParams',
    'NumberRange', 'Random', 'DateTime', 'Ray', 'Region3',
    'ColorSequence', 'NumberSequence',
    'task', 'math', 'string', 'table', 'coroutine', 'bit32', 'os', 'utf8', 'debug', 'buffer',
    'print', 'warn', 'error', 'assert', 'pcall', 'xpcall', 'require',
    'typeof', 'type', 'tonumber', 'tostring', 'pairs', 'ipairs', 'next',
    'select', 'unpack', 'setmetatable', 'getmetatable', 'rawget', 'rawset', 'rawequal', 'rawlen',
    'tick', 'time', 'elapsedTime', 'wait', 'spawn', 'delay'
  ]);

  const COMMON_METHODS = new Set([
    'GetService', 'WaitForChild', 'FindFirstChild', 'FindFirstChildOfClass', 'FindFirstChildWhichIsA',
    'GetChildren', 'GetDescendants', 'IsA', 'Clone', 'Destroy', 'ClearAllChildren',
    'SetAttribute', 'GetAttribute', 'GetPropertyChangedSignal', 'Connect', 'Once', 'Disconnect',
    'Play', 'Pause', 'Cancel', 'Stop', 'Create', 'FireServer', 'FireClient', 'FireAllClients',
    'InvokeServer', 'TakeDamage', 'MoveTo', 'LoadCharacter', 'Kick', 'Raycast',
    'GetPlayers', 'GetPlayerFromCharacter', 'GetDataStore', 'GetAsync', 'SetAsync', 'UpdateAsync'
  ]);

  function isAlpha(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  function isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  function isHexDigit(ch) {
    return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
  }

  function matchLongBracket(src, pos) {
    if (src[pos] !== '[') return -1;
    let i = pos + 1;
    let eqCount = 0;
    while (i < src.length && src[i] === '=') {
      eqCount++;
      i++;
    }
    if (src[i] === '[') return eqCount;
    return -1;
  }

  function tokenize(source) {
    const tokens = [];
    const diagnostics = [];
    const len = source.length;
    let i = 0;
    let line = 1;
    let col = 1;

    function advance(n = 1) {
      for (let k = 0; k < n && i < len; k++) {
        if (source[i] === '\n') {
          line++;
          col = 1;
        } else {
          col++;
        }
        i++;
      }
    }

    function readLongString(eqCount, startIdx, startLine, startCol, isComment) {
      // skip opening [==[
      advance(2 + eqCount);
      const closing = ']' + '='.repeat(eqCount) + ']';
      const closeIdx = source.indexOf(closing, i);
      if (closeIdx === -1) {
        const rest = source.slice(startIdx);
        while (i < len) advance(1);
        diagnostics.push({
          severity: 'error',
          line: startLine,
          col: startCol,
          endCol: startCol + 2 + eqCount,
          message: isComment
            ? `Unclosed multi-line comment (missing '${closing}')`
            : `Unclosed multi-line string (missing '${closing}')`
        });
        return {
          type: isComment ? 'comment' : 'string',
          value: rest,
          raw: rest,
          line: startLine,
          col: startCol,
          endLine: line,
          endCol: col,
          start: startIdx,
          end: len
        };
      }
      const content = source.slice(i, closeIdx);
      advance(closeIdx - i + closing.length);
      return {
        type: isComment ? 'comment' : 'string',
        value: content.startsWith('\n') ? content.slice(1) : content,
        raw: source.slice(startIdx, i),
        line: startLine,
        col: startCol,
        endLine: line,
        endCol: col,
        start: startIdx,
        end: i
      };
    }

    function readInterpolatedString() {
      const startIdx = i;
      const startLine = line;
      const startCol = col;
      advance(1); // skip opening `
      const parts = [];
      let textBuf = '';
      let segLine = line;
      let segCol = col;

      while (i < len) {
        const ch = source[i];
        if (ch === '`') {
          parts.push({ kind: 'text', value: textBuf });
          advance(1);
          return {
            type: 'interp_string',
            parts,
            raw: source.slice(startIdx, i),
            line: startLine,
            col: startCol,
            endLine: line,
            endCol: col,
            start: startIdx,
            end: i
          };
        }
        if (ch === '\n') {
          diagnostics.push({
            severity: 'error',
            line: startLine,
            col: startCol,
            endCol: col,
            message: 'Unclosed interpolated string literal (missing closing backtick `)'
          });
          break;
        }
        if (ch === '\\') {
          advance(1);
          if (i < len) {
            const esc = source[i];
            const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', '`': '`', '{': '{', "'": "'", '"': '"' };
            textBuf += map[esc] !== undefined ? map[esc] : esc;
            advance(1);
          }
          continue;
        }
        if (ch === '{') {
          parts.push({ kind: 'text', value: textBuf });
          textBuf = '';
          advance(1); // skip {
          const exprStart = i;
          const exprLine = line;
          const exprCol = col;
          let depth = 1;
          while (i < len && depth > 0) {
            if (source[i] === '"' || source[i] === "'") {
              const q = source[i];
              advance(1);
              while (i < len && source[i] !== q && source[i] !== '\n') {
                if (source[i] === '\\') advance(2);
                else advance(1);
              }
              if (source[i] === q) advance(1);
              continue;
            }
            if (source[i] === '{') depth++;
            else if (source[i] === '}') {
              depth--;
              if (depth === 0) break;
            }
            advance(1);
          }
          const exprSrc = source.slice(exprStart, i);
          if (depth !== 0) {
            diagnostics.push({
              severity: 'error',
              line: exprLine,
              col: exprCol - 1,
              endCol: col,
              message: "Unclosed '{' inside interpolated string"
            });
          } else {
            if (!exprSrc.trim()) {
              diagnostics.push({
                severity: 'error',
                line: exprLine,
                col: exprCol - 1,
                endCol: col + 1,
                message: 'Empty interpolation expression `{}` is not valid in Luau'
              });
            }
            advance(1); // skip }
          }
          parts.push({ kind: 'expr', source: exprSrc, line: exprLine, col: exprCol });
          segLine = line;
          segCol = col;
          continue;
        }
        textBuf += ch;
        advance(1);
      }

      if (i >= len && source[i - 1] !== '`') {
        diagnostics.push({
          severity: 'error',
          line: startLine,
          col: startCol,
          endCol: col,
          message: 'Unclosed interpolated string literal (missing closing backtick `)'
        });
      }
      parts.push({ kind: 'text', value: textBuf });
      return {
        type: 'interp_string',
        parts,
        raw: source.slice(startIdx, i),
        line: startLine,
        col: startCol,
        endLine: line,
        endCol: col,
        start: startIdx,
        end: i
      };
    }

    while (i < len) {
      const ch = source[i];

      // Whitespace
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        advance(1);
        continue;
      }

      const startIdx = i;
      const startLine = line;
      const startCol = col;

      // Comments: --
      if (ch === '-' && source[i + 1] === '-') {
        const eq = matchLongBracket(source, i + 2);
        if (eq >= 0) {
          advance(2); // --
          const tok = readLongString(eq, startIdx, startLine, startCol, true);
          tokens.push(tok);
          continue;
        }
        while (i < len && source[i] !== '\n') advance(1);
        const raw = source.slice(startIdx, i);
        const isDirective = /^--!(strict|nonstrict|nocheck|native|optimize)\b/.test(raw);
        tokens.push({
          type: isDirective ? 'directive' : 'comment',
          value: raw,
          raw,
          line: startLine,
          col: startCol,
          endLine: line,
          endCol: col,
          start: startIdx,
          end: i
        });
        continue;
      }

      // Long bracket string [[ ... ]] or [=[ ... ]=]
      if (ch === '[') {
        const eq = matchLongBracket(source, i);
        if (eq >= 0) {
          tokens.push(readLongString(eq, startIdx, startLine, startCol, false));
          continue;
        }
      }

      // Single or double quoted string
      if (ch === '"' || ch === "'") {
        const quote = ch;
        advance(1);
        let val = '';
        let closed = false;
        while (i < len) {
          const c = source[i];
          if (c === quote) {
            advance(1);
            closed = true;
            break;
          }
          if (c === '\n' || c === '\r') {
            break;
          }
          if (c === '\\') {
            advance(1);
            if (i < len) {
              const esc = source[i];
              if (esc === 'n') { val += '\n'; advance(1); }
              else if (esc === 't') { val += '\t'; advance(1); }
              else if (esc === 'r') { val += '\r'; advance(1); }
              else if (esc === '\\') { val += '\\'; advance(1); }
              else if (esc === '"') { val += '"'; advance(1); }
              else if (esc === "'") { val += "'"; advance(1); }
              else if (esc === 'z') {
                advance(1);
                while (i < len && /\s/.test(source[i])) advance(1);
              } else {
                val += esc;
                advance(1);
              }
            }
            continue;
          }
          val += c;
          advance(1);
        }
        if (!closed) {
          diagnostics.push({
            severity: 'error',
            line: startLine,
            col: startCol,
            endCol: col,
            message: `Unclosed string literal (missing closing ${quote})`
          });
        }
        tokens.push({
          type: 'string',
          value: val,
          raw: source.slice(startIdx, i),
          line: startLine,
          col: startCol,
          endLine: line,
          endCol: col,
          start: startIdx,
          end: i
        });
        continue;
      }

      // Luau interpolated string `...`
      if (ch === '`') {
        tokens.push(readInterpolatedString());
        continue;
      }

      // Numbers
      if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1]))) {
        if (ch === '0' && (source[i + 1] === 'x' || source[i + 1] === 'X')) {
          advance(2);
          let digits = '';
          while (i < len && (isHexDigit(source[i]) || source[i] === '_')) {
            if (source[i] !== '_') digits += source[i];
            advance(1);
          }
          if (!digits.length || isAlpha(source[i])) {
            while (i < len && isAlpha(source[i])) advance(1);
            diagnostics.push({
              severity: 'error',
              line: startLine,
              col: startCol,
              endCol: col,
              message: `Malformed hexadecimal number '${source.slice(startIdx, i)}'`
            });
          }
          tokens.push({
            type: 'number',
            value: digits.length ? parseInt(digits, 16) : 0,
            raw: source.slice(startIdx, i),
            line: startLine,
            col: startCol,
            endLine: line,
            endCol: col,
            start: startIdx,
            end: i
          });
          continue;
        }
        if (ch === '0' && (source[i + 1] === 'b' || source[i + 1] === 'B')) {
          advance(2);
          let digits = '';
          while (i < len && (source[i] === '0' || source[i] === '1' || source[i] === '_')) {
            if (source[i] !== '_') digits += source[i];
            advance(1);
          }
          if (!digits.length || isDigit(source[i]) || isAlpha(source[i])) {
            while (i < len && (isDigit(source[i]) || isAlpha(source[i]))) advance(1);
            diagnostics.push({
              severity: 'error',
              line: startLine,
              col: startCol,
              endCol: col,
              message: `Malformed binary number '${source.slice(startIdx, i)}'`
            });
          }
          tokens.push({
            type: 'number',
            value: digits.length ? parseInt(digits, 2) : 0,
            raw: source.slice(startIdx, i),
            line: startLine,
            col: startCol,
            endLine: line,
            endCol: col,
            start: startIdx,
            end: i
          });
          continue;
        }

        let numStr = '';
        while (i < len && (isDigit(source[i]) || source[i] === '_')) {
          if (source[i] !== '_') numStr += source[i];
          advance(1);
        }
        if (source[i] === '.' && source[i + 1] !== '.') {
          numStr += '.';
          advance(1);
          while (i < len && (isDigit(source[i]) || source[i] === '_')) {
            if (source[i] !== '_') numStr += source[i];
            advance(1);
          }
        }
        if (source[i] === 'e' || source[i] === 'E') {
          numStr += source[i];
          advance(1);
          if (source[i] === '+' || source[i] === '-') {
            numStr += source[i];
            advance(1);
          }
          let expDigits = 0;
          while (i < len && (isDigit(source[i]) || source[i] === '_')) {
            if (source[i] !== '_') { numStr += source[i]; expDigits++; }
            advance(1);
          }
          if (expDigits === 0) {
            diagnostics.push({
              severity: 'error',
              line: startLine,
              col: startCol,
              endCol: col,
              message: `Malformed exponent in number '${source.slice(startIdx, i)}'`
            });
          }
        }
        if (isAlpha(source[i])) {
          while (i < len && (isAlpha(source[i]) || isDigit(source[i]))) advance(1);
          diagnostics.push({
            severity: 'error',
            line: startLine,
            col: startCol,
            endCol: col,
            message: `Invalid number/identifier token '${source.slice(startIdx, i)}'`
          });
        }
        tokens.push({
          type: 'number',
          value: Number(numStr) || 0,
          raw: source.slice(startIdx, i),
          line: startLine,
          col: startCol,
          endLine: line,
          endCol: col,
          start: startIdx,
          end: i
        });
        continue;
      }

      // Identifiers & Keywords
      if (isAlpha(ch)) {
        while (i < len && (isAlpha(source[i]) || isDigit(source[i]))) {
          advance(1);
        }
        const word = source.slice(startIdx, i);
        const type = HARD_KEYWORDS.has(word) ? 'keyword' : 'ident';
        tokens.push({
          type,
          value: word,
          raw: word,
          line: startLine,
          col: startCol,
          endLine: line,
          endCol: col,
          start: startIdx,
          end: i
        });
        continue;
      }

      // Multi-char operators & special mistake operators
      const three = source.slice(i, i + 3);
      if (three === '...' || three === '..=' || three === '//=') {
        advance(3);
        tokens.push({
          type: 'punct',
          value: three,
          raw: three,
          line: startLine,
          col: startCol,
          endLine: line,
          endCol: col,
          start: startIdx,
          end: i
        });
        continue;
      }

      const two = source.slice(i, i + 2);
      if (
        two === '..' || two === '//' || two === '==' || two === '~=' ||
        two === '<=' || two === '>=' || two === '+=' || two === '-=' ||
        two === '*=' || two === '/=' || two === '%=' || two === '^=' ||
        two === '::' || two === '->'
      ) {
        advance(2);
        tokens.push({
          type: 'punct',
          value: two,
          raw: two,
          line: startLine,
          col: startCol,
          endLine: line,
          endCol: col,
          start: startIdx,
          end: i
        });
        continue;
      }

      // Helpful JS/C mistake operator detection!
      if (two === '!=' || two === '&&' || two === '||' || two === '++') {
        advance(2);
        const hintMap = {
          '!=': "Unexpected '!=' — use '~=' for inequality in Luau",
          '&&': "Unexpected '&&' — use 'and' for logical AND in Luau",
          '||': "Unexpected '||' — use 'or' for logical OR in Luau",
          '++': "Luau does not support '++' — use '+= 1' instead"
        };
        diagnostics.push({
          severity: 'error',
          line: startLine,
          col: startCol,
          endCol: col,
          message: hintMap[two]
        });
        // Push equivalent token so parser can keep analyzing the rest of the line cleanly!
        const fallback = two === '!=' ? '~=' : two === '&&' ? 'and' : two === '||' ? 'or' : '+=';
        tokens.push({
          type: fallback === 'and' || fallback === 'or' ? 'keyword' : 'punct',
          value: fallback,
          raw: two,
          invalidRaw: two,
          line: startLine,
          col: startCol,
          endLine: line,
          endCol: col,
          start: startIdx,
          end: i
        });
        if (two === '++') {
          tokens.push({
            type: 'number',
            value: 1,
            raw: '',
            line: startLine,
            col: startCol,
            endLine: line,
            endCol: col,
            start: i,
            end: i
          });
        }
        continue;
      }

      // Single-char punctuation
      const singles = '+-*/%^#<>(){}[]=;:,.?|&!';
      if (singles.includes(ch)) {
        advance(1);
        if (ch === '!') {
          diagnostics.push({
            severity: 'error',
            line: startLine,
            col: startCol,
            endCol: col,
            message: "Unexpected '!' — use 'not' for negation or '~=' for not-equal in Luau"
          });
          tokens.push({
            type: 'keyword',
            value: 'not',
            raw: '!',
            invalidRaw: '!',
            line: startLine,
            col: startCol,
            endLine: line,
            endCol: col,
            start: startIdx,
            end: i
          });
          continue;
        }
        tokens.push({
          type: 'punct',
          value: ch,
          raw: ch,
          line: startLine,
          col: startCol,
          endLine: line,
          endCol: col,
          start: startIdx,
          end: i
        });
        continue;
      }

      // Unknown symbol
      advance(1);
      diagnostics.push({
        severity: 'error',
        line: startLine,
        col: startCol,
        endCol: col,
        message: `Unexpected character '${ch}'`
      });
    }

    tokens.push({
      type: 'eof',
      value: '<eof>',
      raw: '',
      line,
      col,
      endLine: line,
      endCol: col,
      start: len,
      end: len
    });

    return { tokens, diagnostics };
  }

  // =========================================================================
  // RECURSIVE-DESCENT LUAU PARSER (AST + Error Recovery + Type Stripping)
  // =========================================================================

  const COMPOUND_OPS = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '^=', '..=']);
  const BIN_PRECEDENCE = {
    or: [1, 1],
    and: [2, 2],
    '<': [3, 3], '>': [3, 3], '<=': [3, 3], '>=': [3, 3], '~=': [3, 3], '==': [3, 3],
    '..': [5, 4], // right-associative
    '+': [6, 6], '-': [6, 6],
    '*': [7, 7], '/': [7, 7], '//': [7, 7], '%': [7, 7],
    '^': [10, 9]  // right-associative, higher than unary (8)
  };

  function parseLuau(source) {
    const lex = tokenize(source);
    const allTokens = lex.tokens;
    const diagnostics = lex.diagnostics.slice();

    // Filter out comments & directives for AST parser
    const codeTokens = allTokens.filter((t) => t.type !== 'comment' && t.type !== 'directive');
    let pos = 0;
    let loopDepth = 0;

    function cur() {
      return codeTokens[pos] || codeTokens[codeTokens.length - 1];
    }

    function peek(offset = 1) {
      return codeTokens[pos + offset] || codeTokens[codeTokens.length - 1];
    }

    function prev() {
      return codeTokens[Math.max(0, pos - 1)];
    }

    function at(val, type) {
      const t = cur();
      if (type && t.type !== type) return false;
      return val === undefined ? true : t.value === val;
    }

    function eat(val, type) {
      if (at(val, type)) {
        return codeTokens[pos++];
      }
      return null;
    }

    function addError(tok, message) {
      const t = tok || cur();
      // Avoid piling duplicate syntax errors on the exact same line & col
      if (diagnostics.some((d) => d.severity === 'error' && d.line === t.line && Math.abs(d.col - t.col) <= 2)) {
        return;
      }
      diagnostics.push({
        severity: 'error',
        line: t.line,
        col: t.col,
        endCol: Math.max(t.col + 1, t.endCol || t.col + (t.raw ? t.raw.length : 1)),
        message
      });
    }

    function expect(val, customMsg) {
      const t = cur();
      if (t.value === val) {
        pos++;
        return t;
      }
      const p = prev();
      addError(
        t.type === 'eof' ? p : t,
        customMsg || `Expected '${val}', got ${t.type === 'eof' ? 'end of script' : `'${t.raw || t.value}'`}`
      );
      return null;
    }

    function expectIdent(customMsg) {
      const t = cur();
      if (t.type === 'ident') {
        pos++;
        return t;
      }
      addError(t, customMsg || `Expected identifier, got '${t.raw || t.value}'`);
      return null;
    }

    // Luau Type Annotation skipper (`: number | string?`, `(a: number) -> boolean`, `{ [string]: any }`)
    function skipTypeAnnotation() {
      function parseSingleType() {
        const t = cur();
        if (eat('(')) {
          // Tuple or function parameter type list
          if (!at(')')) {
            while (true) {
              if (cur().type === 'ident' && peek().value === ':') {
                pos += 2;
              } else if (at('...')) {
                pos++;
                if (eat(':')) skipTypeAnnotation();
                break;
              }
              skipTypeAnnotation();
              if (!eat(',')) break;
            }
          }
          expect(')', "Expected ')' in Luau type annotation");
          if (eat('->')) {
            skipTypeAnnotation();
          }
          return;
        }
        if (eat('{')) {
          let depth = 1;
          while (!at('<eof>') && depth > 0) {
            if (at('{')) depth++;
            else if (at('}')) depth--;
            pos++;
          }
          return;
        }
        if (t.value === 'typeof' && peek().value === '(') {
          pos += 2;
          let depth = 1;
          while (!at('<eof>') && depth > 0) {
            if (at('(')) depth++;
            else if (at(')')) depth--;
            pos++;
          }
          return;
        }
        if (t.type === 'ident' || t.value === 'nil' || t.value === 'true' || t.value === 'false' || t.type === 'string') {
          pos++;
          while (eat('.')) {
            if (cur().type === 'ident') pos++;
          }
          // Generic args <T, U>
          if (eat('<')) {
            let depth = 1;
            while (!at('<eof>') && depth > 0) {
              if (at('<')) depth++;
              else if (at('>')) depth--;
              pos++;
            }
          }
        } else if (at('...')) {
          pos++;
          parseSingleType();
        }
        while (eat('?')) { /* optional */ }
      }

      eat('|') || eat('&');
      parseSingleType();
      while (at('|') || at('&')) {
        pos++;
        parseSingleType();
      }
      if (eat('->')) {
        skipTypeAnnotation();
      }
    }

    function skipGenericParams() {
      if (at('<')) {
        let depth = 1;
        pos++;
        while (!at('<eof>') && depth > 0) {
          if (at('<')) depth++;
          else if (at('>')) depth--;
          pos++;
        }
      }
    }

    function isBlockCloser(t) {
      return (
        t.type === 'eof' ||
        t.value === 'end' ||
        t.value === 'else' ||
        t.value === 'elseif' ||
        t.value === 'until'
      );
    }

    function recoverToNextStatement() {
      const startLine = cur().line;
      while (!at('<eof>')) {
        const t = cur();
        if (
          t.value === 'local' || t.value === 'function' || t.value === 'if' ||
          t.value === 'for' || t.value === 'while' || t.value === 'repeat' ||
          t.value === 'return' || isBlockCloser(t)
        ) {
          return;
        }
        if (t.line > startLine) return;
        pos++;
      }
    }

    function parseBlock(stopTokens) {
      const body = [];
      while (!at('<eof>')) {
        while (eat(';')) { /* optional semicolons */ }
        if (at('<eof>')) break;
        if (stopTokens && stopTokens.includes(cur().value)) break;

        const before = pos;
        const stmt = parseStatement();
        if (stmt) body.push(stmt);
        while (eat(';')) { /* optional semicolons */ }

        if (stmt && (stmt.type === 'ReturnStatement' || stmt.type === 'BreakStatement' || stmt.type === 'ContinueStatement')) {
          // In Luau, return/break/continue must be the last statement in a block
          if (!at('<eof>') && !(stopTokens && stopTokens.includes(cur().value))) {
            addError(cur(), `Unreachable code after '${stmt.keyword || 'return'}' — must be the last statement in its block`);
            recoverToNextStatement();
          }
          break;
        }

        if (pos === before) {
          pos++;
        }
      }
      return body;
    }

    function parseStatement() {
      const t = cur();

      // Common JS keyword mistakes (`let`, `const`, `var`)
      if (t.type === 'ident' && (t.value === 'let' || t.value === 'const' || t.value === 'var')) {
        const nextTok = peek();
        if (nextTok.type === 'ident') {
          addError(t, `Unexpected '${t.value}' — use 'local' to declare variables in Luau`);
          pos++; // treat as `local` so rest of line parses cleanly!
          return parseLocalAfterKeyword(t);
        }
      }

      if (t.type === 'ident' && t.value === 'elif') {
        addError(t, "Unexpected 'elif' — use 'elseif' in Luau");
      }

      // `export type ...` or `type Foo = ...`
      if (t.type === 'ident' && t.value === 'export' && peek().value === 'type') {
        pos += 2;
        parseTypeAliasRest(t);
        return { type: 'NoopStatement', line: t.line };
      }
      if (t.type === 'ident' && t.value === 'type' && peek().type === 'ident' && (peek(2).value === '=' || peek(2).value === '<')) {
        pos++;
        parseTypeAliasRest(t);
        return { type: 'NoopStatement', line: t.line };
      }

      // `continue` (contextual keyword in Luau)
      if (t.type === 'ident' && t.value === 'continue') {
        const nx = peek();
        if (nx.value !== '=' && nx.value !== '(' && nx.value !== '.' && nx.value !== ':' && nx.value !== '[' && nx.value !== ',') {
          pos++;
          if (loopDepth <= 0) {
            addError(t, "'continue' can only be used inside a loop");
          }
          return { type: 'ContinueStatement', keyword: 'continue', line: t.line };
        }
      }

      if (eat('local')) {
        return parseLocalAfterKeyword(t);
      }

      if (eat('function')) {
        return parseFunctionDeclaration(t);
      }

      if (eat('if')) {
        return parseIfStatement(t);
      }

      if (eat('while')) {
        return parseWhileStatement(t);
      }

      if (eat('repeat')) {
        return parseRepeatStatement(t);
      }

      if (eat('for')) {
        return parseForStatement(t);
      }

      if (eat('do')) {
        const body = parseBlock(['end']);
        if (!eat('end')) {
          addError(t, `Unclosed 'do' block starting at line ${t.line} (missing 'end')`);
        }
        return { type: 'DoStatement', body, line: t.line };
      }

      if (eat('return')) {
        const values = [];
        if (!isBlockCloser(cur()) && !at(';')) {
          values.push(parseExpression());
          while (eat(',')) {
            values.push(parseExpression());
          }
        }
        return { type: 'ReturnStatement', keyword: 'return', values, line: t.line };
      }

      if (eat('break')) {
        if (loopDepth <= 0) {
          addError(t, "'break' can only be used inside a loop");
        }
        return { type: 'BreakStatement', keyword: 'break', line: t.line };
      }

      // Stray block closers at top level or mismatched
      if (t.value === 'end' || t.value === 'else' || t.value === 'elseif' || t.value === 'until') {
        addError(t, `Unexpected '${t.value}' with no matching opening block`);
        pos++;
        return null;
      }

      // Expression statement: function call, assignment, or compound assignment
      const expr = parsePrimaryOrSuffixed();
      if (!expr) {
        recoverToNextStatement();
        return null;
      }

      // Compound assignment: `x += 1`
      if (COMPOUND_OPS.has(cur().value)) {
        const opTok = codeTokens[pos++];
        if (!isValidAssignTarget(expr)) {
          addError(opTok, `Invalid assignment target before '${opTok.value}'`);
        }
        const rhs = parseExpression();
        return {
          type: 'CompoundAssignStatement',
          operator: opTok.value,
          target: expr,
          value: rhs,
          line: t.line
        };
      }

      // Standard assignment: `a, b = 1, 2`
      if (at('=') || at(',')) {
        const targets = [expr];
        if (!isValidAssignTarget(expr)) {
          addError(t, 'Invalid left-hand side in assignment');
        }
        while (eat(',')) {
          const nextTarget = parsePrimaryOrSuffixed();
          if (nextTarget) {
            if (!isValidAssignTarget(nextTarget)) {
              addError(cur(), 'Invalid left-hand side in multiple assignment');
            }
            targets.push(nextTarget);
          }
        }
        if (!expect('=', "Expected '=' in assignment statement")) {
          recoverToNextStatement();
          return null;
        }
        const values = [parseExpression()];
        while (eat(',')) {
          values.push(parseExpression());
        }
        return {
          type: 'AssignStatement',
          targets,
          values,
          line: t.line
        };
      }

      if (expr.type === 'CallExpression' || expr.type === 'MethodCallExpression') {
        return {
          type: 'CallStatement',
          expression: expr,
          line: t.line
        };
      }

      // Catch JS/C block habit `if (x) {` or standalone identifier mistake
      if (at('{')) {
        addError(cur(), "Unexpected '{' — Luau blocks use 'then ... end' or 'do ... end', not '{ ... }'");
      } else {
        addError(t, 'Incomplete statement — expected assignment or function call');
      }
      recoverToNextStatement();
      return null;
    }

    function isValidAssignTarget(node) {
      return (
        node &&
        (node.type === 'Identifier' || node.type === 'MemberExpression' || node.type === 'IndexExpression')
      );
    }

    function parseTypeAliasRest() {
      if (cur().type === 'ident') pos++;
      skipGenericParams();
      if (eat('=')) {
        skipTypeAnnotation();
      }
    }

    function parseLocalAfterKeyword(localTok) {
      if (eat('function')) {
        const nameTok = expectIdent("Expected function name after 'local function'");
        const fnBody = parseFunctionBody(localTok);
        return {
          type: 'LocalFunctionStatement',
          name: nameTok ? nameTok.value : '_invalid',
          nameLine: nameTok ? nameTok.line : localTok.line,
          params: fnBody.params,
          hasVararg: fnBody.hasVararg,
          body: fnBody.body,
          line: localTok.line
        };
      }

      const vars = [];
      while (true) {
        const id = expectIdent("Expected variable name after 'local'");
        let annotatedType = null;
        if (eat(':')) {
          const typeStart = cur();
          skipTypeAnnotation();
          annotatedType = typeStart.value;
        }
        if (id) {
          vars.push({ name: id.value, line: id.line, col: id.col, annotatedType });
        }
        if (!eat(',')) break;
      }

      const init = [];
      if (eat('=')) {
        init.push(parseExpression());
        while (eat(',')) {
          init.push(parseExpression());
        }
      }

      return {
        type: 'LocalStatement',
        vars,
        init,
        line: localTok.line
      };
    }

    function parseFunctionDeclaration(fnTok) {
      const baseTok = expectIdent("Expected function name after 'function'");
      const path = baseTok ? [baseTok.value] : ['_invalid'];
      let method = null;
      while (eat('.')) {
        const seg = expectIdent("Expected field name after '.'");
        if (seg) path.push(seg.value);
      }
      if (eat(':')) {
        const mTok = expectIdent("Expected method name after ':'");
        if (mTok) method = mTok.value;
      }
      const fnBody = parseFunctionBody(fnTok);
      return {
        type: 'FunctionStatement',
        path,
        method,
        params: fnBody.params,
        hasVararg: fnBody.hasVararg,
        body: fnBody.body,
        line: fnTok.line
      };
    }

    function parseFunctionBody(openTok) {
      skipGenericParams();
      expect('(', "Expected '(' for function parameter list");
      const params = [];
      let hasVararg = false;
      if (!at(')') && !at('<eof>')) {
        while (true) {
          if (eat('...')) {
            hasVararg = true;
            if (eat(':')) skipTypeAnnotation();
            break;
          }
          const p = expectIdent('Expected parameter name or `...`');
          if (p) params.push(p.value);
          if (eat(':')) skipTypeAnnotation();
          if (!eat(',')) break;
        }
      }
      expect(')', "Expected ')' after function parameters");
      if (eat(':')) {
        skipTypeAnnotation();
      }
      const body = parseBlock(['end']);
      if (!eat('end')) {
        addError(openTok, `Unclosed 'function' starting at line ${openTok.line} (missing 'end')`);
      }
      return { params, hasVararg, body };
    }

    function parseIfStatement(ifTok) {
      const clauses = [];
      const test = parseExpression();
      if (!eat('then')) {
        if (eat('{')) {
          addError(prev(), "Luau uses 'then ... end' instead of '{ ... }' after 'if'");
        } else {
          addError(prev(), "Expected 'then' after 'if' condition");
        }
      }
      const consequent = parseBlock(['elseif', 'else', 'end']);
      clauses.push({ test, body: consequent, line: ifTok.line });

      while (eat('elseif')) {
        const elifTok = prev();
        const elifTest = parseExpression();
        if (!eat('then')) {
          addError(prev(), "Expected 'then' after 'elseif' condition");
        }
        const elifBody = parseBlock(['elseif', 'else', 'end']);
        clauses.push({ test: elifTest, body: elifBody, line: elifTok.line });
      }

      let alternate = null;
      if (eat('else')) {
        // Common mistake: `else if` instead of `elseif`!
        if (cur().value === 'if' && cur().line === prev().line) {
          addError(cur(), "Use 'elseif' (one word) instead of 'else if' in Luau, or close the inner 'if' with its own 'end'");
        }
        alternate = parseBlock(['end']);
      }

      if (!eat('end')) {
        addError(ifTok, `Unclosed 'if' statement starting at line ${ifTok.line} (missing 'end')`);
      }

      return {
        type: 'IfStatement',
        clauses,
        alternate,
        line: ifTok.line
      };
    }

    function parseWhileStatement(whileTok) {
      const test = parseExpression();
      if (!eat('do')) {
        if (eat('{')) {
          addError(prev(), "Luau uses 'do ... end' instead of '{ ... }' after 'while'");
        } else {
          addError(prev(), "Expected 'do' after 'while' condition");
        }
      }
      loopDepth++;
      const body = parseBlock(['end']);
      loopDepth--;
      if (!eat('end')) {
        addError(whileTok, `Unclosed 'while' loop starting at line ${whileTok.line} (missing 'end')`);
      }
      return {
        type: 'WhileStatement',
        test,
        body,
        line: whileTok.line
      };
    }

    function parseRepeatStatement(repTok) {
      loopDepth++;
      const body = parseBlock(['until', 'end']);
      loopDepth--;
      if (eat('end')) {
        addError(prev(), "'repeat' loop must close with 'until <condition>', not 'end'");
        return {
          type: 'RepeatStatement',
          body,
          test: { type: 'BooleanLiteral', value: true, line: repTok.line },
          line: repTok.line
        };
      }
      if (!eat('until')) {
        addError(repTok, `Unclosed 'repeat' loop starting at line ${repTok.line} (missing 'until <condition>')`);
        return {
          type: 'RepeatStatement',
          body,
          test: { type: 'BooleanLiteral', value: true, line: repTok.line },
          line: repTok.line
        };
      }
      const test = parseExpression();
      return {
        type: 'RepeatStatement',
        body,
        test,
        line: repTok.line
      };
    }

    function parseForStatement(forTok) {
      const firstVar = expectIdent("Expected loop variable after 'for'");
      if (eat(':')) skipTypeAnnotation();

      // Numeric for: `for i = start, stop, step do`
      if (eat('=')) {
        const start = parseExpression();
        expect(',', "Expected ',' after numeric 'for' start value");
        const stop = parseExpression();
        let step = null;
        if (eat(',')) {
          step = parseExpression();
        }
        if (!eat('do')) {
          addError(prev(), "Expected 'do' after numeric 'for' range");
        }
        loopDepth++;
        const body = parseBlock(['end']);
        loopDepth--;
        if (!eat('end')) {
          addError(forTok, `Unclosed 'for' loop starting at line ${forTok.line} (missing 'end')`);
        }
        return {
          type: 'NumericForStatement',
          variable: firstVar ? firstVar.value : '_i',
          start,
          stop,
          step,
          body,
          line: forTok.line
        };
      }

      // Generic for: `for k, v in exprs do`
      const vars = [firstVar ? firstVar.value : '_k'];
      while (eat(',')) {
        const vTok = expectIdent("Expected variable name after ',' in 'for' loop");
        if (eat(':')) skipTypeAnnotation();
        if (vTok) vars.push(vTok.value);
      }
      if (!eat('in')) {
        addError(cur(), "Expected 'in' or '=' in 'for' loop header");
      }
      const iterators = [parseExpression()];
      while (eat(',')) {
        iterators.push(parseExpression());
      }
      if (!eat('do')) {
        addError(prev(), "Expected 'do' after 'for ... in' expression");
      }
      loopDepth++;
      const body = parseBlock(['end']);
      loopDepth--;
      if (!eat('end')) {
        addError(forTok, `Unclosed 'for' loop starting at line ${forTok.line} (missing 'end')`);
      }
      return {
        type: 'GenericForStatement',
        variables: vars,
        iterators,
        body,
        line: forTok.line
      };
    }

    // Expressions (Pratt / Precedence climbing)
    function parseExpression(minPrec = 0) {
      let left = parseUnary();

      // Luau type cast `expr :: Type`
      while (eat('::')) {
        skipTypeAnnotation();
      }

      while (true) {
        const op = cur().value;
        const prec = BIN_PRECEDENCE[op];
        if (!prec || prec[0] <= minPrec) break;
        const opTok = codeTokens[pos++];
        const right = parseExpression(prec[1]);
        left = {
          type: 'BinaryExpression',
          operator: opTok.value,
          left,
          right,
          line: opTok.line
        };
        while (eat('::')) {
          skipTypeAnnotation();
        }
      }
      return left;
    }

    function parseUnary() {
      const t = cur();
      if (t.value === 'not' || t.value === '-' || t.value === '#') {
        pos++;
        const argument = parseExpression(8);
        return {
          type: 'UnaryExpression',
          operator: t.value,
          argument,
          line: t.line
        };
      }
      return parsePrimaryOrSuffixed();
    }

    function isPrefixExpr(node) {
      return (
        node &&
        (node.type === 'Identifier' ||
          node.type === 'ParenExpression' ||
          node.type === 'MemberExpression' ||
          node.type === 'IndexExpression' ||
          node.type === 'CallExpression' ||
          node.type === 'MethodCallExpression')
      );
    }

    function parsePrimaryOrSuffixed() {
      let expr = parsePrimary();
      if (!expr) return { type: 'NilLiteral', line: cur().line };
      if (!isPrefixExpr(expr)) return expr;

      while (true) {
        if (eat('.')) {
          const prop = expectIdent("Expected property name after '.'");
          expr = {
            type: 'MemberExpression',
            object: expr,
            property: prop ? prop.value : '',
            line: prop ? prop.line : cur().line
          };
          continue;
        }
        if (eat('[')) {
          const openBr = prev();
          const index = parseExpression();
          if (!eat(']')) {
            addError(openBr, `Unclosed '[' starting at line ${openBr.line} (missing ']')`);
          }
          expr = {
            type: 'IndexExpression',
            object: expr,
            index,
            line: openBr.line
          };
          continue;
        }
        if (eat(':')) {
          const mTok = expectIdent("Expected method name after ':'");
          const args = parseCallArgs(mTok || prev());
          expr = {
            type: 'MethodCallExpression',
            object: expr,
            method: mTok ? mTok.value : '',
            arguments: args,
            line: mTok ? mTok.line : cur().line
          };
          continue;
        }
        if (at('(') || cur().type === 'string' || at('{')) {
          const args = parseCallArgs(prev());
          expr = {
            type: 'CallExpression',
            callee: expr,
            arguments: args,
            line: expr.line
          };
          continue;
        }
        break;
      }
      return expr;
    }

    function parseCallArgs(contextTok) {
      if (eat('(')) {
        const openParen = prev();
        const args = [];
        if (!at(')') && !at('<eof>')) {
          args.push(parseExpression());
          while (eat(',')) {
            args.push(parseExpression());
          }
        }
        if (!eat(')')) {
          addError(openParen, `Unclosed '(' in function call at line ${openParen.line} (missing ')')`);
        }
        return args;
      }
      if (cur().type === 'string') {
        const s = codeTokens[pos++];
        return [{ type: 'StringLiteral', value: s.value, line: s.line }];
      }
      if (at('{')) {
        return [parseTableConstructor()];
      }
      addError(contextTok, "Expected '(' for method/function arguments");
      return [];
    }

    function parsePrimary() {
      const t = cur();

      if (eat('nil')) return { type: 'NilLiteral', line: t.line };
      if (eat('true')) return { type: 'BooleanLiteral', value: true, line: t.line };
      if (eat('false')) return { type: 'BooleanLiteral', value: false, line: t.line };

      if (t.type === 'number') {
        pos++;
        return { type: 'NumberLiteral', value: t.value, line: t.line };
      }

      if (t.type === 'string') {
        pos++;
        return { type: 'StringLiteral', value: t.value, line: t.line };
      }

      if (t.type === 'interp_string') {
        pos++;
        const compiledParts = t.parts.map((part) => {
          if (part.kind === 'text') {
            return { kind: 'text', value: part.value };
          }
          const sub = parseLuau('return (' + part.source + ')');
          for (const d of sub.diagnostics) {
            diagnostics.push({
              severity: d.severity,
              line: part.line + (d.line - 1),
              col: d.line === 1 ? part.col + d.col - 9 : d.col,
              endCol: d.line === 1 ? part.col + d.endCol - 9 : d.endCol,
              message: `In string interpolation: ${d.message}`
            });
          }
          const retStmt = sub.ast.body[0];
          const exprAst = retStmt && retStmt.values && retStmt.values[0]
            ? retStmt.values[0]
            : { type: 'NilLiteral', line: part.line };
          return { kind: 'expr', ast: exprAst };
        });
        return { type: 'InterpolatedString', parts: compiledParts, line: t.line };
      }

      if (eat('...')) {
        return { type: 'VarargLiteral', line: t.line };
      }

      if (eat('function')) {
        const fnBody = parseFunctionBody(t);
        return {
          type: 'FunctionExpression',
          params: fnBody.params,
          hasVararg: fnBody.hasVararg,
          body: fnBody.body,
          line: t.line
        };
      }

      // Luau inline ternary expression: `if cond then expr1 elseif cond2 then expr2 else expr3`
      if (eat('if')) {
        const clauses = [];
        const test = parseExpression();
        expect('then', "Expected 'then' in inline 'if ... then ... else' expression");
        const consequent = parseExpression();
        clauses.push({ test, consequent });
        while (eat('elseif')) {
          const eTest = parseExpression();
          expect('then', "Expected 'then' after 'elseif' in inline expression");
          const eCons = parseExpression();
          clauses.push({ test: eTest, consequent: eCons });
        }
        expect('else', "Expected 'else' in inline 'if ... then ... else' expression");
        const alternate = parseExpression();
        return {
          type: 'IfExpression',
          clauses,
          alternate,
          line: t.line
        };
      }

      if (at('{')) {
        return parseTableConstructor();
      }

      if (eat('(')) {
        const expr = parseExpression();
        if (!eat(')')) {
          addError(t, `Unclosed '(' starting at line ${t.line} (missing ')')`);
        }
        return { type: 'ParenExpression', expression: expr, line: t.line };
      }

      if (t.type === 'ident') {
        pos++;
        return { type: 'Identifier', name: t.value, line: t.line, col: t.col };
      }

      addError(t, `Unexpected ${t.type === 'eof' ? 'end of script' : `'${t.raw || t.value}'`} — expected expression`);
      if (!at('<eof>') && !isBlockCloser(t)) pos++;
      return { type: 'NilLiteral', line: t.line };
    }

    function parseTableConstructor() {
      const openTok = expect('{');
      const fields = [];
      while (!at('}') && !at('<eof>')) {
        if (eat('[')) {
          const key = parseExpression();
          expect(']', "Expected ']' after computed table key");
          expect('=', "Expected '=' after '[key]' in table constructor");
          const value = parseExpression();
          fields.push({ kind: 'computed', key, value });
        } else if (cur().type === 'ident' && peek().value === '=') {
          const keyTok = codeTokens[pos++];
          pos++; // =
          const value = parseExpression();
          fields.push({ kind: 'named', key: keyTok.value, value });
        } else {
          const value = parseExpression();
          fields.push({ kind: 'array', value });
        }
        if (!eat(',') && !eat(';')) break;
      }
      if (!eat('}')) {
        addError(openTok, `Unclosed '{' table constructor starting at line ${openTok.line} (missing '}')`);
      }
      return {
        type: 'TableConstructor',
        fields,
        line: openTok.line
      };
    }

    const body = parseBlock(null);
    return {
      ast: { type: 'Chunk', body },
      tokens: allTokens,
      codeTokens,
      diagnostics
    };
  }

  // =========================================================================
  // ROBLOX STATIC ANALYZER & SYMBOL / TYPE EXTRACTOR
  // =========================================================================

  function analyzeLuau(source, context) {
    const ctx = context || {};
    const scriptClass = ctx.scriptClassName || 'Script';
    const parsed = parseLuau(source);
    const diagnostics = parsed.diagnostics.slice();
    const symbols = new Map(); // name -> { name, kind, inferredType, line }

    const validServiceNames = new Set(
      API ? API.SERVICES.map((s) => s.name) : ['Workspace', 'Players', 'ReplicatedStorage', 'ServerScriptService', 'TweenService', 'RunService', 'UserInputService', 'DataStoreService', 'Lighting', 'StarterGui']
    );
    const serverOnlyServices = new Set(
      API ? API.SERVICES.filter((s) => s.serverOnly).map((s) => s.name) : ['ServerScriptService', 'ServerStorage', 'DataStoreService']
    );

    // Infer expression Roblox class type for smart IntelliSense
    function inferExprType(node) {
      if (!node) return null;
      if (node.type === 'StringLiteral' || node.type === 'InterpolatedString') return 'string';
      if (node.type === 'NumberLiteral') return 'number';
      if (node.type === 'BooleanLiteral') return 'boolean';
      if (node.type === 'TableConstructor') return 'table';
      if (node.type === 'Identifier') {
        if (node.name === 'workspace') return 'Workspace';
        if (node.name === 'game') return 'DataModel';
        if (node.name === 'script') return scriptClass;
        const sym = symbols.get(node.name);
        return sym ? sym.inferredType : null;
      }
      // game:GetService("Players")
      if (
        node.type === 'MethodCallExpression' &&
        node.method === 'GetService' &&
        node.arguments &&
        node.arguments[0] &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        return node.arguments[0].value;
      }
      // Instance.new("Part")
      if (
        node.type === 'CallExpression' &&
        node.callee &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object &&
        node.callee.object.name === 'Instance' &&
        node.callee.property === 'new' &&
        node.arguments &&
        node.arguments[0] &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        return node.arguments[0].value;
      }
      // DataStoreService:GetDataStore(...)
      if (node.type === 'MethodCallExpression' && (node.method === 'GetDataStore' || node.method === 'GetOrderedDataStore')) {
        return 'GlobalDataStore';
      }
      // TweenService:Create(...)
      if (node.type === 'MethodCallExpression' && node.method === 'Create') {
        return 'Tween';
      }
      // Players.LocalPlayer
      if (node.type === 'MemberExpression' && node.property === 'LocalPlayer') {
        return 'Player';
      }
      // workspace:WaitForChild("CoinPart") or workspace.CoinPart
      if (
        node.type === 'MethodCallExpression' &&
        (node.method === 'WaitForChild' || node.method === 'FindFirstChild') &&
        node.arguments[0] &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        if (ctx.resolveChildClass) {
          const parentType = inferExprType(node.object);
          const resolved = ctx.resolveChildClass(parentType, node.arguments[0].value);
          if (resolved) return resolved;
        }
        return 'Instance';
      }
      if (node.type === 'MemberExpression' && ctx.resolveChildClass) {
        const parentType = inferExprType(node.object);
        const resolved = ctx.resolveChildClass(parentType, node.property);
        if (resolved) return resolved;
      }
      return null;
    }

    function walkStmtList(list) {
      if (!list) return;
      for (const s of list) walkNode(s);
    }

    function walkNode(node) {
      if (!node || typeof node !== 'object') return;
      switch (node.type) {
        case 'LocalStatement': {
          node.vars.forEach((v, idx) => {
            const initNode = node.init[idx];
            if (initNode) walkNode(initNode);
            const inferred = v.annotatedType || inferExprType(initNode) || 'any';
            symbols.set(v.name, {
              name: v.name,
              kind: initNode && initNode.type === 'FunctionExpression' ? 'function' : 'variable',
              inferredType: inferred,
              line: v.line
            });
          });
          for (let k = node.vars.length; k < node.init.length; k++) walkNode(node.init[k]);
          break;
        }
        case 'LocalFunctionStatement': {
          symbols.set(node.name, {
            name: node.name,
            kind: 'function',
            params: node.params,
            inferredType: 'function',
            line: node.nameLine || node.line
          });
          node.params.forEach((p) => {
            const guessed = p === 'player' || p === 'plr' ? 'Player' : p === 'character' || p === 'char' ? 'Model' : p === 'humanoid' ? 'Humanoid' : 'any';
            symbols.set(p, { name: p, kind: 'parameter', inferredType: guessed, line: node.line });
          });
          walkStmtList(node.body);
          break;
        }
        case 'FunctionStatement': {
          if (node.path.length === 1 && !node.method) {
            symbols.set(node.path[0], {
              name: node.path[0],
              kind: 'function',
              params: node.params,
              inferredType: 'function',
              line: node.line
            });
          }
          walkStmtList(node.body);
          break;
        }
        case 'FunctionExpression': {
          node.params.forEach((p) => {
            const guessed = p === 'player' || p === 'plr' ? 'Player' : p === 'otherPart' || p === 'hit' ? 'Part' : 'any';
            if (!symbols.has(p)) {
              symbols.set(p, { name: p, kind: 'parameter', inferredType: guessed, line: node.line });
            }
          });
          walkStmtList(node.body);
          break;
        }
        case 'IfStatement': {
          for (const c of node.clauses) {
            walkNode(c.test);
            walkStmtList(c.body);
          }
          walkStmtList(node.alternate);
          break;
        }
        case 'IfExpression': {
          for (const c of node.clauses) {
            walkNode(c.test);
            walkNode(c.consequent);
          }
          walkNode(node.alternate);
          break;
        }
        case 'WhileStatement':
        case 'RepeatStatement': {
          walkNode(node.test);
          walkStmtList(node.body);
          break;
        }
        case 'NumericForStatement': {
          symbols.set(node.variable, { name: node.variable, kind: 'variable', inferredType: 'number', line: node.line });
          walkNode(node.start);
          walkNode(node.stop);
          walkNode(node.step);
          walkStmtList(node.body);
          break;
        }
        case 'GenericForStatement': {
          node.variables.forEach((v) => {
            symbols.set(v, { name: v, kind: 'variable', inferredType: 'any', line: node.line });
          });
          node.iterators.forEach(walkNode);
          walkStmtList(node.body);
          break;
        }
        case 'DoStatement':
          walkStmtList(node.body);
          break;
        case 'ReturnStatement':
          node.values.forEach(walkNode);
          break;
        case 'AssignStatement':
          node.targets.forEach(walkNode);
          node.values.forEach(walkNode);
          break;
        case 'CompoundAssignStatement':
          walkNode(node.target);
          walkNode(node.value);
          break;
        case 'CallStatement':
          walkNode(node.expression);
          break;
        case 'BinaryExpression':
          walkNode(node.left);
          walkNode(node.right);
          break;
        case 'UnaryExpression':
          walkNode(node.argument);
          break;
        case 'ParenExpression':
          walkNode(node.expression);
          break;
        case 'TableConstructor':
          node.fields.forEach((f) => {
            if (f.key && typeof f.key === 'object') walkNode(f.key);
            walkNode(f.value);
          });
          break;
        case 'InterpolatedString':
          node.parts.forEach((p) => {
            if (p.kind === 'expr') walkNode(p.ast);
          });
          break;
        case 'IndexExpression':
          walkNode(node.object);
          walkNode(node.index);
          break;
        case 'MemberExpression': {
          walkNode(node.object);
          // Roblox lint: Players.LocalPlayer in a Server Script
          if (node.property === 'LocalPlayer' && scriptClass === 'Script') {
            diagnostics.push({
              severity: 'warning',
              line: node.line,
              col: 1,
              endCol: 80,
              message: "'Players.LocalPlayer' is nil in a Server Script — use a LocalScript or Players.PlayerAdded"
            });
          }
          // Roblox lint: RenderStepped in a Server Script
          if (node.property === 'RenderStepped' && scriptClass === 'Script') {
            diagnostics.push({
              severity: 'warning',
              line: node.line,
              col: 1,
              endCol: 80,
              message: "'RunService.RenderStepped' only fires on the Client — use 'RunService.Heartbeat' in a Server Script"
            });
          }
          break;
        }
        case 'CallExpression': {
          walkNode(node.callee);
          node.arguments.forEach(walkNode);
          // Lint: deprecated global wait / spawn / delay
          if (node.callee && node.callee.type === 'Identifier') {
            const fnName = node.callee.name;
            if (fnName === 'wait' || fnName === 'spawn' || fnName === 'delay') {
              diagnostics.push({
                severity: 'info',
                line: node.line,
                col: node.callee.col || 1,
                endCol: (node.callee.col || 1) + fnName.length,
                message: `Deprecated '${fnName}()' — prefer 'task.${fnName}()' for modern 60Hz Roblox scheduler`
              });
            }
          }
          // Lint: calling Instance method with `.` instead of `:` (e.g. `game.GetService("Players")` or `part.Destroy()`)
          if (
            node.callee &&
            node.callee.type === 'MemberExpression' &&
            COMMON_METHODS.has(node.callee.property)
          ) {
            diagnostics.push({
              severity: 'warning',
              line: node.line,
              col: 1,
              endCol: 80,
              message: `Method '${node.callee.property}' is usually called with ':' instead of '.' (e.g. :${node.callee.property}(...))`
            });
          }
          break;
        }
        case 'MethodCallExpression': {
          walkNode(node.object);
          node.arguments.forEach(walkNode);
          if (
            node.method === 'GetService' &&
            node.arguments[0] &&
            node.arguments[0].type === 'StringLiteral'
          ) {
            const svc = node.arguments[0].value;
            if (!validServiceNames.has(svc)) {
              diagnostics.push({
                severity: 'warning',
                line: node.line,
                col: 1,
                endCol: 80,
                message: `Unknown Roblox Service "${svc}" in game:GetService()`
              });
            } else if (scriptClass === 'LocalScript' && serverOnlyServices.has(svc)) {
              diagnostics.push({
                severity: 'warning',
                line: node.line,
                col: 1,
                endCol: 80,
                message: `'${svc}' is Server-only and cannot be accessed from a LocalScript`
              });
            }
          }
          break;
        }
        case 'Identifier': {
          if (node.name === 'null' || node.name === 'undefined' || node.name === 'None') {
            diagnostics.push({
              severity: 'warning',
              line: node.line,
              col: node.col || 1,
              endCol: (node.col || 1) + node.name.length,
              message: `Unknown identifier '${node.name}' — Luau uses 'nil' for empty values`
            });
          }
          break;
        }
        default:
          break;
      }
    }

    walkStmtList(parsed.ast.body);

    // ModuleScript check: must end with a ReturnStatement
    if (scriptClass === 'ModuleScript') {
      const stmts = parsed.ast.body.filter((s) => s.type !== 'NoopStatement');
      const last = stmts[stmts.length - 1];
      if (!last || last.type !== 'ReturnStatement' || last.values.length !== 1) {
        const lastLine = Math.max(1, source.split('\n').length);
        diagnostics.push({
          severity: 'warning',
          line: lastLine,
          col: 1,
          endCol: 40,
          message: 'ModuleScript should return a single table or value at the end of the file'
        });
      }
    }

    return {
      ast: parsed.ast,
      tokens: parsed.tokens,
      diagnostics,
      symbols: Array.from(symbols.values())
    };
  }

  // =========================================================================
  // SYNTAX HIGHLIGHTER HTML GENERATOR (1:1 Line & Character Preserving!)
  // =========================================================================

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Literal-only previews: never evaluate user code. Lexer tokens exclude comments
  // and strings, so text that merely looks like a constructor is not executed.
  function findColorLiterals(source, suppliedTokens) {
    const tokens=suppliedTokens || tokenize(source).tokens, results=[], used=new Set();
    const byte=n=>Math.round(Math.max(0,Math.min(1,n))*255);
    const hex=rgb=>'#'+rgb.map(n=>byte(n).toString(16).padStart(2,'0')).join('');
    const hsv=(h,s,v)=>{h=((h%1)+1)%1*6;let i=Math.floor(h), f=h-i, p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i]};
    for(let i=0;i<tokens.length;i++){
      const t=tokens[i];
      if(t.type==='ident' && t.value==='Color3' && tokens[i-1]?.value!=='.' && tokens[i+1]?.value==='.' && tokens[i+3]?.value==='('){
        const kind=tokens[i+2]?.value;let k=i+4;
        if(kind==='fromHex'){
          const arg=tokens[k], close=tokens[k+1], raw=arg?.raw||'';
          if(arg?.type==='string' && /^['"]#?[0-9a-fA-F]{6}['"]$/.test(raw) && close?.value===')'){
            let value=raw.slice(1,-1).replace(/^#/,'');results.push({kind,hex:'#'+value.toLowerCase(),start:t.start,end:close.end,editStart:arg.start,editEnd:arg.end,raw,line:t.line,mark:t.start});used.add(k);i=k+1;continue;
          }
        }else if(['fromRGB','new','fromHSV'].includes(kind)){
          const nums=[],argStart=tokens[k]?.start;let good=true;
          for(let j=0;j<3;j++){
            let sign=1;if(tokens[k]?.value==='-'||tokens[k]?.value==='+'){if(tokens[k].value==='-')sign=-1;k++}
            const n=tokens[k++];let v=Number(String(n?.raw||'').replace(/_/g,''))*sign;
            if(n?.type!=='number'||!Number.isFinite(v)){good=false;break}nums.push(v);
            if(j<2){if(tokens[k]?.value!==','){good=false;break}k++}
          }
          if(good && tokens[k]?.value===')'){
            const rgb=kind==='fromRGB'?nums.map(v=>v/255):kind==='fromHSV'?hsv(...nums):nums;
            results.push({kind,hex:hex(rgb),start:t.start,end:tokens[k].end,editStart:argStart,editEnd:tokens[k-1].end,line:t.line,mark:t.start});i=k;continue;
          }
        }
      }
      // Standalone quoted #RGB or #RRGGBB strings are useful too.
      if(t.type==='string' && !used.has(i) && /^['"]#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})['"]$/.test(t.raw||'')){
        let v=t.raw.slice(2,-1).toLowerCase();if(v.length===3)v=[...v].map(c=>c+c).join('');
        results.push({kind:'hexString',hex:'#'+v,start:t.start,end:t.end,editStart:t.start,editEnd:t.end,raw:t.raw,line:t.line,mark:t.start});
      }
    }
    return results;
  }

  function highlightLuau(source, diagnostics, colorLiterals) {
    const { tokens } = tokenize(source);
    const colorByStart = new Map((colorLiterals || []).map(c => [c.mark, c.hex]));
    const diagByLine = new Map();
    for (const d of diagnostics || []) {
      if (!diagByLine.has(d.line)) diagByLine.set(d.line, []);
      diagByLine.get(d.line).push(d);
    }

    // Build token spans while preserving exact source slices (including whitespace/newlines)
    let out = '';
    let cursor = 0;

    for (let idx = 0; idx < tokens.length; idx++) {
      const tok = tokens[idx];
      if (tok.type === 'eof') break;

      if (tok.start > cursor) {
        out += escapeHtml(source.slice(cursor, tok.start));
      }

      const prevTok = idx > 0 ? tokens[idx - 1] : null;
      const nextTok = tokens[idx + 1] || null;
      let cls = '';

      if (tok.invalidRaw) {
        cls = 'tok-invalid';
      } else if (tok.type === 'comment') {
        cls = 'tok-comment';
      } else if (tok.type === 'directive') {
        cls = 'tok-directive';
      } else if (tok.type === 'string') {
        cls = 'tok-string';
      } else if (tok.type === 'interp_string') {
        // Highlight backtick string + inner {expr} brackets!
        cls = 'tok-interp';
      } else if (tok.type === 'number') {
        cls = 'tok-number';
      } else if (tok.type === 'keyword') {
        if (tok.value === 'true' || tok.value === 'false' || tok.value === 'nil') {
          cls = 'tok-boolean';
        } else {
          cls = 'tok-keyword';
        }
      } else if (tok.type === 'ident') {
        if (tok.value === 'self') {
          cls = 'tok-self';
        } else if (tok.value === 'continue' || ((tok.value === 'export' || tok.value === 'type') && nextTok && nextTok.type === 'ident')) {
          cls = 'tok-keyword';
        } else if (prevTok && prevTok.value === ':' && !(nextTok && (nextTok.value === '(' || nextTok.type === 'string' || nextTok.value === '{'))) {
          cls = 'tok-type';
        } else if (API && API.LUAU_TYPES.includes(tok.value) && prevTok && (prevTok.value === ':' || prevTok.value === '->' || prevTok.value === '|')) {
          cls = 'tok-type';
        } else if (prevTok && (prevTok.value === '.' || prevTok.value === ':')) {
          if (nextTok && (nextTok.value === '(' || nextTok.type === 'string' || nextTok.value === '{')) {
            cls = 'tok-method';
          } else {
            cls = 'tok-property';
          }
        } else if (BUILTIN_GLOBALS.has(tok.value)) {
          if (nextTok && nextTok.value === '(') {
            cls = 'tok-builtin-fn';
          } else {
            cls = 'tok-roblox';
          }
        } else if (nextTok && (nextTok.value === '(' || nextTok.type === 'string' || nextTok.value === '{')) {
          cls = 'tok-function';
        } else {
          cls = 'tok-ident';
        }
      } else if (tok.type === 'punct') {
        if ('(){}[]'.includes(tok.value)) cls = 'tok-bracket';
        else cls = 'tok-operator';
      }

      // Check if an error diagnostic specifically targets this token
      const lineDiags = diagByLine.get(tok.line);
      let squiggleCls = '';
      if (lineDiags) {
        for (const d of lineDiags) {
          if (tok.col <= d.endCol && (tok.endCol || tok.col + 1) >= d.col) {
            squiggleCls = d.severity === 'error' ? ' tok-squiggle-error' : d.severity === 'warning' ? ' tok-squiggle-warn' : ' tok-squiggle-info';
            if (d.severity === 'error') break;
          }
        }
      }

      const rawText = source.slice(tok.start, tok.end);
      const colorMark=colorByStart.get(tok.start);
      if (colorMark && /^#[0-9a-f]{6}$/.test(colorMark)) cls += ' color-mark';
      const colorStyle=colorMark && /^#[0-9a-f]{6}$/.test(colorMark) ? ` style="--literal-color:${colorMark}"` : '';
      if (tok.type === 'interp_string') {
        out += `<span class="tok-string${squiggleCls}">${highlightInterpolatedRaw(rawText)}</span>`;
      } else if (cls || squiggleCls) {
        out += `<span class="${(cls + squiggleCls).trim()}"${colorStyle}>${escapeHtml(rawText)}</span>`;
      } else {
        out += escapeHtml(rawText);
      }

      cursor = tok.end;
    }

    if (cursor < source.length) {
      out += escapeHtml(source.slice(cursor));
    }

    return out + ' ';
  }

  function highlightInterpolatedRaw(raw) {
    let html = '';
    let i = 0;
    while (i < raw.length) {
      if (raw[i] === '\\' && i + 1 < raw.length) {
        html += `<span class="tok-escape">${escapeHtml(raw.slice(i, i + 2))}</span>`;
        i += 2;
        continue;
      }
      if (raw[i] === '{') {
        let depth = 1;
        let j = i + 1;
        while (j < raw.length && depth > 0) {
          if (raw[j] === '{') depth++;
          else if (raw[j] === '}') depth--;
          if (depth > 0) j++;
        }
        const inner = raw.slice(i + 1, j);
        html += `<span class="tok-operator">{</span><span class="tok-ident">${escapeHtml(inner)}</span><span class="tok-operator">${j < raw.length ? '}' : ''}</span>`;
        i = j + 1;
        continue;
      }
      html += escapeHtml(raw[i]);
      i++;
    }
    return html;
  }

  // =========================================================================
  // LUAU CODE FORMATTER (Smart Block & Brace Re-Indenter)
  // =========================================================================

  function isInlineIfThen(code, thenIdx) {
    for (let m = thenIdx - 1; m >= 0; m--) {
      if (code[m].value === 'elseif') return false;
      if (code[m].value === 'if') {
        return m > 0 && code[m - 1].value !== ';';
      }
    }
    return false;
  }

  function formatLuau(source, indentUnit) {
    const unit = indentUnit || '    ';
    const rawLines = source.replace(/\r\n/g, '\n').split('\n');
    const frames = [];
    const formatted = [];
    let inLongBlock = false;
    let longClosing = '';

    for (let idx = 0; idx < rawLines.length; idx++) {
      const orig = rawLines[idx];
      if (inLongBlock) {
        formatted.push(orig);
        if (orig.includes(longClosing)) {
          inLongBlock = false;
        }
        continue;
      }

      const trimmed = orig.trim();
      if (!trimmed) {
        formatted.push('');
        continue;
      }

      const { tokens } = tokenize(trimmed);
      const code = tokens.filter((t) => t.type !== 'comment' && t.type !== 'directive' && t.type !== 'eof');

      const longMatch = trimmed.match(/(--)?\[(=*)\[/);
      if (longMatch) {
        const closeSeq = ']' + longMatch[2] + ']';
        const afterIdx = trimmed.indexOf(longMatch[0]) + longMatch[0].length;
        if (!trimmed.slice(afterIdx).includes(closeSeq)) {
          inLongBlock = true;
          longClosing = closeSeq;
        }
      }

      const framesBeforeLine = frames.length;
      const lineOpeners = [];
      let leadingCloseFrames = 0;
      let stillLeading = true;
      const startsWithElse = code.length > 0 && (code[0].value === 'else' || code[0].value === 'elseif');

      for (let k = 0; k < code.length; k++) {
        const v = code[k].value;
        if (k === 0 && startsWithElse) {
          stillLeading = false;
          continue;
        }

        const isOpener =
          v === 'function' || v === 'do' || v === 'repeat' || v === '{' || v === '(' ||
          (v === 'then' && !(code[0].value === 'elseif') && !isInlineIfThen(code, k));
        const isCloser = v === 'end' || v === 'until' || v === '}' || v === ')';

        if (isOpener) {
          stillLeading = false;
          lineOpeners.push(v);
        } else if (isCloser) {
          if (lineOpeners.length > 0) {
            lineOpeners.pop();
          } else if (frames.length > 0) {
            const top = frames[frames.length - 1];
            top.pop();
            if (top.length === 0) {
              frames.pop();
              if (stillLeading) leadingCloseFrames++;
            }
          }
        } else {
          // Allow punctuation like `):Play()` after leading `)` without breaking leading-closer count before non-closers
          stillLeading = false;
        }
      }

      const thisLineIndent = startsWithElse
        ? Math.max(0, framesBeforeLine - 1)
        : Math.max(0, framesBeforeLine - leadingCloseFrames);

      formatted.push(unit.repeat(thisLineIndent) + trimmed);

      if (lineOpeners.length > 0) {
        frames.push(lineOpeners);
      }
    }

    return formatted.join('\n');
  }

  const LuauCompiler = {
    tokenize,
    parseLuau,
    analyzeLuau,
    highlightLuau,
    findColorLiterals,
    formatLuau,
    escapeHtml
  };

  root.LuauCompiler = LuauCompiler;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LuauCompiler;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
