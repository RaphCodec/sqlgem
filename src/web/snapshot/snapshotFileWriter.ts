/**
 * snapshotFileWriter.ts
 *
 * Writes a schema snapshot to the `snapshots/` folder inside the given
 * database folder, prepending standardised metadata headers.
 */

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapshotWriteOptions {
    /** URI of the `snapshots/` folder (will be created if absent). */
    snapshotsFolderUri: vscode.Uri;
    /** Sequential snapshot number (1, 2, 3 …). */
    snapshotNumber: number;
    /** Moment the snapshot was taken. */
    timestamp: Date;
    /** Full schema DDL produced by exportSchema. */
    sql: string;
    /** Database (diagram) name, included in the metadata header. */
    databaseName: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensures the snapshots folder exists, builds the snapshot file name, writes
 * the metadata header followed by the DDL, and returns the file name.
 *
 * File naming convention:  `s-###-YYYYMMDD-HHmmss.sql`
 */
export async function writeSnapshotFile(options: SnapshotWriteOptions): Promise<string> {
    const { snapshotsFolderUri, snapshotNumber, timestamp, sql, databaseName } = options;

    // Ensure the snapshots directory exists
    await vscode.workspace.fs.createDirectory(snapshotsFolderUri);

    const paddedNum = String(snapshotNumber).padStart(3, '0');
    const ts        = formatTimestamp(timestamp);
    const fileName  = `s-${paddedNum}-${ts}.sql`;
    const fileUri   = vscode.Uri.joinPath(snapshotsFolderUri, fileName);

    const content = buildFileContent(paddedNum, timestamp, databaseName, sql);
    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));

    return fileName;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format: YYYYMMDD-HHmmss  (used for the file name) */
function formatTimestamp(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        String(d.getFullYear()) +
        pad(d.getMonth() + 1)   +
        pad(d.getDate())        +
        '-'                     +
        pad(d.getHours())       +
        pad(d.getMinutes())     +
        pad(d.getSeconds())
    );
}

/** Format: YYYY-MM-DD HH:mm:ss  (used in the file header, local time) */
function formatLocalTimestamp(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        ` ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
}

/** Produces the complete file text: metadata header + blank line + DDL. */
function buildFileContent(
    paddedNum: string,
    timestamp: Date,
    databaseName: string,
    sql: string,
): string {
    const localTs = formatLocalTimestamp(timestamp);
    const header = [
        `-- Snapshot: s-${paddedNum}`,
        `-- Created At: ${localTs}`,
        `-- Source: SQLGem`,
        `-- Database: ${databaseName}`,
        '',
    ].join('\n');

    return header + sql;
}
