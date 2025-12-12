// DB2 SQL Language Configuration
import type * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';

export const db2sqlLanguageConfiguration: monacoEditor.languages.LanguageConfiguration =
  {
    // Comment configuration
    comments: {
      lineComment: '--',
      blockComment: ['/*', '*/'],
    },

    // Bracket configuration
    brackets: [
      ['[', ']'],
      ['(', ')'],
    ],

    // Auto-closing pairs
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string', 'comment'] },
      { open: '/*', close: '*/', notIn: ['string'] },
    ],

    // Surrounding pairs for selection
    surroundingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
    ],

    // Folding configuration
    folding: {
      markers: {
        start: /^\s*--\s*#?region\b/,
        end: /^\s*--\s*#?endregion\b/,
      },
    },

    // Word pattern for SQL identifiers
    wordPattern:
      /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,

    // Indentation rules
    indentationRules: {
      increaseIndentPattern:
        /^\s*(BEGIN|CASE|IF|ELSE|ELSEIF|WHEN|LOOP|WHILE|FOR|REPEAT|DO|DECLARE)\b/i,
      decreaseIndentPattern: /^\s*(END|ELSE|ELSEIF|WHEN|UNTIL)\b/i,
    },

    // On enter rules for auto-indentation
    onEnterRules: [
      {
        // After BEGIN, increase indent
        beforeText: /^\s*BEGIN\s*$/i,
        action: { indentAction: 1 }, // IndentAction.Indent
      },
      {
        // After THEN on its own line
        beforeText: /^\s*THEN\s*$/i,
        action: { indentAction: 1 },
      },
      {
        // After ELSE on its own line
        beforeText: /^\s*ELSE\s*$/i,
        action: { indentAction: 1 },
      },
      {
        // After LOOP
        beforeText: /^\s*LOOP\s*$/i,
        action: { indentAction: 1 },
      },
      {
        // Before END, decrease indent
        beforeText: /^\s*END\b/i,
        action: { indentAction: 2 }, // IndentAction.Outdent
      },
    ],
  };
