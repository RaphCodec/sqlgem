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
	x?: number;
	y?: number;
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
	isUnique?: boolean; // Column has UNIQUE constraint or is part of a unique index
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
