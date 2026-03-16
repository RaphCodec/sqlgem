/**
 * Schema extraction utilities.
 * Reads SQL or DBML files from the workspace filesystem and parses them
 * into the internal Database model.
 *
 * Note: live MSSQL database connections are not supported in a web extension.
 * Schemas are extracted from local .sql (DDL) or .dbml files, which can be
 * snapshots, exported database.sql files, or any hand-authored DDL.
 */

import * as vscode from 'vscode';
import { parseSQLToDatabase } from '../sqlParser';
import { parseDBML } from './dbmlParser';
import type { Database } from '../webview/types';

export interface ExtractedSchema {
	database: Database;
	label: string;
}

/**
 * Reads a .sql DDL file and parses it into a Database model.
 * @param uri   Path to the SQL file.
 * @param label Optional display label; defaults to the file's base name.
 */
export async function extractFromSQLFile(uri: vscode.Uri, label?: string): Promise<ExtractedSchema> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	const content = new TextDecoder().decode(bytes);
	const name = label ?? uriBaseName(uri);
	const database = parseSQLToDatabase(content, name);
	return { database, label: name };
}

/**
 * Reads a .dbml file and parses it into a Database model.
 * @param uri   Path to the DBML file.
 * @param label Optional display label; defaults to the file's base name.
 */
export async function extractFromDBMLFile(uri: vscode.Uri, label?: string): Promise<ExtractedSchema> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	const content = new TextDecoder().decode(bytes);
	const name = label ?? uriBaseName(uri);
	const database = parseDBML(content, name);
	return { database, label: name };
}

/**
 * Returns the sorted list of snapshot file names (s-###-*.sql) inside
 * `<folderUri>/snapshots/`, or an empty array if the folder does not exist.
 */
export async function listSnapshotFiles(folderUri: vscode.Uri): Promise<string[]> {
	const snapshotsUri = vscode.Uri.joinPath(folderUri, 'snapshots');
	try {
		const entries = await vscode.workspace.fs.readDirectory(snapshotsUri);
		return entries
			.filter(([name, type]) => type === vscode.FileType.File && /^s-\d+.*\.sql$/i.test(name))
			.map(([name]) => name)
			.sort();
	} catch {
		return [];
	}
}

/**
 * Reads a named snapshot file from `<folderUri>/snapshots/<fileName>` and
 * parses it into a Database model.
 */
export async function extractFromSnapshot(folderUri: vscode.Uri, fileName: string): Promise<ExtractedSchema> {
	const fileUri = vscode.Uri.joinPath(folderUri, 'snapshots', fileName);
	return extractFromSQLFile(fileUri, fileName);
}

// ---------------------------------------------------------------------------

function uriBaseName(uri: vscode.Uri): string {
	const parts = uri.path.split('/');
	return parts[parts.length - 1] ?? uri.path;
}
