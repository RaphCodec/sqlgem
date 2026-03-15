/**
 * MigrationSqlGenerator.ts
 *
 * Converts a MigrationDefinition into an idempotent SQL script.
 *
 * Execution order (mirrors safe dependency resolution):
 *  1.  Drop foreign keys      (pre.dropForeignKeys)
 *  2.  Drop indexes           (pre.dropIndexes)
 *  3.  Drop tables            (tables.drop)
 *  4.  Create tables          (tables.create)
 *  5.  Alter tables           (tables.alter)
 *       5a. Add columns
 *       5b. Alter columns
 *       5c. Drop columns
 *  6.  Create primary keys    (constraints.primaryKeys)
 *  7.  Create unique          (constraints.unique)
 *  8.  Create check           (constraints.checks)
 *  9.  Create foreign keys    (constraints.foreignKeys)
 * 10.  Create indexes         (indexes)
 *
 * All emitted statements are idempotent – safe to run multiple times.
 */

import { SqlBuilder, MssqlDialect, SqlDialect } from './SqlBuilder';
import type {
    MigrationDefinition,
    ColumnDefinition,
    CreateTableDefinition,
    AlterTableDefinition,
    ForeignKeyDefinition,
    PrimaryKeyDefinition,
    UniqueConstraintDefinition,
    CheckConstraintDefinition,
    IndexDefinition,
    DropConstraintRef,
    DropIndexRef,
    TableRef,
} from './MigrationModel';

// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

export interface GeneratorOptions {
    /**
     * SQL dialect to use for identifier quoting and batch separators.
     * Defaults to MssqlDialect.
     */
    dialect?: SqlDialect;

