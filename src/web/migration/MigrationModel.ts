/**
 * MigrationModel.ts
 *
 * Engine-agnostic type definitions for the migration JSON format.
 * The model describes *what* to migrate, not *how* – SQL generation is
 * handled separately by MigrationSqlGenerator.
 */

// ---------------------------------------------------------------------------
// Top-level definition
// ---------------------------------------------------------------------------

export interface MigrationDefinition {
    /** Semantic version of the migration format, e.g. "1.0" */
    version: string;
    description?: string;
    /** When true the generator wraps all statements in a transaction */
    transaction?: boolean;
    /** Pre-migration cleanup (drop FKs / indexes before structural changes) */
    pre?: PreMigration;
    tables?: TablesMigration;
    constraints?: ConstraintsMigration;
    indexes?: IndexDefinition[];
}

// ---------------------------------------------------------------------------
// Pre-migration
// ---------------------------------------------------------------------------

export interface PreMigration {
    dropForeignKeys?: DropConstraintRef[];
    dropIndexes?: DropIndexRef[];
}

export interface DropConstraintRef {
    name: string;
    table: string;
    schema?: string;
}

export interface DropIndexRef {
    name: string;
    table: string;
    schema?: string;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export interface TableRef {
    name: string;
    schema?: string;
}

export interface ColumnDefinition {
    name: string;
    /** Full SQL type string, e.g. "int", "nvarchar(255)", "decimal(18,4)" */
    type: string;
    /** Defaults to true (nullable) when omitted */
    nullable?: boolean;
    /** IDENTITY(1,1) column */
    identity?: boolean;
    /** DEFAULT expression, e.g. "0", "'N/A'", "GETUTCDATE()" */
    default?: string | null;
}

export interface CreateTableDefinition {
    name: string;
    schema?: string;
    columns: ColumnDefinition[];
}

export interface AlterTableDefinition {
    name: string;
    schema?: string;
    addColumns?: ColumnDefinition[];
    alterColumns?: ColumnDefinition[];
    /** Column names to drop */
    dropColumns?: string[];
}

export interface TablesMigration {
    drop?: TableRef[];
    create?: CreateTableDefinition[];
    alter?: AlterTableDefinition[];
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

export type ReferentialAction = 'CASCADE' | 'SET NULL' | 'NO ACTION' | 'SET DEFAULT';

export interface PrimaryKeyDefinition {
    name: string;
    table: string;
    schema?: string;
    columns: string[];
    /** Defaults to true (CLUSTERED) when omitted */
    clustered?: boolean;
}

export interface ForeignKeyDefinition {
    name: string;
    table: string;
    schema?: string;
    columns: string[];
    refTable: string;
    refSchema?: string;
    refColumns: string[];
    onDelete?: ReferentialAction;
    onUpdate?: ReferentialAction;
}

export interface UniqueConstraintDefinition {
    name: string;
    table: string;
    schema?: string;
    columns: string[];
}

export interface CheckConstraintDefinition {
    name: string;
    table: string;
    schema?: string;
    /** Raw SQL check expression, e.g. "Status IN ('A','I','P')" */
    expression: string;
}

export interface ConstraintsMigration {
    primaryKeys?: PrimaryKeyDefinition[];
    foreignKeys?: ForeignKeyDefinition[];
    unique?: UniqueConstraintDefinition[];
    checks?: CheckConstraintDefinition[];
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

export interface IndexDefinition {
    name: string;
    table: string;
    schema?: string;
    columns: string[];
    unique?: boolean;
    /** Defaults to false (NONCLUSTERED) when omitted */
    clustered?: boolean;
}
