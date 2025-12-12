// DB2 SQL Monarch Tokenizer for Syntax Highlighting
import type * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import { ALL_KEYWORDS, ALL_FUNCTIONS, ALL_TYPES } from './db2sql.keywords';

export const db2sqlMonarchLanguage: monacoEditor.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.db2sql',
  ignoreCase: true,

  brackets: [
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
  ],

  keywords: ALL_KEYWORDS.map((k) => k.toLowerCase()),
  functions: ALL_FUNCTIONS.map((f) => f.toLowerCase()),
  typeKeywords: ALL_TYPES.map((t) => t.toLowerCase()),

  operators: [
    '=',
    '>',
    '<',
    '!',
    '~',
    '?',
    ':',
    '==',
    '<=',
    '>=',
    '!=',
    '<>',
    '&&',
    '||',
    '++',
    '--',
    '+',
    '-',
    '*',
    '/',
    '&',
    '|',
    '^',
    '%',
  ],

  // Escape sequences
  escapes:
    /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      // Whitespace
      { include: '@whitespace' },

      // Comments
      { include: '@comments' },

      // Numbers
      [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
      [/\d+[eE][-+]?\d+/, 'number.float'],
      [/\d+/, 'number'],

      // Strings - single quotes (SQL standard)
      [/'/, { token: 'string.quote', bracket: '@open', next: '@string_single' }],

      // Strings - double quotes (identifiers in DB2)
      [/"/, { token: 'string.quote', bracket: '@open', next: '@string_double' }],

      // Delimiters and operators
      [/[;,.]/, 'delimiter'],
      [/[()]/, '@brackets'],
      [/[\[\]]/, '@brackets'],

      // Operators
      [
        /[<>=!~?:&|+\-*/%^]+/,
        {
          cases: {
            '@operators': 'operator',
            '@default': '',
          },
        },
      ],

      // Identifiers and keywords
      [
        /[a-zA-Z_$][\w$]*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@functions': 'predefined',
            '@typeKeywords': 'type',
            '@default': 'identifier',
          },
        },
      ],

      // Parameter markers
      [/\?/, 'variable'],
      [/:[\w]+/, 'variable'],
    ],

    whitespace: [[/\s+/, 'white']],

    comments: [
      // Line comment: --
      [/--.*$/, 'comment'],

      // Block comment: /* */
      [/\/\*/, { token: 'comment.quote', next: '@comment_block' }],
    ],

    comment_block: [
      [/[^/*]+/, 'comment'],
      [/\/\*/, { token: 'comment.quote', next: '@push' }], // Nested comment
      [/\*\//, { token: 'comment.quote', next: '@pop' }],
      [/[/*]/, 'comment'],
    ],

    string_single: [
      [/[^']+/, 'string'],
      [/''/, 'string.escape'], // Escaped single quote
      [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],

    string_double: [
      [/[^"]+/, 'string'],
      [/""/, 'string.escape'], // Escaped double quote
      [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],
  },
};
