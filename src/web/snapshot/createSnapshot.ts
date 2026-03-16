/**
 * createSnapshot.ts
 *
 * Orchestrates the full snapshot creation flow:
 *   1. Ensure the `snapshots/` directory exists
 *   2. Determine the next sequential snapshot number
 *   3. Generate a timestamp
 *   4. Export the current schema as SQL DDL
 *   5. Write the snapshot file
 *
 * Returns the file name of the newly created snapshot.
 * Throws SnapshotError for expected failure conditions so callers can
 * surface clear, user-facing error messages.
 */

import * as vscode from 'vscode';
import type { Database } from '../webview/types';
import { getNextSnapshotNumber } from './getNextSnapshotNumber';
import { exportSchemaToSQL } from './exportSchema';
import { writeSnapshotFile } from './snapshotFileWriter';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class SnapshotError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SnapshotError';
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a snapshot of the supplied database model inside `<databaseFolder>/snapshots/`.
 *
 * @param database           The in-memory database model to snapshot.
 * @param databaseFolderUri  Root folder of the active database (where `database.sql` lives).
 * @returns                  The file name of the newly written snapshot (e.g. `s-003-20260315-142530.sql`).
 * @throws SnapshotError     When schema extraction or file writing fails.
 */
export async function createSchemaSnapshot(
    database: Database,
    databaseFolderUri: vscode.Uri,
): Promise<string> {
    const snapshotsFolderUri = vscode.Uri.joinPath(databaseFolderUri, 'snapshots');

    // Determine next snapshot number (reads existing files; safe if folder absent)
    const snapshotNumber = await getNextSnapshotNumber(snapshotsFolderUri);

    // Capture the moment the snapshot was requested
    const timestamp = new Date();

    // Generate DDL from the in-memory schema model
    let sql: string;
    try {
        sql = exportSchemaToSQL(database);
    } catch (err) {
        throw new SnapshotError(`Schema extraction failed: ${err}`);
    }

    // Write snapshot file
    let fileName: string;
    try {
        fileName = await writeSnapshotFile({
            snapshotsFolderUri,
            snapshotNumber,
            timestamp,
            sql,
            databaseName: database.name,
        });
    } catch (err) {
        throw new SnapshotError(`Failed to write snapshot file: ${err}`);
    }

    return fileName;
}
