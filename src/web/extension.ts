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
				retainContextWhenHidden: true
			}
		);

		panel.webview.html = getWebviewContent();

		// Handle messages from the webview
		panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case 'createDatabase':
						await handleCreateDatabase(message.name, panel);
						break;
					case 'addSchema':
						await handleAddSchema(message.name, panel);
						break;
					case 'addTable':
						await handleAddTable(message.schemaName, message.table, panel);
						break;
					case 'getDatabaseState':
						panel.webview.postMessage({
							command: 'updateDatabase',
							database: currentDatabase
						});
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
			await vscode.workspace.fs.createDirectory(dbFolderUri);
			currentDatabase = {
				name: name,
				schemas: []
			};
			
			panel.webview.postMessage({
				command: 'updateDatabase',
				database: currentDatabase
			});
			
			vscode.window.showInformationMessage(`Database "${name}" created`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create database: ${error}`);
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

		const schemaFolderUri = vscode.Uri.joinPath(workspaceFolders[0].uri, currentDatabase.name, name);
		
		try {
			await vscode.workspace.fs.createDirectory(schemaFolderUri);
			
			currentDatabase.schemas.push({
				name: name,
				tables: []
			});
			
			panel.webview.postMessage({
				command: 'updateDatabase',
				database: currentDatabase
			});
			
			vscode.window.showInformationMessage(`Schema "${name}" created`);
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

		const tableFileUri = vscode.Uri.joinPath(
			workspaceFolders[0].uri, 
			currentDatabase.name, 
			schemaName, 
			`${table.name}.sql`
		);
		
		try {
			console.log('Generating SQL for table:', table.name);
			const sqlContent = generateMSSQLTable(schemaName, table);
			console.log('SQL Content:', sqlContent);
			
			const encoder = new TextEncoder();
			await vscode.workspace.fs.writeFile(tableFileUri, encoder.encode(sqlContent));
			console.log('File written to:', tableFileUri.toString());
			
			schema.tables.push(table);
			
			panel.webview.postMessage({
				command: 'updateDatabase',
				database: currentDatabase
			});
			
			vscode.window.showInformationMessage(`Table "${table.name}" created at ${schemaName}/${table.name}.sql`);
		} catch (error) {
			console.error('Error creating table:', error);
			vscode.window.showErrorMessage(`Failed to create table: ${error}`);
		}
	}

	function generateMSSQLTable(schemaName: string, table: Table): string {
		const columns = table.columns.map(col => {
			let columnDef = `    [${col.name}] ${col.type}`;
			if (col.isPrimaryKey) {
				columnDef += ' PRIMARY KEY';
			}
			if (!col.isNullable) {
				columnDef += ' NOT NULL';
			}
			return columnDef;
		}).join(',\n');

		return `-- Table: ${schemaName}.${table.name}
-- Generated by SQLGem

CREATE TABLE [${schemaName}].[${table.name}] (
${columns}
);
`;
	}

	function getWebviewContent(): string {
	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>SQLGem - ER Diagram</title>
			<style>
				* { box-sizing: border-box; }
				body { 
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
					margin: 0; 
					padding: 0; 
					overflow: hidden;
				}
				
				.app { 
					width: 100vw; 
					height: 100vh; 
					display: flex;
					flex-direction: column;
					background: #f5f5f5;
					transition: background 0.3s;
				}
				
				.dark .app { background: #1e1e1e; }
				
				.toolbar {
					display: flex;
					gap: 8px;
					padding: 12px;
					background: #fff;
					border-bottom: 1px solid #ddd;
					align-items: center;
					box-shadow: 0 1px 3px rgba(0,0,0,0.1);
				}
				
				.dark .toolbar {
					background: #252526;
					border-bottom-color: #3e3e42;
				}
				
				.toolbar button {
					padding: 8px 16px;
					border: none;
					border-radius: 4px;
					background: #007acc;
					color: #fff;
					cursor: pointer;
					font-size: 0.9rem;
					transition: background 0.2s;
				}
				
				.toolbar button:hover { background: #005fa3; }
				
				.toolbar button.secondary {
					background: #5c6370;
				}
				
				.toolbar button.secondary:hover { background: #4a4f5a; }
				
				.db-info {
					color: #333;
					font-weight: 600;
					margin-left: auto;
					margin-right: 12px;
				}
				
				.dark .db-info { color: #ccc; }
				
				.canvas-container {
					flex: 1;
					position: relative;
					overflow: auto;
				}
				
				.canvas {
					min-width: 100%;
					min-height: 100%;
					position: relative;
					padding: 20px;
				}
				
				.table-node {
					position: absolute;
					background: #fff;
					border: 2px solid #007acc;
					border-radius: 8px;
					min-width: 200px;
					box-shadow: 0 2px 8px rgba(0,0,0,0.15);
					cursor: move;
				}
				
				.dark .table-node {
					background: #2d2d30;
					border-color: #007acc;
				}
				
				.table-header {
					background: #007acc;
					color: #fff;
					padding: 8px 12px;
					font-weight: 600;
					border-radius: 6px 6px 0 0;
				}
				
				.table-columns {
					padding: 8px 0;
				}
				
				.column-row {
					padding: 4px 12px;
					display: flex;
					justify-content: space-between;
					font-size: 0.85rem;
					color: #333;
				}
				
				.dark .column-row { color: #ccc; }
				
				.column-row.pk {
					font-weight: 600;
					color: #d73a49;
				}
				
				.dark .column-row.pk { color: #f97583; }
				
				.column-type {
					color: #6a737d;
					font-size: 0.8rem;
					margin-left: 8px;
				}
				
				.dark .column-type { color: #8b949e; }
				
				.modal {
					display: none;
					position: fixed;
					top: 0;
					left: 0;
					width: 100%;
					height: 100%;
					background: rgba(0,0,0,0.5);
					justify-content: center;
					align-items: center;
					z-index: 1000;
				}
				
				.modal.active { display: flex; }
				
				.modal-content {
					background: #fff;
					border-radius: 8px;
					padding: 24px;
					min-width: 400px;
					max-width: 600px;
					box-shadow: 0 4px 16px rgba(0,0,0,0.3);
				}
				
				.dark .modal-content {
					background: #2d2d30;
				}
				
				.modal-content h2 {
					margin-top: 0;
					color: #333;
				}
				
				.dark .modal-content h2 { color: #ccc; }
				
				.form-group {
					margin-bottom: 16px;
				}
				
				.form-group label {
					display: block;
					margin-bottom: 4px;
					color: #333;
					font-weight: 500;
				}
				
				.dark .form-group label { color: #ccc; }
				
				.form-group input,
				.form-group select {
					width: 100%;
					padding: 8px;
					border: 1px solid #ddd;
					border-radius: 4px;
					font-size: 0.9rem;
				}
				
				.dark .form-group input,
				.dark .form-group select {
					background: #1e1e1e;
					border-color: #3e3e42;
					color: #ccc;
				}
				
				.modal-buttons {
					display: flex;
					gap: 8px;
					justify-content: flex-end;
					margin-top: 20px;
				}
				
				.modal-buttons button {
					padding: 8px 16px;
					border: none;
					border-radius: 4px;
					cursor: pointer;
					font-size: 0.9rem;
				}
				
				.modal-buttons .btn-primary {
					background: #007acc;
					color: #fff;
				}
				
				.modal-buttons .btn-primary:hover { background: #005fa3; }
				
				.modal-buttons .btn-cancel {
					background: #e0e0e0;
					color: #333;
				}
				
				.dark .modal-buttons .btn-cancel {
					background: #3e3e42;
					color: #ccc;
				}
				
				.columns-list {
					max-height: 300px;
					overflow-y: auto;
					margin-bottom: 12px;
				}
				
				.column-item {
					display: flex;
					gap: 8px;
					margin-bottom: 8px;
					padding: 8px;
					background: #f5f5f5;
					border-radius: 4px;
				}
				
				.dark .column-item {
					background: #1e1e1e;
				}
				
				.column-item input[type="text"] {
					flex: 1;
				}
				
				.column-item input[type="checkbox"] {
					width: auto;
				}
			</style>
		</head>
		<body>
			<div class="app">
				<div class="toolbar">
					<button onclick="openNewDatabaseModal()">New Database Diagram</button>
					<button onclick="openAddSchemaModal()" class="secondary" id="addSchemaBtn" disabled>Add Schema</button>
					<button onclick="openAddTableModal()" class="secondary" id="addTableBtn" disabled>Add Table</button>
					<button onclick="toggleDarkMode()" class="secondary">Toggle Dark Mode</button>
					<div class="db-info" id="dbInfo">No database</div>
				</div>
				<div class="canvas-container">
					<div class="canvas" id="canvas"></div>
				</div>
			</div>
			
			<!-- New Database Modal -->
			<div class="modal" id="newDbModal">
				<div class="modal-content">
					<h2>New Database Diagram</h2>
					<div class="form-group">
						<label for="dbName">Database Name:</label>
						<input type="text" id="dbName" placeholder="MyDatabase" />
					</div>
					<div class="modal-buttons">
						<button class="btn-cancel" onclick="closeModal('newDbModal')">Cancel</button>
						<button class="btn-primary" onclick="createDatabase()">Create</button>
					</div>
				</div>
			</div>
			
			<!-- Add Schema Modal -->
			<div class="modal" id="addSchemaModal">
				<div class="modal-content">
					<h2>Add Schema</h2>
					<div class="form-group">
						<label for="schemaName">Schema Name:</label>
						<input type="text" id="schemaName" placeholder="dbo" />
					</div>
					<div class="modal-buttons">
						<button class="btn-cancel" onclick="closeModal('addSchemaModal')">Cancel</button>
						<button class="btn-primary" onclick="addSchema()">Add</button>
					</div>
				</div>
			</div>
			
			<!-- Add Table Modal -->
			<div class="modal" id="addTableModal">
				<div class="modal-content">
					<h2>Add Table</h2>
					<div class="form-group">
						<label for="tableSchema">Schema:</label>
						<select id="tableSchema"></select>
					</div>
					<div class="form-group">
						<label for="tableName">Table Name:</label>
						<input type="text" id="tableName" placeholder="Users" />
					</div>
					<div class="form-group">
						<label>Columns:</label>
						<div class="columns-list" id="columnsList"></div>
						<button onclick="addColumn()" class="btn-primary">Add Column</button>
					</div>
					<div class="modal-buttons">
						<button class="btn-cancel" onclick="closeModal('addTableModal')">Cancel</button>
						<button class="btn-primary" onclick="addTable()">Create Table</button>
					</div>
				</div>
			</div>
			
			<script>
				const vscode = acquireVsCodeApi();
				let currentDatabase = null;
				let draggedElement = null;
				let offsetX = 0, offsetY = 0;
				
				// Request initial state
				vscode.postMessage({ command: 'getDatabaseState' });
				
				// Handle messages from extension
				window.addEventListener('message', event => {
					const message = event.data;
					if (message.command === 'updateDatabase') {
						currentDatabase = message.database;
						updateUI();
					}
				});
				
				function updateUI() {
					const dbInfo = document.getElementById('dbInfo');
					const addSchemaBtn = document.getElementById('addSchemaBtn');
					const addTableBtn = document.getElementById('addTableBtn');
					
					if (currentDatabase) {
						dbInfo.textContent = currentDatabase.name + 
							' (' + currentDatabase.schemas.length + ' schemas)';
						addSchemaBtn.disabled = false;
						addTableBtn.disabled = currentDatabase.schemas.length === 0;
					} else {
						dbInfo.textContent = 'No database';
						addSchemaBtn.disabled = true;
						addTableBtn.disabled = true;
					}
					
					renderDiagram();
				}
				
				function renderDiagram() {
					const canvas = document.getElementById('canvas');
					canvas.innerHTML = '';
					
					if (!currentDatabase) return;
					
					let yOffset = 20;
					currentDatabase.schemas.forEach(schema => {
						let xOffset = 20;
						schema.tables.forEach((table, idx) => {
							const tableNode = createTableNode(table, schema.name);
							tableNode.style.left = (table.x || xOffset) + 'px';
							tableNode.style.top = (table.y || yOffset) + 'px';
							canvas.appendChild(tableNode);
							xOffset += 250;
						});
						yOffset += 300;
					});
				}
				
				function createTableNode(table, schemaName) {
					const node = document.createElement('div');
					node.className = 'table-node';
					node.draggable = true;
					
					const header = document.createElement('div');
					header.className = 'table-header';
					header.textContent = schemaName + '.' + table.name;
					node.appendChild(header);
					
					const columns = document.createElement('div');
					columns.className = 'table-columns';
					
					table.columns.forEach(col => {
						const row = document.createElement('div');
						row.className = 'column-row' + (col.isPrimaryKey ? ' pk' : '');
						
						const nameSpan = document.createElement('span');
						nameSpan.textContent = (col.isPrimaryKey ? '🔑 ' : '') + col.name;
						
						const typeSpan = document.createElement('span');
						typeSpan.className = 'column-type';
						typeSpan.textContent = col.type + (col.isNullable ? '' : ' NOT NULL');
						
						row.appendChild(nameSpan);
						row.appendChild(typeSpan);
						columns.appendChild(row);
					});
					
					node.appendChild(columns);
					
					// Drag handlers
					node.addEventListener('dragstart', (e) => {
						draggedElement = node;
						const rect = node.getBoundingClientRect();
						offsetX = e.clientX - rect.left;
						offsetY = e.clientY - rect.top;
					});
					
					node.addEventListener('dragend', (e) => {
						const canvas = document.getElementById('canvas');
						const canvasRect = canvas.getBoundingClientRect();
						node.style.left = (e.clientX - canvasRect.left - offsetX) + 'px';
						node.style.top = (e.clientY - canvasRect.top - offsetY) + 'px';
					});
					
					return node;
				}
				
				function openNewDatabaseModal() {
					document.getElementById('newDbModal').classList.add('active');
				}
				
				function openAddSchemaModal() {
					document.getElementById('addSchemaModal').classList.add('active');
				}
				
				function openAddTableModal() {
					const schemaSelect = document.getElementById('tableSchema');
					schemaSelect.innerHTML = '';
					
					if (currentDatabase) {
						currentDatabase.schemas.forEach(schema => {
							const option = document.createElement('option');
							option.value = schema.name;
							option.textContent = schema.name;
							schemaSelect.appendChild(option);
						});
					}
					
					document.getElementById('columnsList').innerHTML = '';
					addColumn(); // Add one default column
					
					document.getElementById('addTableModal').classList.add('active');
				}
				
				function closeModal(modalId) {
					document.getElementById(modalId).classList.remove('active');
				}
				
				function createDatabase() {
					const name = document.getElementById('dbName').value.trim();
					if (name) {
						vscode.postMessage({
							command: 'createDatabase',
							name: name
						});
						document.getElementById('dbName').value = '';
						closeModal('newDbModal');
					}
				}
				
				function addSchema() {
					const name = document.getElementById('schemaName').value.trim();
					if (name) {
						vscode.postMessage({
							command: 'addSchema',
							name: name
						});
						document.getElementById('schemaName').value = '';
						closeModal('addSchemaModal');
					}
				}
				
				function addColumn() {
					const columnsList = document.getElementById('columnsList');
					const columnItem = document.createElement('div');
					columnItem.className = 'column-item';
					columnItem.innerHTML = \`
						<input type="text" placeholder="Column name" class="col-name" />
						<select class="col-type">
							<option>INT</option>
							<option>VARCHAR(255)</option>
							<option>NVARCHAR(255)</option>
							<option>TEXT</option>
							<option>DATETIME</option>
							<option>BIT</option>
							<option>DECIMAL(18,2)</option>
						</select>
						<label><input type="checkbox" class="col-pk" /> PK</label>
						<label><input type="checkbox" class="col-nullable" checked /> Nullable</label>
						<button onclick="this.parentElement.remove()">Remove</button>
					\`;
					columnsList.appendChild(columnItem);
				}
				
				function addTable() {
					const schemaName = document.getElementById('tableSchema').value;
					const tableName = document.getElementById('tableName').value.trim();
					
					console.log('addTable called', { schemaName, tableName });
					
					if (!schemaName || !tableName) {
						alert('Schema and table name are required');
						return;
					}
					
					const columnItems = document.querySelectorAll('.column-item');
					const columns = [];
					
					columnItems.forEach(item => {
						const name = item.querySelector('.col-name').value.trim();
						if (name) {
							columns.push({
								name: name,
								type: item.querySelector('.col-type').value,
								isPrimaryKey: item.querySelector('.col-pk').checked,
								isForeignKey: false,
								isNullable: item.querySelector('.col-nullable').checked
							});
						}
					});
					
					console.log('Columns:', columns);
					
					if (columns.length === 0) {
						alert('Add at least one column');
						return;
					}
					
					const message = {
						command: 'addTable',
						schemaName: schemaName,
						table: {
							name: tableName,
							columns: columns
						}
					};
					
					console.log('Sending message:', message);
					vscode.postMessage(message);
					
					document.getElementById('tableName').value = '';
					closeModal('addTableModal');
				}
				
				function toggleDarkMode() {
					document.documentElement.classList.toggle('dark');
					localStorage.setItem('sqlgem-dark-mode', 
						document.documentElement.classList.contains('dark'));
				}
				
				// Restore dark mode
				if (localStorage.getItem('sqlgem-dark-mode') === 'true') {
					document.documentElement.classList.add('dark');
				}
			</script>
		</body>
		</html>
	`;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
