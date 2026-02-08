import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';
import { Table, Column } from '../types';

interface LayoutOptions {
	direction?: 'LR' | 'TB' | 'RL' | 'BT';
	nodeWidth?: number;
	nodeHeight?: number;
	nodeSep?: number;
	rankSep?: number;
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
	direction: 'LR',
	nodeWidth: 250,
	nodeHeight: 200,
	nodeSep: 80,
	rankSep: 150,
};

interface TableMetadata {
	table: Table;
	schemaName: string;
	isLookup: boolean;
	isJoinTable: boolean;
	hasSelfReference: boolean;
	outboundFKCount: number;
	inboundFKCount: number;
}

/**
 * Detect if a table is a lookup table
 * Criteria: Has PK, few columns (≤4), many inbound FKs
 */
function isLookupTable(table: Table, inboundFKCount: number): boolean {
	const hasPK = table.columns.some(c => c.isPrimaryKey);
	const columnCount = table.columns.length;
	const hasMinimalColumns = columnCount <= 4;
	const hasManyInbound = inboundFKCount >= 2;
	
	return hasPK && hasMinimalColumns && hasManyInbound;
}

/**
 * Detect if a table is a join table
 * Criteria: Has exactly 2 FKs, composite PK made of those FKs, few additional columns
 */
function isJoinTable(table: Table): boolean {
	const fkColumns = table.columns.filter(c => c.isForeignKey);
	const pkColumns = table.columns.filter(c => c.isPrimaryKey);
	
	// Must have exactly 2 FKs
	if (fkColumns.length !== 2) {
		return false;
	}
	
	// PKs should be the same as FKs (composite key from both FKs)
	const fkNames = new Set(fkColumns.map(c => c.name));
	const pkNames = new Set(pkColumns.map(c => c.name));
	const compositePKFromFKs = pkColumns.every(pk => fkNames.has(pk.name));
	
	// Few additional columns (max 1-2 extra)
	const extraColumns = table.columns.length - 2;
	
	return compositePKFromFKs && extraColumns <= 2;
}

/**
 * Check if table has self-referencing FK
 */
function hasSelfReference(table: Table, schemaName: string, tableName: string): boolean {
	return table.columns.some(c => 
		c.isForeignKey && 
		c.foreignKeyRef &&
		c.foreignKeyRef.schema === schemaName &&
		c.foreignKeyRef.table === tableName
	);
}

/**
 * Build metadata for each table
 */
function buildTableMetadata(nodes: Node[], edges: Edge[]): Map<string, TableMetadata> {
	const metadata = new Map<string, TableMetadata>();
	
	// Count inbound FKs for each table
	const inboundCounts = new Map<string, number>();
	edges.forEach(edge => {
		const count = inboundCounts.get(edge.target) || 0;
		inboundCounts.set(edge.target, count + 1);
	});
	
	// Count outbound FKs for each table
	const outboundCounts = new Map<string, number>();
	edges.forEach(edge => {
		const count = outboundCounts.get(edge.source) || 0;
		outboundCounts.set(edge.source, count + 1);
	});
	
	nodes.forEach(node => {
		const table = node.data.table as Table;
		const schemaName = node.data.schemaName as string;
		const inboundFKCount = inboundCounts.get(node.id) || 0;
		const outboundFKCount = outboundCounts.get(node.id) || 0;
		
		if (!table || !schemaName) {
			return;
		}
		
		metadata.set(node.id, {
			table,
			schemaName,
			isLookup: isLookupTable(table, inboundFKCount),
			isJoinTable: isJoinTable(table),
			hasSelfReference: hasSelfReference(table, schemaName, table.name),
			outboundFKCount,
			inboundFKCount,
		});
	});
	
	return metadata;
}

/**
 * Calculate auto layout positions for nodes using Dagre with enhanced heuristics
 */
export function calculateAutoLayout(
	nodes: Node[],
	edges: Edge[],
	options: LayoutOptions = {}
): Node[] {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	
	// Build table metadata
	const metadata = buildTableMetadata(nodes, edges);
	
	// Create a new directed graph
	const dagreGraph = new dagre.graphlib.Graph();
	dagreGraph.setDefaultEdgeLabel(() => ({}));
	
	// Adjust spacing for better layout
	let rankSep = opts.rankSep;
	
	// Increase rank separation for high fan-out scenarios
	const maxOutbound = Math.max(...Array.from(metadata.values()).map(m => m.outboundFKCount), 0);
	if (maxOutbound > 3) {
		rankSep = rankSep * 1.3; // Increase vertical spacing
	}
	
	// Set graph layout direction and spacing
	dagreGraph.setGraph({
		rankdir: opts.direction,
		nodesep: opts.nodeSep,
		ranksep: rankSep,
		marginx: 50,
		marginy: 50,
		ranker: 'network-simplex',
	});

	// Add nodes to the graph with adjusted dimensions
	nodes.forEach((node) => {
		const meta = metadata.get(node.id);
		let height = opts.nodeHeight;
		
		// Adjust height based on table size
		if (meta) {
			const baseHeight = 60;
			const rowHeight = 32;
			height = Math.max(baseHeight + (meta.table.columns.length * rowHeight), 100);
		}
		
		dagreGraph.setNode(node.id, {
			width: opts.nodeWidth,
			height: height,
		});
	});

	// Filter edges to remove self-references from layout
	const layoutEdges = edges.filter(edge => edge.source !== edge.target);
	
	// Add edges with weights
	layoutEdges.forEach((edge) => {
		const sourceMeta = metadata.get(edge.source);
		const targetMeta = metadata.get(edge.target);
		
		let weight = 1;
		
		if (sourceMeta?.isJoinTable || targetMeta?.isJoinTable) {
			weight = 3;
		}
		
		if (targetMeta?.isLookup) {
			weight = 2;
		}
		
		dagreGraph.setEdge(edge.source, edge.target, { weight });
	});

	// Calculate layout
	dagre.layout(dagreGraph);

	// Apply positions
	const layoutedNodes = nodes.map((node) => {
		const nodeWithPosition = dagreGraph.node(node.id);
		const meta = metadata.get(node.id);
		
		if (!meta) {
			return node;
		}
		
		const width = nodeWithPosition.width;
		const height = nodeWithPosition.height;
		
		let x = nodeWithPosition.x - width / 2;
		let y = nodeWithPosition.y - height / 2;
		
		// Special positioning for lookup tables
		if (meta.isLookup) {
			if (opts.direction === 'LR') {
				x = x - 100;
			} else if (opts.direction === 'TB') {
				y = y - 100;
			}
		}

		return {
			...node,
			position: { x, y },
		};
	});

	return layoutedNodes;
}

export function calculateNodeDimensions(table: { columns: any[] }): { width: number; height: number } {
	const baseWidth = 250;
	const baseHeight = 60;
	const rowHeight = 32;
	
	const height = baseHeight + (table.columns.length * rowHeight);
	
	return {
		width: baseWidth,
		height: Math.max(height, 100),
	};
}
