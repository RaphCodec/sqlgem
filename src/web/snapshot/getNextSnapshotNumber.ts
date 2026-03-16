/**
 * getNextSnapshotNumber.ts
 *
 * Scans an existing snapshots folder and determines the next sequential
 * snapshot number based on files already present (s-###-timestamp.sql).
 */

import * as vscode from 'vscode';

/**
 * Returns the next available snapshot number (1-based).
 * Scans all files matching `s-###-*` in the given folder.
 * Returns 1 when the folder is empty or does not yet exist.
 */
export async function getNextSnapshotNumber(snapshotsFolderUri: vscode.Uri): Promise<number> {
    let maxNumber = 0;
    try {
        const entries = await vscode.workspace.fs.readDirectory(snapshotsFolderUri);
        for (const [name] of entries) {
            const match = name.match(/^s-(\d+)-/i);
            if (match) {
                const n = parseInt(match[1], 10);
                if (n > maxNumber) {
                    maxNumber = n;
                }
            }
        }
    } catch {
        // Folder may not exist yet — start from 0
    }
    return maxNumber + 1;
}