    /**
     * Override the transaction flag from the migration model.
     * When undefined the value from MigrationDefinition.transaction is used
     * (with a default of false).
     */
    transaction?: boolean;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export class MigrationSqlGenerator {
    private readonly _builder: SqlBuilder;
    private readonly _options: Required<Omit<GeneratorOptions, 'transaction'>> &
        Pick<GeneratorOptions, 'transaction'>;

    constructor(options: GeneratorOptions = {}) {
        this._options = {
            dialect: options.dialect ?? MssqlDialect,
            transaction: options.transaction,
        };
        this._builder = new SqlBuilder(this._options.dialect);
    }

    /**
     * Generate the full SQL migration script for the supplied definition.
     */
    generate(migration: MigrationDefinition): string {
        const useTransaction =
            this._options.transaction ?? migration.transaction ?? false;

        if (useTransaction) {
            this._b.append('BEGIN TRANSACTION;');
            this._b.newBatch();
        }

        // 1. Drop foreign keys
        for (const ref of migration.pre?.dropForeignKeys ?? []) {
            this._emitDropForeignKey(ref);
        }

        // 2. Drop indexes
        for (const ref of migration.pre?.dropIndexes ?? []) {
            this._emitDropIndex(ref);
        }

        // 3. Drop tables
        for (const ref of migration.tables?.drop ?? []) {
            this._emitDropTable(ref);
        }

        // 4. Create tables
        for (const def of migration.tables?.create ?? []) {
            this._emitCreateTable(def);
        }

        // 5. Alter tables (add → alter → drop columns)
        for (const def of migration.tables?.alter ?? []) {
            this._emitAlterTable(def);
        }

        // 6. Primary keys
        for (const pk of migration.constraints?.primaryKeys ?? []) {
            this._emitPrimaryKey(pk);
        }

        // 7. Unique constraints
        for (const uq of migration.constraints?.unique ?? []) {
            this._emitUniqueConstraint(uq);
        }

        // 8. Check constraints
        for (const ck of migration.constraints?.checks ?? []) {
            this._emitCheckConstraint(ck);
        }

        // 9. Foreign keys
        for (const fk of migration.constraints?.foreignKeys ?? []) {
            this._emitForeignKey(fk);
        }

        // 10. Indexes
        for (const idx of migration.indexes ?? []) {
            this._emitIndex(idx);
        }

        if (useTransaction) {
            this._b.newBatch();
            this._b.append('COMMIT TRANSACTION;');
        }

        return this._b.build();
    }

    // -----------------------------------------------------------------------
    // Private emitters
    // -----------------------------------------------------------------------

    private get _b(): SqlBuilder {
        return this._builder;
    }

    private _schema(schema?: string): string {
        return schema ?? 'dbo';
    }

    /** Escape a value for embedding inside a SQL single-quoted literal. */
    private _esc(value: string): string {
        return value.replace(/'/g, "''");
    }

    // --- Pre-migration ------------------------------------------------------

    private _emitDropForeignKey(ref: DropConstraintRef): void {
        const schema = this._schema(ref.schema);
        const qt = this._b.qualifiedTable(schema, ref.table);
        this._b.append(
            `IF EXISTS (\n` +
            `    SELECT * FROM sys.foreign_keys\n` +
            `    WHERE name = '${this._esc(ref.name)}'\n` +
            `      AND parent_object_id = OBJECT_ID('${this._esc(schema)}.${this._esc(ref.table)}')\n` +
            `)\n` +
            `BEGIN\n` +
            `    ALTER TABLE ${qt} DROP CONSTRAINT ${this._b.q(ref.name)};\n` +
            `END`
        );
    }

    private _emitDropIndex(ref: DropIndexRef): void {
        const schema = this._schema(ref.schema);
        const qt = this._b.qualifiedTable(schema, ref.table);
        this._b.append(
            `IF EXISTS (\n` +
            `    SELECT * FROM sys.indexes\n` +
            `    WHERE name = '${this._esc(ref.name)}'\n` +
            `      AND object_id = OBJECT_ID('${this._esc(schema)}.${this._esc(ref.table)}')\n` +
            `)\n` +
            `BEGIN\n` +
            `    DROP INDEX ${this._b.q(ref.name)} ON ${qt};\n` +
            `END`
        );
    }

    // --- Tables -------------------------------------------------------------

    private _emitDropTable(ref: TableRef): void {
        const schema = this._schema(ref.schema);
        const qt = this._b.qualifiedTable(schema, ref.name);
        this._b.append(
            `IF OBJECT_ID('${this._esc(schema)}.${this._esc(ref.name)}', 'U') IS NOT NULL\n` +
            `BEGIN\n` +
            `    DROP TABLE ${qt};\n` +
            `END`
        );
    }

    private _emitCreateTable(def: CreateTableDefinition): void {
        const schema = this._schema(def.schema);
        const qt = this._b.qualifiedTable(schema, def.name);
        const columnDefs = def.columns
            .map(c => `        ${this._columnDef(c)}`)
            .join(',\n');
        this._b.append(
            `IF OBJECT_ID('${this._esc(schema)}.${this._esc(def.name)}', 'U') IS NULL\n` +
            `BEGIN\n` +
            `    CREATE TABLE ${qt} (\n` +
            `${columnDefs}\n` +
            `    );\n` +
            `END`
        );
    }

    private _emitAlterTable(def: AlterTableDefinition): void {
        const schema = this._schema(def.schema);
        const qt = this._b.qualifiedTable(schema, def.name);
        const tableRef = `'${this._esc(schema)}.${this._esc(def.name)}'`;

        // 5a. Add columns
        for (const col of def.addColumns ?? []) {
            this._b.append(
                `IF COL_LENGTH(${tableRef}, '${this._esc(col.name)}') IS NULL\n` +
                `BEGIN\n` +
                `    ALTER TABLE ${qt}\n` +
                `    ADD ${this._columnDef(col)};\n` +
                `END`
            );
        }

        // 5b. Alter columns
        for (const col of def.alterColumns ?? []) {
            this._b.append(
                `IF COL_LENGTH(${tableRef}, '${this._esc(col.name)}') IS NOT NULL\n` +
                `BEGIN\n` +
                `    ALTER TABLE ${qt}\n` +
                `    ALTER COLUMN ${this._columnDef(col)};\n` +
                `END`
            );
        }

        // 5c. Drop columns
        for (const colName of def.dropColumns ?? []) {
            this._b.append(
                `IF COL_LENGTH(${tableRef}, '${this._esc(colName)}') IS NOT NULL\n` +
                `BEGIN\n` +
                `    ALTER TABLE ${qt}\n` +
                `    DROP COLUMN ${this._b.q(colName)};\n` +
                `END`
            );
        }
    }

    // --- Constraints --------------------------------------------------------

    private _emitPrimaryKey(pk: PrimaryKeyDefinition): void {
        const schema = this._schema(pk.schema);
        const qt = this._b.qualifiedTable(schema, pk.table);
        const clustered = pk.clustered === false ? 'NONCLUSTERED' : 'CLUSTERED';
        const cols = pk.columns.map(c => this._b.q(c)).join(', ');
        this._b.append(
            `IF NOT EXISTS (\n` +
            `    SELECT * FROM sys.key_constraints\n` +
            `    WHERE name = '${this._esc(pk.name)}'\n` +
            `      AND parent_object_id = OBJECT_ID('${this._esc(schema)}.${this._esc(pk.table)}')\n` +
            `)\n` +
            `BEGIN\n` +
            `    ALTER TABLE ${qt}\n` +
            `    ADD CONSTRAINT ${this._b.q(pk.name)}\n` +
            `    PRIMARY KEY ${clustered} (${cols});\n` +
            `END`
        );
    }

    private _emitUniqueConstraint(uq: UniqueConstraintDefinition): void {
        const schema = this._schema(uq.schema);
        const qt = this._b.qualifiedTable(schema, uq.table);
        const cols = uq.columns.map(c => this._b.q(c)).join(', ');
        this._b.append(
            `IF NOT EXISTS (\n` +
            `    SELECT * FROM sys.key_constraints\n` +
            `    WHERE name = '${this._esc(uq.name)}'\n` +
            `      AND parent_object_id = OBJECT_ID('${this._esc(schema)}.${this._esc(uq.table)}')\n` +
            `)\n` +
            `BEGIN\n` +
            `    ALTER TABLE ${qt}\n` +
            `    ADD CONSTRAINT ${this._b.q(uq.name)} UNIQUE (${cols});\n` +
            `END`
        );
    }

    private _emitCheckConstraint(ck: CheckConstraintDefinition): void {
        const schema = this._schema(ck.schema);
        const qt = this._b.qualifiedTable(schema, ck.table);
        this._b.append(
            `IF NOT EXISTS (\n` +
            `    SELECT * FROM sys.check_constraints\n` +
            `    WHERE name = '${this._esc(ck.name)}'\n` +
            `      AND parent_object_id = OBJECT_ID('${this._esc(schema)}.${this._esc(ck.table)}')\n` +
            `)\n` +
            `BEGIN\n` +
            `    ALTER TABLE ${qt}\n` +
            `    ADD CONSTRAINT ${this._b.q(ck.name)} CHECK (${ck.expression});\n` +
            `END`
        );
    }

    private _emitForeignKey(fk: ForeignKeyDefinition): void {
        const schema = this._schema(fk.schema);
        const refSchema = this._schema(fk.refSchema);
        const qt = this._b.qualifiedTable(schema, fk.table);
        const refQt = this._b.qualifiedTable(refSchema, fk.refTable);
        const cols = fk.columns.map(c => this._b.q(c)).join(', ');
        const refCols = fk.refColumns.map(c => this._b.q(c)).join(', ');

        let sql =
            `IF NOT EXISTS (\n` +
            `    SELECT * FROM sys.foreign_keys WHERE name = '${this._esc(fk.name)}'\n` +
            `)\n` +
            `BEGIN\n` +
            `    ALTER TABLE ${qt}\n` +
            `    ADD CONSTRAINT ${this._b.q(fk.name)}\n` +
            `    FOREIGN KEY (${cols}) REFERENCES ${refQt}(${refCols})`;

        if (fk.onDelete && fk.onDelete !== 'NO ACTION') {
            sql += `\n    ON DELETE ${fk.onDelete}`;
        }
        if (fk.onUpdate && fk.onUpdate !== 'NO ACTION') {
            sql += `\n    ON UPDATE ${fk.onUpdate}`;
        }

        sql += `;\nEND`;
        this._b.append(sql);
    }

    // --- Indexes ------------------------------------------------------------

    private _emitIndex(idx: IndexDefinition): void {
        const schema = this._schema(idx.schema);
        const qt = this._b.qualifiedTable(schema, idx.table);
        const unique = idx.unique ? 'UNIQUE ' : '';
        const clustered = idx.clustered ? 'CLUSTERED ' : 'NONCLUSTERED ';
        const cols = idx.columns.map(c => this._b.q(c)).join(', ');
        this._b.append(
            `IF NOT EXISTS (\n` +
            `    SELECT * FROM sys.indexes\n` +
            `    WHERE name = '${this._esc(idx.name)}'\n` +
            `      AND object_id = OBJECT_ID('${this._esc(schema)}.${this._esc(idx.table)}')\n` +
            `)\n` +
            `BEGIN\n` +
            `    CREATE ${unique}${clustered}INDEX ${this._b.q(idx.name)}\n` +
            `    ON ${qt} (${cols});\n` +
            `END`
        );
    }

    // --- Column definition helper -------------------------------------------

    private _columnDef(col: ColumnDefinition): string {
        const parts: string[] = [
            this._b.q(col.name),
            col.type.toUpperCase(),
        ];

        if (col.identity) {
            parts.push('IDENTITY(1,1)');
        }

        parts.push(col.nullable === false ? 'NOT NULL' : 'NULL');

        if (col.default !== null && col.default !== undefined) {
            parts.push(`DEFAULT ${col.default}`);
        }

        return parts.join(' ');
    }
}
