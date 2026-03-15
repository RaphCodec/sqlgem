/**
 * MigrationBuilder.ts
 *
 * Wraps a SchemaDiff produced by SchemaDiffEngine into a full
 * MigrationDefinition, adding metadata (version, description, timestamp).
 *
 * Keeping this class separate from SchemaDiffEngine preserves the
 * single-responsibility principle:
 *   SchemaDiffEngine  – pure structural comparison
 *   MigrationBuilder  – assembles a persistable migration artifact
 */

import type { MigrationDefinition, MigrationContent, MigrationFile } from './MigrationModel';
import type { SchemaDiff } from './SchemaDiffEngine';

export interface BuildOptions {
    /** Human-readable description written into the migration file. */
    description?: string;
    /** Wrap generated SQL in a transaction (default: false). */
    transaction?: boolean;
}

export class MigrationBuilder {
    /**
     * Produce a MigrationFile with both `up` and `down` sections from two
     * pre-computed SchemaDiffs.
     *
     * @param upDiff   diff(previous → current)
     * @param downDiff diff(current → previous)
     */
    buildFile(upDiff: SchemaDiff, downDiff: SchemaDiff, options: BuildOptions = {}): MigrationFile {
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
        return {
            version: timestamp,
            description: options.description,
            transaction: options.transaction ?? false,
            up: this._buildContent(upDiff),
            down: this._buildContent(downDiff),
        };
    }

    /**
     * Produce a flat MigrationDefinition from a single SchemaDiff.
     * @deprecated Prefer buildFile() which includes both up and down sections.
     */
    build(diff: SchemaDiff, options: BuildOptions = {}): MigrationDefinition {
        return {
            version: '1.0',
            description: options.description,
            transaction: options.transaction ?? false,
            ...this._buildContent(diff),
        };
    }

    /** Returns true when the content section has at least one operation. */
    hasChanges(content: MigrationContent): boolean {
        return (
            (content.pre?.dropForeignKeys?.length ?? 0) > 0 ||
            (content.pre?.dropIndexes?.length ?? 0) > 0 ||
            (content.tables?.drop?.length ?? 0) > 0 ||
            (content.tables?.create?.length ?? 0) > 0 ||
            (content.tables?.alter?.length ?? 0) > 0 ||
            (content.constraints?.primaryKeys?.length ?? 0) > 0 ||
            (content.constraints?.foreignKeys?.length ?? 0) > 0 ||
            (content.constraints?.unique?.length ?? 0) > 0 ||
            (content.constraints?.checks?.length ?? 0) > 0 ||
            (content.indexes?.length ?? 0) > 0
        );
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private _buildContent(diff: SchemaDiff): MigrationContent {
        const content: MigrationContent = {};

        const hasDropFKs = (diff.pre?.dropForeignKeys?.length ?? 0) > 0;
        const hasDropIdxs = (diff.pre?.dropIndexes?.length ?? 0) > 0;
        if (hasDropFKs || hasDropIdxs) {
            content.pre = {
                dropForeignKeys: hasDropFKs ? diff.pre.dropForeignKeys : undefined,
                dropIndexes: hasDropIdxs ? diff.pre.dropIndexes : undefined,
            };
        }

        const hasDrop = (diff.tables?.drop?.length ?? 0) > 0;
        const hasCreate = (diff.tables?.create?.length ?? 0) > 0;
        const hasAlter = (diff.tables?.alter?.length ?? 0) > 0;
        if (hasDrop || hasCreate || hasAlter) {
            content.tables = {
                drop: hasDrop ? diff.tables.drop : undefined,
                create: hasCreate ? diff.tables.create : undefined,
                alter: hasAlter ? diff.tables.alter : undefined,
            };
        }

        const hasPKs = (diff.constraints?.primaryKeys?.length ?? 0) > 0;
        const hasFKs = (diff.constraints?.foreignKeys?.length ?? 0) > 0;
        const hasUQs = (diff.constraints?.unique?.length ?? 0) > 0;
        const hasCKs = (diff.constraints?.checks?.length ?? 0) > 0;
        if (hasPKs || hasFKs || hasUQs || hasCKs) {
            content.constraints = {
                primaryKeys: hasPKs ? diff.constraints.primaryKeys : undefined,
                foreignKeys: hasFKs ? diff.constraints.foreignKeys : undefined,
                unique: hasUQs ? diff.constraints.unique : undefined,
                checks: hasCKs ? diff.constraints.checks : undefined,
            };
        }

        if ((diff.indexes?.length ?? 0) > 0) {
            content.indexes = diff.indexes;
        }

        return content;
    }
}
