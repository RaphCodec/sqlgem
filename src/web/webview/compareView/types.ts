/**
 * Shared message-protocol types for the Schema Compare feature.
 *
 * Imported with `import type` on both sides so neither bundle gains a runtime
 * dependency on the other side's code.
 */

import type { CompareResult, DiffOptions } from '../../schemaCompare/model';

export type { CompareResult, ObjectDiff, ColumnChange, ChangeKind } from '../../schemaCompare/model';

// ---------------------------------------------------------------------------
// Webview → Extension
// ---------------------------------------------------------------------------

export type WebviewMessage =
	| { command: 'ready' }
	| { command: 'listFiles' }
	| { command: 'compare'; sourceFiles: string[]; targetFiles: string[]; options?: DiffOptions }
	| { command: 'requestDiff'; key: string }
	| { command: 'generateMigration' };

// ---------------------------------------------------------------------------
// Extension → Webview
// ---------------------------------------------------------------------------

export type ExtensionMessage =
	| { command: 'filesListed'; files: string[] }
	| { command: 'compareResult'; result: CompareResult }
	| { command: 'diffContent'; key: string; sourceSql: string; targetSql: string }
	| { command: 'migrationReady' }
	| { command: 'error'; message: string };
