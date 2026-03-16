/**
 * DBML parser — converts a DBML document into a Database model.
 *
 * Supports the subset of DBML that SQLGem generates via generateDBMLContent(),
 * plus common DBML standard table/column definitions.
 *
 * Supported DBML features:
 *   - Table definitions: Table "schema"."table" { ... } or Table "table" { ... }
 *   - Column definitions with type, length/precision/scale
 *   - Column settings: pk, increment, not null, unique, default: `value`, ref: > ...
 *   - Multi-column indexes block with pk, unique, name: '...' settings
 */

import type { Database, Schema, Table, Column } from '../webview/types';

export function parseDBML(content: string, databaseName: string): Database {
	const database: Database = { name: databaseName, schemas: [] };

	function getOrCreateSchema(name: string): Schema {
		const key = name.toLowerCase();
		for (const s of database.schemas) {
			if (s.name.toLowerCase() === key) { return s; }
		}
		const schema: Schema = { name, tables: [] };
		database.schemas.push(schema);
		return schema;
	}

	const lines = content.split('\n');
	let i = 0;

	while (i < lines.length) {
		const trimmed = lines[i].trim();

		// Skip empty lines and // comments
		if (trimmed === '' || trimmed.startsWith('//')) {
			i++;
			continue;
		}

		// Table declaration: Table "schema"."name" { or Table "name" {
		const tableMatch = trimmed.match(/^Table\s+(.+?)\s*\{/i);
		if (tableMatch) {
			const { schemaName, tableName } = parseTableQualifier(tableMatch[1].trim());
			const schema = getOrCreateSchema(schemaName);
			const table: Table = { name: tableName, columns: [] };

			i++; // advance past the Table { line

			// Collect body lines until the matching closing brace
			let depth = 1;
			const bodyLines: string[] = [];
			while (i < lines.length) {
				const line = lines[i];
				const t = line.trim();
				for (const ch of t) {
					if (ch === '{') { depth++; }
					else if (ch === '}') { depth--; }
				}
				if (depth === 0) {
					i++; // skip the closing }
					break;
				}
				bodyLines.push(line);
				i++;
			}

			parseTableBody(table, bodyLines);
			schema.tables.push(table);
			continue;
		}

		// Skip any other top-level declarations (Ref, Project, Enum, etc.)
		i++;
	}

	// Ensure 'dbo' schema appears first
	const dboIdx = database.schemas.findIndex(s => s.name.toLowerCase() === 'dbo');
	if (dboIdx > 0) {
		const [dbo] = database.schemas.splice(dboIdx, 1);
		database.schemas.unshift(dbo);
	}

	// Guarantee at least one schema
	if (database.schemas.length === 0) {
		database.schemas.push({ name: 'dbo', tables: [] });
	}

	return database;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parses "schema"."table" or "table" (or unquoted variants) into parts. */
function parseTableQualifier(qualifier: string): { schemaName: string; tableName: string } {
	// "schema"."table"
	const doubleMatch = qualifier.match(/^"([^"]+)"\."([^"]+)"$/);
	if (doubleMatch) {
		return { schemaName: doubleMatch[1], tableName: doubleMatch[2] };
	}
	// "table"
	const singleMatch = qualifier.match(/^"([^"]+)"$/);
	if (singleMatch) {
		return { schemaName: 'dbo', tableName: singleMatch[1] };
	}
	// schema.table (unquoted)
	const dotMatch = qualifier.match(/^(\w+)\.(\w+)$/);
	if (dotMatch) {
		return { schemaName: dotMatch[1], tableName: dotMatch[2] };
	}
	// plain table name
	return { schemaName: 'dbo', tableName: qualifier.replace(/"/g, '').trim() };
}

/** Parses the body of a Table block into columns and indexes. */
function parseTableBody(table: Table, lines: string[]): void {
	let inIndexes = false;

	for (const rawLine of lines) {
		const trimmed = rawLine.trim();
		if (trimmed === '' || trimmed.startsWith('//')) { continue; }

		// Entering the indexes sub-block
		if (/^indexes\s*\{/i.test(trimmed)) {
			inIndexes = true;
			continue;
		}
		// Leaving the indexes sub-block
		if (inIndexes && trimmed === '}') {
			inIndexes = false;
			continue;
		}

		if (inIndexes) {
			parseIndexLine(table, trimmed);
		} else {
			parseColumnLine(table, trimmed);
		}
	}
}

/**
 * Parses a column definition line:
 *   colName type [setting1, setting2, ...]
 */
function parseColumnLine(table: Table, line: string): void {
	// Split off the settings bracket [...]
	const bracketPos = line.indexOf('[');
	let mainPart: string;
	let settingsStr: string | undefined;

	if (bracketPos !== -1) {
		mainPart = line.slice(0, bracketPos).trim();
		const closingPos = line.lastIndexOf(']');
		settingsStr = closingPos > bracketPos ? line.slice(bracketPos + 1, closingPos) : undefined;
	} else {
		mainPart = line.trim();
	}

	// Split name and type (first whitespace boundary)
	const spaceIdx = mainPart.search(/\s/);
	if (spaceIdx === -1) { return; } // malformed

	const colName = mainPart.slice(0, spaceIdx).trim();
	const typeRaw = mainPart.slice(spaceIdx + 1).trim();
	if (!colName || !typeRaw) { return; }

	const { baseType, length, precision, scale } = parseColType(typeRaw);

	const col: Column = {
		name: colName,
		type: baseType,
		isPrimaryKey: false,
		isForeignKey: false,
		isNullable: true,
	};

	if (length !== undefined) { col.length = length; }
	if (precision !== undefined) { col.precision = precision; }
	if (scale !== undefined) { col.scale = scale; }

	if (settingsStr !== undefined) {
		applyColumnSettings(col, settingsStr, table);
	}

	table.columns.push(col);
}

/** Parses a DBML column type string into its parts. */
function parseColType(raw: string): {
	baseType: string;
	length?: number;
	precision?: number;
	scale?: number;
} {
	const match = raw.match(/^(\w+)\((.+)\)$/);
	if (!match) {
		return { baseType: raw.toUpperCase() };
	}
	const baseType = match[1].toUpperCase();
	const paramStr = match[2].trim();

	if (paramStr.toLowerCase() === 'max') {
		return { baseType }; // MAX cannot be stored as a number
	}

	const commaIdx = paramStr.indexOf(',');
	if (commaIdx !== -1) {
		const p = parseInt(paramStr.slice(0, commaIdx).trim(), 10);
		const s = parseInt(paramStr.slice(commaIdx + 1).trim(), 10);
		if (!isNaN(p) && !isNaN(s)) {
			return { baseType, precision: p, scale: s };
		}
	}

	const n = parseInt(paramStr, 10);
	if (!isNaN(n)) {
		const textTypes = ['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR', 'BINARY', 'VARBINARY'];
		if (textTypes.includes(baseType)) {
			return { baseType, length: n };
		}
		return { baseType, precision: n };
	}

	return { baseType };
}

/**
 * Applies the comma-separated settings string to a column.
 * Handles: pk, increment, not null, unique, default: `...`, ref: > "..."."..."."..."
 */
function applyColumnSettings(col: Column, settings: string, table: Table): void {
	let pos = 0;
	const s = settings;

	while (pos < s.length) {
		// Skip leading whitespace and commas
		while (pos < s.length && (s[pos] === ',' || s[pos] === ' ' || s[pos] === '\t')) { pos++; }
		if (pos >= s.length) { break; }

		const rest = s.slice(pos);

		if (rest.startsWith('pk')) {
			col.isPrimaryKey = true;
			col.isNullable = false;
			if (!table.primaryKey) {
				table.primaryKey = { columns: [col.name] };
			} else if (!table.primaryKey.columns.includes(col.name)) {
				table.primaryKey.columns.push(col.name);
			}
			pos += 2;

		} else if (rest.startsWith('increment')) {
			col.defaultValue = 'IDENTITY';
			pos += 9;

		} else if (rest.startsWith('not null')) {
			col.isNullable = false;
			pos += 8;

		} else if (rest.startsWith('unique')) {
			col.isUniqueConstraint = true;
			if (!col.uniqueConstraintName) {
				col.uniqueConstraintName = `UQ_${table.name}_${col.name}`;
			}
			pos += 6;

		} else if (rest.startsWith('default:')) {
			pos += 8;
			while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) { pos++; }

			if (s[pos] === '`') {
				pos++;
				const end = s.indexOf('`', pos);
				if (end !== -1) {
					col.defaultValue = s.slice(pos, end);
					pos = end + 1;
				} else {
					col.defaultValue = s.slice(pos);
					pos = s.length;
				}
			} else if (s[pos] === "'") {
				pos++;
				const end = s.indexOf("'", pos);
				if (end !== -1) {
					col.defaultValue = s.slice(pos, end);
					pos = end + 1;
				} else {
					col.defaultValue = s.slice(pos);
					pos = s.length;
				}
			} else {
				const commaIdx = s.indexOf(',', pos);
				col.defaultValue = commaIdx !== -1 ? s.slice(pos, commaIdx).trim() : s.slice(pos).trim();
				pos = commaIdx !== -1 ? commaIdx : s.length;
			}

		} else if (rest.startsWith('ref:')) {
			pos += 4;
			while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) { pos++; }
			// Skip the relationship operator (>, <, -, <>)
			while (pos < s.length && ['<', '>', '-'].includes(s[pos])) { pos++; }
			while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) { pos++; }

			// Parse quoted identifiers: "a"."b"."c" or "a"."b"
			const parts: string[] = [];
			while (pos < s.length && s[pos] === '"') {
				pos++;
				const end = s.indexOf('"', pos);
				if (end === -1) { break; }
				parts.push(s.slice(pos, end));
				pos = end + 1;
				if (pos < s.length && s[pos] === '.') { pos++; } else { break; }
			}

			if (parts.length >= 3) {
				col.isForeignKey = true;
				col.foreignKeyRef = { schema: parts[0], table: parts[1], column: parts[2] };
			} else if (parts.length === 2) {
				col.isForeignKey = true;
				col.foreignKeyRef = { schema: 'dbo', table: parts[0], column: parts[1] };
			}

		} else {
			// Unknown or unrecognised setting — skip to next comma
			const commaIdx = s.indexOf(',', pos);
			pos = commaIdx !== -1 ? commaIdx + 1 : s.length;
		}
	}
}

/**
 * Parses a single line from an `indexes { }` block.
 * Formats: (col1, col2) [pk, name: '...'] or col1 [unique]
 */
function parseIndexLine(table: Table, line: string): void {
	const bracketPos = line.indexOf('[');
	let colsPart: string;
	let settingsStr: string | undefined;

	if (bracketPos !== -1) {
		colsPart = line.slice(0, bracketPos).trim();
		const closingPos = line.lastIndexOf(']');
		settingsStr = closingPos > bracketPos ? line.slice(bracketPos + 1, closingPos) : undefined;
	} else {
		colsPart = line.trim();
	}

	// Extract column names
	let columns: string[];
	if (colsPart.startsWith('(')) {
		const closeIdx = colsPart.lastIndexOf(')');
		const inner = colsPart.slice(1, closeIdx > 0 ? closeIdx : colsPart.length);
		columns = inner.split(',').map(c => c.trim()).filter(Boolean);
	} else {
		columns = colsPart.trim() ? [colsPart.trim()] : [];
	}

	if (columns.length === 0) { return; }

	let isPk = false;
	let isUnique = false;
	let isClustered = false;
	let name: string | undefined;

	if (settingsStr) {
		isPk = /\bpk\b/i.test(settingsStr);
		isUnique = /\bunique\b/i.test(settingsStr);
		isClustered = /\bclustered\b/i.test(settingsStr);
		const nameMatch = settingsStr.match(/name:\s*['"]([^'"]+)['"]/);
		if (nameMatch) { name = nameMatch[1]; }
	}

	if (isPk) {
		table.primaryKey = {
			name,
			columns,
			isClustered: isClustered || true, // default CLUSTERED
		};
		columns.forEach(colName => {
			const col = table.columns.find(c => c.name === colName);
			if (col) { col.isPrimaryKey = true; col.isNullable = false; }
		});
	} else if (isUnique) {
		if (columns.length === 1) {
			const col = table.columns.find(c => c.name.toLowerCase() === columns[0].toLowerCase());
			if (col) {
				col.isUniqueConstraint = true;
				if (name) { col.uniqueConstraintName = name; }
			}
		} else {
			if (!table.uniqueConstraints) { table.uniqueConstraints = []; }
			table.uniqueConstraints.push({
				name: name ?? `UQ_${table.name}_${columns.join('_')}`,
				columns,
			});
		}
	} else {
		if (!table.indexes) { table.indexes = []; }
		table.indexes.push({
			name: name ?? `IX_${table.name}_${columns.join('_')}`,
			columns,
			isClustered,
			isUnique: false,
		});
	}
}
