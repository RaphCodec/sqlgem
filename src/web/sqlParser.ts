/**
 * SQL Parser for SQLGem
 * Handles parsing of MSSQL statements including IF NOT EXISTS patterns
 */

export interface Column {
	name: string;
	type: string;
	length?: number;
	precision?: number;
	scale?: number;
	isPrimaryKey: boolean;
	isForeignKey: boolean;
	isNullable: boolean;
	isUnique?: boolean;
	defaultValue?: string;
	foreignKeyRef?: {
		schema: string;
		table: string;
		column: string;
	};
	pkName?: string;
	fkConstraintName?: string;
	uniqueConstraintName?: string;
}

export interface Table {
	name: string;
	columns: Column[];
	x?: number;
	y?: number;
}

export interface Schema {
	name: string;
	tables: Table[];
}

export interface Database {
	name: string;
	schemas: Schema[];
}

/**
 * Parse SQL content and extract database structure
 * Supports both regular CREATE statements and IF NOT EXISTS patterns
 */
export function parseSQLToDatabase(sqlContent: string, databaseName: string): Database {
	const db: Database = { name: databaseName, schemas: [] };

	// Helper to ensure schema exists
	const ensureSchema = (name: string): Schema => {
		let s = db.schemas.find(x => x.name === name);
		if (!s) {
			s = { name, tables: [] };
			db.schemas.push(s);
		}
		return s;
	};

	// Remove SQL comments
	let cleanSQL = sqlContent
		.replace(/--[^\r\n]*/g, '') // Single-line comments
		.replace(/\/\*[\s\S]*?\*\//g, ''); // Multi-line comments

	// Normalize MS SQL Server IF NOT EXISTS blocks wrapped in BEGIN...END
	// Transform: IF NOT EXISTS (...) BEGIN CREATE TABLE ... END -> CREATE TABLE IF NOT EXISTS ...
	cleanSQL = cleanSQL.replace(
		/IF\s+NOT\s+EXISTS\s*\([^)]+\)\s+BEGIN\s+(CREATE\s+TABLE\s+(?:\[?[^\]\s.]+\]?\.)?(?:\[?[^\]\s(]+\]?)\s*\([^)]+\))\s*;?\s*END/gi,
		(match, createStmt) => createStmt + ';'
	);

	// Also handle simpler IF NOT EXISTS patterns without sys.objects
	cleanSQL = cleanSQL.replace(
		/IF\s+NOT\s+EXISTS\s*\([^)]+\)\s+(CREATE\s+TABLE\s+[^;]+;)/gi,
		'$1'
	);

	// Parse CREATE SCHEMA statements (both regular and IF NOT EXISTS patterns)
	const schemaRe = /(?:CREATE\s+SCHEMA\s+\[?([^\]\s]+)\]?|EXEC\s*\(\s*'CREATE\s+SCHEMA\s+\[?([^\]']+)\]?)/gi;
	let schemaMatch;
	while ((schemaMatch = schemaRe.exec(cleanSQL)) !== null) {
		const schemaName = schemaMatch[1] || schemaMatch[2];
		if (schemaName) {
			ensureSchema(schemaName);
		}
	}

	// Parse CREATE TABLE blocks (handles both regular and IF NOT EXISTS)
	// Pattern: CREATE TABLE [IF NOT EXISTS] [schema].[table] (...) or schema.table (...)
	// Updated to handle nested parentheses in column definitions more robustly
	const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\[?([^\]\s.]+)\]?\.)?(?:\[?([^\]\s(]+)\]?)\s*\(([\s\S]*?)\)\s*;/gi;
	let ctMatch;
	while ((ctMatch = createTableRe.exec(cleanSQL)) !== null) {
		const schemaName = ctMatch[1] || 'dbo';
		const tableName = ctMatch[2];
		const colsBlock = ctMatch[3];

		const schema = ensureSchema(schemaName);
		const columns: Column[] = [];

		// Split by commas that are not inside parentheses
		let depth = 0;
		let currentCol = '';
		const colLines: string[] = [];

		for (let i = 0; i < colsBlock.length; i++) {
			const char = colsBlock[i];
			if (char === '(') depth++;
			else if (char === ')') depth--;
			else if (char === ',' && depth === 0) {
				colLines.push(currentCol.trim());
				currentCol = '';
				continue;
			}
			currentCol += char;
		}
		if (currentCol.trim()) colLines.push(currentCol.trim());

		let foundPKConstraint = false;
		let pkConstraintName = '';
		const pkColumns: string[] = [];
		
		// Store UNIQUE constraint info to apply after column parsing
		const uniqueConstraints: Array<{
			constraintName: string;
			columns: string[];
		}> = [];
		
		// Store FK constraint info to apply after column parsing
		const fkConstraints: Array<{
			constraintName: string;
			sourceColumn: string;
			targetSchema: string;
			targetTable: string;
			targetColumn: string;
		}> = [];

		for (let line of colLines) {
			line = line.trim();
			if (!line) continue;

			// Check for PRIMARY KEY constraint definition
			const pkConstraintMatch = /CONSTRAINT\s+\[?([^\]\s]+)\]?\s+PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(line);
			if (pkConstraintMatch) {
				foundPKConstraint = true;
				pkConstraintName = pkConstraintMatch[1];
				const pkCols = pkConstraintMatch[2].split(',').map(c => c.trim().replace(/[\[\]]/g, ''));
				pkColumns.push(...pkCols);
				continue;
			}

			// Check for FOREIGN KEY constraint definition inside CREATE TABLE
			const fkConstraintMatch = /CONSTRAINT\s+\[?([^\]\s]+)\]?\s+FOREIGN\s+KEY\s*\(\s*\[?([^\]\s,]+)\]?\s*\)\s*REFERENCES\s+(?:\[?([^\]\s.]+)\]?\.)?(?:\[?([^\]\s(]+)\]?)\s*\(\s*\[?([^\]\s)]+)\]?\s*\)/i.exec(line);
			if (fkConstraintMatch) {
				fkConstraints.push({
					constraintName: fkConstraintMatch[1],
					sourceColumn: fkConstraintMatch[2],
					targetSchema: fkConstraintMatch[3] || 'dbo',
					targetTable: fkConstraintMatch[4],
					targetColumn: fkConstraintMatch[5]
				});
				continue;
			}

			// Check for UNIQUE constraint definition
			const uniqueConstraintMatch = /CONSTRAINT\s+\[?([^\]\s]+)\]?\s+UNIQUE\s*\(([^)]+)\)/i.exec(line);
			if (uniqueConstraintMatch) {
				const uniqueCols = uniqueConstraintMatch[2].split(',').map(c => c.trim().replace(/[\[\]]/g, ''));
				uniqueConstraints.push({
					constraintName: uniqueConstraintMatch[1],
					columns: uniqueCols
				});
				continue;
			}

			// Skip any remaining CONSTRAINT definitions (CHECK, etc.)
			if (/^\s*CONSTRAINT\s+/i.test(line)) {
				continue;
			}

			// Parse column definition
			// Enhanced to handle IDENTITY, UNIQUEIDENTIFIER, and various type patterns
			const colMatch = /^\[?([^\]\s]+)\]?\s+([A-Z0-9]+(?:\s*\([^)]+\))?(?:\s+IDENTITY\s*\([^)]+\))?)([\s\S]*)$/i.exec(line);
			if (!colMatch) continue;

			const colName = colMatch[1];
			let colTypeRaw = colMatch[2].trim();
			const rest = colMatch[3] || '';

			// Handle IDENTITY columns - strip IDENTITY for type extraction
			const isIdentity = /IDENTITY\s*\([^)]+\)/i.test(colTypeRaw);
			colTypeRaw = colTypeRaw.replace(/\s+IDENTITY\s*\([^)]+\)/i, '');

			// Parse type with length/precision/scale
			// Support various types: INT, BIGINT, VARCHAR(n), NVARCHAR(n), DECIMAL(p,s), UNIQUEIDENTIFIER, DATETIME2, etc.
			const typeMatch = /^([A-Z0-9]+)(?:\s*\((\d+)(?:\s*,\s*(\d+))?\))?/i.exec(colTypeRaw);
			const baseType = typeMatch ? typeMatch[1].toUpperCase() : colTypeRaw.toUpperCase();
			const length = typeMatch && typeMatch[2] ? parseInt(typeMatch[2]) : undefined;
			const scale = typeMatch && typeMatch[3] ? parseInt(typeMatch[3]) : undefined;

			const isPK = /PRIMARY\s+KEY/i.test(rest) || pkColumns.includes(colName);
			const isNotNull = /NOT\s+NULL/i.test(rest);
			const isNullable = !isNotNull && !isPK;
			
			// Check for inline UNIQUE constraint
			const hasInlineUnique = /\bUNIQUE\b/i.test(rest);

			// Extract default value - handles both simple values and function calls
			const defaultMatch = /DEFAULT\s+([^\s,]+(?:\s*\([^)]*\))?)/i.exec(rest);
			let defaultValue = defaultMatch ? defaultMatch[1].trim() : undefined;
			
			// For IDENTITY columns, set a default placeholder if no explicit default
			if (isIdentity && !defaultValue) {
				defaultValue = 'IDENTITY';
			}

		// Check for inline REFERENCES (e.g., REFERENCES schema.table(column))
		const inlineRefMatch = /REFERENCES\s+(?:\[?([^\]\s.]+)\]?\.)?(?:\[?([^\]\s(]+)\]?)\s*\(\s*\[?([^\]\s)]+)\]?\s*\)/i.exec(rest);
		let foreignKeyRef = undefined;
		let isForeignKey = false;
		if (inlineRefMatch) {
			const refSchema = inlineRefMatch[1] || 'dbo';
			const refTable = inlineRefMatch[2];
			const refColumn = inlineRefMatch[3];
			foreignKeyRef = { schema: refSchema, table: refTable, column: refColumn };
			isForeignKey = true;
		}

		columns.push({
			name: colName,
			type: baseType,
			length: length,
			precision: length,
			scale: scale,
			isPrimaryKey: isPK,
			isForeignKey: isForeignKey,
			isNullable: isNullable,
			isUnique: hasInlineUnique,
			defaultValue: defaultValue,
			pkName: isPK && foundPKConstraint ? pkConstraintName : undefined,
			foreignKeyRef: foreignKeyRef,
			});
		}

		// Apply UNIQUE constraints from CONSTRAINT definitions to columns
		for (const uc of uniqueConstraints) {
			for (const colName of uc.columns) {
				const col = columns.find(c => c.name === colName);
				if (col) {
					col.isUnique = true;
					col.uniqueConstraintName = uc.constraintName;
				}
			}
		}
		
		// Apply FK constraints from CONSTRAINT definitions to columns
		for (const fk of fkConstraints) {
			const col = columns.find(c => c.name === fk.sourceColumn);
			if (col) {
				col.isForeignKey = true;
				col.foreignKeyRef = {
					schema: fk.targetSchema,
					table: fk.targetTable,
					column: fk.targetColumn
				};
				col.fkConstraintName = fk.constraintName;
			}
		}

		schema.tables.push({ name: tableName, columns });
	}

	// Parse ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES ...
	// This handles explicit FK constraints (and updates inline references with constraint names)
	const fkRe = /ALTER\s+TABLE\s+(?:\[?([^\]\s.]+)\]?\.)?(?:\[?([^\]\s]+)\]?)\s+ADD\s+CONSTRAINT\s+\[?([^\]\s]+)\]?[\s\S]*?FOREIGN\s+KEY\s*\(\s*\[?([^\]\s,]+)\]?\s*\)\s*REFERENCES\s+(?:\[?([^\]\s.]+)\]?\.)?(?:\[?([^\]\s]+)\]?)\s*\(\s*\[?([^\]\s,]+)\]?\s*\)/gi;
	let fkMatch;
	while ((fkMatch = fkRe.exec(cleanSQL)) !== null) {
		const srcSchema = fkMatch[1] || 'dbo';
		const srcTable = fkMatch[2];
		const constraintName = fkMatch[3];
		const srcCol = fkMatch[4];
		const refSchema = fkMatch[5] || 'dbo';
		const refTable = fkMatch[6];
		const refCol = fkMatch[7];

		const s = db.schemas.find(x => x.name === srcSchema);
		if (!s) continue;
		const t = s.tables.find(x => x.name === srcTable);
		if (!t) continue;
		const c = t.columns.find(x => x.name === srcCol);
		if (!c) continue;
		
		// Set or update FK info (might already exist from inline REFERENCES)
		c.isForeignKey = true;
		c.foreignKeyRef = { schema: refSchema, table: refTable, column: refCol };
		if (constraintName && !c.fkConstraintName) {
			c.fkConstraintName = constraintName;
		}
	}

	// Ensure all referenced tables have their referenced columns marked as potential PKs
	// Also auto-generate FK constraint names for inline references without explicit names
	db.schemas.forEach(schema => {
		schema.tables.forEach(table => {
			table.columns.forEach(col => {
				if (col.foreignKeyRef) {
					// Auto-generate FK constraint name if not set
					if (!col.fkConstraintName) {
						col.fkConstraintName = `FK_${table.name}_${col.name}`;
					}
					
					// Mark referenced column as PK if not already marked
					const refSchema = db.schemas.find(s => s.name === col.foreignKeyRef!.schema);
					if (refSchema) {
						const refTable = refSchema.tables.find(t => t.name === col.foreignKeyRef!.table);
						if (refTable) {
							const refCol = refTable.columns.find(c => c.name === col.foreignKeyRef!.column);
							if (refCol && !refCol.isPrimaryKey) {
								// Mark as primary key if not already marked
								refCol.isPrimaryKey = true;
							}
						}
					}
				}
			});
		});
	});

	return db;
}
