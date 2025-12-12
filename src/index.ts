import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import MonacoDiffEditor from "./diff";
import MonacoEditor from "./editor";

// DB2 SQL language support
export { registerDB2SQL, DB2SQL_LANGUAGE_ID, createDB2SQLValidator, validateDB2SQL, createDB2SQLHoverProvider } from "./languages/db2sql";
export type { DB2SQLDiagnostic, DB2SchemaConfig, DB2Table, DB2Column, DB2Schema, DB2SQLOptions } from "./languages/db2sql";

export * from "./types";
// eslint-disable-next-line no-restricted-exports
export { MonacoEditor as default, MonacoDiffEditor, monaco };
