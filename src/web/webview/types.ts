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
	isPrimaryKey: boolean;
	isForeignKey: boolean;
	isNullable: boolean;
	foreignKeyRef?: {
		schema: string;
		table: string;
		column: string;
	};
}

export interface VSCodeAPI {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
}
