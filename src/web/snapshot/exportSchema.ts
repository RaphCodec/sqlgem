/**
 * exportSchema.ts
 *
 * Generates a complete MSSQL-compatible schema DDL from the in-memory
 * database model.  The output uses plain CREATE statements (no idempotent
 * IF NOT EXISTS guards) — snapshots represent a pristine schema state
 * intended for reconstruction and comparison, not incremental application.
 *
 * Emission order (matches dependency constraints):
 *  1.  CREATE SCHEMA   (non-dbo schemas)
 *  2.  CREATE TABLE    (all schemas)
 *  3.  UNIQUE constraints
 *  4.  Indexes
 *  5.  FOREIGN KEY constraints
 *  6.  CHECK constraints
 */

import type { Database, Table } from '../webview/types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert the supplied in-memory database model into a full schema DDL string.
 *
 * @param database  In-memory database model (from the diagram).
 * @returns         A SQL string suitable for inclusion in a snapshot file.
 */
export function exportSchemaToSQL(database: Database): string {
    let sql = '';

    // -----------------------------------------------------------------------
    // 1. Non-dbo schemas
    // -----------------------------------------------------------------------
    const nonDboSchemas = database.schemas.filter(s => s.name !== 'dbo');
    if (nonDboSchemas.length > 0) {
        sql += section('Schemas');
        nonDboSchemas.forEach(schema => {
            sql += `CREATE SCHEMA [${schema.name}];\nGO\n\n`;
        });
    }

    // -----------------------------------------------------------------------
    // 2. Tables
    // -----------------------------------------------------------------------
    database.schemas.forEach(schema => {
        if (schema.tables.length === 0) { return; }
        sql += section(`Schema: ${schema.name}`);
        schema.tables.forEach(table => {
            sql += generateTableDDL(schema.name, table);
            sql += '\nGO\n\n';
        });
    });

    // -----------------------------------------------------------------------
    // 3. Unique constraints
    // -----------------------------------------------------------------------
    const uniqueConstraints: string[] = [];
    database.schemas.forEach(schema => {
        schema.tables.forEach(table => {
            // Column-level unique constraints
            table.columns
                .filter(c => c.isUniqueConstraint && !c.isPrimaryKey)
                .forEach(col => {
                    const name = col.uniqueConstraintName ?? `UQ_${table.name}_${col.name}`;
                    uniqueConstraints.push(
                        `ALTER TABLE [${schema.name}].[${table.name}]\n` +
                        `    ADD CONSTRAINT [${name}] UNIQUE ([${col.name}]);`
                    );
                });

            // Table-level unique constraints
            table.uniqueConstraints?.forEach(uc => {
                const name = uc.name || `UQ_${table.name}_${uc.columns.join('_')}`;
                const cols = uc.columns.map(c => `[${c}]`).join(', ');
                uniqueConstraints.push(
                    `ALTER TABLE [${schema.name}].[${table.name}]\n` +
                    `    ADD CONSTRAINT [${name}] UNIQUE (${cols});`
                );
            });
        });
    });

    if (uniqueConstraints.length > 0) {
        sql += section('Unique Constraints');
        uniqueConstraints.forEach(stmt => { sql += stmt + '\nGO\n\n'; });
    }

    // -----------------------------------------------------------------------
    // 4. Indexes
    // -----------------------------------------------------------------------
    const indexes: string[] = [];
    database.schemas.forEach(schema => {
        schema.tables.forEach(table => {
            table.indexes?.forEach(idx => {
                const prefix   = idx.isUnique ? 'UQ' : 'IX';
                const name     = idx.name || `${prefix}_${table.name}_${idx.columns.join('_')}`;
                const cols     = idx.columns.map(c => `[${c}]`).join(', ');
                const unique   = idx.isUnique   ? 'UNIQUE '    : '';
                const cluster  = idx.isClustered ? 'CLUSTERED'  : 'NONCLUSTERED';
                indexes.push(
                    `CREATE ${unique}${cluster} INDEX [${name}]\n` +
                    `    ON [${schema.name}].[${table.name}] (${cols});`
                );
            });
        });
    });

    if (indexes.length > 0) {
        sql += section('Indexes');
        indexes.forEach(stmt => { sql += stmt + '\nGO\n\n'; });
    }

    // -----------------------------------------------------------------------
    // 5. Foreign key constraints
    // -----------------------------------------------------------------------
    const foreignKeys: string[] = [];
    database.schemas.forEach(schema => {
        schema.tables.forEach(table => {
            table.columns.forEach(col => {
                if (!col.isForeignKey || !col.foreignKeyRef) { return; }
                const ref    = col.foreignKeyRef;
                const name   = col.fkConstraintName ?? `FK_${table.name}_${col.name}`;
                foreignKeys.push(
                    `ALTER TABLE [${schema.name}].[${table.name}]\n` +
                    `    ADD CONSTRAINT [${name}]\n` +
                    `    FOREIGN KEY ([${col.name}])\n` +
                    `    REFERENCES [${ref.schema}].[${ref.table}]([${ref.column}]);`
                );
            });
        });
    });

    if (foreignKeys.length > 0) {
        sql += section('Foreign Key Constraints');
        foreignKeys.forEach(stmt => { sql += stmt + '\nGO\n\n'; });
    }

    // -----------------------------------------------------------------------
    // 6. Check constraints
    // -----------------------------------------------------------------------
    const checkConstraints: string[] = [];
    database.schemas.forEach(schema => {
        schema.tables.forEach(table => {
            table.checkConstraints?.forEach(chk => {
                const name = chk.name || `CK_${table.name}`;
                checkConstraints.push(
                    `ALTER TABLE [${schema.name}].[${table.name}]\n` +
                    `    ADD CONSTRAINT [${name}] CHECK (${chk.expression});`
                );
            });
        });
    });

    if (checkConstraints.length > 0) {
        sql += section('Check Constraints');
        checkConstraints.forEach(stmt => { sql += stmt + '\nGO\n\n'; });
    }

    return sql;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Emit a section heading comment block. */
function section(title: string): string {
    return `-- ====================================\n-- ${title}\n-- ====================================\n\n`;
}

/**
 * Produce a CREATE TABLE statement for one table (no IF NOT EXISTS guard).
 */
function generateTableDDL(schemaName: string, table: Table): string {
    const columnDefs = table.columns.map(col => {
        let typeStr = col.type;
        if ((col.type === 'VARCHAR' || col.type === 'NVARCHAR') && col.length) {
            typeStr = `${col.type}(${col.length})`;
        } else if (col.type === 'DECIMAL' && col.precision !== undefined) {
            typeStr = col.scale !== undefined
                ? `DECIMAL(${col.precision},${col.scale})`
                : `DECIMAL(${col.precision})`;
        }
        const nullability = (!col.isNullable || col.isPrimaryKey) ? ' NOT NULL' : '';
        return `    [${col.name}] ${typeStr}${nullability}`;
    });

    let sql = `CREATE TABLE [${schemaName}].[${table.name}] (\n`;
    sql += columnDefs.join(',\n');

    // Primary key constraint
    let pkCols: string[] = [];
    let pkName   = `PK_${table.name}`;
    let pkCluster = true;

    if (table.primaryKey) {
        pkCols   = table.primaryKey.columns.map(c => `[${c}]`);
        pkName   = table.primaryKey.name ?? pkName;
        pkCluster = table.primaryKey.isClustered !== false;
    } else {
        pkCols = table.columns.filter(c => c.isPrimaryKey).map(c => `[${c.name}]`);
        const pkCol = table.columns.find(c => c.isPrimaryKey && c.pkName);
        if (pkCol) { pkName = pkCol.pkName!; }
    }

    if (pkCols.length > 0) {
        const clusterKw = pkCluster ? 'CLUSTERED' : 'NONCLUSTERED';
        sql += `,\n    CONSTRAINT [${pkName}] PRIMARY KEY ${clusterKw} (${pkCols.join(', ')})`;
    }

    sql += `\n);`;
    return sql;
}
