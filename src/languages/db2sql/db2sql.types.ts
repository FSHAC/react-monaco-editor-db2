// DB2 SQL Schema Types for Autocomplete

/**
 * Represents a column in a database table
 */
export interface DB2Column {
  /** Column name */
  name: string;
  /** Data type (e.g., 'VARCHAR(50)', 'INTEGER', 'DECIMAL(10,2)') */
  dataType?: string;
  /** Column description/comment */
  description?: string;
  /** Whether the column is nullable */
  nullable?: boolean;
  /** Whether the column is a primary key */
  isPrimaryKey?: boolean;
}

/**
 * Represents a database table or view
 */
export interface DB2Table {
  /** Table name */
  name: string;
  /** Schema/Library name (optional, for qualified names) */
  schema?: string;
  /** Table description/comment */
  description?: string;
  /** List of columns in the table */
  columns?: DB2Column[];
  /** Table type: 'TABLE', 'VIEW', 'ALIAS' */
  type?: 'TABLE' | 'VIEW' | 'ALIAS' | 'PHYSICAL' | 'LOGICAL';
}

/**
 * Represents a database schema/library
 */
export interface DB2Schema {
  /** Schema/Library name */
  name: string;
  /** Schema description */
  description?: string;
  /** Tables in this schema */
  tables?: DB2Table[];
}

/**
 * Configuration for DB2 SQL schema autocomplete
 */
export interface DB2SchemaConfig {
  /** List of schemas/libraries */
  schemas?: DB2Schema[];
  /** List of tables (for flat structure without schemas) */
  tables?: DB2Table[];
  /** Default schema to use when not qualified */
  defaultSchema?: string;
  /** Whether to show schema prefix in suggestions */
  showSchemaPrefix?: boolean;
}

/**
 * Options for registering DB2 SQL language support
 */
export interface DB2SQLOptions {
  /** Schema configuration for autocomplete */
  schema?: DB2SchemaConfig;
}
