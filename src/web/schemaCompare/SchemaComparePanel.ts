/**
 * VS Code WebviewPanel host for Schema Compare.
 *
 * Responsibilities:
 *  - Create and manage a singleton webview panel.
 *  - List SQL files from the workspace.
 *  - Parse SQL files into SchemaObjectDef[] on demand.
 *  - Run the diff engine and post results to the webview.
 *  - Generate migration scripts and open them as VS Code documents.
 */

import * as vscode from 'vscode';
import { parseSchemaObjects, generateObjectSql } from './parser';
import { diffObjects, generateMigrationScript } from './diffEngine';
import type { SchemaObjectDef, DiffOptions } from './model';
import type { WebviewMessage, ExtensionMessage } from '../webview/compareView/types';

// Directories to skip when scanning for SQL files.
const SKIP_DIRS = new Set([
	'node_modules', 'dist', 'out', 'build', '.git', '.github', '.vscode',
]);

// ---------------------------------------------------------------------------

export class SchemaComparePanel {
	private static _instance: SchemaComparePanel | undefined;

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private readonly _disposables: vscode.Disposable[] = [];

	/** Cached objects from the most recent comparison. */
	private _lastSourceObjects: SchemaObjectDef[] = [];
	private _lastTargetObjects: SchemaObjectDef[] = [];
	private _lastResult: ReturnType<typeof diffObjects> | null = null;

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		this._panel.webview.html = this._buildHtml();
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._panel.webview.onDidReceiveMessage(
			(msg: WebviewMessage) => this._handleMessage(msg),
			null,
			this._disposables,
		);
	}

	// -------------------------------------------------------------------------
	// Public factory
	// -------------------------------------------------------------------------

	static createOrShow(extensionUri: vscode.Uri): void {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (SchemaComparePanel._instance) {
			SchemaComparePanel._instance._panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'sqlgemSchemaCompare',
			'SQLGem: Schema Compare',
			column ?? vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'web')],
			},
		);

		SchemaComparePanel._instance = new SchemaComparePanel(panel, extensionUri);
	}

	// -------------------------------------------------------------------------
	// Message handling
	// -------------------------------------------------------------------------

	private async _handleMessage(msg: WebviewMessage): Promise<void> {
		switch (msg.command) {
			case 'ready':
			case 'listFiles':
				await this._sendFileList();
				break;
			case 'compare':
				await this._runComparison(msg.sourceFiles, msg.targetFiles, msg.options);
				break;
			case 'requestDiff':
				this._sendDiffContent(msg.key);
				break;
			case 'generateMigration':
				await this._openMigrationDocument();
				break;
		}
	}

	// -------------------------------------------------------------------------
	// File listing
	// -------------------------------------------------------------------------

	private async _sendFileList(): Promise<void> {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders) {
			this._post({ command: 'filesListed', files: [] });
			return;
		}

		const files: string[] = [];
		for (const folder of folders) {
			await this._collectSqlFiles(folder.uri, folder.uri, files);
		}

		this._post({ command: 'filesListed', files });
	}

	private async _collectSqlFiles(
		rootUri: vscode.Uri,
		dirUri: vscode.Uri,
		out: string[],
		depth = 0,
	): Promise<void> {
		if (depth > 6) { return; }

		let entries: [string, vscode.FileType][];
		try {
			entries = await vscode.workspace.fs.readDirectory(dirUri);
		} catch {
			return;
		}

		for (const [name, type] of entries) {
			if (name.startsWith('.')) { continue; }
			const childUri = vscode.Uri.joinPath(dirUri, name);

			if (type === vscode.FileType.File && name.endsWith('.sql')) {
				const rel = childUri.path.substring(rootUri.path.length).replace(/^\//, '');
				out.push(rel);
			} else if (type === vscode.FileType.Directory && !SKIP_DIRS.has(name)) {
				await this._collectSqlFiles(rootUri, childUri, out, depth + 1);
			}
		}
	}

	// -------------------------------------------------------------------------
	// Comparison
	// -------------------------------------------------------------------------

	private async _runComparison(
		sourceFiles: string[],
		targetFiles: string[],
		options?: DiffOptions,
	): Promise<void> {
		const [src, tgt] = await Promise.all([
			this._parseFiles(sourceFiles),
			this._parseFiles(targetFiles),
		]);

		this._lastSourceObjects = src.objects;
		this._lastTargetObjects = tgt.objects;

		const result = diffObjects(src.objects, tgt.objects, src.label, tgt.label, options ?? {});
		this._lastResult = result;

		this._post({ command: 'compareResult', result });
	}

	private async _parseFiles(relPaths: string[]): Promise<{ objects: SchemaObjectDef[]; label: string }> {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || relPaths.length === 0) {
			return { objects: [], label: '(none)' };
		}

		const root = folders[0].uri;
		const allObjects: SchemaObjectDef[] = [];

		for (const rel of relPaths) {
			const uri = vscode.Uri.joinPath(root, rel);
			try {
				const bytes = await vscode.workspace.fs.readFile(uri);
				const sql   = new TextDecoder().decode(bytes);
				const parsed = parseSchemaObjects(sql, rel);

				for (const obj of parsed) {
					const idx = allObjects.findIndex(o => o.key === obj.key);
					if (idx >= 0) {
						allObjects[idx] = obj; // later file wins on key collision
					} else {
						allObjects.push(obj);
					}
				}
			} catch (err) {
				this._post({ command: 'error', message: `Failed to read "${rel}": ${err}` });
			}
		}

		const label = relPaths.length === 1 ? relPaths[0] : `${relPaths.length} files`;
		return { objects: allObjects, label };
	}

	// -------------------------------------------------------------------------
	// Diff content (for the side-by-side view)
	// -------------------------------------------------------------------------

	private _sendDiffContent(key: string): void {
		const srcObj = this._lastSourceObjects.find(o => o.key === key);
		const tgtObj = this._lastTargetObjects.find(o => o.key === key);

		this._post({
			command: 'diffContent',
			key,
			sourceSql: srcObj ? generateObjectSql(srcObj) : '',
			targetSql: tgtObj ? generateObjectSql(tgtObj) : '',
		});
	}

	// -------------------------------------------------------------------------
	// Migration script
	// -------------------------------------------------------------------------

	private async _openMigrationDocument(): Promise<void> {
		if (!this._lastResult) { return; }

		const sql = generateMigrationScript(this._lastResult);
		const doc = await vscode.workspace.openTextDocument({ content: sql, language: 'sql' });
		await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

		this._post({ command: 'migrationReady' });
	}

	// -------------------------------------------------------------------------
	// Webview HTML
	// -------------------------------------------------------------------------

	private _buildHtml(): string {
		const scriptUri = this._panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'dist', 'web', 'compareWebview.js'),
		);
		const nonce = getNonce();
		const csp   = this._panel.webview.cspSource;

		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${csp} 'unsafe-inline';
                 font-src  ${csp} data:;
                 img-src   ${csp} data:;
                 script-src 'nonce-${nonce}';">
  <title>SQLGem — Schema Compare</title>
  <style>
    html, body, #root {
      margin: 0; padding: 0;
      width: 100%; height: 100%;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	// -------------------------------------------------------------------------

	private _post(message: ExtensionMessage): void {
		this._panel.webview.postMessage(message);
	}

	dispose(): void {
		SchemaComparePanel._instance = undefined;
		this._panel.dispose();
		for (const d of this._disposables) { d.dispose(); }
		this._disposables.length = 0;
	}
}

// ---------------------------------------------------------------------------

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}
