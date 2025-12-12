import React from "react";
import { createRoot } from "react-dom/client";
import MonacoEditor, { MonacoDiffEditor, registerDB2SQL, createDB2SQLValidator, createDB2SQLHoverProvider } from "react-monaco-editor";
import sampleSchemaRaw from "./sample_schema.json";

// Sample DB2 SQL code for the example
const DB2_SAMPLE_CODE = `-- DB2 SQL Example
-- This demonstrates DB2 SQL syntax highlighting

-- Create a sample table
CREATE TABLE EMPLOYEES (
    EMP_ID INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY,
    FIRST_NAME VARCHAR(50) NOT NULL,
    LAST_NAME VARCHAR(50) NOT NULL,
    EMAIL VARCHAR(100),
    HIRE_DATE DATE DEFAULT CURRENT_DATE,
    SALARY DECIMAL(10,2),
    DEPARTMENT_ID INTEGER,
    PRIMARY KEY (EMP_ID)
);

-- Select with DB2-specific syntax
SELECT
    E.FIRST_NAME,
    E.LAST_NAME,
    E.SALARY,
    D.DEPT_NAME,
    ROW_NUMBER() OVER (PARTITION BY D.DEPT_NAME ORDER BY E.SALARY DESC) AS RANK
FROM EMPLOYEES E
INNER JOIN DEPARTMENTS D ON E.DEPARTMENT_ID = D.DEPT_ID
WHERE E.SALARY > 50000
    AND E.HIRE_DATE BETWEEN '2020-01-01' AND CURRENT_DATE
ORDER BY D.DEPT_NAME, E.SALARY DESC
FETCH FIRST 10 ROWS ONLY;

-- Common Table Expression (CTE)
WITH DEPT_STATS AS (
    SELECT
        DEPARTMENT_ID,
        COUNT(*) AS EMP_COUNT,
        AVG(SALARY) AS AVG_SALARY,
        MAX(SALARY) AS MAX_SALARY
    FROM EMPLOYEES
    GROUP BY DEPARTMENT_ID
)
SELECT * FROM DEPT_STATS
WHERE AVG_SALARY > 60000;

-- DB2 Administrative command example
CALL SYSPROC.ADMIN_CMD('REORG TABLE MYSCHEMA.EMPLOYEES');
CALL SYSPROC.ADMIN_CMD('RUNSTATS ON TABLE MYSCHEMA.EMPLOYEES WITH DISTRIBUTION');
`;

class CodeEditor extends React.Component {
  constructor() {
    super();
    this.state = {
      code: "// type your code... \n",
      theme: "vs-light",
    };
  }

  onChange = (newValue) => {
    console.log("onChange", newValue); // eslint-disable-line no-console
  };

  editorDidMount = (editor) => {
    // eslint-disable-next-line no-console
    console.log("editorDidMount", editor, editor.getValue(), editor.getModel());
    this.editor = editor;
  };

  changeEditorValue = () => {
    if (this.editor) {
      this.editor.setValue("// code changed! \n");
    }
  };

  changeBySetState = () => {
    this.setState({ code: "// code changed by setState! \n" });
  };

  setDarkTheme = () => {
    this.setState({ theme: "vs-dark" });
  };

  setLightTheme = () => {
    this.setState({ theme: "vs-light" });
  };

  render() {
    const { code, theme } = this.state;
    const options = {
      selectOnLineNumbers: true,
      roundedSelection: false,
      readOnly: false,
      cursorStyle: "line",
      automaticLayout: false,
    };
    return (
      <div>
        <div>
          <button onClick={this.changeEditorValue} type="button">
            Change value
          </button>
          <button onClick={this.changeBySetState} type="button">
            Change by setState
          </button>
          <button onClick={this.setDarkTheme} type="button">
            Set dark theme
          </button>
          <button onClick={this.setLightTheme} type="button">
            Set light theme
          </button>
        </div>
        <hr />
        <MonacoEditor
          height="400"
          language="javascript"
          value={code}
          options={options}
          onChange={this.onChange}
          editorDidMount={this.editorDidMount}
          theme={theme}
        />
      </div>
    );
  }
}

