/**
 * SQL → SchemaObjectDef parser.
 *
 * Wraps the existing sqlParser to produce the flat, normalised model used by
 * the diff engine.  Also provides a SQL generator for diff-view display.
 */

import { parseSQLToDatabase } from '../sqlParser';
import type { Column, Database } from '../webview/types';
import type {
	SchemaObjectDef,
	ColumnDef,
	IndexDef,
	ForeignKeyDef,
	UniqueConstraintDef,
} from './model';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse raw SQL DDL text into an array of SchemaObjectDef.
 * @param sql   Raw DDL content (CREATE TABLE statements etc.).
 * @param label Display name used for the Database name (e.g. file basename).
 */
export function parseSchemaObjects(sql: string, label: string): SchemaObjectDef[] {
	const db = parseSQLToDatabase(sql, label);
	return extractFromDatabase(db);
}

/**
 * Generate a canonical, human-readable CREATE TABLE SQL snippet from a
 * SchemaObjectDef.  Used to populate the side-by-side diff view.
 */
export function generateObjectSql(obj: SchemaObjectDef): string {
	const lines: string[] = [];

	lines.push(`CREATE TABLE [${obj.schemaName}].[${obj.name}] (`);

	obj.columns.forEach((c, i) => {
		const nullable = c.nullable ? 'NULL' : 'NOT NULL';
		const def = c.default ? ` DEFAULT ${c.default}` : '';
		const trailing = i < obj.columns.length - 1 || obj.primaryKey.length > 0 ? ',' : '';
		lines.push(`    [${c.name}] ${c.dataType} ${nullable}${def}${trailing}`);
	});

	if (obj.primaryKey.length > 0) {
		const pkCols = obj.primaryKey.map(c => `[${c}]`).join(', ');
		lines.push(`    CONSTRAINT [PK_${obj.name}] PRIMARY KEY CLUSTERED (${pkCols})`);
	}

	lines.push(');');

	for (const fk of obj.foreignKeys) {
		lines.push('');
		lines.push(`ALTER TABLE [${obj.schemaName}].[${obj.name}]`);
		lines.push(`    ADD CONSTRAINT [${fk.constraintName}]`);
		lines.push(`    FOREIGN KEY ([${fk.column}])`);
		lines.push(`    REFERENCES [${fk.refSchema}].[${fk.refTable}] ([${fk.refColumn}]);`);
	}

	for (const uc of obj.uniqueConstraints) {
		const ucCols = uc.columns.map(c => `[${c}]`).join(', ');
		lines.push('');
		lines.push(`ALTER TABLE [${obj.schemaName}].[${obj.name}]`);
		lines.push(`    ADD CONSTRAINT [${uc.name}] UNIQUE (${ucCols});`);
	}

	for (const idx of obj.indexes) {
		const unique    = idx.unique    ? 'UNIQUE '       : '';
		const clustered = idx.clustered ? 'CLUSTERED'     : 'NONCLUSTERED';
		const idxCols = idx.columns.map(c => `[${c}]`).join(', ');
		lines.push('');
		lines.push(`CREATE ${unique}${clustered} INDEX [${idx.name}]`);
		lines.push(`    ON [${obj.schemaName}].[${obj.name}] (${idxCols});`);
	}

	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractFromDatabase(db: Database): SchemaObjectDef[] {
	const objects: SchemaObjectDef[] = [];

	for (const schema of db.schemas) {
		for (const table of schema.tables) {
			const key    = `${schema.name}.${table.name}`.toLowerCase();
			const columns: ColumnDef[] = table.columns.map(c => ({
				name:     c.name,
				dataType: formatDataType(c),
				nullable: c.isNullable,
				default:  c.defaultValue,
			}));

			const primaryKey: string[] = table.primaryKey
				? table.primaryKey.columns
				: table.columns.filter(c => c.isPrimaryKey).map(c => c.name);

			const indexes: IndexDef[] = (table.indexes ?? []).map(i => ({
				name:      i.name,
				columns:   i.columns,
				unique:    i.isUnique,
				clustered: i.isClustered,
			}));

			const foreignKeys: ForeignKeyDef[] = table.columns
				.filter(c => c.isForeignKey && c.foreignKeyRef)
				.map(c => ({
					constraintName: c.fkConstraintName ?? `FK_${table.name}_${c.name}`,
					column:    c.name,
					refSchema: c.foreignKeyRef!.schema,
					refTable:  c.foreignKeyRef!.table,
					refColumn: c.foreignKeyRef!.column,
				}));

			const uniqueConstraints: UniqueConstraintDef[] =
				(table.uniqueConstraints ?? []).map(uc => ({
					name:    uc.name,
					columns: uc.columns,
				}));

			objects.push({
				key,
				schemaName: schema.name,
				name:       table.name,
				columns,
				primaryKey,
				indexes,
				foreignKeys,
				uniqueConstraints,
			});
		}
	}

	return objects;
}

function formatDataType(c: Column): string {
	let t = c.type.toUpperCase();
	if (c.length !== undefined) {
		t += `(${c.length})`;
	} else if (c.precision !== undefined && c.scale !== undefined) {
		t += `(${c.precision}, ${c.scale})`;
	} else if (c.precision !== undefined) {
		t += `(${c.precision})`;
	}
	return t;
}
