// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { parseSQLToDatabase } from './sqlParser';

interface Database {
	name: string;
	schemas: Schema[];
}

interface Schema {
	name: string;
	tables: Table[];
}

interface UniqueConstraint {
	name: string;
	columns: string[];
}

interface Index {
	name: string;
	columns: string[];
	isClustered: boolean;
	isUnique: boolean;
}

interface PrimaryKey {
	name?: string;
	columns: string[];
	isClustered?: boolean;
}

interface Table {
	name: string;
	columns: Column[];
	primaryKey?: PrimaryKey;
	uniqueConstraints?: UniqueConstraint[];
	indexes?: Index[];
	x?: number;
	y?: number;
}

interface Column {
	name: string;
	type: string;
	isPrimaryKey: boolean;
	isForeignKey: boolean;
	isNullable: boolean;
	isUnique?: boolean;
	defaultValue?: string;
	foreignKeyRef?: {
		schema: string;
		table: string;
		column: string;
	};
	pkName?: string;
	fkConstraintName?: string;
	uniqueConstraintName?: string;
	length?: number;
	precision?: number;
	scale?: number;
}

let currentDatabase: Database | null = null;
let currentDatabaseFolderUri: vscode.Uri | null = null;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('SQLGem extension is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('sqlgem.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from sqlgem in a web extension host!');
	});

	const windowDisposable = vscode.commands.registerCommand('sqlgem.showWindow', () => {
		const panel = vscode.window.createWebviewPanel(
			'sqlgemWindow',
			'SQLGem - ER Diagram',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'web')]
			}
		);

		panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

		// Handle messages from the webview
		panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case 'createDatabase':
						await handleCreateDatabase(message.name, panel);
						break;
					case 'loadDatabase':
						await handleLoadDatabase(panel);
						break;
					case 'addSchema':
						await handleAddSchema(message.name, panel);
						break;
					case 'addTable':
						await handleAddTable(message.schemaName, message.table, panel);
						break;
					case 'updateTable':
						await handleUpdateTable(message.schemaName, message.oldTableName, message.table, panel);
						break;
					case 'deleteTable':
						await handleDeleteTable(message.schemaName, message.tableName, panel);
						break;
					case 'saveDatabase':
						await handleSaveDatabase(panel, message.useIfNotExists || false);
						break;
					case 'previewSQL':
						handlePreviewSQL(panel, message.useIfNotExists || false);
						break;					case 'getDatabaseState':
						panel.webview.postMessage({
							command: 'updateDatabase',
							database: currentDatabase
						});
						break;
					case 'showError':
						vscode.window.showErrorMessage(message.text);
						break;
				}
			},
			undefined,
			context.subscriptions
		);
	});

	context.subscriptions.push(windowDisposable);
	context.subscriptions.push(disposable);

	async function handleCreateDatabase(name: string, panel: vscode.WebviewPanel) {
		if (!name) {
			vscode.window.showErrorMessage('Database name is required');
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder open');
			return;
		}

		const dbFolderUri = vscode.Uri.joinPath(workspaceFolders[0].uri, name);
		
		try {
			// Check if folder exists
			let exists = true;
			try {
				await vscode.workspace.fs.stat(dbFolderUri);
			} catch (e) {
				exists = false;
			}

			if (exists) {
				const choice = await vscode.window.showWarningMessage(
					`Database folder "${name}" already exists. Overwrite?`,
					'Overwrite',
					'Cancel'
				);
				if (choice !== 'Overwrite') {
					vscode.window.showInformationMessage('Create database cancelled');
					return;
				}

				// Delete existing folder before creating
				await vscode.workspace.fs.delete(dbFolderUri, { recursive: true, useTrash: false });
			}

			await vscode.workspace.fs.createDirectory(dbFolderUri);
			
			currentDatabase = {
				name: name,
				schemas: [{
					name: 'dbo',
					tables: []
				}]
			};

			// Track the database folder
			currentDatabaseFolderUri = dbFolderUri;

			// Create initial database.sql file
			await writeDatabaseSQL();
			
			panel.webview.postMessage({
				command: 'updateDatabase',
				database: currentDatabase
			});
			
			vscode.window.showInformationMessage(`Database "${name}" created with default schema "dbo"`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create database: ${error}`);
		}
	}

	async function handleLoadDatabase(panel: vscode.WebviewPanel) {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder open');
			return;
		}

		try {
			const entries = await vscode.workspace.fs.readDirectory(workspaceFolders[0].uri);
			const dirs = entries.filter(([name, type]) => type === vscode.FileType.Directory).map(([name]) => name);
			if (dirs.length === 0) {
				vscode.window.showInformationMessage('No folders found in workspace to load');
				return;
			}

			const pick = await vscode.window.showQuickPick(dirs, { placeHolder: 'Select database folder to load' });
			if (!pick) {
				return;
			}

			const folderUri = vscode.Uri.joinPath(workspaceFolders[0].uri, pick);
			const databaseSqlUri = vscode.Uri.joinPath(folderUri, 'database.sql');

			console.log(`Loading database from folder: ${pick}`);
			console.log(`Looking for database.sql file...`);

			// Check if database.sql exists
			let databaseSqlExists = false;
			try {
				await vscode.workspace.fs.stat(databaseSqlUri);
				databaseSqlExists = true;
			} catch {
				databaseSqlExists = false;
			}

			if (!databaseSqlExists) {
				vscode.window.showErrorMessage(
					`database.sql file is missing in the selected folder "${pick}". Please add the file to load the database.`
				);
				return;
			}

			// Read database.sql file
			const bytes = await vscode.workspace.fs.readFile(databaseSqlUri);
			const sqlContent = new TextDecoder().decode(bytes);
			console.log(`Read database.sql: ${sqlContent.length} bytes`);
			console.log('SQL preview (first 500 chars):', sqlContent.substring(0, 500));

			// Parse SQL content using enhanced parser (supports IF NOT EXISTS patterns)
			const db = parseSQLToDatabase(sqlContent, pick);

			console.log(`Parsed database: ${db.name}`);
			console.log(`Schemas found: ${db.schemas.length}`, db.schemas.map(s => `${s.name} (${s.tables.length} tables)`));
			db.schemas.forEach(schema => {
				console.log(`Schema ${schema.name}:`);
				schema.tables.forEach(table => {
					console.log(`  Table ${table.name}: ${table.columns.length} columns`);
					table.columns.forEach(col => {
						const fkInfo = col.isForeignKey ? ` -> ${col.foreignKeyRef?.schema}.${col.foreignKeyRef?.table}(${col.foreignKeyRef?.column})` : '';
						console.log(`    ${col.name} ${col.type}${col.isPrimaryKey ? ' PK' : ''}${fkInfo}`);
					});
				});
			});

			currentDatabase = db;
			currentDatabaseFolderUri = folderUri;

			panel.webview.postMessage({ command: 'updateDatabase', database: currentDatabase });
			console.log('Sent updateDatabase message to webview');
			
			vscode.window.showInformationMessage(`Loaded database "${pick}" from database.sql`);
		} catch (error) {
			console.error('Error loading database:', error);
			vscode.window.showErrorMessage(`Failed to load database: ${error}`);
		}
	}

	async function handleAddSchema(name: string, panel: vscode.WebviewPanel) {
		if (!currentDatabase) {
			vscode.window.showErrorMessage('Create a database first');
			return;
		}

		if (!name) {
			vscode.window.showErrorMessage('Schema name is required');
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			return;
		}
		
		try {
			currentDatabase.schemas.push({
				name: name,
				tables: []
			});

			// Update in-memory only (no file write)
			panel.webview.postMessage({
				command: 'updateDatabase',
				database: currentDatabase
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create schema: ${error}`);
		}
	}

	async function handleAddTable(schemaName: string, table: Table, panel: vscode.WebviewPanel) {
		console.log('handleAddTable called', { schemaName, table, currentDatabase });
		
		if (!currentDatabase) {
			vscode.window.showErrorMessage('Create a database first');
			return;
		}

		const schema = currentDatabase.schemas.find(s => s.name === schemaName);
		if (!schema) {
			vscode.window.showErrorMessage(`Schema "${schemaName}" not found`);
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder open');
			return;
		}
		
		try {
			console.log('Adding table:', table.name);
			schema.tables.push(table);

			// Update in-memory only (no file write)
			panel.webview.postMessage({
				command: 'updateDatabase',
				database: currentDatabase
			});
		} catch (error) {
			console.error('Error creating table:', error);
			vscode.window.showErrorMessage(`Failed to create table: ${error}`);
		}
	}

	async function handleUpdateTable(schemaName: string, oldTableName: string, table: Table, panel: vscode.WebviewPanel) {
		console.log('handleUpdateTable called', { schemaName, oldTableName, table, currentDatabase });
		
		if (!currentDatabase) {
			vscode.window.showErrorMessage('Create a database first');
			return;
		}

		const schema = currentDatabase.schemas.find(s => s.name === schemaName);
		if (!schema) {
			vscode.window.showErrorMessage(`Schema "${schemaName}" not found`);
			return;
		}

		const tableIndex = schema.tables.findIndex(t => t.name === oldTableName);
		if (tableIndex === -1) {
			vscode.window.showErrorMessage(`Table "${oldTableName}" not found`);
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder open');
			return;
		}

		try {
			const oldTable = schema.tables[tableIndex];

			// Check if any columns were renamed that have FK references
			for (const oldCol of oldTable.columns) {
				if (oldCol.isPrimaryKey) {
					const newCol = table.columns.find(c => c.name === oldCol.name);
					if (!newCol && table.columns.some(c => c.isPrimaryKey)) {
						// Column was renamed - update FK references across all tables
						updateForeignKeyReferences(schemaName, oldTableName, oldCol.name, table, panel);
					}
				}
			}

			// Update in-memory structure only (no file write)
			schema.tables[tableIndex] = table;

			panel.webview.postMessage({
				command: 'updateDatabase',
				database: currentDatabase
			});
		} catch (error) {
			console.error('Error updating table:', error);
			vscode.window.showErrorMessage(`Failed to update table: ${error}`);
		}
	}

	async function handleDeleteTable(schemaName: string, tableName: string, panel: vscode.WebviewPanel) {
		if (!currentDatabase) {
			vscode.window.showErrorMessage('No database loaded');
			return;
		}

		const schema = currentDatabase.schemas.find(s => s.name === schemaName);
		if (!schema) {
			vscode.window.showErrorMessage(`Schema "${schemaName}" not found`);
			return;
		}

		const tableIndex = schema.tables.findIndex(t => t.name === tableName);
		if (tableIndex === -1) {
			vscode.window.showErrorMessage(`Table "${tableName}" not found`);
			return;
		}

		// Clean up all foreign key references to this table in other tables
		currentDatabase.schemas.forEach(s => {
			s.tables.forEach(t => {
				// Remove FK columns that reference the deleted table
				t.columns.forEach(col => {
					if (col.isForeignKey && 
						col.foreignKeyRef && 
						col.foreignKeyRef.schema === schemaName && 
						col.foreignKeyRef.table === tableName) {
						// Clear the FK reference
						col.isForeignKey = false;
						col.foreignKeyRef = undefined;
						col.fkConstraintName = undefined;
					}
				});
			});
		});

		// Remove table from schema (in-memory only, no file write)
		schema.tables.splice(tableIndex, 1);

		// Send updated database to webview
		panel.webview.postMessage({
			command: 'updateDatabase',
			database: currentDatabase,
		});
	}

	function generateMSSQLTable(schemaName: string, table: Table, useIfNotExists: boolean = false): string {
		// Build column definitions (without named PK constraint)
		const columnsDefs = table.columns.map(col => {
			// Format type with length/precision/scale if applicable
			let typeStr = col.type;
			if ((col.type === 'VARCHAR' || col.type === 'NVARCHAR') && col.length) {
				typeStr = `${col.type}(${col.length})`;
			} else if (col.type === 'DECIMAL' && col.precision) {
				typeStr = col.scale !== undefined 
					? `DECIMAL(${col.precision},${col.scale})` 
					: `DECIMAL(${col.precision})`;
			}
			
			let columnDef = `    [${col.name}] ${typeStr}`;
			if (!col.isNullable || col.isPrimaryKey) {
				columnDef += ' NOT NULL';
			}
			return columnDef;
		}).join(',\n');

		let tableSql = `-- Table: ${schemaName}.${table.name}\n`;
		tableSql += `-- Generated by SQLGem\n\n`;
		
		if (useIfNotExists) {
			tableSql += `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[${schemaName}].[${table.name}]') AND type = 'U')\n`;
			tableSql += `BEGIN\n`;
			tableSql += `    CREATE TABLE [${schemaName}].[${table.name}] (\n${columnsDefs}`;
		} else {
			tableSql += `CREATE TABLE [${schemaName}].[${table.name}] (\n${columnsDefs}`;
		}

		// Add primary key constraint if present
		// Check table-level PK first, then fall back to column-level PKs
		let pkCols: string[] = [];
		let pkName = `PK_${table.name}`;
		let pkIsClustered = true; // Default to clustered
		
		if (table.primaryKey) {
			// Use table-level primary key definition
			pkCols = table.primaryKey.columns.map(col => `[${col}]`);
			pkName = table.primaryKey.name || pkName;
			pkIsClustered = table.primaryKey.isClustered !== false; // Default to clustered if not specified
		} else {
			// Fall back to column-level PKs
			pkCols = table.columns.filter(c => c.isPrimaryKey).map(c => `[${c.name}]`);
			const pkCol = table.columns.find(c => c.isPrimaryKey && c.pkName);
			if (pkCol) {
				pkName = pkCol.pkName!;
			}
		}
		
		if (pkCols.length > 0) {
			const clusterKeyword = pkIsClustered ? 'CLUSTERED' : 'NONCLUSTERED';
			tableSql += `,\n    CONSTRAINT [${pkName}] PRIMARY KEY ${clusterKeyword} (${pkCols.join(', ')})`;
		}

		tableSql += `\n);\n`;
		
		if (useIfNotExists) {
			tableSql += `END\n`;
		}

		// Add column-level UNIQUE constraints as inline constraints (deprecated pattern)
		// Modern approach: use table.uniqueConstraints array instead
		const uniqueColumns = table.columns.filter(c => c.isUnique && !c.isPrimaryKey);
		if (uniqueColumns.length > 0) {
			uniqueColumns.forEach(col => {
				const ucName = col.uniqueConstraintName || `UQ_${table.name}_${col.name}`;
				if (useIfNotExists) {
					tableSql += `\nIF NOT EXISTS (\n`;
					tableSql += `    SELECT 1 FROM sys.key_constraints\n`;
					tableSql += `    WHERE name = N'${ucName}'\n`;
					tableSql += `    AND parent_object_id = OBJECT_ID(N'[${schemaName}].[${table.name}]')\n`;
					tableSql += `)\n`;
					tableSql += `BEGIN\n`;
					tableSql += `    ALTER TABLE [${schemaName}].[${table.name}]\n`;
					tableSql += `        ADD CONSTRAINT [${ucName}] UNIQUE ([${col.name}]);\n`;
					tableSql += `END\n`;
				} else {
					tableSql += `\nALTER TABLE [${schemaName}].[${table.name}]\n`;
					tableSql += `    ADD CONSTRAINT [${ucName}] UNIQUE ([${col.name}]);\n`;
				}
			});
		}

		return tableSql;
	}

	function generateDatabaseSQL(useIfNotExists: boolean = false): string {
		if (!currentDatabase) {
			return '';
		}

		let sql = `-- Database: ${currentDatabase.name}\n`;
		sql += `-- Generated by SQLGem at ${new Date().toISOString()}\n`;
		if (useIfNotExists) {
			sql += `-- Idempotent DDL: Safe to run multiple times\n`;
		}
		sql += `\nUSE [${currentDatabase.name}];\nGO\n\n`;

		// Create schemas (for non-dbo schemas)
		const nonDboSchemas = currentDatabase.schemas.filter(s => s.name !== 'dbo');
		if (nonDboSchemas.length > 0) {
			sql += `-- ====================================\n`;
			sql += `-- Create Schemas\n`;
			sql += `-- ====================================\n\n`;
			nonDboSchemas.forEach(schema => {
				if (useIfNotExists) {
					sql += `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'${schema.name}')\n`;
					sql += `BEGIN\n`;
					sql += `    EXEC('CREATE SCHEMA [${schema.name}]');\n`;
					sql += `END\n`;
				} else {
					sql += `CREATE SCHEMA [${schema.name}];\n`;
				}
				sql += `GO\n\n`;
			});
		}

		// Generate all tables for all schemas
		currentDatabase.schemas.forEach(schema => {
			if (schema.tables.length > 0) {
				sql += `-- ====================================\n`;
				sql += `-- Schema: ${schema.name}\n`;
				sql += `-- ====================================\n\n`;

				schema.tables.forEach(table => {
					sql += generateMSSQLTable(schema.name, table, useIfNotExists);
					sql += '\nGO\n\n';
				});
			}
		});

		// Collect all foreign key constraints and add them at the end
		const allForeignKeys: string[] = [];
		currentDatabase.schemas.forEach(schema => {
			schema.tables.forEach(table => {
				table.columns.forEach(col => {
					if (col.isForeignKey && col.foreignKeyRef) {
						const ref = col.foreignKeyRef;
						const fkName = col.fkConstraintName || `FK_${table.name}_${col.name}`;
						
						let fkSql = '';
						if (useIfNotExists) {
							fkSql += `IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = N'${fkName}' AND parent_object_id = OBJECT_ID(N'[${schema.name}].[${table.name}]'))\n`;
							fkSql += `BEGIN\n`;
							fkSql += `    ALTER TABLE [${schema.name}].[${table.name}]\n`;
							fkSql += `        ADD CONSTRAINT [${fkName}]\n`;
							fkSql += `        FOREIGN KEY ([${col.name}])\n`;
							fkSql += `        REFERENCES [${ref.schema}].[${ref.table}]([${ref.column}]);\n`;
							fkSql += `END`;
						} else {
							fkSql += `ALTER TABLE [${schema.name}].[${table.name}]\n`;
							fkSql += `    ADD CONSTRAINT [${fkName}]\n`;
							fkSql += `    FOREIGN KEY ([${col.name}])\n`;
							fkSql += `    REFERENCES [${ref.schema}].[${ref.table}]([${ref.column}]);`;
						}
						
						allForeignKeys.push(fkSql);
					}
				});
			});
		});

		// Collect all unique constraints (table-level only)
		const allUniqueConstraints: string[] = [];
		currentDatabase.schemas.forEach(schema => {
			schema.tables.forEach(table => {
				// Add table-level unique constraints
				if (table.uniqueConstraints) {
					table.uniqueConstraints.forEach(uc => {
						// Auto-generate name if missing
						const constraintName = uc.name || `UQ_${table.name}_${uc.columns.join('_')}`;
						const ucCols = uc.columns.map(col => `[${col}]`).join(', ');
						let ucSql = '';
						if (useIfNotExists) {
							ucSql += `IF NOT EXISTS (\n`;
							ucSql += `    SELECT 1 FROM sys.key_constraints\n`;
							ucSql += `    WHERE name = N'${constraintName}'\n`;
							ucSql += `    AND parent_object_id = OBJECT_ID(N'[${schema.name}].[${table.name}]')\n`;
							ucSql += `)\n`;
							ucSql += `BEGIN\n`;
							ucSql += `    ALTER TABLE [${schema.name}].[${table.name}]\n`;
							ucSql += `        ADD CONSTRAINT [${constraintName}] UNIQUE (${ucCols});\n`;
							ucSql += `END`;
						} else {
							ucSql += `ALTER TABLE [${schema.name}].[${table.name}]\n`;
							ucSql += `    ADD CONSTRAINT [${constraintName}] UNIQUE (${ucCols});`;
						}
						allUniqueConstraints.push(ucSql);
					});
				}
			});
		});

		// Collect all indexes
		const allIndexes: string[] = [];
		currentDatabase.schemas.forEach(schema => {
			schema.tables.forEach(table => {
				if (table.indexes) {
					table.indexes.forEach(idx => {
						// Auto-generate name if missing using correct naming conventions
						let indexName = idx.name;
						if (!indexName) {
							const prefix = idx.isUnique ? 'UX' : 'IX'; // UX for unique, IX for non-unique
							indexName = `${prefix}_${table.name}_${idx.columns.join('_')}`;
						}
						
						const idxCols = idx.columns.map(col => `[${col}]`).join(', ');
						const uniqueKeyword = idx.isUnique ? 'UNIQUE ' : '';
						const clusterKeyword = idx.isClustered ? 'CLUSTERED' : 'NONCLUSTERED';
						
						let idxSql = '';
						if (useIfNotExists) {
							idxSql += `IF NOT EXISTS (\n`;
							idxSql += `    SELECT 1 FROM sys.indexes\n`;
							idxSql += `    WHERE name = N'${indexName}'\n`;
							idxSql += `    AND object_id = OBJECT_ID(N'[${schema.name}].[${table.name}]')\n`;
							idxSql += `)\n`;
							idxSql += `BEGIN\n`;
							idxSql += `    CREATE ${uniqueKeyword}${clusterKeyword} INDEX [${indexName}]\n`;
							idxSql += `        ON [${schema.name}].[${table.name}] (${idxCols});\n`;
							idxSql += `END`;
						} else {
							idxSql += `CREATE ${uniqueKeyword}${clusterKeyword} INDEX [${indexName}]\n`;
							idxSql += `    ON [${schema.name}].[${table.name}] (${idxCols});`;
						}
						allIndexes.push(idxSql);
					});
				}
			});
		});

		if (allUniqueConstraints.length > 0) {
			sql += `-- ====================================\n`;
			sql += `-- Unique Constraints\n`;
			sql += `-- ====================================\n\n`;
			allUniqueConstraints.forEach(uc => {
				sql += uc + '\nGO\n\n';
			});
		}

		if (allIndexes.length > 0) {
			sql += `-- ====================================\n`;
			sql += `-- Indexes\n`;
			sql += `-- ====================================\n\n`;
			allIndexes.forEach(idx => {
				sql += idx + '\nGO\n\n';
			});
		}

		if (allForeignKeys.length > 0) {
			sql += `-- ====================================\n`;
			sql += `-- Foreign Key Constraints\n`;
			sql += `-- ====================================\n\n`;
			allForeignKeys.forEach(fk => {
				sql += fk + '\nGO\n\n';
			});
		}

		return sql;
	}

	async function handleSaveDatabase(panel: vscode.WebviewPanel, useIfNotExists: boolean = false): Promise<void> {
		if (!currentDatabase) {
			vscode.window.showErrorMessage('No database to save');
			return;
		}

		if (!currentDatabaseFolderUri) {
			vscode.window.showErrorMessage('Database folder not set. Please create or load a database first.');
			return;
		}

		try {
			await writeDatabaseSQL(useIfNotExists);
			vscode.window.showInformationMessage(`Database "${currentDatabase.name}" saved to database.sql`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to save database: ${error}`);
		}
	}

	function handlePreviewSQL(panel: vscode.WebviewPanel, useIfNotExists: boolean = false): void {
		if (!currentDatabase) {
			vscode.window.showErrorMessage('No database to preview');
			return;
		}

		const sqlContent = generateDatabaseSQL(useIfNotExists);
		panel.webview.postMessage({
			command: 'showSQLPreview',
			sql: sqlContent
		});
	}

	async function writeDatabaseSQL(useIfNotExists: boolean = false): Promise<void> {
		if (!currentDatabase || !currentDatabaseFolderUri) {
			return;
		}

		// Save to database.sql in the current database folder
		const dbFileUri = vscode.Uri.joinPath(currentDatabaseFolderUri, 'database.sql');
		const sqlContent = generateDatabaseSQL(useIfNotExists);
		const encoder = new TextEncoder();
		await vscode.workspace.fs.writeFile(dbFileUri, encoder.encode(sqlContent));
	}

	function updateForeignKeyReferences(schemaName: string, tableName: string, oldColumnName: string, updatedTable: Table, panel: vscode.WebviewPanel): void {
		if (!currentDatabase) {
			return;
		}

		// Find the new column name (the PK column in the updated table)
		const newPrimaryKeyColumn = updatedTable.columns.find(c => c.isPrimaryKey);
		if (!newPrimaryKeyColumn) {
			return;
		}

		const newColumnName = newPrimaryKeyColumn.name;

		// Update all FK references across all schemas and tables
		currentDatabase.schemas.forEach(schema => {
			schema.tables.forEach(table => {
				table.columns.forEach(col => {
					if (col.isForeignKey && col.foreignKeyRef) {
						if (
							col.foreignKeyRef.schema === schemaName &&
							col.foreignKeyRef.table === tableName &&
							col.foreignKeyRef.column === oldColumnName
						) {
							// Update the reference column
							col.foreignKeyRef.column = newColumnName;
							// Also rename the FK column itself to match the referenced column
							col.name = newColumnName;
						}
					}
				});
			});
		});
	}

	function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, 'dist', 'web', 'webview.js')
		);

		const nonce = getNonce();

		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource};">
				<title>SQLGem - ER Diagram</title>
				<style>
					body, html {
						margin: 0;
						padding: 0;
						width: 100%;
						height: 100%;
						overflow: hidden;
					}
					#root {
						width: 100%;
						height: 100%;
					}
				</style>
			</head>
			<body>
				<div id="root"></div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>
		`;
	}

	function getNonce() {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