class AnotherEditor extends React.Component {
  constructor() {
    super();
    this.state = {
      code: ["{", '    "$schema": "http://myserver/foo-schema.json"', "}"].join("\n"),
      language: "json",
    };
  }

  changeLanguage = () => {
    this.setState((prev) => ({
      language: prev.language === "json" ? "javascript" : "json",
    }));
  };

  editorWillMount = (monaco) => {
    monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions({
      validate: true,
      schemas: [
        {
          uri: "http://myserver/foo-schema.json",
          schema: {
            type: "object",
            properties: {
              p1: {
                enum: ["v1", "v2"],
              },
              p2: {
                $ref: "http://myserver/bar-schema.json",
              },
            },
          },
        },
        {
          uri: "http://myserver/bar-schema.json",
          schema: {
            type: "object",
            properties: {
              q1: {
                enum: ["x1", "x2"],
              },
            },
          },
        },
      ],
    });
  };

  render() {
    const { code, language } = this.state;
    return (
      <div>
        <div>
          <button onClick={this.changeLanguage} type="button">
            Change by setState
          </button>
          <span style={{ marginLeft: "3em" }}>
            Language:
            {this.state.language}
          </span>
        </div>
        <hr />
        <div>
          <MonacoEditor
            width="800"
            height="300"
            language={language}
            defaultValue={code}
            editorWillMount={this.editorWillMount}
          />
        </div>
      </div>
    );
  }
}

class CodeEditorWithUri extends React.Component {
  constructor() {
    super();
    this.state = {
      code: `{\n"p1": "v3",\n"q1": "Value"\n}`,
    };
  }

  editorWillMount = (monaco) => {
    monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions({
      validate: true,
      schemas: [
        {
          uri: "http://myserver/foo-schema.json",
          fileMatch: ["file:///test-editor-with-validation"],
          schema: {
            type: "object",
            properties: {
              p1: {
                enum: ["v1", "v2"],
              },
              p2: {
                $ref: "http://myserver/bar-schema.json",
              },
            },
          },
        },
        {
          uri: "http://myserver/bar-schema.json",
          fileMatch: ["file:///test-editor-with-validation"],
          schema: {
            type: "object",
            properties: {
              q1: {
                enum: ["x1", "x2"],
              },
            },
          },
        },
      ],
    });
  };

  render() {
    const { code } = this.state;
    const options = {
      selectOnLineNumbers: true,
      roundedSelection: false,
      readOnly: false,
      cursorStyle: "line",
      automaticLayout: false,
    };
    return (
      <div>
        <MonacoEditor
          height="400"
          language="json"
          value={code}
          options={options}
          onChange={this.onChange}
          editorWillMount={this.editorWillMount}
          uri={({ Uri }) => Uri.parse("test-editor")}
        />
        <MonacoEditor
          height="400"
          language="json"
          value={code}
          options={options}
          onChange={this.onChange}
          editorWillMount={this.editorWillMount}
          uri={({ Uri }) => Uri.parse("test-editor-with-validation")}
        />
      </div>
    );
  }
}

class DiffEditor extends React.Component {
  constructor() {
    super();
    this.state = {
      code: 'const a = "Hello Monaco"',
      original: 'const a = "Hello World"',
    };
  }

  onChange = (newValue) => {
    console.log("onChange", newValue); // eslint-disable-line no-console
  };

  render() {
    const { code, original } = this.state;
    return (
      <div>
        <button onClick={() => this.setState({ code })} type="button">
          Reset
        </button>
        <hr />
        <MonacoDiffEditor
          width="800"
          height="300"
          language="javascript"
          value={code}
          original={original}
          onChange={this.onChange}
        />
      </div>
    );
  }
}

// Transform the imported schema to match our DB2SchemaConfig interface
function transformSchema(rawSchema) {
  // Group tables by database/schema
  const schemaMap = {};

  rawSchema.forEach((table) => {
    const schemaName = table.database || "DEFAULT";

    if (!schemaMap[schemaName]) {
      schemaMap[schemaName] = {
        name: schemaName,
        description: schemaName,
        tables: [],
      };
    }

    // Transform columns
    const columns = (table.columns || []).map((col) => ({
      name: col.name,
      dataType: col.type + (col.max_length ? `(${col.max_length})` : ""),
      description: col.friendly_name || col.description || null,
      nullable: col.nullable,
    }));

    schemaMap[schemaName].tables.push({
      name: table.name,
      schema: schemaName,
      description: table.friendly_name || table.description || null,
      type: "TABLE",
      columns: columns,
    });
  });

  return {
    showSchemaPrefix: true,
    defaultSchema: Object.keys(schemaMap)[0] || "DEFAULT",
    schemas: Object.values(schemaMap),
  };
}

