/**
 * SchemaDiffEngine.ts
 *
 * Compares two diagram Database snapshots and produces a SchemaDiff that
 * describes every structural change between them.
 *
 * The diff output is engine-agnostic: it maps directly onto the sections of
 * MigrationDefinition so that MigrationBuilder can assemble a persistable
 * migration file with minimal transformation.
 *
 * Diff rules
 * ----------
 * Tables:
 *   – Table in current but NOT in previous  → tables.create
 *   – Table in previous but NOT in current  → tables.drop
 *   – Table in both, column set changed     → tables.alter (addColumns / alterColumns / dropColumns)
 *
 * Pre-flight (must run BEFORE structural changes):
 *   – FK in previous but NOT in current     → pre.dropForeignKeys
 *   – Index in previous but NOT in current  → pre.dropIndexes
 *
 * Post-structural:
 *   – PK on new table, or PK added to existing table  → constraints.primaryKeys
 *   – FK in current but NOT in previous               → constraints.foreignKeys
 *   – Unique constraint in current but NOT in previous  → constraints.unique
 *   – Check constraint in current but NOT in previous   → constraints.checks
 *   – Index in current but NOT in previous             → indexes
 */

import type { Database, Table, Column } from '../webview/types';
import type {
    MigrationDefinition,
    CreateTableDefinition,
    AlterTableDefinition,
    ColumnDefinition,
    TableRef,
    DropConstraintRef,
    DropIndexRef,
    PrimaryKeyDefinition,
    ForeignKeyDefinition,
    UniqueConstraintDefinition,
    CheckConstraintDefinition,
    IndexDefinition,
} from './MigrationModel';

// ---------------------------------------------------------------------------
// SchemaDiff = MigrationDefinition without top-level metadata
// ---------------------------------------------------------------------------

export type SchemaDiff = Required<
    Pick<MigrationDefinition, 'pre' | 'tables' | 'constraints' | 'indexes'>
>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface CollectedFK {
    name: string;
    schema: string;
    table: string;
    column: string;
    refSchema: string;
    refTable: string;
    refColumn: string;
}

interface CollectedIndex {
    name: string;
    schema: string;
    table: string;
    columns: string[];
    unique: boolean;
    clustered: boolean;
}

interface CollectedUC {
    name: string;
    schema: string;
    table: string;
    columns: string[];
}

interface CollectedCK {
    name: string;
    schema: string;
    table: string;
    expression: string;
}

