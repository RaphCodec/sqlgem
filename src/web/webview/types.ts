export interface Database {
	name: string;
	schemas: Schema[];
}

export interface Schema {
	name: string;
	tables: Table[];
}

export interface Table {
	name: string;
	columns: Column[];
	primaryKey?: {
		name?: string;
		columns: string[];
		isClustered?: boolean; // MSSQL: PK can be clustered or nonclustered
	};
	uniqueConstraints?: UniqueConstraint[];
	checkConstraints?: CheckConstraint[];
	indexes?: Index[];
	x?: number;
	y?: number;
}

export interface Index {
	name: string;
	columns: string[];
	isClustered: boolean;
	isUnique: boolean;
}

export interface UniqueConstraint {
	name: string;
	columns: string[];
}

export interface CheckConstraint {
    name: string;
    expression: string; // SQL expression for CHECK, e.g. "age >= 0"
}

export interface Column {
	name: string;
	type: string;
	length?: number;
	precision?: number;
	scale?: number;
	isPrimaryKey: boolean;
	isForeignKey: boolean;
	isNullable: boolean;
	isUniqueConstraint?: boolean; // Column is part of a UNIQUE constraint
	defaultValue?: string;
	foreignKeyRef?: {
		schema: string;
		table: string;
		column: string;
	};
	pkName?: string;
	fkConstraintName?: string;
	uniqueConstraintName?: string; // Name of UNIQUE constraint if applicable
}

export interface VSCodeAPI {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
}
