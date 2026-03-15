/**
 * MigrationLoader.ts
 *
 * Reads a migration JSON file from the VS Code workspace file system,
 * parses it, and returns a validated MigrationDefinition.
 */

import * as vscode from 'vscode';
import type { MigrationDefinition } from './MigrationModel';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class MigrationLoadError extends Error {
    constructor(message: string, public readonly uri: vscode.Uri) {
        super(message);
        this.name = 'MigrationLoadError';
    }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export class MigrationLoader {
    /**
     * Read, parse, and validate a migration JSON file.
     *
     * @param uri  URI of the `.json` migration file inside the workspace.
     * @returns    The parsed and validated MigrationDefinition.
     * @throws     MigrationLoadError when the file cannot be read, is not
     *             valid JSON, or fails structural validation.
     */
    async load(uri: vscode.Uri): Promise<MigrationDefinition> {
        let raw: Uint8Array;
        try {
            raw = await vscode.workspace.fs.readFile(uri);
        } catch (cause) {
            throw new MigrationLoadError(
                `Cannot read migration file: ${cause}`,
                uri
            );
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(new TextDecoder().decode(raw));
        } catch (cause) {
            throw new MigrationLoadError(
                `Migration file contains invalid JSON: ${cause}`,
                uri
            );
        }

        this._validate(parsed, uri);
        return parsed as MigrationDefinition;
    }

    // -----------------------------------------------------------------------
    // Private validation
    // -----------------------------------------------------------------------

    private _validate(value: unknown, uri: vscode.Uri): void {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            throw new MigrationLoadError(
                'Migration must be a JSON object at the top level',
                uri
            );
        }

        const obj = value as Record<string, unknown>;

        if (typeof obj['version'] !== 'string' || !obj['version'].trim()) {
            throw new MigrationLoadError(
                'Migration must have a non-empty "version" string field',
                uri
            );
        }

        // Light structural checks – full schema validation would require a
        // JSON-Schema library which we intentionally avoid to keep the bundle
        // small inside a web extension.
        this._validateTablesSection(obj, uri);
        this._validateConstraintsSection(obj, uri);
    }

    private _validateTablesSection(
        obj: Record<string, unknown>,
        uri: vscode.Uri
    ): void {
        const tables = obj['tables'];
        if (tables === undefined || tables === null) {
            return;
        }
        if (typeof tables !== 'object' || Array.isArray(tables)) {
            throw new MigrationLoadError(
                '"tables" must be an object',
                uri
            );
        }
        const t = tables as Record<string, unknown>;
        for (const key of ['drop', 'create', 'alter'] as const) {
            if (t[key] !== undefined && !Array.isArray(t[key])) {
                throw new MigrationLoadError(
                    `"tables.${key}" must be an array`,
                    uri
                );
            }
        }
    }

    private _validateConstraintsSection(
        obj: Record<string, unknown>,
        uri: vscode.Uri
    ): void {
        const constraints = obj['constraints'];
        if (constraints === undefined || constraints === null) {
            return;
        }
        if (typeof constraints !== 'object' || Array.isArray(constraints)) {
            throw new MigrationLoadError(
                '"constraints" must be an object',
                uri
            );
        }
        const c = constraints as Record<string, unknown>;
        for (const key of ['primaryKeys', 'foreignKeys', 'unique', 'checks'] as const) {
            if (c[key] !== undefined && !Array.isArray(c[key])) {
                throw new MigrationLoadError(
                    `"constraints.${key}" must be an array`,
                    uri
                );
            }
        }
    }
}