interface TableMapEntry {
    schema: string;
    table: string;
    tableObj: Table;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class SchemaDiffEngine {
    /**
     * Compare `previous` (saved schema) against `current` (in-memory schema)
     * and return a SchemaDiff describing every structural change.
     */
    diff(previous: Database, current: Database): SchemaDiff {
        const result: SchemaDiff = {
            pre: { dropForeignKeys: [], dropIndexes: [] },
            tables: { create: [], drop: [], alter: [] },
            constraints: { primaryKeys: [], foreignKeys: [], unique: [], checks: [] },
            indexes: [],
        };

        const prevFKs = this._collectForeignKeys(previous);
        const curFKs = this._collectForeignKeys(current);
        const prevIdxs = this._collectIndexes(previous);
        const curIdxs = this._collectIndexes(current);
        const prevUCs = this._collectUniqueConstraints(previous);
        const curUCs = this._collectUniqueConstraints(current);
        const prevCKs = this._collectCheckConstraints(previous);
        const curCKs = this._collectCheckConstraints(current);

        // --- Pre: drop FKs removed between previous and current -------------
        const prevFKNames = new Set(prevFKs.map(f => f.name));
        const curFKNames = new Set(curFKs.map(f => f.name));
        for (const fk of prevFKs) {
            if (!curFKNames.has(fk.name)) {
                result.pre.dropForeignKeys!.push(
                    this._dropConstraintRef(fk.name, fk.table, fk.schema)
                );
            }
        }

        // --- Pre: drop indexes removed between previous and current ----------
        const prevIdxNames = new Set(prevIdxs.map(i => i.name));
        const curIdxNames = new Set(curIdxs.map(i => i.name));
        for (const idx of prevIdxs) {
            if (!curIdxNames.has(idx.name)) {
                result.pre.dropIndexes!.push(
                    this._dropIndexRef(idx.name, idx.table, idx.schema)
                );
            }
        }

        // --- Table-level diff ------------------------------------------------
        const prevMap = this._buildTableMap(previous);
        const curMap = this._buildTableMap(current);

        // Tables to drop
        for (const [key, entry] of prevMap) {
            if (!curMap.has(key)) {
                result.tables.drop!.push(
                    this._tableRef(entry.table, entry.schema)
                );
            }
        }

        // Tables to create / alter
        for (const [key, curEntry] of curMap) {
            if (!prevMap.has(key)) {
                // Brand-new table
                result.tables.create!.push(
                    this._buildCreateTable(curEntry.schema, curEntry.tableObj)
                );
                const pk = this._buildPrimaryKey(curEntry.schema, curEntry.tableObj);
                if (pk) {
                    result.constraints.primaryKeys!.push(pk);
                }
            } else {
                // Existing table – detect column changes
                const prevEntry = prevMap.get(key)!;
                const alter = this._buildAlterTable(
                    curEntry.schema,
                    prevEntry.tableObj,
                    curEntry.tableObj
                );
                if (
                    alter &&
                    (alter.addColumns?.length ||
                        alter.alterColumns?.length ||
                        alter.dropColumns?.length)
                ) {
                    result.tables.alter!.push(alter);
                }

                // PK added to an existing table that previously had none
                if (!prevEntry.tableObj.primaryKey && curEntry.tableObj.primaryKey) {
                    const pk = this._buildPrimaryKey(curEntry.schema, curEntry.tableObj);
                    if (pk) {
                        result.constraints.primaryKeys!.push(pk);
                    }
                }
            }
        }

        // --- New FKs ---------------------------------------------------------
        for (const fk of curFKs) {
            if (!prevFKNames.has(fk.name)) {
                result.constraints.foreignKeys!.push({
                    name: fk.name,
                    table: fk.table,
                    schema: fk.schema,
                    columns: [fk.column],
                    refTable: fk.refTable,
                    refSchema: fk.refSchema,
                    refColumns: [fk.refColumn],
                });
            }
        }

        // --- New unique constraints ------------------------------------------
        const prevUCNames = new Set(prevUCs.map(u => u.name));
        for (const uc of curUCs) {
            if (!prevUCNames.has(uc.name)) {
                result.constraints.unique!.push({
                    name: uc.name,
                    table: uc.table,
                    schema: uc.schema,
                    columns: uc.columns,
                });
            }
        }

        // --- New check constraints -------------------------------------------
        const prevCKNames = new Set(prevCKs.map(c => c.name));
        for (const ck of curCKs) {
            if (!prevCKNames.has(ck.name)) {
                result.constraints.checks!.push({
                    name: ck.name,
                    table: ck.table,
                    schema: ck.schema,
                    expression: ck.expression,
                });
            }
        }

        // --- New indexes -----------------------------------------------------
        for (const idx of curIdxs) {
            if (!prevIdxNames.has(idx.name)) {
                result.indexes.push({
                    name: idx.name,
                    table: idx.table,
                    schema: idx.schema,
                    columns: idx.columns,
                    unique: idx.unique,
                    clustered: idx.clustered,
                });
            }
        }

        return result;
    }

    // -------------------------------------------------------------------------
    // Collector helpers
    // -------------------------------------------------------------------------

    private _collectForeignKeys(db: Database): CollectedFK[] {
        const result: CollectedFK[] = [];
        for (const schema of db.schemas) {
            for (const table of schema.tables) {
                for (const col of table.columns) {
                    if (col.isForeignKey && col.foreignKeyRef) {
                        result.push({
                            name:
                                col.fkConstraintName ||
                                `FK_${table.name}_${col.name}`,
                            schema: schema.name,
                            table: table.name,
                            column: col.name,
                            refSchema: col.foreignKeyRef.schema,
                            refTable: col.foreignKeyRef.table,
                            refColumn: col.foreignKeyRef.column,
                        });
                    }
                }
            }
        }
        return result;
    }

    private _collectIndexes(db: Database): CollectedIndex[] {
        const result: CollectedIndex[] = [];
        for (const schema of db.schemas) {
            for (const table of schema.tables) {
                for (const idx of table.indexes ?? []) {
                    result.push({
                        name: idx.name,
                        schema: schema.name,
                        table: table.name,
                        columns: idx.columns,
                        unique: idx.isUnique,
                        clustered: idx.isClustered,
                    });
                }
            }
        }
        return result;
    }

    private _collectUniqueConstraints(db: Database): CollectedUC[] {
        const result: CollectedUC[] = [];
        for (const schema of db.schemas) {
            for (const table of schema.tables) {
                for (const uc of table.uniqueConstraints ?? []) {
                    result.push({
                        name: uc.name,
                        schema: schema.name,
                        table: table.name,
                        columns: uc.columns,
                    });
                }
            }
        }
        return result;
    }

    private _collectCheckConstraints(db: Database): CollectedCK[] {
        const result: CollectedCK[] = [];
        for (const schema of db.schemas) {
            for (const table of schema.tables) {
                for (const ck of table.checkConstraints ?? []) {
                    result.push({
                        name: ck.name,
                        schema: schema.name,
                        table: table.name,
                        expression: ck.expression,
                    });
                }
            }
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Table map
    // -------------------------------------------------------------------------

    private _buildTableMap(db: Database): Map<string, TableMapEntry> {
        const map = new Map<string, TableMapEntry>();
        for (const schema of db.schemas) {
            for (const table of schema.tables) {
                // Key is schema + table name, normalised to lower-case for
                // case-insensitive comparison (MSSQL is case-insensitive by default).
                const key = `${schema.name.toLowerCase()}.${table.name.toLowerCase()}`;
                map.set(key, { schema: schema.name, table: table.name, tableObj: table });
            }
        }
        return map;
    }

    // -------------------------------------------------------------------------
    // CREATE TABLE builder
    // -------------------------------------------------------------------------

    private _buildCreateTable(schema: string, table: Table): CreateTableDefinition {
        return {
            name: table.name,
            schema,
            columns: table.columns.map(c => this._toColumnDef(c)),
        };
    }

    // -------------------------------------------------------------------------
    // ALTER TABLE builder
    // -------------------------------------------------------------------------

    private _buildAlterTable(
        schema: string,
        prev: Table,
        cur: Table
    ): AlterTableDefinition | null {
        const prevColMap = new Map(prev.columns.map(c => [c.name.toLowerCase(), c]));
        const curColMap = new Map(cur.columns.map(c => [c.name.toLowerCase(), c]));

        const addColumns: ColumnDefinition[] = [];
        const alterColumns: ColumnDefinition[] = [];
        const dropColumns: string[] = [];

        // Added or altered columns
        for (const [key, curCol] of curColMap) {
            const prevCol = prevColMap.get(key);
            if (!prevCol) {
                addColumns.push(this._toColumnDef(curCol));
            } else if (this._columnChanged(prevCol, curCol)) {
                // Only non-IDENTITY changes can be done via ALTER COLUMN
                if (!prevCol.defaultValue?.includes('IDENTITY') &&
                    !curCol.defaultValue?.includes('IDENTITY')) {
                    alterColumns.push(this._toColumnDef(curCol));
                }
            }
        }

        // Dropped columns
        for (const [key, prevCol] of prevColMap) {
            if (!curColMap.has(key)) {
                dropColumns.push(prevCol.name);
            }
        }

        if (!addColumns.length && !alterColumns.length && !dropColumns.length) {
            return null;
        }

        return {
            name: cur.name,
            schema,
            addColumns: addColumns.length ? addColumns : undefined,
            alterColumns: alterColumns.length ? alterColumns : undefined,
            dropColumns: dropColumns.length ? dropColumns : undefined,
        };
    }

    // -------------------------------------------------------------------------
    // Primary key builder
    // -------------------------------------------------------------------------

    private _buildPrimaryKey(schema: string, table: Table): PrimaryKeyDefinition | null {
        // Prefer table-level primaryKey definition
        if (table.primaryKey) {
            return {
                name: table.primaryKey.name || `PK_${table.name}`,
                table: table.name,
                schema,
                columns: table.primaryKey.columns,
                clustered: table.primaryKey.isClustered !== false,
            };
        }
        // Fall back to column-level PK flags
        const pkCols = table.columns.filter(c => c.isPrimaryKey);
        if (!pkCols.length) {
            return null;
        }
        const pkName = pkCols.find(c => c.pkName)?.pkName || `PK_${table.name}`;
        return {
            name: pkName,
            table: table.name,
            schema,
            columns: pkCols.map(c => c.name),
            clustered: true,
        };
    }

    // -------------------------------------------------------------------------
    // Column conversion
    // -------------------------------------------------------------------------

    private _toColumnDef(col: Column): ColumnDefinition {
        const type = this._columnTypeString(col);
        const isIdentity =
            col.defaultValue === 'IDENTITY' ||
            col.defaultValue?.toUpperCase() === 'IDENTITY';
        const defaultVal =
            !isIdentity && col.defaultValue ? col.defaultValue : undefined;
        return {
            name: col.name,
            type,
            nullable: col.isNullable,
            identity: isIdentity || undefined,
            default: defaultVal ?? null,
        };
    }

    private _columnTypeString(col: Column): string {
        const base = col.type.toUpperCase();
        if (col.length !== undefined) {
            return `${base}(${col.length})`;
        }
        if (col.precision !== undefined && col.scale !== undefined) {
            return `${base}(${col.precision},${col.scale})`;
        }
        if (col.precision !== undefined) {
            return `${base}(${col.precision})`;
        }
        return base;
    }

    private _columnChanged(prev: Column, cur: Column): boolean {
        return (
            this._columnTypeString(prev) !== this._columnTypeString(cur) ||
            prev.isNullable !== cur.isNullable
        );
    }

    // -------------------------------------------------------------------------
    // Small ref builders
    // -------------------------------------------------------------------------

    private _tableRef(table: string, schema: string): TableRef {
        return { name: table, schema };
    }

    private _dropConstraintRef(
        name: string,
        table: string,
        schema: string
    ): DropConstraintRef {
        return { name, table, schema };
    }

    private _dropIndexRef(name: string, table: string, schema: string): DropIndexRef {
        return { name, table, schema };
    }
}
