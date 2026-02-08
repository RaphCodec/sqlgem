// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

interface Database {
	name: string;
	schemas: Schema[];
}

interface Schema {
	name: string;
	tables: Table[];
}

interface Table {
	name: string;
	columns: Column[];
	x?: number;
	y?: number;
}

interface Column {
	name: string;
	type: string;
	isPrimaryKey: boolean;
	isForeignKey: boolean;
	isNullable: boolean;
	defaultValue?: string;
	foreignKeyRef?: {
		schema: string;
		table: string;
		column: string;
	};
	pkName?: string;
	fkConstraintName?: string;
	length?: number;
	precision?: number;
	scale?: number;
}

let currentDatabase: Database | null = null;

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
						break;				case 'saveDatabase':
					await handleSaveDatabase(panel);
					break;
				case 'previewSQL':
					handlePreviewSQL(panel);
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

			// Create initial database.sql file
			await writeDatabaseSQL(workspaceFolders[0].uri);
			
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
			const folderEntries = await vscode.workspace.fs.readDirectory(folderUri);
			const sqlFiles = folderEntries.filter(([name, type]) => type === vscode.FileType.File && name.toLowerCase().endsWith('.sql')).map(([name]) => name);

			let combinedSql = '';
			for (const f of sqlFiles) {
				const fileUri = vscode.Uri.joinPath(folderUri, f);
				const bytes = await vscode.workspace.fs.readFile(fileUri);
				combinedSql += new TextDecoder().decode(bytes) + '\n';
			}

			// Parse SQL content to build database structure
			const db: Database = { name: pick, schemas: [] };

			// Helper to ensure schema exists
			const ensureSchema = (name: string) => {
				let s = db.schemas.find(x => x.name === name);
				if (!s) {
					s = { name, tables: [] };
					db.schemas.push(s);
				}
				return s;
			};

			// Parse CREATE TABLE blocks
			const createTableRe = /CREATE\s+TABLE\s+\[([^\]]+)\]\.\[([^\]]+)\]\s*\(([\s\S]*?)\)\s*;/gi;
			let ctMatch;
			while ((ctMatch = createTableRe.exec(combinedSql)) !== null) {
				const schemaName = ctMatch[1];
				const tableName = ctMatch[2];
				const colsBlock = ctMatch[3];
				const schema = ensureSchema(schemaName);
				const colsLines = colsBlock.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
				const columns: Table['columns'] = [];
				for (let line of colsLines) {
					// remove trailing comma
					if (line.endsWith(',')) line = line.slice(0, -1);
					const colMatch = /^\[([^\]]+)\]\s+([^\s]+)([\s\S]*)$/i.exec(line);
					if (!colMatch) continue;
					const colName = colMatch[1];
					const colType = colMatch[2];
					const rest = colMatch[3] || '';
					const isPK = /PRIMARY\s+KEY/i.test(rest);
					const isNotNull = /NOT\s+NULL/i.test(rest);
					columns.push({
						name: colName,
						type: colType,
						isPrimaryKey: isPK,
						isForeignKey: false,
						isNullable: !isNotNull,
					});
				}
				schema.tables.push({ name: tableName, columns });
			}

			// Parse ALTER TABLE ... ADD CONSTRAINT <name> ... FOREIGN KEY ... REFERENCES ...
			const fkRe = /ALTER\s+TABLE\s+\[([^\]]+)\]\.\[([^\]]+)\]\s+ADD\s+CONSTRAINT\s+\[?([^\]\s]+)\]?[\s\S]*?FOREIGN\s+KEY\s*\(\[([^\]]+)\]\)\s*REFERENCES\s+\[([^\]]+)\]\.\[([^\]]+)\]\s*\(\[([^\]]+)\]\)/gi;
			let fkMatch;
			while ((fkMatch = fkRe.exec(combinedSql)) !== null) {
				const srcSchema = fkMatch[1];
				const srcTable = fkMatch[2];
				const constraintName = fkMatch[3];
				const srcCol = fkMatch[4];
				const refSchema = fkMatch[5];
				const refTable = fkMatch[6];
				const refCol = fkMatch[7];

				const s = db.schemas.find(x => x.name === srcSchema);
				if (!s) continue;
				const t = s.tables.find(x => x.name === srcTable);
				if (!t) continue;
				const c = t.columns.find(x => x.name === srcCol);
				if (!c) continue;
				c.isForeignKey = true;
				c.foreignKeyRef = { schema: refSchema, table: refTable, column: refCol };
				if (constraintName) {
					c.fkConstraintName = constraintName;
				}
			}

			currentDatabase = db;

			panel.webview.postMessage({ command: 'updateDatabase', database: currentDatabase });
			vscode.window.showInformationMessage(`Loaded database folder "${pick}" (${sqlFiles.length} .sql files parsed)`);
		} catch (error) {
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

	function generateMSSQLTable(schemaName: string, table: Table): string {
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
		tableSql += `CREATE TABLE [${schemaName}].[${table.name}] (\n${columnsDefs}`;

		// Add primary key constraint if present
		const pkCols = table.columns.filter(c => c.isPrimaryKey).map(c => `[${c.name}]`);
		if (pkCols.length > 0) {
			const pkName = table.columns.find(c => c.isPrimaryKey && c.pkName)?.pkName || `PK_${table.name}`;
			tableSql += `,\n    CONSTRAINT [${pkName}] PRIMARY KEY (${pkCols.join(', ')})`;
		}

		tableSql += `\n);\n`;

		return tableSql;
	}

	function generateDatabaseSQL(): string {
		if (!currentDatabase) {
			return '';
		}

		let sql = `-- Database: ${currentDatabase.name}\n`;
		sql += `-- Generated by SQLGem at ${new Date().toISOString()}\n\n`;
		sql += `USE [${currentDatabase.name}];\nGO\n\n`;

		// Create schemas (for non-dbo schemas)
		const nonDboSchemas = currentDatabase.schemas.filter(s => s.name !== 'dbo');
		if (nonDboSchemas.length > 0) {
			sql += `-- ====================================\n`;
			sql += `-- Create Schemas\n`;
			sql += `-- ====================================\n\n`;
			nonDboSchemas.forEach(schema => {
				sql += `CREATE SCHEMA [${schema.name}];\nGO\n\n`;
			});
		}

		// Generate all tables for all schemas
		currentDatabase.schemas.forEach(schema => {
			if (schema.tables.length > 0) {
				sql += `-- ====================================\n`;
				sql += `-- Schema: ${schema.name}\n`;
				sql += `-- ====================================\n\n`;

				schema.tables.forEach(table => {
					sql += generateMSSQLTable(schema.name, table);
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
						allForeignKeys.push(
							`ALTER TABLE [${schema.name}].[${table.name}]\n` +
							`    ADD CONSTRAINT [${col.fkConstraintName || `FK_${table.name}_${col.name}`}]\n` +
							`    FOREIGN KEY ([${col.name}])\n` +
							`    REFERENCES [${ref.schema}].[${ref.table}]([${ref.column}]);`
						);
					}
				});
			});
		});

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

	async function handleSaveDatabase(panel: vscode.WebviewPanel): Promise<void> {
		if (!currentDatabase) {
			vscode.window.showErrorMessage('No database to save');
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder open');
			return;
		}

		try {
			await writeDatabaseSQL(workspaceFolders[0].uri);
			vscode.window.showInformationMessage(`Database "${currentDatabase.name}" saved successfully`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to save database: ${error}`);
		}
	}

	function handlePreviewSQL(panel: vscode.WebviewPanel): void {
		if (!currentDatabase) {
			vscode.window.showErrorMessage('No database to preview');
			return;
		}

		const sqlContent = generateDatabaseSQL();
		panel.webview.postMessage({
			command: 'showSQLPreview',
			sql: sqlContent
		});
	}

	async function writeDatabaseSQL(workspaceUri: vscode.Uri): Promise<void> {
		if (!currentDatabase) {
			return;
		}

		const dbFileUri = vscode.Uri.joinPath(workspaceUri, currentDatabase.name, `${currentDatabase.name}.sql`);
		const sqlContent = generateDatabaseSQL();
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
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
