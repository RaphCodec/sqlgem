/**
 * Core data model for Schema Compare.
 * Pure type definitions — no VS Code or DOM dependencies.
 * Safe to import in both the extension host and the webview bundle.
 */

export type ChangeKind = 'added' | 'removed' | 'modified' | 'unchanged';

// ---------------------------------------------------------------------------
// Parsed schema-object definitions
// ---------------------------------------------------------------------------

export interface ColumnDef {
	name: string;
	/** Normalized uppercase type with length / precision, e.g. "NVARCHAR(100)" */
	dataType: string;
	nullable: boolean;
	default?: string;
}

export interface IndexDef {
	name: string;
	columns: string[];
	unique: boolean;
	clustered: boolean;
}

export interface ForeignKeyDef {
	constraintName: string;
	column: string;
	refSchema: string;
	refTable: string;
	refColumn: string;
}

export interface UniqueConstraintDef {
	name: string;
	columns: string[];
}

/** Represents one parsed table with all its structural metadata. */
export interface SchemaObjectDef {
	/** "schema.table" lowercased — canonical identity key */
	key: string;
	schemaName: string;
	name: string;
	columns: ColumnDef[];
	/** Ordered primary-key column names */
	primaryKey: string[];
	indexes: IndexDef[];
	foreignKeys: ForeignKeyDef[];
	uniqueConstraints: UniqueConstraintDef[];
}

// ---------------------------------------------------------------------------
// Diff result types
// ---------------------------------------------------------------------------

export interface FieldChange {
	field: string;
	from: string;
	to: string;
}

export interface ColumnChange {
	name: string;
	change: ChangeKind;
	source?: ColumnDef;
	target?: ColumnDef;
	fieldChanges: FieldChange[];
}

export interface NamedChange {
	name: string;
	change: 'added' | 'removed';
}

export interface ObjectDiff {
	key: string;
	schemaName: string;
	name: string;
	change: ChangeKind;
	source?: SchemaObjectDef;
	target?: SchemaObjectDef;
	columnChanges: ColumnChange[];
	pkChanged: boolean;
	indexChanges: NamedChange[];
	fkChanges: NamedChange[];
	uniqueChanges: NamedChange[];
}

export interface CompareStats {
	added: number;
	removed: number;
	modified: number;
	unchanged: number;
}

export interface CompareResult {
	sourceLabel: string;
	targetLabel: string;
	objects: ObjectDiff[];
	stats: CompareStats;
}

export interface DiffOptions {
	/** Treat type/name differences as equal when they differ only by casing. Default: false */
	ignoreCase?: boolean;
}
