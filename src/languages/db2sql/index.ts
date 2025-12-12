// DB2 SQL Language Support for Monaco Editor
import type * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import { db2sqlMonarchLanguage } from './db2sql.monarch';
import { db2sqlLanguageConfiguration } from './db2sql.config';
import { createDB2SQLCompletionProvider } from './db2sql.completion';
import type { DB2SQLOptions } from './db2sql.types';

export const DB2SQL_LANGUAGE_ID = 'db2sql';

/**
 * Register DB2 SQL language support with Monaco Editor.
 *
 * Call this function in your `editorWillMount` callback before creating
 * any editor instances that use the 'db2sql' language.
 *
 * @param monaco - The Monaco Editor module
 * @param options - Optional configuration for schema-aware autocomplete
 *
 * @example
 * ```tsx
 * import MonacoEditor, { registerDB2SQL } from 'react-monaco-editor';
 *
 * function MyEditor() {
 *   const editorWillMount = (monaco) => {
 *     // Basic usage without schema
 *     registerDB2SQL(monaco);
 *
 *     // Or with schema for table/column autocomplete
 *     registerDB2SQL(monaco, {
 *       schema: {
 *         tables: [
 *           {
 *             name: 'EMPLOYEES',
 *             columns: [
 *               { name: 'EMP_ID', dataType: 'INTEGER' },
 *               { name: 'FIRST_NAME', dataType: 'VARCHAR(50)' },
 *             ],
 *           },
 *         ],
 *       },
 *     });
 *   };
 *
 *   return (
 *     <MonacoEditor
 *       language="db2sql"
 *       editorWillMount={editorWillMount}
 *       value="SELECT * FROM EMPLOYEES;"
 *     />
 *   );
 * }
 * ```
 */
export function registerDB2SQL(monaco: typeof monacoEditor, options?: DB2SQLOptions): void {
  // eslint-disable-next-line no-console
  console.log('registerDB2SQL called');

  // Check if already registered to avoid duplicate registration
  const languages = monaco.languages.getLanguages();
  const alreadyRegistered = languages.some(
    (lang) => lang.id === DB2SQL_LANGUAGE_ID,
  );

  if (alreadyRegistered) {
    // eslint-disable-next-line no-console
    console.log('DB2SQL already registered, skipping');
    return;
  }

  // Register the language
  monaco.languages.register({
    id: DB2SQL_LANGUAGE_ID,
    extensions: ['.sql', '.db2'],
    aliases: ['DB2 SQL', 'db2sql', 'DB2', 'db2'],
    mimetypes: ['text/x-db2sql'],
  });
  // eslint-disable-next-line no-console
  console.log('DB2SQL language registered');

  // Set the tokenizer for syntax highlighting
  monaco.languages.setMonarchTokensProvider(
    DB2SQL_LANGUAGE_ID,
    db2sqlMonarchLanguage,
  );
  // eslint-disable-next-line no-console
  console.log('DB2SQL tokenizer set');

  // Set the language configuration
  monaco.languages.setLanguageConfiguration(
    DB2SQL_LANGUAGE_ID,
    db2sqlLanguageConfiguration,
  );
  // eslint-disable-next-line no-console
  console.log('DB2SQL language config set');

  // Register the completion provider with optional schema config
  monaco.languages.registerCompletionItemProvider(
    DB2SQL_LANGUAGE_ID,
    createDB2SQLCompletionProvider(monaco, options?.schema),
  );
  // eslint-disable-next-line no-console
  console.log('DB2SQL completion provider registered', options?.schema ? 'with schema config' : 'without schema config');
}

// Re-export components for advanced usage
export { db2sqlMonarchLanguage } from './db2sql.monarch';
export { db2sqlLanguageConfiguration } from './db2sql.config';
export { createDB2SQLCompletionProvider, createDB2SQLValidator, validateDB2SQL, createDB2SQLHoverProvider } from './db2sql.completion';
export type { DB2SQLDiagnostic } from './db2sql.completion';
export * from './db2sql.keywords';
export * from './db2sql.types';
