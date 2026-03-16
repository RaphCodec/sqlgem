/**
 * Schema comparison engine.
 *
 * Compares two Database models and produces a SchemaComparison that describes
 * every structural difference: added/removed schemas, tables, columns, PKs,
 * indexes, foreign keys, and unique constraints.
 */

import type { Database, Table, Column } from '../webview/types';
import type {
	SchemaComparison,
	TableDiff,
	ModifiedTableDiff,
	ColumnDiff,
	ColumnChange,
	ColumnChangeDetail,
	IndexDiff,
	ForeignKeyDiff,
	UniqueConstraintDiff,
} from './SchemaCompareModel';

/**
 * Compares two database schemas.
 *
 * @param source      The "before" (baseline) schema.
 * @param target      The "after" (new) schema.
 * @param sourceLabel Human-readable label for the source.
 * @param targetLabel Human-readable label for the target.
 */
export function compareSchemas(
	source: Database,
	target: Database,
	sourceLabel: string,
	targetLabel: string,
): SchemaComparison {
	const result: SchemaComparison = {
		sourceLabel,
		targetLabel,
		addedTables: [],
		removedTables: [],
		modifiedTables: [],
		addedSchemas: [],
		removedSchemas: [],
	};

	// Schema-level diff
	const sourceSchemaKeys = new Set(source.schemas.map(s => s.name.toLowerCase()));
	const targetSchemaKeys = new Set(target.schemas.map(s => s.name.toLowerCase()));

	for (const schema of target.schemas) {
		if (!sourceSchemaKeys.has(schema.name.toLowerCase())) {
			result.addedSchemas.push(schema.name);
		}
	}
	for (const schema of source.schemas) {
		if (!targetSchemaKeys.has(schema.name.toLowerCase())) {
			result.removedSchemas.push(schema.name);
		}
	}

	// Build table maps keyed by "schema.table" (lowercased for case-insensitive lookup)
	type TableEntry = { schemaName: string; table: Table };

	const buildTableMap = (db: Database): Map<string, TableEntry> => {
		const m = new Map<string, TableEntry>();
		for (const schema of db.schemas) {
			for (const table of schema.tables) {
				m.set(`${schema.name.toLowerCase()}.${table.name.toLowerCase()}`, {
					schemaName: schema.name,
					table,
				});
			}
		}
		return m;
	};

	const sourceTables = buildTableMap(source);
	const targetTables = buildTableMap(target);

	// Added tables (present in target, absent in source)
	for (const [key, entry] of targetTables) {
		if (!sourceTables.has(key)) {
			result.addedTables.push({ schemaName: entry.schemaName, tableName: entry.table.name });
		}
	}
	// Removed tables (present in source, absent in target)
	for (const [key, entry] of sourceTables) {
		if (!targetTables.has(key)) {
			result.removedTables.push({ schemaName: entry.schemaName, tableName: entry.table.name });
		}
	}
	// Modified tables (present in both)
	for (const [key, srcEntry] of sourceTables) {
		const tgtEntry = targetTables.get(key);
		if (!tgtEntry) { continue; }
		const diff = diffTable(srcEntry.schemaName, srcEntry.table, tgtEntry.table);
		if (isModified(diff)) { result.modifiedTables.push(diff); }
	}

	return result;
}

// ---------------------------------------------------------------------------
// Table-level comparison
// ---------------------------------------------------------------------------

function isModified(diff: ModifiedTableDiff): boolean {
	return (
		diff.addedColumns.length > 0
		|| diff.removedColumns.length > 0
		|| diff.modifiedColumns.length > 0
		|| diff.addedIndexes.length > 0
		|| diff.removedIndexes.length > 0
		|| diff.addedForeignKeys.length > 0
		|| diff.removedForeignKeys.length > 0
		|| diff.addedUniqueConstraints.length > 0
		|| diff.removedUniqueConstraints.length > 0
		|| diff.pkChanged
	);
}