// Transform the raw schema data
const sampleSchemaConfig = transformSchema(sampleSchemaRaw);
console.log(`Loaded schema with ${sampleSchemaRaw.length} tables`);

// DB2 SQL Editor Example
class DB2SQLEditor extends React.Component {
  constructor() {
    super();
    this.state = {
      code: DB2_SAMPLE_CODE,
      theme: "vs-dark",
    };
  }

  onChange = (newValue) => {
    console.log("DB2 SQL onChange", newValue); // eslint-disable-line no-console
  };

  editorWillMount = (monaco) => {
    // Register DB2 SQL language with schema config for table/column autocomplete
    registerDB2SQL(monaco, { schema: sampleSchemaConfig });
  };

  editorDidMount = (editor, monaco) => {
    // eslint-disable-next-line no-console
    console.log("DB2 SQL Editor mounted", editor);
    // eslint-disable-next-line no-console
    console.log("Editor language:", editor.getModel().getLanguageId());
    this.editor = editor;

    // Set up validation
    const validate = createDB2SQLValidator(monaco, sampleSchemaConfig);

    // Validate on mount
    validate(editor.getModel());

    // Re-validate when content changes (with debounce)
    let validateTimeout;
    editor.onDidChangeModelContent(() => {
      clearTimeout(validateTimeout);
      validateTimeout = setTimeout(() => {
        validate(editor.getModel());
      }, 500); // 500ms debounce
    });

    // Register hover provider for column/table information
    monaco.languages.registerHoverProvider('db2sql', createDB2SQLHoverProvider(monaco, sampleSchemaConfig));
  };

  setDarkTheme = () => {
    this.setState({ theme: "vs-dark" });
  };

  setLightTheme = () => {
    this.setState({ theme: "vs" });
  };

  triggerSuggest = () => {
    if (this.editor) {
      console.log("Triggering suggest programmatically...");
      this.editor.focus();
      this.editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
    }
  };

  render() {
    const { code, theme } = this.state;
    const options = {
      selectOnLineNumbers: true,
      roundedSelection: false,
      readOnly: false,
      cursorStyle: "line",
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      fontSize: 14,
      // Enable autocomplete suggestions while typing
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: "off",
    };
    return (
      <div>
        <div>
          <button onClick={this.setDarkTheme} type="button">
            Dark theme
          </button>
          <button onClick={this.setLightTheme} type="button">
            Light theme
          </button>
          <button onClick={this.triggerSuggest} type="button" style={{ marginLeft: '10px', backgroundColor: '#4CAF50', color: 'white' }}>
            Trigger Autocomplete
          </button>
          <span style={{ marginLeft: "1em", color: "#666" }}>
            Try: "SELECT " for column names, "FROM " for table names, or "EMPLOYEES." for table columns
          </span>
        </div>
        <hr />
        <MonacoEditor
          width="100%"
          height="500"
          language="db2sql"
          value={code}
          options={options}
          onChange={this.onChange}
          editorWillMount={this.editorWillMount}
          editorDidMount={this.editorDidMount}
          theme={theme}
        />
      </div>
    );
  }
}

const App = () => (
  <div>
    <h2>DB2 SQL Editor (with syntax highlighting and schema-aware autocomplete)</h2>
    <DB2SQLEditor />
    <hr />
    <h2>Monaco Editor Sample (controlled mode)</h2>
    <CodeEditor />
    <hr />
    <h2>Another editor (uncontrolled mode)</h2>
    <AnotherEditor />
    <hr />
    <h2>Editor with specific URI</h2>
    <CodeEditorWithUri />
    <hr />
    <h2>Another editor (showing a diff)</h2>
    <DiffEditor />
  </div>
);

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);
