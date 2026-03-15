/**
 * MigrationLoader.ts
 *
 * Reads a migration JSON file from the VS Code workspace file system,
 * parses it, and returns a validated MigrationDefinition.
 */

import * as vscode from 'vscode';
import type { MigrationFile, MigrationContent } from './MigrationModel';

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
     * Supports both:
     *  - v2 format: { version, up: {...}, down: {...} }
     *  - v1 legacy flat format: { version, pre?, tables?, constraints?, indexes? }
     *    (automatically wrapped: flat body becomes `up`, `down` is empty)
     *
     * @param uri  URI of the `.json` migration file inside the workspace.
     * @returns    The parsed and validated MigrationFile.
     * @throws     MigrationLoadError when the file cannot be read, is not
     *             valid JSON, or fails structural validation.
     */
    async load(uri: vscode.Uri): Promise<MigrationFile> {
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
        return this._normalise(parsed as Record<string, unknown>, uri);
    }

    // -----------------------------------------------------------------------
    // Normalisation: convert v1 flat format → v2 MigrationFile
    // -----------------------------------------------------------------------

    private _normalise(obj: Record<string, unknown>, _uri: vscode.Uri): MigrationFile {
        // v2: has an "up" key that is an object
        if (typeof obj['up'] === 'object' && obj['up'] !== null && !Array.isArray(obj['up'])) {
            return obj as unknown as MigrationFile;
        }

        // v1 flat: lift content fields into "up", leave "down" empty
        const up: MigrationContent = {};
        if (obj['pre'] !== undefined) { up.pre = obj['pre'] as any; }
        if (obj['tables'] !== undefined) { up.tables = obj['tables'] as any; }
        if (obj['constraints'] !== undefined) { up.constraints = obj['constraints'] as any; }
        if (obj['indexes'] !== undefined) { up.indexes = obj['indexes'] as any; }

        return {
            version: String(obj['version']),
            description: obj['description'] as string | undefined,
            transaction: obj['transaction'] as boolean | undefined,
            up,
            down: {},
        };
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
        //
        // For v2 (has "up" key) validate each section inside up/down.
        // For v1 (flat) validate the top-level tables/constraints.
        if (typeof obj['up'] === 'object' && obj['up'] !== null && !Array.isArray(obj['up'])) {
            const up = obj['up'] as Record<string, unknown>;
            this._validateTablesSection(up, uri);
            this._validateConstraintsSection(up, uri);
            if (typeof obj['down'] === 'object' && obj['down'] !== null && !Array.isArray(obj['down'])) {
                const down = obj['down'] as Record<string, unknown>;
                this._validateTablesSection(down, uri);
                this._validateConstraintsSection(down, uri);
            }
        } else {
            this._validateTablesSection(obj, uri);
            this._validateConstraintsSection(obj, uri);
        }
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