function diffTable(schemaName: string, source: Table, target: Table): ModifiedTableDiff {
	const diff: ModifiedTableDiff = {
		schemaName,
		tableName: target.name,
		addedColumns: [],
		removedColumns: [],
		modifiedColumns: [],
		addedIndexes: [],
		removedIndexes: [],
		addedForeignKeys: [],
		removedForeignKeys: [],
		addedUniqueConstraints: [],
		removedUniqueConstraints: [],
		pkChanged: false,
	};

	// ---- Columns ----
	const srcCols = new Map(source.columns.map(c => [c.name.toLowerCase(), c]));
	const tgtCols = new Map(target.columns.map(c => [c.name.toLowerCase(), c]));

	for (const [key, col] of tgtCols) {
		if (!srcCols.has(key)) {
			diff.addedColumns.push({ name: col.name, schemaName, tableName: target.name });
		} else {
			const changes = getColumnChanges(srcCols.get(key)!, col);
			if (changes.length > 0) {
				diff.modifiedColumns.push({ name: col.name, schemaName, tableName: target.name, changes });
			}
		}
	}
	for (const [key, col] of srcCols) {
		if (!tgtCols.has(key)) {
			diff.removedColumns.push({ name: col.name, schemaName, tableName: target.name });
		}
	}

	// ---- Primary key ----
	const srcPk = getPkColumns(source).sort().join(',');
	const tgtPk = getPkColumns(target).sort().join(',');
	if (srcPk !== tgtPk) {
		diff.pkChanged = true;
		diff.oldPk = getPkColumns(source);
		diff.newPk = getPkColumns(target);
	}

	// ---- Indexes ----
	const srcIdxMap = buildIndexMap(source);
	const tgtIdxMap = buildIndexMap(target);
	for (const [key, idx] of tgtIdxMap) {
		if (!srcIdxMap.has(key)) { diff.addedIndexes.push(idx); }
	}
	for (const [key, idx] of srcIdxMap) {
		if (!tgtIdxMap.has(key)) { diff.removedIndexes.push(idx); }
	}

	// ---- Foreign keys ----
	const srcFkMap = buildFkMap(source);
	const tgtFkMap = buildFkMap(target);
	for (const [key, fk] of tgtFkMap) {
		if (!srcFkMap.has(key)) { diff.addedForeignKeys.push(fk); }
	}
	for (const [key, fk] of srcFkMap) {
		if (!tgtFkMap.has(key)) { diff.removedForeignKeys.push(fk); }
	}

	// ---- Unique constraints ----
	const srcUqMap = buildUqMap(source);
	const tgtUqMap = buildUqMap(target);
	for (const [key, uq] of tgtUqMap) {
		if (!srcUqMap.has(key)) { diff.addedUniqueConstraints.push(uq); }
	}
	for (const [key, uq] of srcUqMap) {
		if (!tgtUqMap.has(key)) { diff.removedUniqueConstraints.push(uq); }
	}

	return diff;
}

// ---------------------------------------------------------------------------
// Column-level comparison
// ---------------------------------------------------------------------------

function getPkColumns(table: Table): string[] {
	if (table.primaryKey) { return [...table.primaryKey.columns]; }
	return table.columns.filter(c => c.isPrimaryKey).map(c => c.name);
}

function columnTypeString(col: Column): string {
	const t = col.type.toUpperCase();
	if (col.length !== undefined) { return `${t}(${col.length})`; }
	if (col.precision !== undefined && col.scale !== undefined) { return `${t}(${col.precision},${col.scale})`; }
	if (col.precision !== undefined) { return `${t}(${col.precision})`; }
	return t;
}

function getColumnChanges(source: Column, target: Column): ColumnChangeDetail[] {
	const changes: ColumnChangeDetail[] = [];

	const srcType = columnTypeString(source);
	const tgtType = columnTypeString(target);
	if (srcType !== tgtType) {
		changes.push({ field: 'type', oldValue: srcType, newValue: tgtType });
	}

	if (source.isNullable !== target.isNullable) {
		changes.push({ field: 'nullable', oldValue: String(source.isNullable), newValue: String(target.isNullable) });
	}

	if (source.defaultValue !== target.defaultValue) {
		changes.push({ field: 'default', oldValue: source.defaultValue, newValue: target.defaultValue });
	}

	if (source.isPrimaryKey !== target.isPrimaryKey) {
		changes.push({ field: 'primaryKey', oldValue: String(source.isPrimaryKey), newValue: String(target.isPrimaryKey) });
	}

	return changes;
}

// ---------------------------------------------------------------------------
// Map builders for indexes, foreign keys, and unique constraints
// ---------------------------------------------------------------------------

function buildIndexMap(table: Table): Map<string, IndexDiff> {
	const map = new Map<string, IndexDiff>();
	for (const idx of table.indexes ?? []) {
		// Key: sorted columns + isUnique flag (so a unique index is distinct from a non-unique one)
		const key = idx.columns.map(c => c.toLowerCase()).sort().join(',') + ':' + String(idx.isUnique);
		map.set(key, {
			name: idx.name,
			columns: idx.columns,
			isUnique: idx.isUnique,
			isClustered: idx.isClustered,
		});
	}
	return map;
}

function buildFkMap(table: Table): Map<string, ForeignKeyDiff> {
	const map = new Map<string, ForeignKeyDiff>();
	for (const col of table.columns) {
		if (!col.isForeignKey || !col.foreignKeyRef) { continue; }
		const ref = col.foreignKeyRef;
		const key = `${col.name.toLowerCase()}->${ref.schema.toLowerCase()}.${ref.table.toLowerCase()}.${ref.column.toLowerCase()}`;
		map.set(key, {
			constraintName: col.fkConstraintName ?? `FK_${table.name}_${col.name}`,
			column: col.name,
			refSchema: ref.schema,
			refTable: ref.table,
			refColumn: ref.column,
		});
	}
	return map;
}

function buildUqMap(table: Table): Map<string, UniqueConstraintDiff> {
	const map = new Map<string, UniqueConstraintDiff>();
	// Column-level unique flags
	for (const col of table.columns) {
		if (col.isUniqueConstraint && !col.isPrimaryKey) {
			map.set(col.name.toLowerCase(), {
				name: col.uniqueConstraintName ?? `UQ_${table.name}_${col.name}`,
				columns: [col.name],
			});
		}
	}
	// Table-level unique constraints
	for (const uc of table.uniqueConstraints ?? []) {
		const key = uc.columns.map(c => c.toLowerCase()).sort().join(',');
		map.set(key, { name: uc.name, columns: uc.columns });
	}
	return map;
}

// Re-export types that consumers need from this module
export type { TableDiff, ModifiedTableDiff, ColumnDiff, ColumnChange, IndexDiff, ForeignKeyDiff, UniqueConstraintDiff };
