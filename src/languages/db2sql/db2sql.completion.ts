// DB2 for IBM i (AS400) SQL Completion Provider and Validation
import type * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import {
  SQL_KEYWORDS,
  DB2_IBM_I_KEYWORDS,
  IBM_I_75_KEYWORDS,
  IBM_I_74_KEYWORDS,
  IBM_I_73_KEYWORDS,
  DB2_FUNCTIONS,
  DB2_DATA_TYPES,
  QSYS2_SERVICES,
  SYSIBM_CATALOG,
  IBM_I_SYSTEM_OBJECTS,
} from './db2sql.keywords';
import type { DB2SchemaConfig, DB2Table, DB2Column } from './db2sql.types';

/**
 * Diagnostic/validation marker interface
 */
export interface DB2SQLDiagnostic {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
}

/**
 * Validates DB2 SQL and returns diagnostics
 */
export function validateDB2SQL(
  text: string,
  schemaConfig?: DB2SchemaConfig,
): DB2SQLDiagnostic[] {
  const diagnostics: DB2SQLDiagnostic[] = [];
  const lines = text.split('\n');

  // SQL keywords to skip when validating identifiers (shared across all validation)
  var sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'GROUP', 'BY', 'ORDER', 'HAVING', 'UNION', 'EXCEPT', 'INTERSECT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'NULL', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'EXISTS', 'IS', 'TRUE', 'FALSE', 'DISTINCT', 'ALL', 'ASC', 'DESC', 'FETCH', 'FIRST', 'ROWS', 'ONLY', 'LIMIT', 'OFFSET', 'MAX', 'MIN', 'SUM', 'AVG', 'COUNT', 'CAST', 'COALESCE', 'NULLIF', 'TRIM', 'UPPER', 'LOWER', 'SUBSTRING', 'SUBSTR', 'LENGTH', 'CONCAT', 'DATE', 'TIME', 'TIMESTAMP', 'CHAR', 'VARCHAR', 'INTEGER', 'DECIMAL', 'NUMERIC', 'DIGITS', 'FLOAT', 'DOUBLE', 'REAL', 'SMALLINT', 'BIGINT', 'CLOB', 'BLOB', 'DBCLOB', 'DECFLOAT', 'XML', 'BOOLEAN', 'TIMESTAMPDIFF', 'LPAD', 'RPAD', 'ROW_NUMBER', 'OVER', 'PARTITION', 'LAG', 'LEAD', 'RANK', 'DENSE_RANK', 'NTILE', 'VALUES', 'INSERT', 'UPDATE', 'DELETE', 'SET', 'INTO', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'VIEW', 'INDEX', 'WITH', 'RECURSIVE'];

  // Helper to strip comments and string literals from expression (replace with spaces to preserve length)
  var stripCommentsAndStrings = function(expr: string): string {
    // Remove -- line comments (replace with spaces)
    var result = expr.replace(/--[^\n]*/g, function(match: string) {
      return new Array(match.length + 1).join(' ');
    });
    // Remove /* */ block comments (replace with spaces, handling newlines)
    result = result.replace(/\/\*[\s\S]*?\*\//g, function(match: string) {
      return match.replace(/[^\n]/g, ' ');
    });
    // Remove string literals (replace with spaces to preserve positions)
    result = result.replace(/'[^']*'/g, function(match: string) {
      return new Array(match.length + 1).join(' ');
    });
    return result;
  };

  // Alias for backward compatibility
  var stripComments = stripCommentsAndStrings;

  // Check for unclosed strings
  var inString = false;
  var stringStartLine = 0;
  var stringStartCol = 0;
  for (var lineNum = 0; lineNum < lines.length; lineNum++) {
    var line = lines[lineNum];
    for (var col = 0; col < line.length; col++) {
      var char = line[col];
      if (char === "'" && (col === 0 || line[col - 1] !== "'")) {
        if (!inString) {
          inString = true;
          stringStartLine = lineNum;
          stringStartCol = col;
        } else {
          inString = false;
        }
      }
    }
  }
  if (inString) {
    diagnostics.push({
      startLineNumber: stringStartLine + 1,
      startColumn: stringStartCol + 1,
      endLineNumber: stringStartLine + 1,
      endColumn: stringStartCol + 2,
      message: 'Unclosed string literal',
      severity: 'error',
    });
  }

  // Check for trailing comma before keywords (e.g., "SELECT a, FROM" is invalid)
  // But exclude commas between CTEs (comma before identifier that starts a new CTE)
  var trailingCommaRegex = /,\s*\n?\s*(FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|UNION|EXCEPT|INTERSECT|FETCH|LIMIT|FOR|;|\))/gi;
  var commaMatch;
  while ((commaMatch = trailingCommaRegex.exec(text)) !== null) {
    var commaPos = getPositionFromOffset(text, commaMatch.index);
    diagnostics.push({
      startLineNumber: commaPos.line,
      startColumn: commaPos.column,
      endLineNumber: commaPos.line,
      endColumn: commaPos.column + 1,
      message: 'Unexpected comma before ' + commaMatch[1].trim().toUpperCase(),
      severity: 'error',
    });
  }

  // Extract CTE names from WITH clause so we don't flag them as unknown tables
  var cteNames: string[] = [];
  var cteRegex = /WITH\s+(?:\/\*[\s\S]*?\*\/|--[^\n]*\n|\s)*([A-Za-z_#@$][A-Za-z0-9_#@$]*)\s+AS\s*\(/gi;
  var cteMatch;
  // First, find initial CTE after WITH
  while ((cteMatch = cteRegex.exec(text)) !== null) {
    cteNames.push(cteMatch[1].toUpperCase());
  }
  // Also find subsequent CTEs (after comma in WITH clause)
  // Pattern: ),\s*cte_name AS (
  var subsequentCteRegex = /\)\s*,\s*(?:\/\*[\s\S]*?\*\/|--[^\n]*\n|\s)*([A-Za-z_#@$][A-Za-z0-9_#@$]*)\s+AS\s*\(/gi;
  while ((cteMatch = subsequentCteRegex.exec(text)) !== null) {
    cteNames.push(cteMatch[1].toUpperCase());
  }

  // Check for missing comma between columns (two identifiers without comma)
  // Pattern: identifier followed by whitespace/newline then another identifier (not a keyword)
  var keywordSet = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'GROUP', 'ORDER', 'BY', 'HAVING', 'UNION', 'EXCEPT', 'INTERSECT', 'AS', 'INTO', 'VALUES', 'SET', 'UPDATE', 'DELETE', 'INSERT', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW', 'FETCH', 'FIRST', 'ROWS', 'ONLY', 'LIMIT', 'OFFSET', 'FOR', 'NULL', 'NOT', 'IS', 'IN', 'BETWEEN', 'LIKE', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'DISTINCT', 'ALL', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CAST', 'COALESCE', 'NULLIF'];

  // Check for unclosed parentheses
  var parenDepth = 0;
  var parenStack: Array<{line: number, col: number}> = [];
  for (var pLineNum = 0; pLineNum < lines.length; pLineNum++) {
    var pLine = lines[pLineNum];
    var inStr = false;
    for (var pCol = 0; pCol < pLine.length; pCol++) {
      var pChar = pLine[pCol];
      if (pChar === "'" && !inStr) {
        inStr = true;
      } else if (pChar === "'" && inStr) {
        inStr = false;
      } else if (!inStr) {
        if (pChar === '(') {
          parenDepth++;
          parenStack.push({line: pLineNum, col: pCol});
        } else if (pChar === ')') {
          parenDepth--;
          if (parenDepth < 0) {
            diagnostics.push({
              startLineNumber: pLineNum + 1,
              startColumn: pCol + 1,
              endLineNumber: pLineNum + 1,
              endColumn: pCol + 2,
              message: 'Unexpected closing parenthesis',
              severity: 'error',
            });
            parenDepth = 0;
          } else {
            parenStack.pop();
          }
        }
      }
    }
  }
  // Report unclosed opening parentheses
  for (var pi = 0; pi < parenStack.length; pi++) {
    var unclosed = parenStack[pi];
    diagnostics.push({
      startLineNumber: unclosed.line + 1,
      startColumn: unclosed.col + 1,
      endLineNumber: unclosed.line + 1,
      endColumn: unclosed.col + 2,
      message: 'Unclosed parenthesis',
      severity: 'error',
    });
  }

  // Check for empty SELECT (SELECT FROM without columns)
  var emptySelectRegex = /SELECT\s+(FROM|WHERE)/gi;
  var emptyMatch;
  while ((emptyMatch = emptySelectRegex.exec(text)) !== null) {
    var emptyPos = getPositionFromOffset(text, emptyMatch.index);
    diagnostics.push({
      startLineNumber: emptyPos.line,
      startColumn: emptyPos.column,
      endLineNumber: emptyPos.line,
      endColumn: emptyPos.column + 6,
      message: 'SELECT requires at least one column or expression',
      severity: 'error',
    });
  }

  // Check for duplicate commas
  var doubleCommaRegex = /,\s*,/g;
  var dblCommaMatch;
  while ((dblCommaMatch = doubleCommaRegex.exec(text)) !== null) {
    var dblPos = getPositionFromOffset(text, dblCommaMatch.index);
    diagnostics.push({
      startLineNumber: dblPos.line,
      startColumn: dblPos.column,
      endLineNumber: dblPos.line,
      endColumn: dblPos.column + dblCommaMatch[0].length,
      message: 'Duplicate comma',
      severity: 'error',
    });
  }

  // Check for missing comma between identifiers in SELECT clauses
  // Pattern: identifier followed by whitespace/newline then another identifier (not a keyword)
  // First, find all SELECT clauses
  var selectClauseRegex = /\bSELECT\s+([\s\S]*?)(?=\s+FROM\b)/gi;
  var selectClauseMatch;
  while ((selectClauseMatch = selectClauseRegex.exec(text)) !== null) {
    var selectContent = selectClauseMatch[1];
    var selectStartPos = selectClauseMatch.index + selectClauseMatch[0].length - selectClauseMatch[1].length;

    // Strip comments from the select content for analysis
    var strippedContent = selectContent;
    // Remove -- line comments
    strippedContent = strippedContent.replace(/--[^\n]*/g, function(m) {
      return new Array(m.length + 1).join(' ');
    });
    // Remove /* */ block comments
    strippedContent = strippedContent.replace(/\/\*[\s\S]*?\*\//g, function(m) {
      return m.replace(/[^\n]/g, ' ');
    });

    // Look for pattern: identifier followed by newline/whitespace then another identifier
    // But NOT: identifier AS identifier, identifier operator identifier, function(
    var missingCommaPattern = /(?<![A-Za-z0-9_#@$])([A-Za-z_#@$][A-Za-z0-9_#@$]*)\s*\n\s*([A-Za-z_#@$][A-Za-z0-9_#@$]*)(?![A-Za-z0-9_#@$])/g;
    var mcMatch;
    var sqlKeywordsUpper = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'GROUP', 'BY', 'ORDER', 'HAVING', 'UNION', 'EXCEPT', 'INTERSECT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'NULL', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'EXISTS', 'IS', 'ASC', 'DESC', 'DISTINCT', 'ALL'];

    while ((mcMatch = missingCommaPattern.exec(strippedContent)) !== null) {
      var firstId = mcMatch[1].toUpperCase();
      var secondId = mcMatch[2].toUpperCase();

      // Skip if first identifier is AS (part of "x AS y" pattern)
      if (firstId === 'AS') continue;

      // Skip if second identifier is a keyword (like FROM, WHERE, AS, etc.)
      if (sqlKeywordsUpper.indexOf(secondId) >= 0) continue;

      // Skip if first identifier is a keyword that can precede an identifier without comma
      if (sqlKeywordsUpper.indexOf(firstId) >= 0) continue;

      // This looks like a missing comma
      var missingCommaPos = getPositionFromOffset(text, selectStartPos + mcMatch.index + mcMatch[1].length);
      diagnostics.push({
        startLineNumber: missingCommaPos.line,
        startColumn: missingCommaPos.column,
        endLineNumber: missingCommaPos.line,
        endColumn: missingCommaPos.column + 1,
        message: 'Missing comma between "' + mcMatch[1] + '" and "' + mcMatch[2] + '"',
        severity: 'error',
      });
    }
  }

  // Check for incomplete column reference (identifier followed by dot then whitespace/newline/keyword)
  var incompleteDotRegex = /([A-Za-z0-9_#@$]+)\.\s*(\n|,|FROM|WHERE|AND|OR|ORDER|GROUP|HAVING|UNION|EXCEPT|INTERSECT|;|\))/gi;
  var dotMatch;
  while ((dotMatch = incompleteDotRegex.exec(text)) !== null) {
    var dotPos = getPositionFromOffset(text, dotMatch.index + dotMatch[1].length);
    diagnostics.push({
      startLineNumber: dotPos.line,
      startColumn: dotPos.column,
      endLineNumber: dotPos.line,
      endColumn: dotPos.column + 1,
      message: 'Incomplete reference: expected column name after "' + dotMatch[1] + '."',
      severity: 'error',
    });
  }

  // Parse CTEs with full column info for validation
  var parsedCTEs = parseCTEs(text);

  // If we have schema config, validate table and column references
  if (schemaConfig) {
    var allTables = getAllTablesForValidation(schemaConfig);
    var tableNames = allTables.map(function(t) {
      return t.name.toUpperCase();
    });
    var fullTableNames = allTables.map(function(t) {
      return t.schema ? (t.schema + '.' + t.name).toUpperCase() : t.name.toUpperCase();
    });

    // Find table references in FROM/JOIN clauses
    var tableRefRegex = /(?:FROM|JOIN)\s+([A-Za-z0-9_#@$]+(?:\.[A-Za-z0-9_#@$]+)?)/gi;
    var match;
    while ((match = tableRefRegex.exec(text)) !== null) {
      var tableName = match[1].toUpperCase();
      var shortName = tableName.indexOf('.') >= 0 ? tableName.split('.')[1] : tableName;

      // Check if table exists in schema or is a CTE
      var tableExists = tableNames.indexOf(shortName) >= 0 ||
                        fullTableNames.indexOf(tableName) >= 0 ||
                        cteNames.indexOf(shortName) >= 0 ||
                        cteNames.indexOf(tableName) >= 0;
      if (!tableExists) {
        // Find position in text
        var pos = getPositionFromOffset(text, match.index + match[0].indexOf(match[1]));
        diagnostics.push({
          startLineNumber: pos.line,
          startColumn: pos.column,
          endLineNumber: pos.line,
          endColumn: pos.column + match[1].length,
          message: 'Unknown table: ' + match[1],
          severity: 'warning',
        });
      }
    }

    // Find column references (table.column pattern)
    var columnRefRegex = /([A-Za-z0-9_#@$]+)\.([A-Za-z0-9_#@$]+)(?!\s*\()/g;
    while ((match = columnRefRegex.exec(text)) !== null) {
      var tableOrAlias = match[1].toUpperCase();
      var columnName = match[2].toUpperCase();

      // Skip if this looks like a schema.table reference (check if second part is a known table)
      if (tableNames.indexOf(columnName) >= 0) {
        continue;
      }

      // Check if this is a CTE reference - validate against CTE output columns
      var foundCTE: ParsedCTEWithContext | null = null;
      for (var cteI = 0; cteI < parsedCTEs.length; cteI++) {
        if (parsedCTEs[cteI].name === tableOrAlias) {
          foundCTE = parsedCTEs[cteI];
          break;
        }
      }

      if (foundCTE) {
        // Validate against CTE's output columns
        var cteColumnExists = false;
        for (var cteColI = 0; cteColI < foundCTE.columns.length; cteColI++) {
          if (foundCTE.columns[cteColI].name === columnName) {
            cteColumnExists = true;
            break;
          }
        }
        if (!cteColumnExists) {
          var cteColPos = getPositionFromOffset(text, match.index + match[1].length + 1);
          diagnostics.push({
            startLineNumber: cteColPos.line,
            startColumn: cteColPos.column,
            endLineNumber: cteColPos.line,
            endColumn: cteColPos.column + columnName.length,
            message: 'Unknown column "' + match[2] + '" in CTE "' + foundCTE.name + '". Available columns: ' + foundCTE.columns.map(function(c) { return c.name; }).join(', '),
            severity: 'warning',
          });
        }
        continue;
      }

      // Try to find the table
      var foundTable = null;
      for (var i = 0; i < allTables.length; i++) {
        var t = allTables[i];
        if (t.name.toUpperCase() === tableOrAlias ||
            (t.schema && (t.schema + '.' + t.name).toUpperCase() === tableOrAlias)) {
          foundTable = t;
          break;
        }
      }

      // Determine which CTE body (or main query) this column reference is in
      // to search for aliases only within that scope
      var columnRefOffset = match.index;
      var scopeText = text; // Default to full text for main query

      // Check if we're inside a CTE body
      for (var scopeCteI = 0; scopeCteI < parsedCTEs.length; scopeCteI++) {
        var scopeCte = parsedCTEs[scopeCteI];
        if (columnRefOffset >= scopeCte.bodyStartOffset && columnRefOffset <= scopeCte.bodyEndOffset) {
          // We're inside this CTE's body - only search for aliases within it
          scopeText = text.substring(scopeCte.bodyStartOffset, scopeCte.bodyEndOffset);
          break;
        }
      }

      // If not in any CTE, check if we're in main query after all CTEs
      if (scopeText === text && parsedCTEs.length > 0) {
        var lastCteEnd = 0;
        for (var lcI = 0; lcI < parsedCTEs.length; lcI++) {
          if (parsedCTEs[lcI].endOffset > lastCteEnd) {
            lastCteEnd = parsedCTEs[lcI].endOffset;
          }
        }
        if (columnRefOffset > lastCteEnd) {
          scopeText = text.substring(lastCteEnd);
        }
      }

      // Also check for aliases within the same scope
      var aliasRegex = new RegExp('(?:FROM|JOIN)\\s+([A-Za-z0-9_#@$]+(?:\\.[A-Za-z0-9_#@$]+)?)\\s+(?:AS\\s+)?' + tableOrAlias + '\\b', 'i');
      var aliasMatch = scopeText.match(aliasRegex);
      if (aliasMatch) {
        var aliasedTableName = aliasMatch[1].toUpperCase();
        var aliasedShortName = aliasedTableName.indexOf('.') >= 0 ? aliasedTableName.split('.')[1] : aliasedTableName;

        // Check if the aliased table is a CTE
        var aliasedCTE: ParsedCTEWithContext | null = null;
        for (var acI = 0; acI < parsedCTEs.length; acI++) {
          if (parsedCTEs[acI].name === aliasedShortName || parsedCTEs[acI].name === aliasedTableName) {
            aliasedCTE = parsedCTEs[acI];
            break;
          }
        }

        if (aliasedCTE) {
          // Validate against CTE's output columns
          var aliasedCteColExists = false;
          for (var acColI = 0; acColI < aliasedCTE.columns.length; acColI++) {
            if (aliasedCTE.columns[acColI].name === columnName) {
              aliasedCteColExists = true;
              break;
            }
          }
          if (!aliasedCteColExists) {
            var acColPos = getPositionFromOffset(text, match.index + match[1].length + 1);
            diagnostics.push({
              startLineNumber: acColPos.line,
              startColumn: acColPos.column,
              endLineNumber: acColPos.line,
              endColumn: acColPos.column + columnName.length,
              message: 'Unknown column "' + match[2] + '" in CTE "' + aliasedCTE.name + '". Available columns: ' + aliasedCTE.columns.map(function(c) { return c.name; }).join(', '),
              severity: 'warning',
            });
          }
          continue;
        }

        for (var j = 0; j < allTables.length; j++) {
          if (allTables[j].name.toUpperCase() === aliasedShortName) {
            foundTable = allTables[j];
            break;
          }
        }
      }

      if (foundTable && foundTable.columns) {
        var columnExists = false;
        for (var k = 0; k < foundTable.columns.length; k++) {
          if (foundTable.columns[k].name.toUpperCase() === columnName) {
            columnExists = true;
            break;
          }
        }
        if (!columnExists) {
          var colPos = getPositionFromOffset(text, match.index + match[1].length + 1);
          diagnostics.push({
            startLineNumber: colPos.line,
            startColumn: colPos.column,
            endLineNumber: colPos.line,
            endColumn: colPos.column + columnName.length,
            message: 'Unknown column "' + match[2] + '" in table "' + foundTable.name + '"',
            severity: 'warning',
          });
        }
      }
    }

    // Validate unqualified columns inside CTE bodies that reference other CTEs
    for (var cteVIdx = 0; cteVIdx < parsedCTEs.length; cteVIdx++) {
      var currentCTE = parsedCTEs[cteVIdx];
      var cteBody = text.substring(currentCTE.bodyStartOffset, currentCTE.bodyEndOffset);

      // Find which CTEs are referenced in this CTE's FROM clause
      var referencedCTEsInBody: ParsedCTEWithContext[] = [];
      for (var ftI = 0; ftI < currentCTE.fromTables.length; ftI++) {
        var fromTable = currentCTE.fromTables[ftI];
        for (var refCteI = 0; refCteI < parsedCTEs.length; refCteI++) {
          if (parsedCTEs[refCteI].name === fromTable) {
            referencedCTEsInBody.push(parsedCTEs[refCteI]);
            break;
          }
        }
      }

      // If this CTE references other CTEs, validate unqualified column references
      if (referencedCTEsInBody.length > 0) {
        // Find unqualified column references in SELECT clause
        var selectMatch = cteBody.match(/SELECT\s+([\s\S]*?)(?=\s+FROM\s+)/i);
        if (selectMatch) {
          var selectClause = selectMatch[1];
          // Calculate offset: position of SELECT + (full match length - captured columns length) = start of columns
          var selectKeywordPos = cteBody.indexOf(selectMatch[0]);
          var selectStartOffset = currentCTE.bodyStartOffset + selectKeywordPos + (selectMatch[0].length - selectMatch[1].length);

          // Parse column expressions, handling nested parentheses
          // Store untrimmed expressions so we can calculate correct offsets
          var colExprs: Array<{expr: string, untrimmed: string, offset: number}> = [];
          var currentExpr = '';
          var exprStartOffset = selectStartOffset;
          var parenDepth = 0;
          var inStr = false;

          for (var si = 0; si < selectClause.length; si++) {
            var c = selectClause[si];
            if (c === "'" && !inStr) inStr = true;
            else if (c === "'" && inStr) inStr = false;
            else if (!inStr) {
              if (c === '(') parenDepth++;
              else if (c === ')') parenDepth--;
              else if (c === ',' && parenDepth === 0) {
                colExprs.push({expr: currentExpr.trim(), untrimmed: currentExpr, offset: exprStartOffset});
                currentExpr = '';
                exprStartOffset = selectStartOffset + si + 1;
                continue;
              }
            }
            currentExpr += c;
          }
          if (currentExpr.trim()) {
            colExprs.push({expr: currentExpr.trim(), untrimmed: currentExpr, offset: exprStartOffset});
          }

          // Check each column expression for unqualified column references
          for (var ceIdx = 0; ceIdx < colExprs.length; ceIdx++) {
            var colExpr = stripComments(colExprs[ceIdx].expr);

            // Skip expressions with AS - but still check the expression before AS
            var asMatch = colExpr.match(/^([\s\S]+?)\s+AS\s+([A-Za-z_#@$][A-Za-z0-9_#@$]*)\s*$/i);
            var exprToCheck = asMatch ? asMatch[1].trim() : colExpr;

            // Skip if this is just a literal or star
            if (exprToCheck.match(/^['0-9]/) || exprToCheck === '*') continue;

            // Find ALL identifiers in the expression that could be column references
            // Match identifiers not followed by '(' (which would be functions)
            var identifierPattern = /(?<![A-Za-z0-9_#@$])([A-Za-z_#@$][A-Za-z0-9_#@$]*)(?![A-Za-z0-9_#@$])/g;
            var idMatch;
            var lastIndex = 0;

            while ((idMatch = identifierPattern.exec(exprToCheck)) !== null) {
              var potentialCol = idMatch[1].toUpperCase();
              var matchIndex = idMatch.index;

              // Skip SQL keywords and functions
              if (sqlKeywords.indexOf(potentialCol) >= 0) continue;

              // Skip if followed by '(' (it's a function call)
              var afterMatch = exprToCheck.substring(matchIndex + idMatch[1].length);
              if (afterMatch.match(/^\s*\(/)) continue;

              // Skip if preceded by '.' (it's a qualified column, handled elsewhere)
              if (matchIndex > 0 && exprToCheck[matchIndex - 1] === '.') continue;

              // Skip if followed by '.' (it's a table/schema prefix)
              if (afterMatch.match(/^\s*\./)) continue;

              // Now validate this identifier as a column reference
              var foundInCTE = false;
              for (var rcI = 0; rcI < referencedCTEsInBody.length; rcI++) {
                var refCTE = referencedCTEsInBody[rcI];
                // Check direct CTE columns
                for (var rcColI = 0; rcColI < refCTE.columns.length; rcColI++) {
                  if (refCTE.columns[rcColI].name === potentialCol) {
                    foundInCTE = true;
                    break;
                  }
                }
                if (foundInCTE) break;

                // Check if CTE uses wildcard - if so, also check source table columns
                var refCteBody = text.substring(refCTE.bodyStartOffset, refCTE.bodyEndOffset);

                // Check for SELECT * (all columns from all tables)
                var hasSelectStar = /\bSELECT\s+\*/i.test(refCteBody);

                // Find all specific table.* or alias.* patterns
                var wildcardPatterns: string[] = [];
                var wildcardRegex = /(?<![A-Za-z0-9_#@$])([A-Za-z_#@$][A-Za-z0-9_#@$]*(?:\.[A-Za-z_#@$][A-Za-z0-9_#@$]*)?)\.\*/g;
                var wcMatch;
                while ((wcMatch = wildcardRegex.exec(refCteBody)) !== null) {
                  wildcardPatterns.push(wcMatch[1].toUpperCase());
                }

                // Build alias to table mapping for this CTE
                var cteAliasMap: {[alias: string]: string} = {};
                // Use negative lookahead to prevent SQL keywords from being captured as aliases
                var cteFromJoinRegex = /(?:FROM|JOIN)\s+([A-Za-z0-9_#@$]+(?:\.[A-Za-z0-9_#@$]+)?)(?:\s+(?:AS\s+)?(?!(?:ON|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|AND|OR|GROUP|ORDER|HAVING|UNION|LIMIT|FETCH)\b)([A-Za-z_#@$][A-Za-z0-9_#@$]*))?/gi;
                var fjMatch;
                while ((fjMatch = cteFromJoinRegex.exec(refCteBody)) !== null) {
                  var tblName = fjMatch[1].toUpperCase();
                  var tblAlias = fjMatch[2] ? fjMatch[2].toUpperCase() : null;
                  if (tblAlias) {
                    cteAliasMap[tblAlias] = tblName;
                  }
                  // Also map short name to full name
                  var tblShort = tblName.indexOf('.') >= 0 ? tblName.split('.')[1] : tblName;
                  cteAliasMap[tblShort] = tblName;
                  cteAliasMap[tblName] = tblName;
                }

                if (hasSelectStar) {
                  // SELECT * - check all source table columns
                  for (var srcTblI = 0; srcTblI < refCTE.fromTables.length; srcTblI++) {
                    var srcTbl = refCTE.fromTables[srcTblI];
                    var srcTblShort = srcTbl.indexOf('.') >= 0 ? srcTbl.split('.')[1] : srcTbl;
                    for (var stI = 0; stI < allTables.length; stI++) {
                      var st = allTables[stI];
                      if (st.name.toUpperCase() === srcTblShort ||
                          (st.schema && (st.schema + '.' + st.name).toUpperCase() === srcTbl)) {
                        if (st.columns) {
                          for (var stColI = 0; stColI < st.columns.length; stColI++) {
                            if (st.columns[stColI].name.toUpperCase() === potentialCol) {
                              foundInCTE = true;
                              break;
                            }
                          }
                        }
                        break;
                      }
                    }
                    if (foundInCTE) break;
                  }
                } else if (wildcardPatterns.length > 0) {
                  // Specific table.* patterns - only check those specific tables
                  for (var wpI = 0; wpI < wildcardPatterns.length; wpI++) {
                    var wcPattern = wildcardPatterns[wpI];
                    // Resolve alias to actual table
                    var resolvedTable = cteAliasMap[wcPattern] || wcPattern;
                    var resolvedShort = resolvedTable.indexOf('.') >= 0 ? resolvedTable.split('.')[1] : resolvedTable;

                    for (var stI2 = 0; stI2 < allTables.length; stI2++) {
                      var st2 = allTables[stI2];
                      if (st2.name.toUpperCase() === resolvedShort ||
                          (st2.schema && (st2.schema + '.' + st2.name).toUpperCase() === resolvedTable)) {
                        if (st2.columns) {
                          for (var stColI2 = 0; stColI2 < st2.columns.length; stColI2++) {
                            if (st2.columns[stColI2].name.toUpperCase() === potentialCol) {
                              foundInCTE = true;
                              break;
                            }
                          }
                        }
                        break;
                      }
                    }
                    if (foundInCTE) break;
                  }
                }
                if (foundInCTE) break;
              }

              // Also check actual tables in FROM clause
              var foundInTable = false;
              for (var ftCheckI = 0; ftCheckI < currentCTE.fromTables.length; ftCheckI++) {
                var ftName = currentCTE.fromTables[ftCheckI];
                // Skip if this is a CTE (already checked above)
                var isCTERef = false;
                for (var cteCheckI = 0; cteCheckI < parsedCTEs.length; cteCheckI++) {
                  if (parsedCTEs[cteCheckI].name === ftName) {
                    isCTERef = true;
                    break;
                  }
                }
                if (isCTERef) continue;

                // Check actual table columns
                var ftShortName = ftName.indexOf('.') >= 0 ? ftName.split('.')[1] : ftName;
                for (var atI = 0; atI < allTables.length; atI++) {
                  var at = allTables[atI];
                  if (at.name.toUpperCase() === ftShortName) {
                    if (at.columns) {
                      for (var atColI = 0; atColI < at.columns.length; atColI++) {
                        if (at.columns[atColI].name.toUpperCase() === potentialCol) {
                          foundInTable = true;
                          break;
                        }
                      }
                    }
                    break;
                  }
                }
                if (foundInTable) break;
              }

              if (!foundInCTE && !foundInTable) {
                // Find the position of this identifier in the original text
                var exprOffset = colExprs[ceIdx].offset;
                // Find where the trimmed content starts within the untrimmed string
                var contentStart = colExprs[ceIdx].untrimmed.indexOf(colExprs[ceIdx].expr);
                if (contentStart > 0) exprOffset += contentStart;
                // Add the position within the expression
                exprOffset += matchIndex;

                var unqualColPos = getPositionFromOffset(text, exprOffset);
                diagnostics.push({
                  startLineNumber: unqualColPos.line,
                  startColumn: unqualColPos.column,
                  endLineNumber: unqualColPos.line,
                  endColumn: unqualColPos.column + potentialCol.length,
                  message: 'Unknown column "' + idMatch[1] + '". Available columns from CTEs: ' + referencedCTEsInBody.map(function(c) { return c.columns.map(function(col) { return col.name; }).join(', '); }).join(', '),
                  severity: 'warning',
                });
              }
            }
          }
        }
      }
    }

    // Validate unqualified columns in the main query after all CTEs
    if (parsedCTEs.length > 0) {
      // Find the end of the last CTE
      var lastCTEEnd = 0;
      for (var lceIdx = 0; lceIdx < parsedCTEs.length; lceIdx++) {
        if (parsedCTEs[lceIdx].endOffset > lastCTEEnd) {
          lastCTEEnd = parsedCTEs[lceIdx].endOffset;
        }
      }

      // Get the main query text after CTEs
      var mainQueryText = text.substring(lastCTEEnd);

      // Find SELECT ... FROM pattern in main query
      var mainSelectMatch = mainQueryText.match(/SELECT\s+([\s\S]*?)(?=\s+FROM\s+)/i);
      if (mainSelectMatch) {
        var mainSelectClause = mainSelectMatch[1];
        var mainSelectOffset = lastCTEEnd + mainQueryText.indexOf(mainSelectMatch[0]) + (mainSelectMatch[0].length - mainSelectMatch[1].length);

        // Find what CTEs are referenced in FROM clause
        var mainFromMatch = mainQueryText.match(/FROM\s+([A-Za-z_#@$][A-Za-z0-9_#@$]*)/i);
        var mainReferencedCTEs: ParsedCTEWithContext[] = [];
        if (mainFromMatch) {
          var mainFromTable = mainFromMatch[1].toUpperCase();
          for (var mfcIdx = 0; mfcIdx < parsedCTEs.length; mfcIdx++) {
            if (parsedCTEs[mfcIdx].name === mainFromTable) {
              mainReferencedCTEs.push(parsedCTEs[mfcIdx]);
              break;
            }
          }
        }

        // If we found a CTE in FROM, validate columns
        if (mainReferencedCTEs.length > 0) {
          // Parse column expressions in main SELECT
          var mainColExprs: Array<{expr: string, untrimmed: string, offset: number}> = [];
          var mainCurrentExpr = '';
          var mainExprStart = mainSelectOffset;
          var mainParenDepth = 0;
          var mainInStr = false;

          for (var msi = 0; msi < mainSelectClause.length; msi++) {
            var mc = mainSelectClause[msi];
            if (mc === "'" && !mainInStr) mainInStr = true;
            else if (mc === "'" && mainInStr) mainInStr = false;

            if (!mainInStr) {
              if (mc === '(') mainParenDepth++;
              else if (mc === ')') mainParenDepth--;
              else if (mc === ',' && mainParenDepth === 0) {
                if (mainCurrentExpr.trim()) {
                  mainColExprs.push({expr: mainCurrentExpr.trim(), untrimmed: mainCurrentExpr, offset: mainExprStart});
                }
                mainCurrentExpr = '';
                mainExprStart = mainSelectOffset + msi + 1;
                continue;
              }
            }
            mainCurrentExpr += mc;
          }
          if (mainCurrentExpr.trim()) {
            mainColExprs.push({expr: mainCurrentExpr.trim(), untrimmed: mainCurrentExpr, offset: mainExprStart});
          }

          // Strip comments and validate each expression
          for (var mceIdx = 0; mceIdx < mainColExprs.length; mceIdx++) {
            var mainExpr = mainColExprs[mceIdx].expr;
            var mainExprToCheck = stripComments(mainExpr);

            // Skip * wildcards
            if (mainExprToCheck.trim() === '*') continue;
            if (/^[A-Za-z_#@$][A-Za-z0-9_#@$]*\.\*$/.test(mainExprToCheck.trim())) continue;

            // Skip if contains AS (alias definition)
            if (/\bAS\b/i.test(mainExprToCheck)) {
              mainExprToCheck = mainExprToCheck.replace(/^([\s\S]+?)\s+AS\s+[A-Za-z_#@$][A-Za-z0-9_#@$]*$/i, '$1');
            }

            // Find identifiers that might be column references
            var mainIdRegex = /(?<![A-Za-z0-9_#@$])([A-Za-z_#@$][A-Za-z0-9_#@$]*)(?![A-Za-z0-9_#@$])/g;
            var mainIdMatch;
            while ((mainIdMatch = mainIdRegex.exec(mainExprToCheck)) !== null) {
              var mainPotentialCol = mainIdMatch[1].toUpperCase();
              var mainMatchIndex = mainIdMatch.index;

              // Skip SQL keywords
              if (sqlKeywords.indexOf(mainPotentialCol) >= 0) continue;

              // Skip if followed by '(' (function call)
              var mainAfterMatch = mainExprToCheck.substring(mainMatchIndex + mainIdMatch[1].length);
              if (mainAfterMatch.match(/^\s*\(/)) continue;

              // Skip if preceded by '.' (qualified column)
              if (mainMatchIndex > 0 && mainExprToCheck[mainMatchIndex - 1] === '.') continue;

              // Skip if followed by '.' (table prefix)
              if (mainAfterMatch.match(/^\s*\./)) continue;

              // Check if column exists in referenced CTE
              var mainFoundInCTE = false;
              for (var mrcIdx = 0; mrcIdx < mainReferencedCTEs.length; mrcIdx++) {
                var mainRefCTE = mainReferencedCTEs[mrcIdx];
                // Check direct CTE columns
                for (var mrcColIdx = 0; mrcColIdx < mainRefCTE.columns.length; mrcColIdx++) {
                  if (mainRefCTE.columns[mrcColIdx].name === mainPotentialCol) {
                    mainFoundInCTE = true;
                    break;
                  }
                }
                if (mainFoundInCTE) break;

                // Check wildcard-expanded columns from source tables
                var mainRefCteBody = text.substring(mainRefCTE.bodyStartOffset, mainRefCTE.bodyEndOffset);
                var mainHasSelectStar = /\bSELECT\s+\*/i.test(mainRefCteBody);

                // Find wildcard patterns
                var mainWildcardPatterns: string[] = [];
                var mainWildcardRegex = /(?<![A-Za-z0-9_#@$])([A-Za-z_#@$][A-Za-z0-9_#@$]*(?:\.[A-Za-z_#@$][A-Za-z0-9_#@$]*)?)\.\*/g;
                var mainWcMatch;
                while ((mainWcMatch = mainWildcardRegex.exec(mainRefCteBody)) !== null) {
                  mainWildcardPatterns.push(mainWcMatch[1].toUpperCase());
                }

                // Build alias to table mapping
                var mainCteAliasMap: {[alias: string]: string} = {};
                var mainCteFromJoinRegex = /(?:FROM|JOIN)\s+([A-Za-z0-9_#@$]+(?:\.[A-Za-z0-9_#@$]+)?)(?:\s+(?:AS\s+)?(?!(?:ON|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|AND|OR|GROUP|ORDER|HAVING|UNION|LIMIT|FETCH)\b)([A-Za-z_#@$][A-Za-z0-9_#@$]*))?/gi;
                var mainFjMatch;
                while ((mainFjMatch = mainCteFromJoinRegex.exec(mainRefCteBody)) !== null) {
                  var mainTblName = mainFjMatch[1].toUpperCase();
                  var mainTblAlias = mainFjMatch[2] ? mainFjMatch[2].toUpperCase() : null;
                  if (mainTblAlias) {
                    mainCteAliasMap[mainTblAlias] = mainTblName;
                  }
                  var mainTblShort = mainTblName.indexOf('.') >= 0 ? mainTblName.split('.')[1] : mainTblName;
                  mainCteAliasMap[mainTblShort] = mainTblName;
                  mainCteAliasMap[mainTblName] = mainTblName;
                }

                if (mainHasSelectStar) {
                  // Check all source tables
                  for (var msrcTblI = 0; msrcTblI < mainRefCTE.fromTables.length; msrcTblI++) {
                    var msrcTbl = mainRefCTE.fromTables[msrcTblI];
                    var msrcTblShort = msrcTbl.indexOf('.') >= 0 ? msrcTbl.split('.')[1] : msrcTbl;
                    for (var mstI = 0; mstI < allTables.length; mstI++) {
                      var mst = allTables[mstI];
                      if (mst.name.toUpperCase() === msrcTblShort ||
                          (mst.schema && (mst.schema + '.' + mst.name).toUpperCase() === msrcTbl)) {
                        if (mst.columns) {
                          for (var mstColI = 0; mstColI < mst.columns.length; mstColI++) {
                            if (mst.columns[mstColI].name.toUpperCase() === mainPotentialCol) {
                              mainFoundInCTE = true;
                              break;
                            }
                          }
                        }
                        break;
                      }
                    }
                    if (mainFoundInCTE) break;
                  }
                } else if (mainWildcardPatterns.length > 0) {
                  // Check only specific wildcarded tables
                  for (var mwpI = 0; mwpI < mainWildcardPatterns.length; mwpI++) {
                    var mwcPattern = mainWildcardPatterns[mwpI];
                    var mresolvedTable = mainCteAliasMap[mwcPattern] || mwcPattern;
                    var mresolvedShort = mresolvedTable.indexOf('.') >= 0 ? mresolvedTable.split('.')[1] : mresolvedTable;

                    for (var mstI2 = 0; mstI2 < allTables.length; mstI2++) {
                      var mst2 = allTables[mstI2];
                      if (mst2.name.toUpperCase() === mresolvedShort ||
                          (mst2.schema && (mst2.schema + '.' + mst2.name).toUpperCase() === mresolvedTable)) {
                        if (mst2.columns) {
                          for (var mstColI2 = 0; mstColI2 < mst2.columns.length; mstColI2++) {
                            if (mst2.columns[mstColI2].name.toUpperCase() === mainPotentialCol) {
                              mainFoundInCTE = true;
                              break;
                            }
                          }
                        }
                        break;
                      }
                    }
                    if (mainFoundInCTE) break;
                  }
                }
                if (mainFoundInCTE) break;
              }

              if (!mainFoundInCTE) {
                var mainExprOffset = mainColExprs[mceIdx].offset;
                var mainContentStart = mainColExprs[mceIdx].untrimmed.indexOf(mainColExprs[mceIdx].expr);
                if (mainContentStart > 0) mainExprOffset += mainContentStart;
                mainExprOffset += mainMatchIndex;

                var mainUnqualColPos = getPositionFromOffset(text, mainExprOffset);
                diagnostics.push({
                  startLineNumber: mainUnqualColPos.line,
                  startColumn: mainUnqualColPos.column,
                  endLineNumber: mainUnqualColPos.line,
                  endColumn: mainUnqualColPos.column + mainPotentialCol.length,
                  message: 'Unknown column "' + mainIdMatch[1] + '". Available columns from CTE "' + mainReferencedCTEs[0].name + '": ' + mainReferencedCTEs[0].columns.map(function(c) { return c.name; }).join(', '),
                  severity: 'warning',
                });
              }
            }
          }
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Parsed CTE information
 */
interface ParsedCTE {
  name: string;
  columns: Array<{
    name: string;
    expression?: string;
    sourceTable?: string;
    sourceColumn?: string;
  }>;
  startOffset: number;
  endOffset: number;
}

/**
 * Extended CTE info including source tables
 */
interface ParsedCTEWithContext extends ParsedCTE {
  bodyStartOffset: number;
  bodyEndOffset: number;
  fromTables: string[];
}

/**
 * Parse CTEs from SQL text and extract their column definitions
 */
function parseCTEs(text: string): ParsedCTEWithContext[] {
  const ctes: ParsedCTEWithContext[] = [];

  // Find WITH clause
  const withMatch = text.match(/\bWITH\s+/i);
  if (!withMatch) return ctes;

  // Find all CTE definitions: name AS ( ... )
  // We need to handle nested parentheses
  const ctePattern = /([A-Za-z_#@$][A-Za-z0-9_#@$]*)\s+AS\s*\(/gi;
  var match;

  while ((match = ctePattern.exec(text)) !== null) {
    const cteName = match[1].toUpperCase();
    const startOffset = match.index;
    const openParenPos = match.index + match[0].length - 1;

    // Find the matching closing parenthesis
    var depth = 1;
    var pos = openParenPos + 1;
    var inString = false;

    while (pos < text.length && depth > 0) {
      const char = text[pos];
      if (char === "'" && !inString) {
        inString = true;
      } else if (char === "'" && inString) {
        inString = false;
      } else if (!inString) {
        if (char === '(') depth++;
        else if (char === ')') depth--;
      }
      pos++;
    }

    const cteBody = text.substring(openParenPos + 1, pos - 1);
    const endOffset = pos;

    // Parse columns from the SELECT clause within the CTE
    const columns: ParsedCTE['columns'] = [];

    // Find SELECT clause
    const selectMatch = cteBody.match(/SELECT\s+([\s\S]*?)(?=\s+FROM\s+)/i);
    if (selectMatch) {
      const selectClause = selectMatch[1];

      // Split by comma, but respect parentheses
      const columnExprs: string[] = [];
      var currentExpr = '';
      var parenDepth = 0;
      var inStr = false;

      for (var i = 0; i < selectClause.length; i++) {
        const c = selectClause[i];
        if (c === "'" && !inStr) inStr = true;
        else if (c === "'" && inStr) inStr = false;
        else if (!inStr) {
          if (c === '(') parenDepth++;
          else if (c === ')') parenDepth--;
          else if (c === ',' && parenDepth === 0) {
            columnExprs.push(currentExpr.trim());
            currentExpr = '';
            continue;
          }
        }
        currentExpr += c;
      }
      if (currentExpr.trim()) {
        columnExprs.push(currentExpr.trim());
      }

      // Parse each column expression
      columnExprs.forEach(function(expr) {
        // Skip DISTINCT, ALL, etc.
        const cleanExpr = expr.replace(/^\s*(DISTINCT|ALL)\s+/i, '').trim();
        if (!cleanExpr || cleanExpr === '*') return;

        // Check for AS alias (use [\s\S] instead of . to match newlines in multiline expressions)
        const asMatch = cleanExpr.match(/^([\s\S]+?)\s+AS\s+([A-Za-z_#@$][A-Za-z0-9_#@$]*)\s*$/i);
        if (asMatch) {
          columns.push({
            name: asMatch[2].toUpperCase(),
            expression: asMatch[1].trim(),
          });
        } else {
          // Check for simple column reference (possibly with table prefix)
          const simpleMatch = cleanExpr.match(/^([A-Za-z_#@$][A-Za-z0-9_#@$]*)\.([A-Za-z_#@$][A-Za-z0-9_#@$]*)$/);
          if (simpleMatch) {
            columns.push({
              name: simpleMatch[2].toUpperCase(),
              sourceTable: simpleMatch[1].toUpperCase(),
              sourceColumn: simpleMatch[2].toUpperCase(),
            });
          } else {
            // Just a column name
            const colMatch = cleanExpr.match(/^([A-Za-z_#@$][A-Za-z0-9_#@$]*)$/);
            if (colMatch) {
              columns.push({
                name: colMatch[1].toUpperCase(),
                sourceColumn: colMatch[1].toUpperCase(),
              });
            }
          }
        }
      });
    }

    // Extract FROM tables from CTE body
    const fromTables: string[] = [];
    const fromRegex = /(?:FROM|JOIN)\s+([A-Za-z0-9_#@$]+(?:\.[A-Za-z0-9_#@$]+)?)/gi;
    var fromMatch;
    while ((fromMatch = fromRegex.exec(cteBody)) !== null) {
      fromTables.push(fromMatch[1].toUpperCase());
    }

    ctes.push({
      name: cteName,
      columns: columns,
      startOffset: startOffset,
      endOffset: endOffset,
      bodyStartOffset: openParenPos + 1,
      bodyEndOffset: pos - 1,
      fromTables: fromTables,
    });
  }

  return ctes;
}

/**
 * Helper to get line/column from offset
 */
function getPositionFromOffset(text: string, offset: number): { line: number; column: number } {
  var line = 1;
  var column = 1;
  for (var i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line: line, column: column };
}

/**
 * Get all tables for validation (same as getAllTables but accessible here)
 */
function getAllTablesForValidation(schemaConfig: DB2SchemaConfig): DB2Table[] {
  var tables: DB2Table[] = [];
  if (schemaConfig.tables) {
    for (var i = 0; i < schemaConfig.tables.length; i++) {
      tables.push(schemaConfig.tables[i]);
    }
  }
  if (schemaConfig.schemas) {
    for (var j = 0; j < schemaConfig.schemas.length; j++) {
      var schema = schemaConfig.schemas[j];
      if (schema.tables) {
        for (var k = 0; k < schema.tables.length; k++) {
          var table = schema.tables[k];
          tables.push({
            name: table.name,
            schema: table.schema || schema.name,
            description: table.description,
            columns: table.columns,
            type: table.type,
          });
        }
      }
    }
  }
  return tables;
}

/**
 * Creates a hover provider for DB2 SQL that shows table/column information
 */
export function createDB2SQLHoverProvider(
  monaco: typeof monacoEditor,
  schemaConfig?: DB2SchemaConfig,
): monacoEditor.languages.HoverProvider {
  return {
    provideHover(
      model: monacoEditor.editor.ITextModel,
      position: monacoEditor.Position,
    ): monacoEditor.languages.ProviderResult<monacoEditor.languages.Hover> {
      if (!schemaConfig) return null;

      const allTables = getAllTablesForValidation(schemaConfig);
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const wordText = word.word.toUpperCase();
      const lineContent = model.getLineContent(position.lineNumber);

      // Check if this is a table.column reference
      const beforeWord = lineContent.substring(0, word.startColumn - 1);
      const afterWord = lineContent.substring(word.endColumn - 1);

      // Check if there's a dot before (this word is a column after table.)
      const dotBefore = beforeWord.match(/([A-Za-z0-9_#@$]+)\.\s*$/);
      if (dotBefore) {
        const tableOrAlias = dotBefore[1].toUpperCase();

        // Find the table (check aliases first)
        const fullText = model.getValue();
        var actualTableName = tableOrAlias;

        // Check for alias definition
        const aliasRegex = new RegExp(
          '(?:FROM|JOIN)\\s+([A-Za-z0-9_#@$]+(?:\\.[A-Za-z0-9_#@$]+)?)\\s+(?:AS\\s+)?' + tableOrAlias + '\\b',
          'i'
        );
        const aliasMatch = fullText.match(aliasRegex);
        if (aliasMatch) {
          actualTableName = aliasMatch[1].toUpperCase();
        }

        // First check if this is a CTE reference
        const parsedCTEsForHover = parseCTEs(fullText);
        for (var cteHoverIdx = 0; cteHoverIdx < parsedCTEsForHover.length; cteHoverIdx++) {
          const cte = parsedCTEsForHover[cteHoverIdx];
          if (cte.name === tableOrAlias || cte.name === actualTableName) {
            // Found CTE, check for column
            for (var cteColHoverIdx = 0; cteColHoverIdx < cte.columns.length; cteColHoverIdx++) {
              const col = cte.columns[cteColHoverIdx];
              if (col.name === wordText) {
                const contents: monacoEditor.IMarkdownString[] = [];
                var cteColMarkdown = '**' + col.name + '**\n\n';
                cteColMarkdown += '**From CTE:** ' + cte.name + '\n\n';
                if (col.expression) {
                  cteColMarkdown += '**Expression:**\n```sql\n' + col.expression + '\n```\n\n';
                } else if (col.sourceColumn) {
                  cteColMarkdown += '_Column reference_';
                  if (col.sourceTable) {
                    cteColMarkdown += ' from ' + col.sourceTable;
                  }
                  cteColMarkdown += '\n\n';
                }
                contents.push({ value: cteColMarkdown });
                return {
                  contents: contents,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endLineNumber: position.lineNumber,
                    endColumn: word.endColumn,
                  },
                };
              }
            }
            break;
          }
        }

        // Find the table and column in schema
        for (var i = 0; i < allTables.length; i++) {
          const t = allTables[i];
          const fullName = t.schema ? (t.schema + '.' + t.name).toUpperCase() : t.name.toUpperCase();
          const shortName = t.name.toUpperCase();

          if (fullName === actualTableName || shortName === actualTableName ||
              (actualTableName.indexOf('.') >= 0 && actualTableName.split('.')[1] === shortName)) {
            // Found the table, now find the column
            if (t.columns) {
              for (var j = 0; j < t.columns.length; j++) {
                const col = t.columns[j];
                if (col.name.toUpperCase() === wordText) {
                  // Build hover content
                  const contents: monacoEditor.IMarkdownString[] = [];
                  var markdown = '**' + col.name + '**';
                  if (col.dataType) {
                    markdown += ' `' + col.dataType + '`';
                  }
                  markdown += '\n\n';
                  markdown += '**Table:** ' + (t.schema ? t.schema + '.' : '') + t.name + '\n\n';
                  if (col.description) {
                    markdown += col.description + '\n\n';
                  }
                  if (col.nullable !== undefined) {
                    markdown += col.nullable ? '_Nullable_' : '_Not Null_';
                  }
                  if (col.isPrimaryKey) {
                    markdown += ' | _Primary Key_';
                  }

                  contents.push({ value: markdown });
                  return {
                    contents: contents,
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: word.startColumn,
                      endLineNumber: position.lineNumber,
                      endColumn: word.endColumn,
                    },
                  };
                }
              }
            }
            break;
          }
        }
      }

      // Check if there's a dot after (this word is a table before .column or .*)
      const dotAfter = afterWord.match(/^\s*\./);
      if (dotAfter || !dotBefore) {
        // First, try to resolve if this is an alias
        const fullText = model.getValue();
        var resolvedTableName = wordText;

        // Check for alias definition: FROM/JOIN tablename AS alias or FROM/JOIN tablename alias
        const aliasResolveRegex = new RegExp(
          '(?:FROM|JOIN)\\s+([A-Za-z0-9_#@$]+(?:\\.[A-Za-z0-9_#@$]+)?)\\s+(?:AS\\s+)?' + wordText + '\\b',
          'i'
        );
        const aliasResolveMatch = fullText.match(aliasResolveRegex);
        if (aliasResolveMatch) {
          resolvedTableName = aliasResolveMatch[1].toUpperCase();
        }

        // Check if this is a table name (directly or resolved from alias)
        for (var k = 0; k < allTables.length; k++) {
          const t = allTables[k];
          const fullTableName = t.schema ? (t.schema + '.' + t.name).toUpperCase() : t.name.toUpperCase();
          const shortTableName = t.name.toUpperCase();

          if (shortTableName === wordText || shortTableName === resolvedTableName ||
              fullTableName === resolvedTableName ||
              (resolvedTableName.indexOf('.') >= 0 && resolvedTableName.split('.')[1] === shortTableName)) {
            const contents: monacoEditor.IMarkdownString[] = [];
            var tableMarkdown = '**' + (t.schema ? t.schema + '.' : '') + t.name + '**';
            if (t.type) {
              tableMarkdown += ' _(' + t.type + ')_';
            }
            tableMarkdown += '\n\n';
            if (t.description) {
              tableMarkdown += t.description + '\n\n';
            }
            if (t.columns && t.columns.length > 0) {
              tableMarkdown += '**Columns:** ' + t.columns.length + '\n\n';
              // Show first few columns
              var colList = t.columns.slice(0, 10).map(function(c) {
                return '- `' + c.name + '`' + (c.dataType ? ' ' + c.dataType : '');
              }).join('\n');
              tableMarkdown += colList;
              if (t.columns.length > 10) {
                tableMarkdown += '\n- _... and ' + (t.columns.length - 10) + ' more_';
              }
            }

            contents.push({ value: tableMarkdown });
            return {
              contents: contents,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endLineNumber: position.lineNumber,
                endColumn: word.endColumn,
              },
            };
          }
        }
      }

      // Check for unqualified column names (no dot before)
      // Look at tables referenced in FROM/JOIN clauses AND CTE definitions
      if (!dotBefore && !dotAfter) {
        const fullText = model.getValue();

        // Parse CTEs first
        const parsedCTEs = parseCTEs(fullText);

        // Calculate current cursor offset to check if we're inside a CTE body
        var cursorOffset = 0;
        for (var lineIdx = 0; lineIdx < position.lineNumber - 1; lineIdx++) {
          cursorOffset += model.getLineContent(lineIdx + 1).length + 1; // +1 for newline
        }
        cursorOffset += word.startColumn - 1;

        // Check if we're inside a CTE body
        var insideCTE: ParsedCTEWithContext | null = null;
        for (var cteCheckIdx = 0; cteCheckIdx < parsedCTEs.length; cteCheckIdx++) {
          const cte = parsedCTEs[cteCheckIdx];
          if (cursorOffset >= cte.bodyStartOffset && cursorOffset <= cte.bodyEndOffset) {
            insideCTE = cte;
            break;
          }
        }

        // If inside a CTE body, look at the FROM tables within that CTE for column source
        if (insideCTE) {
          // First check actual tables from FROM clause in this CTE
          for (var ftIdx = 0; ftIdx < insideCTE.fromTables.length; ftIdx++) {
            const fromTableName = insideCTE.fromTables[ftIdx];
            const fromShortName = fromTableName.indexOf('.') >= 0 ? fromTableName.split('.')[1] : fromTableName;

            // Check if this FROM table is another CTE
            var sourceCTE: ParsedCTEWithContext | null = null;
            for (var scIdx = 0; scIdx < parsedCTEs.length; scIdx++) {
              if (parsedCTEs[scIdx].name === fromShortName || parsedCTEs[scIdx].name === fromTableName) {
                sourceCTE = parsedCTEs[scIdx];
                break;
              }
            }

            if (sourceCTE) {
              // Check if word is a column from this referenced CTE
              for (var scColIdx = 0; scColIdx < sourceCTE.columns.length; scColIdx++) {
                const col = sourceCTE.columns[scColIdx];
                if (col.name === wordText) {
                  const contents: monacoEditor.IMarkdownString[] = [];
                  var cteColMarkdown = '**' + col.name + '**\n\n';
                  cteColMarkdown += '**From CTE:** ' + sourceCTE.name + '\n\n';
                  if (col.expression) {
                    cteColMarkdown += '**Expression:**\n```sql\n' + col.expression + '\n```\n\n';
                  } else if (col.sourceColumn) {
                    cteColMarkdown += '_Column reference_';
                    if (col.sourceTable) {
                      cteColMarkdown += ' from ' + col.sourceTable;
                    }
                    cteColMarkdown += '\n\n';
                  }
                  contents.push({ value: cteColMarkdown });
                  return {
                    contents: contents,
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: word.startColumn,
                      endLineNumber: position.lineNumber,
                      endColumn: word.endColumn,
                    },
                  };
                }
              }
            } else {
              // It's a real table, check for column
              for (var tblIdx = 0; tblIdx < allTables.length; tblIdx++) {
                const t = allTables[tblIdx];
                const tFullName = t.schema ? (t.schema + '.' + t.name).toUpperCase() : t.name.toUpperCase();
                if (tFullName === fromTableName || t.name.toUpperCase() === fromShortName) {
                  if (t.columns) {
                    for (var tcIdx = 0; tcIdx < t.columns.length; tcIdx++) {
                      const col = t.columns[tcIdx];
                      if (col.name.toUpperCase() === wordText) {
                        const contents: monacoEditor.IMarkdownString[] = [];
                        var tableColMarkdown = '**' + col.name + '**';
                        if (col.dataType) {
                          tableColMarkdown += ' `' + col.dataType + '`';
                        }
                        tableColMarkdown += '\n\n';
                        tableColMarkdown += '**Table:** ' + (t.schema ? t.schema + '.' : '') + t.name + '\n\n';
                        if (col.description) {
                          tableColMarkdown += col.description + '\n\n';
                        }
                        if (col.nullable !== undefined) {
                          tableColMarkdown += col.nullable ? '_Nullable_' : '_Not Null_';
                        }
                        if (col.isPrimaryKey) {
                          tableColMarkdown += ' | _Primary Key_';
                        }
                        contents.push({ value: tableColMarkdown });
                        return {
                          contents: contents,
                          range: {
                            startLineNumber: position.lineNumber,
                            startColumn: word.startColumn,
                            endLineNumber: position.lineNumber,
                            endColumn: word.endColumn,
                          },
                        };
                      }
                    }
                  }
                  break;
                }
              }
            }
          }
          // If we're inside a CTE but didn't find a match above, don't show CTE column info
          // Fall through to check for other matches (tables, etc.)
        }

        // Check if this word is a CTE name (only if not inside a CTE body)
        if (!insideCTE) {
          for (var cteIdx = 0; cteIdx < parsedCTEs.length; cteIdx++) {
            const cte = parsedCTEs[cteIdx];
            if (cte.name === wordText) {
              const contents: monacoEditor.IMarkdownString[] = [];
              var cteMarkdown = '**' + cte.name + '** _(CTE)_\n\n';
              cteMarkdown += '_Common Table Expression_\n\n';
              if (cte.columns.length > 0) {
                cteMarkdown += '**Columns:**\n\n';
                cte.columns.forEach(function(col) {
                  cteMarkdown += '- `' + col.name + '`';
                  if (col.expression) {
                    cteMarkdown += ' = ' + col.expression.substring(0, 50) + (col.expression.length > 50 ? '...' : '');
                  }
                  cteMarkdown += '\n';
                });
              }
              contents.push({ value: cteMarkdown });
              return {
                contents: contents,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: word.startColumn,
                  endLineNumber: position.lineNumber,
                  endColumn: word.endColumn,
                },
              };
            }
          }
        }

        // Check if word is a column from a CTE referenced in FROM/JOIN (outside of CTE definitions)
        if (!insideCTE) {
          const cteRefRegex = /(?:FROM|JOIN)\s+([A-Za-z_#@$][A-Za-z0-9_#@$]*)/gi;
          var cteRefMatch;
          while ((cteRefMatch = cteRefRegex.exec(fullText)) !== null) {
            const refName = cteRefMatch[1].toUpperCase();
            // Check if this references a CTE
            for (var cIdx = 0; cIdx < parsedCTEs.length; cIdx++) {
              const cte = parsedCTEs[cIdx];
              if (cte.name === refName) {
                // Check if word matches a CTE column
                for (var colIdx = 0; colIdx < cte.columns.length; colIdx++) {
                  const col = cte.columns[colIdx];
                  if (col.name === wordText) {
                    const contents: monacoEditor.IMarkdownString[] = [];
                    var cteColMarkdown = '**' + col.name + '**\n\n';
                    cteColMarkdown += '**From CTE:** ' + cte.name + '\n\n';
                    if (col.expression) {
                      cteColMarkdown += '**Expression:**\n```sql\n' + col.expression + '\n```\n\n';
                    } else if (col.sourceColumn) {
                      cteColMarkdown += '_Column reference_';
                      if (col.sourceTable) {
                        cteColMarkdown += ' from ' + col.sourceTable;
                      }
                      cteColMarkdown += '\n\n';
                    }
                    contents.push({ value: cteColMarkdown });
                    return {
                      contents: contents,
                      range: {
                        startLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endLineNumber: position.lineNumber,
                        endColumn: word.endColumn,
                      },
                    };
                  }
                }
              }
            }
          }
        }

        // Find all tables referenced in FROM/JOIN
        const referencedTables: DB2Table[] = [];
        const tableRefRegex = /(?:FROM|JOIN)\s+([A-Za-z0-9_#@$]+(?:\.[A-Za-z0-9_#@$]+)?)/gi;
        var refMatch;
        while ((refMatch = tableRefRegex.exec(fullText)) !== null) {
          const refTableName = refMatch[1].toUpperCase();
          const refShortName = refTableName.indexOf('.') >= 0 ? refTableName.split('.')[1] : refTableName;

          // Skip if this is a CTE reference
          var isCTE = false;
          for (var ci = 0; ci < parsedCTEs.length; ci++) {
            if (parsedCTEs[ci].name === refTableName || parsedCTEs[ci].name === refShortName) {
              isCTE = true;
              break;
            }
          }
          if (isCTE) continue;

          // Find matching table in schema
          for (var m = 0; m < allTables.length; m++) {
            const t = allTables[m];
            const tFullName = t.schema ? (t.schema + '.' + t.name).toUpperCase() : t.name.toUpperCase();
            if (tFullName === refTableName || t.name.toUpperCase() === refShortName) {
              referencedTables.push(t);
              break;
            }
          }
        }

        // Check if word matches any column in referenced tables
        for (var n = 0; n < referencedTables.length; n++) {
          const t = referencedTables[n];
          if (t.columns) {
            for (var p = 0; p < t.columns.length; p++) {
              const col = t.columns[p];
              if (col.name.toUpperCase() === wordText) {
                const contents: monacoEditor.IMarkdownString[] = [];
                var colMarkdown = '**' + col.name + '**';
                if (col.dataType) {
                  colMarkdown += ' `' + col.dataType + '`';
                }
                colMarkdown += '\n\n';
                colMarkdown += '**Table:** ' + (t.schema ? t.schema + '.' : '') + t.name + '\n\n';
                if (col.description) {
                  colMarkdown += col.description + '\n\n';
                }
                if (col.nullable !== undefined) {
                  colMarkdown += col.nullable ? '_Nullable_' : '_Not Null_';
                }
                if (col.isPrimaryKey) {
                  colMarkdown += ' | _Primary Key_';
                }

                contents.push({ value: colMarkdown });
                return {
                  contents: contents,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endLineNumber: position.lineNumber,
                    endColumn: word.endColumn,
                  },
                };
              }
            }
          }
        }
      }

      return null;
    },
  };
}

/**
 * Creates a validation provider that can be attached to an editor
 */
export function createDB2SQLValidator(
  monaco: typeof monacoEditor,
  schemaConfig?: DB2SchemaConfig,
): (model: monacoEditor.editor.ITextModel) => void {
  return function(model: monacoEditor.editor.ITextModel) {
    var text = model.getValue();
    var diagnostics = validateDB2SQL(text, schemaConfig);

    var markers: monacoEditor.editor.IMarkerData[] = diagnostics.map(function(d) {
      var severity: monacoEditor.MarkerSeverity;
      switch (d.severity) {
        case 'error':
          severity = monaco.MarkerSeverity.Error;
          break;
        case 'warning':
          severity = monaco.MarkerSeverity.Warning;
          break;
        case 'info':
          severity = monaco.MarkerSeverity.Info;
          break;
        default:
          severity = monaco.MarkerSeverity.Hint;
      }
      return {
        startLineNumber: d.startLineNumber,
        startColumn: d.startColumn,
        endLineNumber: d.endLineNumber,
        endColumn: d.endColumn,
        message: d.message,
        severity: severity,
      };
    });

    monaco.editor.setModelMarkers(model, 'db2sql', markers);
  };
}

// Snippet templates for common SQL patterns
// Labels prefixed with ~ to distinguish from keywords and sort after them
const SQL_SNIPPETS = [
  {
    label: '~select-statement',
    insertText: 'SELECT ${1:columns}\nFROM ${2:table}\nWHERE ${3:condition};',
    documentation: 'Basic SELECT statement template',
    filterText: 'select statement template',
  },
  {
    label: '~select-all',
    insertText: 'SELECT *\nFROM ${1:table};',
    documentation: 'Select all columns from a table',
    filterText: 'select all star',
  },
  {
    label: '~select-top',
    insertText: 'SELECT ${1:columns}\nFROM ${2:table}\nFETCH FIRST ${3:n} ROWS ONLY;',
    documentation: 'Select with row limit (DB2 syntax)',
    filterText: 'select top fetch first',
  },
  {
    label: '~insert-values',
    insertText: 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});',
    documentation: 'Insert a single row',
    filterText: 'insert into values',
  },
  {
    label: '~insert-select',
    insertText: 'INSERT INTO ${1:target_table} (${2:columns})\nSELECT ${3:columns}\nFROM ${4:source_table};',
    documentation: 'Insert from SELECT',
    filterText: 'insert select from',
  },
  {
    label: '~update-statement',
    insertText: 'UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};',
    documentation: 'Update rows in a table',
    filterText: 'update set where',
  },
  {
    label: '~delete-statement',
    insertText: 'DELETE FROM ${1:table}\nWHERE ${2:condition};',
    documentation: 'Delete rows from a table',
    filterText: 'delete from where',
  },
  {
    label: '~create-table',
    insertText: 'CREATE TABLE ${1:table_name} (\n\t${2:column_name} ${3:data_type} ${4:constraints}\n);',
    documentation: 'Create a new table',
    filterText: 'create table',
  },
  {
    label: '~create-index',
    insertText: 'CREATE INDEX ${1:index_name}\nON ${2:table_name} (${3:column_name});',
    documentation: 'Create an index',
    filterText: 'create index on',
  },
  {
    label: '~create-view',
    insertText: 'CREATE VIEW ${1:view_name} AS\nSELECT ${2:columns}\nFROM ${3:table};',
    documentation: 'Create a view',
    filterText: 'create view as select',
  },
  {
    label: '~create-procedure',
    insertText: 'CREATE PROCEDURE ${1:procedure_name} (${2:parameters})\nLANGUAGE SQL\nBEGIN\n\t${3:-- statements}\nEND;',
    documentation: 'Create a stored procedure',
    filterText: 'create procedure',
  },
  {
    label: '~alter-table-add',
    insertText: 'ALTER TABLE ${1:table_name}\nADD COLUMN ${2:column_name} ${3:data_type};',
    documentation: 'Add a column to a table',
    filterText: 'alter table add column',
  },
  {
    label: '~drop-table',
    insertText: 'DROP TABLE ${1:table_name};',
    documentation: 'Drop a table',
    filterText: 'drop table',
  },
  {
    label: '~join-statement',
    insertText: '${1|INNER,LEFT,RIGHT,FULL OUTER|} JOIN ${2:table}\n\tON ${3:condition}',
    documentation: 'Join clause',
    filterText: 'join inner left right',
  },
  {
    label: '~group-by',
    insertText: 'GROUP BY ${1:columns}\nHAVING ${2:condition}',
    documentation: 'Group by with having clause',
    filterText: 'group by having',
  },
  {
    label: '~order-by',
    insertText: 'ORDER BY ${1:column} ${2|ASC,DESC|}',
    documentation: 'Order by clause',
    filterText: 'order by asc desc',
  },
  {
    label: '~case-when',
    insertText: 'CASE\n\tWHEN ${1:condition} THEN ${2:result}\n\tELSE ${3:default}\nEND',
    documentation: 'Case expression',
    filterText: 'case when then else end',
  },
  {
    label: '~cte-with',
    insertText: 'WITH ${1:cte_name} AS (\n\tSELECT ${2:columns}\n\tFROM ${3:table}\n)\nSELECT * FROM ${1:cte_name};',
    documentation: 'Common Table Expression',
    filterText: 'with cte common table expression',
  },
  {
    label: '~merge-statement',
    insertText: 'MERGE INTO ${1:target_table} AS t\nUSING ${2:source_table} AS s\n\tON ${3:t.id = s.id}\nWHEN MATCHED THEN\n\tUPDATE SET ${4:t.col = s.col}\nWHEN NOT MATCHED THEN\n\tINSERT (${5:columns}) VALUES (${6:values});',
    documentation: 'Merge (upsert) statement',
    filterText: 'merge into using when matched',
  },
  {
    label: '~cursor-declare',
    insertText: 'DECLARE ${1:cursor_name} CURSOR FOR\n\tSELECT ${2:columns}\n\tFROM ${3:table};\n\nOPEN ${1:cursor_name};\nFETCH ${1:cursor_name} INTO ${4:variables};\nCLOSE ${1:cursor_name};',
    documentation: 'Cursor declaration and usage',
    filterText: 'declare cursor fetch open close',
  },
  // DB2 for IBM i specific snippets
  {
    label: '~fetch-first',
    insertText: 'FETCH FIRST ${1:n} ROWS ONLY',
    documentation: 'Limit result set (DB2 syntax)',
    filterText: 'fetch first rows only limit',
  },
  {
    label: '~limit-offset',
    insertText: 'LIMIT ${1:n} OFFSET ${2:0}',
    documentation: 'Limit with offset (IBM i 7.2+)',
    filterText: 'limit offset',
  },
  // QSYS2 Services
  {
    label: 'QSYS2.OBJECT_STATISTICS',
    insertText: "SELECT * FROM TABLE(QSYS2.OBJECT_STATISTICS('${1:LIBRARY}', '${2:*ALL}')) AS X",
    documentation: 'List objects in a library',
  },
  {
    label: 'QSYS2.ACTIVE_JOB_INFO',
    insertText: 'SELECT * FROM TABLE(QSYS2.ACTIVE_JOB_INFO()) AS X',
    documentation: 'List active jobs on the system',
  },
  {
    label: 'QSYS2.SYSTEM_STATUS_INFO',
    insertText: 'SELECT * FROM QSYS2.SYSTEM_STATUS_INFO',
    documentation: 'System status information',
  },
  {
    label: 'QSYS2.USER_INFO',
    insertText: "SELECT * FROM QSYS2.USER_INFO WHERE AUTHORIZATION_NAME = '${1:USERNAME}'",
    documentation: 'User profile information',
  },
  {
    label: 'QSYS2.JOBLOG_INFO',
    insertText: 'SELECT * FROM TABLE(QSYS2.JOBLOG_INFO(${1:JOB_NAME})) AS X',
    documentation: 'Job log messages',
  },
  {
    label: 'QSYS2.LIBRARY_LIST_INFO',
    insertText: 'SELECT * FROM QSYS2.LIBRARY_LIST_INFO',
    documentation: 'Current library list',
  },
  {
    label: 'QSYS2.PTF_INFO',
    insertText: 'SELECT * FROM QSYS2.PTF_INFO',
    documentation: 'PTF information',
  },
  {
    label: 'QSYS2.SYSTABLES',
    insertText: "SELECT * FROM QSYS2.SYSTABLES WHERE TABLE_SCHEMA = '${1:LIBRARY}'",
    documentation: 'List tables in a library',
  },
  {
    label: 'QSYS2.SYSCOLUMNS',
    insertText: "SELECT * FROM QSYS2.SYSCOLUMNS WHERE TABLE_SCHEMA = '${1:LIBRARY}' AND TABLE_NAME = '${2:TABLE}'",
    documentation: 'List columns in a table',
  },
  // QCMDEXC
  {
    label: 'QCMDEXC',
    insertText: "CALL QSYS2.QCMDEXC('${1:COMMAND}')",
    documentation: 'Execute CL command via SQL',
  },
  {
    label: 'QCMDEXC DSPJOB',
    insertText: "CALL QSYS2.QCMDEXC('DSPJOB OUTPUT(*PRINT)')",
    documentation: 'Display job information',
  },
  {
    label: 'QCMDEXC WRKACTJOB',
    insertText: "CALL QSYS2.QCMDEXC('WRKACTJOB OUTPUT(*PRINT)')",
    documentation: 'Work with active jobs',
  },
  // RRN (Relative Record Number)
  {
    label: 'RRN',
    insertText: 'RRN(${1:table_name})',
    documentation: 'Get relative record number (IBM i specific)',
  },
  // VARCHAR_FORMAT - Date/Time formatting
  {
    label: 'VARCHAR_FORMAT date',
    insertText: "VARCHAR_FORMAT(${1:date_column}, '${2:YYYY-MM-DD}')",
    documentation: 'Format date as string',
  },
  {
    label: 'VARCHAR_FORMAT timestamp',
    insertText: "VARCHAR_FORMAT(${1:timestamp_column}, '${2:YYYY-MM-DD HH24:MI:SS}')",
    documentation: 'Format timestamp as string',
  },
  {
    label: 'TIMESTAMP_FORMAT',
    insertText: "TIMESTAMP_FORMAT('${1:string}', '${2:YYYY-MM-DD HH24:MI:SS}')",
    documentation: 'Convert string to timestamp',
  },
  // DIGITS
  {
    label: 'DIGITS',
    insertText: 'DIGITS(${1:numeric_column})',
    documentation: 'Convert number to character string without sign',
  },
  // DECODE (Oracle compatibility)
  {
    label: 'DECODE',
    insertText: 'DECODE(${1:expression}, ${2:search1}, ${3:result1}, ${4:default})',
    documentation: 'Oracle-compatible CASE expression',
  },
  // Journal
  {
    label: 'DISPLAY_JOURNAL',
    insertText: "SELECT * FROM TABLE(QSYS2.DISPLAY_JOURNAL('${1:LIBRARY}', '${2:JOURNAL}', '${3:TABLE}')) AS X",
    documentation: 'Display journal entries for a table',
  },
  // IFS
  {
    label: 'IFS_OBJECT_STATISTICS',
    insertText: "SELECT * FROM TABLE(QSYS2.IFS_OBJECT_STATISTICS('${1:/path}')) AS X",
    documentation: 'IFS object statistics',
  },
  // Data Area
  {
    label: 'DATA_AREA_INFO',
    insertText: "SELECT * FROM QSYS2.DATA_AREA_INFO WHERE DATA_AREA_LIBRARY = '${1:LIBRARY}'",
    documentation: 'Data area information',
  },
];

/**
 * Determines the SQL context at the current cursor position
 */
function getSQLContext(
  model: monacoEditor.editor.ITextModel,
  position: monacoEditor.Position,
): {
  context: 'table' | 'column' | 'schema' | 'general';
  tableAlias?: string;
  schemaName?: string;
  referencedTables: string[];
  aliasToTable: { [alias: string]: string };
} {
  // Get entire document text to find table references (FROM may come after SELECT)
  const fullText = model.getValue();

  // Get text up to cursor for context detection
  const textUntilPosition = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  // Find statement boundaries
  const lastSemicolon = textUntilPosition.lastIndexOf(';');
  const statementStart = lastSemicolon >= 0 ? lastSemicolon + 1 : 0;

  // Find the end of current statement (next semicolon or end of document)
  const textAfterStart = fullText.substring(statementStart);
  const nextSemicolon = textAfterStart.indexOf(';');
  const fullStatement = nextSemicolon >= 0
    ? textAfterStart.substring(0, nextSemicolon)
    : textAfterStart;

  // Text before cursor (for determining what keyword we're after)
  const currentStatement = lastSemicolon >= 0
    ? textUntilPosition.substring(lastSemicolon + 1)
    : textUntilPosition;

  // Extract referenced tables and aliases from the FULL statement (including after cursor)
  const referencedTables: string[] = [];
  const aliasToTable: { [alias: string]: string } = {};

  // Parse FROM clause: FROM table [AS] alias or FROM schema.table [AS] alias
  // Use fullStatement to catch FROM clauses that come after the cursor position
  var tableAliasRegex = /(?:FROM|JOIN)\s+([A-Za-z0-9_#@$]+(?:\.[A-Za-z0-9_#@$]+)?)(?:\s+(?:AS\s+)?([A-Za-z_#@$][A-Za-z0-9_#@$]*))?/gi;
  var match;
  while ((match = tableAliasRegex.exec(fullStatement)) !== null) {
    var tableName = match[1].toUpperCase();
    var alias = match[2] ? match[2].toUpperCase() : null;

    referencedTables.push(tableName);

    if (alias) {
      aliasToTable[alias] = tableName;
    }
    // Also map the table's short name (without schema) to itself
    var shortName = tableName.indexOf('.') >= 0 ? tableName.split('.')[1] : tableName;
    if (!aliasToTable[shortName]) {
      aliasToTable[shortName] = tableName;
    }
  }

  // Check if we're after a dot (for schema.table or table.column)
  const lineText = model.getLineContent(position.lineNumber);
  const textBeforeCursor = lineText.substring(0, position.column - 1);
  const dotMatch = textBeforeCursor.match(/([A-Za-z0-9_#@$]+)\.\s*$/);

  if (dotMatch) {
    const prefix = dotMatch[1].toUpperCase();
    // Return the prefix - we'll resolve aliases in the provider
    return { context: 'column', tableAlias: prefix, referencedTables, aliasToTable };
  }

  // Check context based on keywords
  // Get the text before the current word (to detect if we're right after a keyword)
  const wordMatch = textBeforeCursor.match(/(\S+)\s*$/);
  const textBeforeWord = wordMatch
    ? textBeforeCursor.substring(0, textBeforeCursor.length - wordMatch[0].length)
    : textBeforeCursor;
  const trimmedBeforeWord = textBeforeWord.replace(/\s+$/, '');

  // Table contexts: FROM, JOIN, INTO, UPDATE, TABLE
  const tableKeywords = /(?:FROM|JOIN|INTO|UPDATE|TABLE|TRUNCATE)\s*$/i;
  const trimmedStatement = currentStatement.replace(/\s+$/, '');
  // Check both: cursor right after keyword OR current word is right after keyword
  if (tableKeywords.test(trimmedStatement + ' ') || tableKeywords.test(trimmedBeforeWord + ' ')) {
    return { context: 'table', referencedTables, aliasToTable };
  }

  // Column contexts: SELECT, WHERE, ON, ORDER BY, GROUP BY, SET, AND, OR, HAVING
  const columnKeywords = /(?:SELECT|WHERE|AND|OR|ON|SET|ORDER\s+BY|GROUP\s+BY|HAVING|,)\s*$/i;
  if (columnKeywords.test(trimmedStatement + ' ') || columnKeywords.test(trimmedBeforeWord + ' ')) {
    return { context: 'column', referencedTables, aliasToTable };
  }

  // Additional check: if we're between SELECT and FROM (typing columns in select list)
  // Look for SELECT before cursor but no FROM before cursor
  const hasSelectBefore = /\bSELECT\b/i.test(currentStatement);
  const hasFromBefore = /\bFROM\b/i.test(currentStatement);
  if (hasSelectBefore && !hasFromBefore) {
    return { context: 'column', referencedTables, aliasToTable };
  }

  // Also check: between FROM and WHERE/GROUP/ORDER (typing in FROM clause or after table)
  const hasWhereBefore = /\bWHERE\b/i.test(currentStatement);
  const hasGroupBefore = /\bGROUP\b/i.test(currentStatement);
  const hasOrderBefore = /\bORDER\b/i.test(currentStatement);
  if (hasFromBefore && !hasWhereBefore && !hasGroupBefore && !hasOrderBefore) {
    // Could be typing table name or alias - check if right after FROM/JOIN
    if (!tableKeywords.test(trimmedBeforeWord + ' ')) {
      // Not right after FROM/JOIN, might be in WHERE-less query columns
      return { context: 'column', referencedTables, aliasToTable };
    }
  }

  return { context: 'general', referencedTables, aliasToTable };
}

/**
 * Get all tables from schema config
 */
function getAllTables(schemaConfig?: DB2SchemaConfig): DB2Table[] {
  if (!schemaConfig) return [];

  const tables: DB2Table[] = [];

  // Add tables from flat list
  if (schemaConfig.tables) {
    tables.push(...schemaConfig.tables);
  }

  // Add tables from schemas
  if (schemaConfig.schemas) {
    schemaConfig.schemas.forEach((schema) => {
      if (schema.tables) {
        schema.tables.forEach((table) => {
          tables.push({
            ...table,
            schema: table.schema || schema.name,
          });
        });
      }
    });
  }

  return tables;
}

/**
 * Get columns for a specific table
 */
function getColumnsForTable(
  tableName: string,
  schemaConfig?: DB2SchemaConfig,
): DB2Column[] {
  if (!schemaConfig) return [];

  const tables = getAllTables(schemaConfig);
  const upperTableName = tableName.toUpperCase();

  // Find matching table (check both with and without schema prefix)
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const fullName = t.schema ? (t.schema + '.' + t.name).toUpperCase() : t.name.toUpperCase();
    if (fullName === upperTableName || t.name.toUpperCase() === upperTableName) {
      return t.columns || [];
    }
  }

  return [];
}

/**
 * Creates the DB2 SQL completion provider with optional schema support
 */
export function createDB2SQLCompletionProvider(
  monaco: typeof monacoEditor,
  schemaConfig?: DB2SchemaConfig,
): monacoEditor.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['.', ' '],

    provideCompletionItems(
      model: monacoEditor.editor.ITextModel,
      position: monacoEditor.Position,
    ): monacoEditor.languages.ProviderResult<monacoEditor.languages.CompletionList> {
      // Check if cursor is inside a comment - if so, return no suggestions
      const lineContent = model.getLineContent(position.lineNumber);
      const textBeforeCursor = lineContent.substring(0, position.column - 1);

      // Check for -- line comment
      const lineCommentIndex = textBeforeCursor.indexOf('--');
      if (lineCommentIndex >= 0) {
        // Make sure we're not inside a string before the --
        var inString = false;
        for (var i = 0; i < lineCommentIndex; i++) {
          if (textBeforeCursor[i] === "'") inString = !inString;
        }
        if (!inString) {
          return { suggestions: [] };
        }
      }

      // Check for /* block comment (need to check full text up to cursor)
      const fullTextToCursor = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      var blockCommentDepth = 0;
      var inStr = false;
      for (var ci = 0; ci < fullTextToCursor.length - 1; ci++) {
        var ch = fullTextToCursor[ci];
        if (ch === "'" && !inStr) inStr = true;
        else if (ch === "'" && inStr) inStr = false;
        else if (!inStr) {
          if (ch === '/' && fullTextToCursor[ci + 1] === '*') {
            blockCommentDepth++;
            ci++;
          } else if (ch === '*' && fullTextToCursor[ci + 1] === '/') {
            blockCommentDepth--;
            ci++;
          }
        }
      }
      if (blockCommentDepth > 0) {
        return { suggestions: [] };
      }

      const word = model.getWordUntilPosition(position);
      const range: monacoEditor.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: monacoEditor.languages.CompletionItem[] = [];
      const context = getSQLContext(model, position);

      // Check if we're inside a CTE body - if so, suggest CTE columns
      const fullTextForCTE = model.getValue();
      const parsedCTEsForCompletion = parseCTEs(fullTextForCTE);

      // Calculate cursor offset
      var cursorOffsetForCTE = 0;
      for (var cteLineIdx = 0; cteLineIdx < position.lineNumber - 1; cteLineIdx++) {
        cursorOffsetForCTE += model.getLineContent(cteLineIdx + 1).length + 1;
      }
      cursorOffsetForCTE += position.column - 1;

      // Find which CTE we're inside (if any)
      var insideCTEForCompletion: ParsedCTEWithContext | null = null;
      for (var cteCompIdx = 0; cteCompIdx < parsedCTEsForCompletion.length; cteCompIdx++) {
        const cte = parsedCTEsForCompletion[cteCompIdx];
        if (cursorOffsetForCTE >= cte.bodyStartOffset && cursorOffsetForCTE <= cte.bodyEndOffset) {
          insideCTEForCompletion = cte;
          break;
        }
      }

      // Check if we're in the main query AFTER all CTEs (not inside any CTE body)
      // This is the final SELECT that uses the CTEs
      var inMainQueryAfterCTEs = false;
      var lastCTEEndOffset = 0;
      if (parsedCTEsForCompletion.length > 0) {
        // Find the end of the last CTE
        for (var lci = 0; lci < parsedCTEsForCompletion.length; lci++) {
          if (parsedCTEsForCompletion[lci].endOffset > lastCTEEndOffset) {
            lastCTEEndOffset = parsedCTEsForCompletion[lci].endOffset;
          }
        }
        // If cursor is after the last CTE, we're in the main query
        if (cursorOffsetForCTE > lastCTEEndOffset) {
          inMainQueryAfterCTEs = true;
        }
      }

      // If in main query after CTEs, suggest columns from CTEs in FROM clause
      if (inMainQueryAfterCTEs && !context.tableAlias) {
        // Get text from after last CTE to cursor (the main query)
        const mainQueryText = fullTextForCTE.substring(lastCTEEndOffset, cursorOffsetForCTE);

        // Check if we're in column context within the main query
        const hasSelectInMain = /\bSELECT\b/i.test(mainQueryText);
        const hasFromInMain = /\bFROM\b/i.test(mainQueryText);
        const isColumnContextInMain = hasSelectInMain && !hasFromInMain;
        const afterWhereInMain = /\b(WHERE|AND|OR|ON|HAVING)\s+[^;]*$/i.test(mainQueryText);

        if (isColumnContextInMain || afterWhereInMain) {
          // Parse FROM tables from the FULL main query (including after cursor)
          const mainQueryFull = fullTextForCTE.substring(lastCTEEndOffset);
          const fromMatch = mainQueryFull.match(/\bFROM\s+([A-Za-z_#@$][A-Za-z0-9_#@$]*)/i);

          if (fromMatch) {
            const mainFromTable = fromMatch[1].toUpperCase();

            // Check if FROM references a CTE
            for (var mainCteIdx = 0; mainCteIdx < parsedCTEsForCompletion.length; mainCteIdx++) {
              const cte = parsedCTEsForCompletion[mainCteIdx];
              if (cte.name === mainFromTable) {
                // Add CTE columns
                cte.columns.forEach((col) => {
                  suggestions.push({
                    label: col.name,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: col.name,
                    range,
                    detail: cte.name + ' (CTE) | ' + (col.expression ? 'Computed' : 'Column'),
                    documentation: col.expression ? 'Expression: ' + col.expression : 'Column from CTE ' + cte.name,
                    sortText: '0' + col.name,
                  });
                });

                // Also add CTE name for qualified references
                suggestions.push({
                  label: cte.name,
                  kind: monaco.languages.CompletionItemKind.Struct,
                  insertText: cte.name,
                  range,
                  detail: 'CTE',
                  documentation: 'Type . to see columns',
                  sortText: '1' + cte.name,
                });

                return { suggestions };
              }
            }
          }
        }
      }

      // If inside a CTE, check if we should suggest CTE columns
      // We need to check context WITHIN the CTE body, not the global context
      if (insideCTEForCompletion && !context.tableAlias) {
        // Get the text within this CTE body up to cursor
        const cteBodyBeforeCursor = fullTextForCTE.substring(
          insideCTEForCompletion.bodyStartOffset,
          cursorOffsetForCTE
        );

        // Check if we're in a column context within this CTE
        const hasSelectInCTE = /\bSELECT\b/i.test(cteBodyBeforeCursor);
        const hasFromInCTE = /\bFROM\b/i.test(cteBodyBeforeCursor);
        const isColumnContext = hasSelectInCTE && !hasFromInCTE;

        // Also check if we're after WHERE, AND, OR, etc. within the CTE
        const afterWhereKeyword = /\b(WHERE|AND|OR|ON|HAVING)\s+[^;]*$/i.test(cteBodyBeforeCursor);

        if ((isColumnContext || afterWhereKeyword || context.context === 'column') && insideCTEForCompletion.fromTables.length > 0) {
          // Get columns from tables/CTEs referenced in this CTE's FROM clause
          var cteSuggestionsAdded = false;

          for (var fromTblIdx = 0; fromTblIdx < insideCTEForCompletion.fromTables.length; fromTblIdx++) {
            const fromTableName = insideCTEForCompletion.fromTables[fromTblIdx];
            const fromShortName = fromTableName.indexOf('.') >= 0 ? fromTableName.split('.')[1] : fromTableName;

          // Check if this FROM table is another CTE
          for (var srcCteIdx = 0; srcCteIdx < parsedCTEsForCompletion.length; srcCteIdx++) {
            const srcCte = parsedCTEsForCompletion[srcCteIdx];
            if (srcCte.name === fromShortName || srcCte.name === fromTableName) {
              // Add columns from this CTE
              srcCte.columns.forEach((col) => {
                suggestions.push({
                  label: col.name,
                  kind: monaco.languages.CompletionItemKind.Field,
                  insertText: col.name,
                  range,
                  detail: srcCte.name + ' (CTE) | ' + (col.expression ? 'Computed' : 'Column'),
                  documentation: col.expression ? 'Expression: ' + col.expression : 'Column from CTE ' + srcCte.name,
                  sortText: '0' + col.name,
                });
              });

              // Check if CTE has * or table.* - if so, also add columns from its source tables
              const cteBody = fullTextForCTE.substring(srcCte.bodyStartOffset, srcCte.bodyEndOffset);

              // Check for SELECT * (all columns from all tables)
              const hasSelectStarComp = /\bSELECT\s+\*/i.test(cteBody);

              // Find all specific table.* or alias.* patterns
              const wildcardPatternsComp: string[] = [];
              const wildcardRegexComp = /(?<![A-Za-z0-9_#@$])([A-Za-z_#@$][A-Za-z0-9_#@$]*(?:\.[A-Za-z_#@$][A-Za-z0-9_#@$]*)?)\.\*/g;
              var wcMatchComp: RegExpExecArray | null;
              while ((wcMatchComp = wildcardRegexComp.exec(cteBody)) !== null) {
                wildcardPatternsComp.push(wcMatchComp[1].toUpperCase());
              }

              // Build alias to table mapping for this CTE
              const cteAliasMapComp: {[alias: string]: string} = {};
              // Use negative lookahead to prevent SQL keywords from being captured as aliases
              const cteFromJoinRegexComp = /(?:FROM|JOIN)\s+([A-Za-z0-9_#@$]+(?:\.[A-Za-z0-9_#@$]+)?)(?:\s+(?:AS\s+)?(?!(?:ON|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|AND|OR|GROUP|ORDER|HAVING|UNION|LIMIT|FETCH)\b)([A-Za-z_#@$][A-Za-z0-9_#@$]*))?/gi;
              var fjMatchComp: RegExpExecArray | null;
              while ((fjMatchComp = cteFromJoinRegexComp.exec(cteBody)) !== null) {
                const tblNameComp = fjMatchComp[1].toUpperCase();
                const tblAliasComp = fjMatchComp[2] ? fjMatchComp[2].toUpperCase() : null;
                if (tblAliasComp) {
                  cteAliasMapComp[tblAliasComp] = tblNameComp;
                }
                const tblShortComp = tblNameComp.indexOf('.') >= 0 ? tblNameComp.split('.')[1] : tblNameComp;
                cteAliasMapComp[tblShortComp] = tblNameComp;
                cteAliasMapComp[tblNameComp] = tblNameComp;
              }

              // Determine which tables to add columns from
              const tablesToInclude: string[] = [];
              if (hasSelectStarComp) {
                // All tables
                srcCte.fromTables.forEach((t) => tablesToInclude.push(t.toUpperCase()));
              } else if (wildcardPatternsComp.length > 0) {
                // Only specific tables from wildcard patterns
                wildcardPatternsComp.forEach((wc) => {
                  const resolved = cteAliasMapComp[wc] || wc;
                  tablesToInclude.push(resolved);
                });
              }

              if (tablesToInclude.length > 0 && schemaConfig) {
                const allTablesForStar = getAllTables(schemaConfig);
                tablesToInclude.forEach((srcFromTable) => {
                  const srcFromShort = srcFromTable.indexOf('.') >= 0 ? srcFromTable.split('.')[1] : srcFromTable;
                  allTablesForStar.forEach((t) => {
                    if (t.name.toUpperCase() === srcFromShort ||
                        (t.schema && (t.schema + '.' + t.name).toUpperCase() === srcFromTable)) {
                      if (t.columns) {
                        t.columns.forEach((col) => {
                          // Check if not already added
                          var alreadyAdded = false;
                          for (var si = 0; si < suggestions.length; si++) {
                            if (suggestions[si].label === col.name) {
                              alreadyAdded = true;
                              break;
                            }
                          }
                          if (!alreadyAdded) {
                            suggestions.push({
                              label: col.name,
                              kind: monaco.languages.CompletionItemKind.Field,
                              insertText: col.name,
                              range,
                              detail: t.name + ' (via ' + srcCte.name + ' CTE *) | ' + (col.dataType || 'Column'),
                              documentation: col.description || 'Column from ' + t.name + ' via CTE ' + srcCte.name,
                              sortText: '0' + col.name,
                            });
                          }
                        });
                      }
                    }
                  });
                });
              }

              cteSuggestionsAdded = true;
              break;
            }
          }

          // If not a CTE, check if it's a real table
          if (!cteSuggestionsAdded && schemaConfig) {
            const allTablesForFrom = getAllTables(schemaConfig);
            for (var tblIdx = 0; tblIdx < allTablesForFrom.length; tblIdx++) {
              const t = allTablesForFrom[tblIdx];
              if (t.name.toUpperCase() === fromShortName ||
                  (t.schema && (t.schema + '.' + t.name).toUpperCase() === fromTableName)) {
                if (t.columns) {
                  t.columns.forEach((col) => {
                    suggestions.push({
                      label: col.name,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: col.name,
                      range,
                      detail: t.name + ' | ' + (col.dataType || 'Column'),
                      documentation: col.description,
                      sortText: '0' + col.name,
                    });
                  });
                }
                cteSuggestionsAdded = true;
                break;
              }
            }
          }
        }

        // If we added CTE suggestions, also add table names for qualified references
        if (cteSuggestionsAdded) {
          // Add CTE names for table.column syntax
          for (var cteNameIdx = 0; cteNameIdx < insideCTEForCompletion.fromTables.length; cteNameIdx++) {
            const tblName = insideCTEForCompletion.fromTables[cteNameIdx];
            const shortTblName = tblName.indexOf('.') >= 0 ? tblName.split('.')[1] : tblName;
            suggestions.push({
              label: shortTblName,
              kind: monaco.languages.CompletionItemKind.Struct,
              insertText: shortTblName,
              range,
              detail: 'Table/CTE',
              documentation: 'Type . to see columns',
              sortText: '1' + shortTblName,
            });
          }
          return { suggestions };
        }
      }
      }

      // If we have schema config, add context-aware suggestions
      if (schemaConfig) {
        const allTables = getAllTables(schemaConfig);

        // Parse CTEs to add to suggestions
        const fullTextForCTE = model.getValue();
        const parsedCTEs = parseCTEs(fullTextForCTE);

        // Add table suggestions when in table context
        if (context.context === 'table') {
          // Add CTE tables first
          parsedCTEs.forEach((cte) => {
            suggestions.push({
              label: cte.name,
              kind: monaco.languages.CompletionItemKind.Struct,
              insertText: cte.name,
              range,
              detail: 'CTE',
              documentation: 'Common Table Expression with ' + cte.columns.length + ' columns',
              sortText: '0' + cte.name,
            });
          });

          allTables.forEach((table) => {
            const displayName = context.schemaName
              ? table.name
              : (schemaConfig.showSchemaPrefix && table.schema
                  ? table.schema + '.' + table.name
                  : table.name);

            suggestions.push({
              label: displayName,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: displayName,
              range,
              detail: table.type || 'Table',
              documentation: table.description,
              sortText: '0' + displayName, // Prioritize tables
            });
          });
          // In table context, only show tables - return early
          return { suggestions };
        }

        // Add column suggestions when in column context
        if (context.context === 'column') {
          // If we have a specific table context (after table.), show its columns
          if (context.tableAlias) {
            // Check if this is a CTE reference first
            for (var cteI = 0; cteI < parsedCTEs.length; cteI++) {
              const cte = parsedCTEs[cteI];
              if (cte.name === context.tableAlias) {
                // Show CTE columns
                cte.columns.forEach((col) => {
                  var colDetail = 'CTE column';
                  if (col.expression) {
                    colDetail = 'Computed: ' + col.expression.substring(0, 30) + (col.expression.length > 30 ? '...' : '');
                  }
                  suggestions.push({
                    label: col.name,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: col.name,
                    range,
                    detail: colDetail,
                    documentation: 'Column from CTE ' + cte.name,
                    sortText: '0' + col.name,
                  });
                });
                return { suggestions };
              }
            }

            // Resolve alias to actual table name if it exists
            var resolvedTableName = context.aliasToTable[context.tableAlias] || context.tableAlias;
            const columns = getColumnsForTable(resolvedTableName, schemaConfig);
            if (columns.length > 0) {
              // Found columns for this table
              columns.forEach((col) => {
                var detail = col.dataType || 'Column';
                if (col.description) {
                  detail = detail + ' - ' + col.description;
                }
                suggestions.push({
                  label: col.name,
                  kind: monaco.languages.CompletionItemKind.Field,
                  insertText: col.name,
                  range,
                  detail: detail,
                  documentation: col.description,
                  sortText: '0' + col.name,
                });
              });
              // Return early - only show columns for this specific table
              return { suggestions };
            } else {
              // tableAlias might be a schema name, show tables in that schema
              const tablesInSchema = allTables.filter(function(t) {
                return t.schema && t.schema.toUpperCase() === context.tableAlias;
              });
              if (tablesInSchema.length > 0) {
                tablesInSchema.forEach((table) => {
                  suggestions.push({
                    label: table.name,
                    kind: monaco.languages.CompletionItemKind.Class,
                    insertText: table.name,
                    range,
                    detail: table.type || 'Table',
                    documentation: table.description,
                    sortText: '0' + table.name,
                  });
                });
                return { suggestions };
              }
            }
          } else {
            // Show columns from all referenced tables including CTEs
            context.referencedTables.forEach((tableName) => {
              // Check if this is a CTE
              var isCteRef = false;
              for (var ci = 0; ci < parsedCTEs.length; ci++) {
                const cte = parsedCTEs[ci];
                if (cte.name === tableName.toUpperCase()) {
                  isCteRef = true;
                  // Add CTE columns
                  cte.columns.forEach((col) => {
                    suggestions.push({
                      label: col.name,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: col.name,
                      range,
                      detail: cte.name + ' (CTE) | ' + (col.expression ? 'Computed' : 'Column'),
                      documentation: col.expression ? 'Expression: ' + col.expression : 'Column from CTE',
                      sortText: '0' + col.name,
                    });
                  });
                  break;
                }
              }

              if (!isCteRef) {
                const columns = getColumnsForTable(tableName, schemaConfig);
                columns.forEach((col) => {
                  var colDetail = (col.dataType || 'Column');
                  if (col.description) {
                    colDetail = colDetail + ' - ' + col.description;
                  }
                  suggestions.push({
                    label: col.name,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: col.name,
                    range,
                    detail: tableName + ' | ' + colDetail,
                    documentation: col.description,
                    sortText: '0' + col.name,
                  });
                });
              }
            });

            // Also show all tables and CTEs for table.column syntax
            parsedCTEs.forEach((cte) => {
              suggestions.push({
                label: cte.name,
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: cte.name,
                range,
                detail: 'CTE',
                documentation: 'Type . to see CTE columns',
                sortText: '1' + cte.name,
              });
            });

            allTables.forEach((table) => {
              suggestions.push({
                label: table.name,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: table.name,
                range,
                detail: table.type || 'Table',
                documentation: 'Type . to see columns',
                sortText: '1' + table.name,
              });
            });
          }
        }
      }

      // Always add SQL keywords
      SQL_KEYWORDS.forEach((keyword) => {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range,
          detail: 'SQL Keyword',
          sortText: '2' + keyword,
        });
      });

      // Add DB2 for IBM i specific keywords
      DB2_IBM_I_KEYWORDS.forEach((keyword) => {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range,
          detail: 'IBM i Keyword',
          sortText: '2' + keyword,
        });
      });

      // Add IBM i version-specific keywords
      [...IBM_I_75_KEYWORDS, ...IBM_I_74_KEYWORDS, ...IBM_I_73_KEYWORDS].forEach((keyword) => {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range,
          detail: 'IBM i Reserved Word',
          sortText: '2' + keyword,
        });
      });

      // Add QSYS2 Services
      QSYS2_SERVICES.forEach((service) => {
        suggestions.push({
          label: service,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: service,
          range,
          detail: 'QSYS2 Service',
          sortText: '3' + service,
        });
      });

      // Add SYSIBM Catalog
      SYSIBM_CATALOG.forEach((catalog) => {
        suggestions.push({
          label: catalog,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: catalog,
          range,
          detail: 'SYSIBM Catalog',
          sortText: '3' + catalog,
        });
      });

      // Add IBM i System Objects
      IBM_I_SYSTEM_OBJECTS.forEach((obj) => {
        suggestions.push({
          label: obj,
          kind: monaco.languages.CompletionItemKind.Constant,
          insertText: obj,
          range,
          detail: 'IBM i System Object',
          sortText: '3' + obj,
        });
      });

      // Add DB2 functions
      DB2_FUNCTIONS.forEach((func) => {
        suggestions.push({
          label: func,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${func}($0)`,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: 'DB2 Function',
          sortText: '4' + func,
        });
      });

      // Add DB2 data types
      DB2_DATA_TYPES.forEach((type) => {
        suggestions.push({
          label: type,
          kind: monaco.languages.CompletionItemKind.TypeParameter,
          insertText: type,
          range,
          detail: 'DB2 Data Type',
          sortText: '5' + type,
        });
      });

      // Add snippet templates
      SQL_SNIPPETS.forEach((snippet) => {
        var item: monacoEditor.languages.CompletionItem = {
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet.insertText,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: range,
          detail: 'Snippet',
          documentation: snippet.documentation,
          sortText: '6' + snippet.label,
        };
        if (snippet.filterText) {
          item.filterText = snippet.filterText;
        }
        suggestions.push(item);
      });

      return { suggestions };
    },
  };
}
