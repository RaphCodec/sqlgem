/**
 * Data model for schema comparison results.
 * All types are plain data (no logic, no vscode dependencies).
 */

export interface TableDiff {
	schemaName: string;
	tableName: string;
}

export interface ColumnDiff {
	name: string;
	schemaName: string;
	tableName: string;
}

export interface ColumnChangeDetail {
	field: string;
	oldValue: string | undefined;
	newValue: string | undefined;
}

export interface ColumnChange {
	name: string;
	schemaName: string;
	tableName: string;
	changes: ColumnChangeDetail[];
}

export interface IndexDiff {
	name: string;
	columns: string[];
	isUnique: boolean;
	isClustered: boolean;
}

export interface ForeignKeyDiff {
	constraintName: string;
	column: string;
	refSchema: string;
	refTable: string;
	refColumn: string;
}

export interface UniqueConstraintDiff {
	name: string;
	columns: string[];
}

export interface ModifiedTableDiff {
	schemaName: string;
	tableName: string;
	addedColumns: ColumnDiff[];
	removedColumns: ColumnDiff[];
	modifiedColumns: ColumnChange[];
	addedIndexes: IndexDiff[];
	removedIndexes: IndexDiff[];
	addedForeignKeys: ForeignKeyDiff[];
	removedForeignKeys: ForeignKeyDiff[];
	addedUniqueConstraints: UniqueConstraintDiff[];
	removedUniqueConstraints: UniqueConstraintDiff[];
	pkChanged: boolean;
	oldPk?: string[];
	newPk?: string[];
}

export interface SchemaComparison {
	sourceLabel: string;
	targetLabel: string;
	addedTables: TableDiff[];
	removedTables: TableDiff[];
	modifiedTables: ModifiedTableDiff[];
	addedSchemas: string[];
	removedSchemas: string[];
}
