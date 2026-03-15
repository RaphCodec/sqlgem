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

import type { MigrationDefinition } from './MigrationModel';
import type { SchemaDiff } from './SchemaDiffEngine';

export interface BuildOptions {
    /** Human-readable description written into the migration file. */
    description?: string;
    /** Wrap generated SQL in a transaction (default: false). */
    transaction?: boolean;
}

export class MigrationBuilder {
    /**
     * Produce a MigrationDefinition from a SchemaDiff.
     *
     * The returned object is ready to be:
     *   1. Serialised to JSON and saved to disk.
     *   2. Passed directly to MigrationSqlGenerator.generate().
     */
    build(diff: SchemaDiff, options: BuildOptions = {}): MigrationDefinition {
        const migration: MigrationDefinition = {
            version: '1.0',
            description: options.description,
            transaction: options.transaction ?? false,
        };

        // Only include sections that have actual content to keep the JSON clean.
        const hasDropFKs = (diff.pre?.dropForeignKeys?.length ?? 0) > 0;
        const hasDropIdxs = (diff.pre?.dropIndexes?.length ?? 0) > 0;
        if (hasDropFKs || hasDropIdxs) {
            migration.pre = {
                dropForeignKeys: hasDropFKs ? diff.pre.dropForeignKeys : undefined,
                dropIndexes: hasDropIdxs ? diff.pre.dropIndexes : undefined,
            };
        }

        const hasDrop = (diff.tables?.drop?.length ?? 0) > 0;
        const hasCreate = (diff.tables?.create?.length ?? 0) > 0;
        const hasAlter = (diff.tables?.alter?.length ?? 0) > 0;
        if (hasDrop || hasCreate || hasAlter) {
            migration.tables = {
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
            migration.constraints = {
                primaryKeys: hasPKs ? diff.constraints.primaryKeys : undefined,
                foreignKeys: hasFKs ? diff.constraints.foreignKeys : undefined,
                unique: hasUQs ? diff.constraints.unique : undefined,
                checks: hasCKs ? diff.constraints.checks : undefined,
            };
        }

        if ((diff.indexes?.length ?? 0) > 0) {
            migration.indexes = diff.indexes;
        }

        return migration;
    }

    /** Returns true when the migration has at least one operation. */
    hasChanges(migration: MigrationDefinition): boolean {
        return (
            (migration.pre?.dropForeignKeys?.length ?? 0) > 0 ||
            (migration.pre?.dropIndexes?.length ?? 0) > 0 ||
            (migration.tables?.drop?.length ?? 0) > 0 ||
            (migration.tables?.create?.length ?? 0) > 0 ||
            (migration.tables?.alter?.length ?? 0) > 0 ||
            (migration.constraints?.primaryKeys?.length ?? 0) > 0 ||
            (migration.constraints?.foreignKeys?.length ?? 0) > 0 ||
            (migration.constraints?.unique?.length ?? 0) > 0 ||
            (migration.constraints?.checks?.length ?? 0) > 0 ||
            (migration.indexes?.length ?? 0) > 0
        );
    }
}
