import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
	FluentProvider,
	webLightTheme,
	webDarkTheme,
	Button,
	Input,
	Label,
	Dialog,
	DialogTrigger,
	DialogSurface,
	DialogTitle,
	DialogBody,
	DialogActions,
	DialogContent,
	Select,
	Checkbox,
	makeStyles,
	tokens,
	Menu,
	MenuTrigger,
	MenuPopover,
	MenuList,
	MenuItem,
} from '@fluentui/react-components';
import {
	AddRegular,
	DatabaseRegular,
	TableRegular,
	WeatherMoonRegular,
	WeatherSunnyRegular,
	SaveRegular,
	DocumentTextRegular,
	OrganizationRegular,
	TagRegular,
} from '@fluentui/react-icons';
import {
	ReactFlow,
	Background,
	Controls,
	MiniMap,
	Node,
	Edge,
	Connection,
	useNodesState,
	useEdgesState,
	addEdge,
	useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Database, Schema, Table, Column, VSCodeAPI } from './types';
import TableNode from './components/TableNode';
import { TableEditorSidebar } from './components/TableEditorSidebar';
import { SchemaFilterPanel } from './components/SchemaFilterPanel';
import { calculateAutoLayout } from './utils/autoLayout';

declare const acquireVsCodeApi: () => VSCodeAPI;
const vscode = acquireVsCodeApi();

const useStyles = makeStyles({
	app: {
		width: '100vw',
		height: '100vh',
		display: 'flex',
		flexDirection: 'column',
	},
	toolbar: {
		display: 'flex',
		gap: tokens.spacingHorizontalXS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorNeutralBackground1,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		alignItems: 'center',
		boxShadow: tokens.shadow4,
	},
	dbInfo: {
		marginLeft: 'auto',
		fontWeight: tokens.fontWeightSemibold,
		color: tokens.colorNeutralForeground2,
	},
	canvas: {
		flex: 1,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	previewDialog: {
		width: '80vw',
		maxWidth: '1200px',
	},
	previewContent: {
		minHeight: '400px',
		maxHeight: '70vh',
		overflowY: 'auto',
	},
	sqlPreview: {
		fontFamily: 'monospace',
		whiteSpace: 'pre-wrap',
		backgroundColor: tokens.colorNeutralBackground3,
		padding: tokens.spacingVerticalM,
		borderRadius: tokens.borderRadiusMedium,
		fontSize: tokens.fontSizeBase200,
	},
	formGroup: {
		marginBottom: tokens.spacingVerticalM,
	},
	columnsList: {
		maxHeight: '300px',
		overflowY: 'auto',
		marginBottom: tokens.spacingVerticalM,
	},
	columnItem: {
		display: 'flex',
		gap: tokens.spacingHorizontalS,
		marginBottom: tokens.spacingVerticalS,
		padding: tokens.spacingVerticalS,
		backgroundColor: tokens.colorNeutralBackground3,
		borderRadius: tokens.borderRadiusMedium,
		alignItems: 'center',
	},
	columnItemInput: {
		flex: 1,
	},
});

// Memoize nodeTypes outside component to prevent recreation
const nodeTypes = {
	tableNode: TableNode,
};

export const App: React.FC = () => {
	const styles = useStyles();
	const { fitView } = useReactFlow();
	const [isDarkMode, setIsDarkMode] = useState(() => {
		return localStorage.getItem('sqlgem-dark-mode') === 'true';
	});
	const [showFKNames, setShowFKNames] = useState(() => {
		return localStorage.getItem('sqlgem-show-fk-names') === 'true';
	});
	const [useIfNotExists, setUseIfNotExists] = useState(() => {
		return localStorage.getItem('sqlgem-use-if-not-exists') === 'true';
	});
	const [currentDatabase, setCurrentDatabase] = useState<Database | null>(null);
	const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
	const [visibleSchemas, setVisibleSchemas] = useState<Set<string>>(() => {
		const saved = localStorage.getItem('sqlgem-visible-schemas');
		return saved ? new Set(JSON.parse(saved)) : new Set(['dbo']);
	});
	const debounceTimerRef = useRef<number | null>(null);

	// Dialog states
	const [newDbDialogOpen, setNewDbDialogOpen] = useState(false);
	const [addSchemaDialogOpen, setAddSchemaDialogOpen] = useState(false);
	const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

	// Sidebar state
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [sidebarMode, setSidebarMode] = useState<'add' | 'edit'>('edit');
	const [editingTable, setEditingTable] = useState<{ schema: string; table: Table } | null>(null);

	// SQL Preview state
	const [previewSQL, setPreviewSQL] = useState('');

	// Form states
	const [dbName, setDbName] = useState('');
	const [schemaName, setSchemaName] = useState('');

	// Track if initial auto-layout has been applied
	const initialLayoutApplied = useRef(false);

	// Extract schema names from database
	const availableSchemas = React.useMemo(() => {
		if (!currentDatabase) return [];
		return currentDatabase.schemas.map(s => s.name).sort();
	}, [currentDatabase]);

	// Get default schema
	const defaultSchema = React.useMemo(() => {
		if (!currentDatabase || currentDatabase.schemas.length === 0) return 'dbo';
		// Check if 'dbo' exists, otherwise return first schema
		return currentDatabase.schemas.some(s => s.name === 'dbo') 
			? 'dbo' 
			: currentDatabase.schemas[0].name;
	}, [currentDatabase]);

	// Update node and edge visibility using hidden property (no re-render)
	useEffect(() => {
		console.log('[Webview] Updating visibility for schemas:', Array.from(visibleSchemas));
		
		// Update nodes with hidden property instead of filtering
		setNodes((nds) => 
			nds.map((node) => {
				const schemaName = node.id.split('.')[0];
				const isHidden = !visibleSchemas.has(schemaName);
				// Only update if hidden state changed
				if (node.hidden !== isHidden) {
					return { ...node, hidden: isHidden };
				}
				return node;
			})
		);

		// Update edges with hidden property
		setEdges((eds) => 
			eds.map((edge) => {
				const sourceSchema = edge.source.split('.')[0];
				const targetSchema = edge.target.split('.')[0];
				const isHidden = !visibleSchemas.has(sourceSchema) || !visibleSchemas.has(targetSchema);
				// Only update if hidden state changed
				if (edge.hidden !== isHidden) {
					return { ...edge, hidden: isHidden };
				}
				return edge;
			})
		);
	}, [visibleSchemas, setNodes, setEdges]);

	// Apply theme-aware styles for React Flow controls
	useEffect(() => {
		const styleId = 'react-flow-theme-styles';
		let styleElement = document.getElementById(styleId) as HTMLStyleElement;
		
		if (!styleElement) {
			styleElement = document.createElement('style');
			styleElement.id = styleId;
			document.head.appendChild(styleElement);
		}

		const styles = isDarkMode ? `
			.react-flow__controls button {
				background-color: #1e1e1e !important;
				border-color: #3e3e3e !important;
				color: #fff !important;
			}
			.react-flow__controls button:hover {
				background-color: #2a2a2a !important;
			}
			.react-flow__controls button path {
				fill: #fff !important;
			}
		` : `
			.react-flow__controls button {
				background-color: #fff !important;
				border-color: #ddd !important;
				color: #333 !important;
			}
			.react-flow__controls button:hover {
				background-color: #f5f5f5 !important;
			}
			.react-flow__controls button path {
				fill: #333 !important;
			}
		`;

		styleElement.textContent = styles;
	}, [isDarkMode]);

	const handleEditTable = useCallback((schemaName: string, table: Table) => {
		setEditingTable({ schema: schemaName, table });
		setSidebarMode('edit');
		setSidebarOpen(true);
	}, []);

	const handleAddTable = useCallback((schemaName: string) => {
		const newTable: Table = {
			name: 'NewTable',
			columns: [
				{ name: 'Id', type: 'INT', isPrimaryKey: true, isForeignKey: false, isNullable: false },
			],
		};
		setEditingTable({ schema: schemaName, table: newTable });
		setSidebarMode('add');
		setSidebarOpen(true);
	}, []);

	const handleSaveTable = useCallback((schemaName: string, oldTableName: string, updatedTable: Table) => {
		if (sidebarMode === 'add') {
			vscode.postMessage({
				command: 'addTable',
				schemaName,
				table: updatedTable,
			});
		} else {
			vscode.postMessage({
				command: 'updateTable',
				schemaName,
				oldTableName,
				table: updatedTable,
			});
		}
	}, [sidebarMode]);

	const handleDeleteTable = useCallback((schemaName: string, tableName: string) => {
		vscode.postMessage({
			command: 'deleteTable',
			schemaName,
			tableName,
		});
		// Close sidebar and clear editing state
		setSidebarOpen(false);
		setEditingTable(null);
	}, []);

	const getAllTablesForFKReferences = useCallback(() => {
		if (!currentDatabase) return [];
		return currentDatabase.schemas
			.filter(s => s && s.tables)
			.flatMap(s => 
				s.tables
					.filter(t => t && t.columns)
					.map(t => ({
						schema: s.name,
						table: t.name,
						columns: t.columns,
					}))
			);
	}, [currentDatabase]);

	const handleSaveDatabase = () => {
		vscode.postMessage({ command: 'saveDatabase', useIfNotExists: useIfNotExists });
	};

	const handlePreviewSQL = () => {
		vscode.postMessage({ command: 'previewSQL', useIfNotExists: useIfNotExists });
	};

	const updateNodesFromDatabase = useCallback((database: Database | null) => {
		console.log('[Webview] updateNodesFromDatabase called with:', database);
		
		if (!database) {
			console.log('[Webview] No database, clearing nodes/edges');
			setNodes([]);
			setEdges([]);
			return;
		}

		// Ensure column flags are synced with table-level constraints
		// This is critical for proper icon display and UI state
		database.schemas.forEach(schema => {
			schema.tables.forEach(table => {
				// Sync PRIMARY KEY: if table.primaryKey exists, ensure columns have isPrimaryKey = true
				if (table.primaryKey && table.primaryKey.columns) {
					table.primaryKey.columns.forEach(pkColName => {
						const col = table.columns.find(c => c.name === pkColName);
						if (col && !col.isPrimaryKey) {
							col.isPrimaryKey = true;
							// Also set pkName if not already set
							if (!col.pkName && table.primaryKey!.name) {
								col.pkName = table.primaryKey!.name;
							}
						}
					});
				}

				// Sync UNIQUE CONSTRAINTS: if table.uniqueConstraints exists, ensure columns have isUniqueConstraint = true
				if (table.uniqueConstraints) {
					table.uniqueConstraints.forEach(uc => {
						uc.columns.forEach(ucColName => {
							const col = table.columns.find(c => c.name === ucColName);
							if (col && !col.isUniqueConstraint) {
								col.isUniqueConstraint = true;
								// Also set uniqueConstraintName if not already set
								if (!col.uniqueConstraintName) {
									col.uniqueConstraintName = uc.name;
								}
							}
						});
					});
				}
			});
		});

		console.log('[Webview] Processing database:', database.name);
		console.log('[Webview] Number of schemas:', database.schemas?.length);

		const newNodes: Node[] = [];
		const newEdges: Edge[] = [];
		let yOffset = 50;

		database.schemas.forEach((schema) => {
			console.log(`[Webview] Processing schema: ${schema.name}, tables: ${schema.tables?.length}`);
			if (!schema || !schema.tables) return;
			let xOffset = 50;
			schema.tables.forEach((table) => {
				console.log(`[Webview]   Processing table: ${table.name}, columns: ${table.columns?.length}`);
				if (!table || !table.name || !table.columns) return;

				const nodeId = `${schema.name}.${table.name}`;
				// Check if node should be hidden based on current visible schemas
				const isHidden = !visibleSchemas.has(schema.name);
				
				newNodes.push({
					id: nodeId,
					type: 'tableNode',
					position: { x: table.x || xOffset, y: table.y || yOffset },
					hidden: isHidden,
					data: {
						schemaName: schema.name,
						table: table,
						onEdit: handleEditTable,
						onDelete: handleDeleteTable,
					},
				});
				console.log(`[Webview]     Created node: ${nodeId} at (${table.x || xOffset}, ${table.y || yOffset}), hidden: ${isHidden}`);

				// Create edges for foreign keys
				table.columns.forEach((col) => {
					if (col.isForeignKey && col.foreignKeyRef && col.foreignKeyRef.schema && col.foreignKeyRef.table && col.foreignKeyRef.column) {
						const sourceId = `${schema.name}.${table.name}`;
						const targetId = `${col.foreignKeyRef.schema}.${col.foreignKeyRef.table}`;
						const isSelfReference = sourceId === targetId;
						
					// Generate FK label: show constraint name when toggle is on, nothing when off
					const fkLabel = showFKNames 
						? (col.fkConstraintName || `FK_${table.name}_${col.name}`)
						: undefined;
					
					// Check if edge should be hidden
					const edgeHidden = !visibleSchemas.has(schema.name) || !visibleSchemas.has(col.foreignKeyRef.schema);
					
					newEdges.push({
						id: `${sourceId}-${col.name}-${targetId}`,
						source: sourceId,
						target: targetId,
						sourceHandle: `${sourceId}-${col.name}-source`,
						targetHandle: `${targetId}-${col.foreignKeyRef.column}-target`,
						label: fkLabel,
						hidden: edgeHidden,
						type: isSelfReference ? 'default' : 'smoothstep',
						animated: true,
						style: isSelfReference 
							? { stroke: '#007acc', strokeWidth: 2, strokeDasharray: '5,5' }
							: { stroke: '#007acc', strokeWidth: 2 },
						...(isSelfReference && {
							// Loop back with offset for self-references
							markerEnd: {
								type: 'arrowclosed',
								color: '#007acc',
							},
						}),
					});
					console.log(`[Webview]       Created FK edge: ${sourceId} -> ${targetId}, hidden: ${edgeHidden}`);
					}
				});

				xOffset += 300;
			});
			yOffset += 350;
		});

		console.log(`[Webview] Total nodes created: ${newNodes.length}`);
		console.log(`[Webview] Total edges created: ${newEdges.length}`);
		
		// Set nodes and edges directly
		setNodes(newNodes);
		setEdges(newEdges);
	}, [visibleSchemas, handleEditTable, handleDeleteTable, showFKNames, setNodes, setEdges]);

	useEffect(() => {
		console.log('[Webview] Mounted, requesting database state');
		vscode.postMessage({ command: 'getDatabaseState' });

		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			console.log('[Webview] Received message:', message.command, message);
			
			if (message.command === 'updateDatabase') {
				console.log('[Webview] Database received:', message.database);
				if (message.database) {
					console.log('[Webview] Schemas:', message.database.schemas?.length);
					message.database.schemas?.forEach((schema: any) => {
						console.log(`[Webview]   Schema: ${schema.name}, Tables: ${schema.tables?.length}`);
					});
				}
				// Reset layout flag to trigger auto-layout on database load
				initialLayoutApplied.current = false;
				setCurrentDatabase(message.database);
				updateNodesFromDatabase(message.database);
			} else if (message.command === 'showSQLPreview') {
				setPreviewSQL(message.sql);
				setPreviewDialogOpen(true);
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [updateNodesFromDatabase]);

	// Auto-layout on initial diagram load
	useEffect(() => {
		if (!initialLayoutApplied.current && nodes.length > 0 && currentDatabase) {
			initialLayoutApplied.current = true;
			
			// Calculate new positions using Dagre
			const layoutedNodes = calculateAutoLayout(nodes, edges, {
				direction: 'LR',
				nodeSep: 80,
				rankSep: 150,
			});

			// Update nodes with new positions
			setNodes(layoutedNodes);

			// Fit view after layout with padding
			setTimeout(() => {
				(fitView as any)({ padding: 0.2, duration: 300 });
			}, 50);
		}
	}, [nodes, edges, currentDatabase, setNodes, fitView]);

	/**
	 * Handle-agnostic, bidirectional FK creation callback
	 * 
	 * Features:
	 * - Works regardless of drag direction (source→target or target→source)
	 * - Works regardless of handle side (left or right)
	 * - Automatically detects which column should be FK vs referenced based on PK/UNIQUE constraints
	 * - Enforces MSSQL foreign key rules
	 * - Validates data type compatibility
	 * - Prevents duplicate and circular foreign keys
	 * 
	 * Logic:
	 * 1. Parse both handle IDs to extract schema.table.column info
	 * 2. Check which column has PK or UNIQUE constraint
	 * 3. Auto-assign FK role: column with PK/UNIQUE becomes referenced, other becomes FK
	 * 4. Validate: exactly one must be PK/UNIQUE, types must match, no duplicates
	 * 5. Create FK with auto-generated constraint name
	 * 
	 * This ensures users never need to worry about connection direction - they can
	 * simply drag from any column handle to any other, and the system determines
	 * the correct FK relationship automatically.
	 */
	const onConnect = useCallback(
		(connection: Connection) => {
			if (!currentDatabase) {
				console.log('[FK Creation] No database available');
				return;
			}

			// Parse handle: "schema.table-column-source/target"
			const sourceHandle = connection.sourceHandle;
			const targetHandle = connection.targetHandle;
			// Extract schema, table, and column from handles
			const parseHandle = (handle: string): { schema: string; table: string; column: string } | null => {
				const parts = handle.split('-');
				if (parts.length < 3) return null;
				
				const schemaTable = parts[0];
				const column = parts.slice(1, -1).join('-'); // Handle columns with hyphens
				
				const schemaParts = schemaTable.split('.');
				if (schemaParts.length < 2) return null;
				
				const schema = schemaParts[0];
				const table = schemaParts.slice(1).join('.'); // Handle tables with dots
				
				return { schema, table, column };
			};

			// Note: We intentionally call them "side1" and "side2" instead of "source" and "target"
			// because we don't yet know which will be the FK and which will be referenced.
			// The system determines direction based on PK/UNIQUE constraints, not drag direction.
			if (!sourceHandle || !targetHandle) {
				console.log('[FK Creation] Missing handle IDs');
				return;
			}
			
			const side1 = parseHandle(sourceHandle);
			const side2 = parseHandle(targetHandle);

			if (!side1 || !side2) {
				console.log('[FK Creation] Invalid handle format');
				vscode.postMessage({ 
					command: 'showError', 
					text: 'Invalid connection handles' 
				});
				return;
			}

			console.log('[FK Creation] Side 1 (drag source):', side1);
			console.log('[FK Creation] Side 2 (drag target):', side2);

			// Find schemas and tables for both sides
			const schema1 = currentDatabase.schemas.find(s => s.name === side1.schema);
			const schema2 = currentDatabase.schemas.find(s => s.name === side2.schema);

			if (!schema1 || !schema2) {
				console.log('[FK Creation] Schema not found');
				vscode.postMessage({ 
					command: 'showError', 
					text: 'Schema not found' 
				});
				return;
			}

			const table1 = schema1.tables.find(t => t.name === side1.table);
			const table2 = schema2.tables.find(t => t.name === side2.table);

			if (!table1 || !table2) {
				console.log('[FK Creation] Table not found');
				vscode.postMessage({ 
					command: 'showError', 
					text: 'Table not found' 
				});
				return;
			}

			const column1 = table1.columns.find(c => c.name === side1.column);
			const column2 = table2.columns.find(c => c.name === side2.column);

			if (!column1 || !column2) {
				console.log('[FK Creation] Column not found');
				vscode.postMessage({ 
					command: 'showError', 
					text: 'Column not found' 
				});
				return;
			}

			// Helper function: Check if column is referenceable (PK, UNIQUE, or part of unique constraint/index)
			const isColumnReferenceable = (column: Column, table: Table): boolean => {
				// Check column-level PK or UNIQUE constraint
				if (column.isPrimaryKey || column.isUniqueConstraint === true) {
					return true;
				}

				// Check if column is part of table-level primary key
				if (table.primaryKey && table.primaryKey.columns.includes(column.name)) {
					return true;
				}

				// Check if column is part of a unique constraint
				if (table.uniqueConstraints) {
					for (const uc of table.uniqueConstraints) {
						if (uc.columns.length === 1 && uc.columns.includes(column.name)) {
							return true;
						}
					}
				}

				// Check if column is part of a unique index (single-column)
				if (table.indexes) {
					for (const idx of table.indexes) {
						if (idx.isUnique && idx.columns.length === 1 && idx.columns.includes(column.name)) {
							return true;
						}
					}
				}

				return false;
			};

			// Check which columns are PK/UNIQUE (referenced columns must have unique constraint)
			const column1IsPKOrUnique = isColumnReferenceable(column1, table1);
			const column2IsPKOrUnique = isColumnReferenceable(column2, table2);

			console.log('[FK Creation] Column 1 PK/UNIQUE:', column1IsPKOrUnique, `(PK: ${column1.isPrimaryKey}, UNIQUE: ${column1.isUniqueConstraint})`);
			console.log('[FK Creation] Column 2 PK/UNIQUE:', column2IsPKOrUnique, `(PK: ${column2.isPrimaryKey}, UNIQUE: ${column2.isUniqueConstraint})`);

			// ========================================================================
			// MSSQL VALIDATION: Exactly one side must be PK or UNIQUE
			// This ensures referential integrity - FK must point to a unique column
			// ========================================================================
			
			if (!column1IsPKOrUnique && !column2IsPKOrUnique) {
				console.log('[FK Creation] Neither column is PK or UNIQUE');
				vscode.postMessage({ 
					command: 'showError', 
					text: 'One column must be PRIMARY KEY or UNIQUE. Referenced column must have a unique constraint.' 
				});
				return;
			}

			if (column1IsPKOrUnique && column2IsPKOrUnique) {
				console.log('[FK Creation] Both columns are PK or UNIQUE');
				vscode.postMessage({ 
					command: 'showError', 
					text: 'Ambiguous relationship: only one column may be the referenced key. Both columns are PRIMARY KEY or UNIQUE.' 
				});
				return;
			}

			// ========================================================================
			// INTELLIGENT DIRECTION DETECTION
			// This is the core of handle-agnostic FK creation.
			// Regardless of which handle the user dragged from or to, we determine
			// the correct FK direction based solely on column constraints.
			// ========================================================================
			
			let fkColumn: Column;
			let fkSide: { schema: string; table: string; column: string };
			let fkTable: Table;
			let refColumn: Column;
			let refSide: { schema: string; table: string; column: string };
			let refTable: Table;

			if (column1IsPKOrUnique) {
				// Column 1 has PK/UNIQUE → it's the referenced column
				// Column 2 is the foreign key column
				refSide = side1;
				refTable = table1;
				refColumn = column1;
				
				fkSide = side2;
				fkTable = table2;
				fkColumn = column2;
			} else {
				// Column 2 has PK/UNIQUE → it's the referenced column
				// Column 1 is the foreign key column
				refSide = side2;
				refTable = table2;
				refColumn = column2;
				
				fkSide = side1;
				fkTable = table1;
				fkColumn = column1;
			}

			// Direction has been intelligently determined - drag direction is now irrelevant
			console.log('[FK Creation] ✓ Direction auto-detected (handle-agnostic):', {
				fk: `${fkSide.schema}.${fkSide.table}.${fkSide.column}`,
				references: `${refSide.schema}.${refSide.table}.${refSide.column}`,
				basis: column1IsPKOrUnique ? 'side1 has PK/UNIQUE' : 'side2 has PK/UNIQUE'
			});

			// Validation: Check if FK column already has a FK
			if (fkColumn.isForeignKey) {
				// Check if it's the same relationship
				if (fkColumn.foreignKeyRef && 
					fkColumn.foreignKeyRef.schema === refSide.schema &&
					fkColumn.foreignKeyRef.table === refSide.table &&
					fkColumn.foreignKeyRef.column === refSide.column) {
					console.log('[FK Creation] Duplicate FK relationship');
					vscode.postMessage({ 
						command: 'showError', 
						text: `Foreign key already exists between ${fkSide.table}.${fkSide.column} and ${refSide.table}.${refSide.column}` 
					});
					return;
				}
				console.log('[FK Creation] FK column already has FK to different table');
				vscode.postMessage({ 
					command: 'showError', 
					text: `Column "${fkColumn.name}" already has a foreign key constraint. Remove the existing FK first.` 
				});
				return;
			}

			// Additional validation: Check if referenced column has a FK pointing back (prevent circular)
			if (refColumn.isForeignKey && 
				refColumn.foreignKeyRef &&
				refColumn.foreignKeyRef.schema === fkSide.schema &&
				refColumn.foreignKeyRef.table === fkSide.table &&
				refColumn.foreignKeyRef.column === fkSide.column) {
				console.log('[FK Creation] Circular FK detected');
				vscode.postMessage({ 
					command: 'showError', 
					text: `Cannot create circular foreign key: ${refSide.table}.${refSide.column} already references ${fkSide.table}.${fkSide.column}` 
				});
				return;
			}

			// Validation: Check compatible data types
			const normalizeType = (type: string) => type.replace(/\(.*\)/, '').toUpperCase();
			if (normalizeType(fkColumn.type) !== normalizeType(refColumn.type)) {
				console.log('[FK Creation] Incompatible data types');
				vscode.postMessage({ 
					command: 'showError', 
					text: `Data types are incompatible: ${fkColumn.type} vs ${refColumn.type}. Both columns must have matching types.` 
				});
				return;
			}

			// Create FK: Update FK column
			const updatedColumns = fkTable.columns.map(col => {
				if (col.name === fkSide.column) {
					return {
						...col,
						isForeignKey: true,
						foreignKeyRef: {
							schema: refSide.schema,
							table: refSide.table,
							column: refSide.column
						},
						// Auto-generate FK constraint name using default naming convention
						fkConstraintName: `FK_${fkSide.table}_${fkSide.column}`
					};
				}
				return col;
			});

			const updatedTable = { ...fkTable, columns: updatedColumns };

			console.log('[FK Creation] Creating FK:', {
				from: `${fkSide.schema}.${fkSide.table}.${fkSide.column}`,
				to: `${refSide.schema}.${refSide.table}.${refSide.column}`,
				constraint: `FK_${fkSide.table}_${fkSide.column}`
			});

			// Update via extension (same underlying method as button-based FK creation)
			vscode.postMessage({
				command: 'updateTable',
				schemaName: fkSide.schema,
				oldTableName: fkSide.table,
				table: updatedTable,
			});

			// Update local state immediately for responsive UI
			if (currentDatabase) {
				const updatedDatabase = {
					...currentDatabase,
					schemas: currentDatabase.schemas.map(schema => {
						if (schema.name === fkSide.schema) {
							return {
								...schema,
								tables: schema.tables.map(table => 
									table.name === fkSide.table ? updatedTable : table
								)
							};
						}
						return schema;
					})
				};

				setCurrentDatabase(updatedDatabase);
				updateNodesFromDatabase(updatedDatabase);
			}

		console.log('[FK Creation] ✓ FK created successfully via handle-agnostic bidirectional logic');
	},
	[currentDatabase, setCurrentDatabase, updateNodesFromDatabase]
);

// Handle edge changes (detect removals to remove FK from schema)
const handleEdgesChange = useCallback((changes: any[]) => {
	if (!currentDatabase) {
		// Delegate to default handler to keep UI in sync
		onEdgesChange(changes);
		return;
	}

	const removedChanges = changes.filter((c: any) => c.type === 'remove');
	if (removedChanges.length === 0) {
		onEdgesChange(changes);
		return;
	}

	// Helper to parse handle ids created as `${schema}.${table}-${column}-source|target`
	const parseHandle = (handle: string | null | undefined, nodeId: string) => {
		if (!handle) return null;
		try {
			// Remove trailing '-source' or '-target'
			const base = handle.endsWith('-source') ? handle.slice(0, -7) : handle.endsWith('-target') ? handle.slice(0, -7) : handle;
			// base is like "schema.table-column" (column may contain dashes)
			const prefix = `${nodeId}-`;
			if (base.startsWith(prefix)) {
				return base.slice(prefix.length);
			}
			// Fallback: take last dash-separated segment
			const parts = base.split('-');
			return parts.slice(1).join('-') || parts[parts.length - 1];
		} catch (e) {
			return null;
		}
	};

	// Process each removed edge
	removedChanges.forEach((chg: any) => {
		const removedEdge = edges.find(e => e.id === chg.id);
		if (!removedEdge) return;

		const sourceNode = removedEdge.source; // schema.table
		const targetNode = removedEdge.target; // schema.table

		const srcParts = sourceNode.split('.');
		const tgtParts = targetNode.split('.');
		if (srcParts.length < 2 || tgtParts.length < 2) return;

		const srcSchema = srcParts[0];
		const srcTable = srcParts.slice(1).join('.');
		const tgtSchema = tgtParts[0];
		const tgtTable = tgtParts.slice(1).join('.');

		const sourceColumn = parseHandle(removedEdge.sourceHandle, sourceNode);
		const targetColumn = parseHandle(removedEdge.targetHandle, targetNode);

		// Determine which side was FK (either source column or target column may be FK)
		// Try clearing FK from source column if it matched
		const updatedDb = {
			...currentDatabase,
			schemas: currentDatabase.schemas.map(s => ({
				...s,
				tables: s.tables.map(t => ({ ...t, columns: t.columns.map(c => ({ ...c })) }))
			}))
		} as Database;

		let updatedTable: Table | null = null;

		// Attempt clear on source column
		const srcSchemaObj = updatedDb.schemas.find(s => s.name === srcSchema);
		if (srcSchemaObj) {
			const srcTableObj = srcSchemaObj.tables.find(t => t.name === srcTable);
			if (srcTableObj && sourceColumn) {
				const col = srcTableObj.columns.find(c => c.name === sourceColumn);
				if (col && col.isForeignKey && col.foreignKeyRef &&
					col.foreignKeyRef.schema === tgtSchema &&
					col.foreignKeyRef.table === tgtTable &&
					col.foreignKeyRef.column === targetColumn) {
					col.isForeignKey = false;
					col.foreignKeyRef = undefined;
					col.fkConstraintName = undefined;
					updatedTable = { ...srcTableObj, columns: srcTableObj.columns };
				}
			}
		}

		// If not found on source, try clear on target (bidirectional support)
		if (!updatedTable) {
			const tgtSchemaObj = updatedDb.schemas.find(s => s.name === tgtSchema);
			if (tgtSchemaObj) {
				const tgtTableObj = tgtSchemaObj.tables.find(t => t.name === tgtTable);
				if (tgtTableObj && targetColumn) {
					const col = tgtTableObj.columns.find(c => c.name === targetColumn);
					if (col && col.isForeignKey && col.foreignKeyRef &&
						col.foreignKeyRef.schema === srcSchema &&
						col.foreignKeyRef.table === srcTable &&
						col.foreignKeyRef.column === sourceColumn) {
						col.isForeignKey = false;
						col.foreignKeyRef = undefined;
						col.fkConstraintName = undefined;
						updatedTable = { ...tgtTableObj, columns: tgtTableObj.columns };
					}
				}
			}
		}

		if (updatedTable) {
			// Update local UI immediately
			setCurrentDatabase(updatedDb);
			updateNodesFromDatabase(updatedDb);

			// Notify extension to update its canonical model
			const updateSchemaName = updatedTable && updatedDb.schemas.some(s => s.tables.some(t => t.name === updatedTable!.name))
				? (updatedDb.schemas.find(s => s.tables.some(t => t.name === updatedTable!.name))!.name)
				: srcSchema;

			vscode.postMessage({
				command: 'updateTable',
				schemaName: updateSchemaName,
				oldTableName: updatedTable.name,
				table: updatedTable,
			});
		}
	});

	// Finally delegate to default onEdgesChange to let React Flow update its internal state
	onEdgesChange(changes);
}, [edges, currentDatabase, onEdgesChange, setCurrentDatabase, updateNodesFromDatabase]);

	const toggleDarkMode = () => {
		const newMode = !isDarkMode;
		setIsDarkMode(newMode);
		localStorage.setItem('sqlgem-dark-mode', String(newMode));
	};

	const toggleFKNames = () => {
		const newMode = !showFKNames;
		setShowFKNames(newMode);
		localStorage.setItem('sqlgem-show-fk-names', String(newMode));
	};

	// Update edge labels when FK name visibility changes
	useEffect(() => {
		setEdges((eds) => 
			eds.map((edge) => {
				// Extract table and column names from edge
				const sourceTableName = edge.source.split('.')[1];
				const sourceColName = edge.sourceHandle?.split('-')[2] || '';
				const fkLabel = showFKNames 
					? (edge.label || `FK_${sourceTableName}_${sourceColName}`)
					: undefined;
				
				// Only update if label changed
				if (edge.label !== fkLabel) {
					return { ...edge, label: fkLabel };
				}
				return edge;
			})
		);
	}, [showFKNames, setEdges]);

	const toggleIfNotExists = () => {
		const newMode = !useIfNotExists;
		setUseIfNotExists(newMode);
		localStorage.setItem('sqlgem-use-if-not-exists', String(newMode));
	};

	const handleCreateDatabase = () => {
		if (dbName.trim()) {
			vscode.postMessage({ command: 'createDatabase', name: dbName.trim() });
			setDbName('');
			setNewDbDialogOpen(false);
		}
	};

	const handleAddSchema = () => {
		if (schemaName.trim()) {
			vscode.postMessage({ command: 'addSchema', name: schemaName.trim() });
			setSchemaName('');
			setAddSchemaDialogOpen(false);
		}
	};

	const handleAutoLayout = useCallback(() => {
		if (!currentDatabase || nodes.length === 0) return;

		// Calculate new positions using Dagre
		const layoutedNodes = calculateAutoLayout(nodes, edges, {
			direction: 'LR',
			nodeSep: 80,
			rankSep: 150,
		});

		// Update nodes with new positions
		setNodes(layoutedNodes);

		// Fit view after layout with padding
		setTimeout(() => {
			(fitView as any)({ padding: 0.2, duration: 300 });
		}, 50);
	}, [currentDatabase, nodes, edges, setNodes, fitView]);

	const handleSchemaVisibilityChange = useCallback((newVisibleSchemas: Set<string>) => {
		// Debounce rapid changes to prevent flickering
		if (debounceTimerRef.current !== null) {
			window.clearTimeout(debounceTimerRef.current);
		}
		
		// Update immediately for responsive feel
		setVisibleSchemas(newVisibleSchemas);
		
		// Debounce localStorage save
		debounceTimerRef.current = window.setTimeout(() => {
			localStorage.setItem('sqlgem-visible-schemas', JSON.stringify(Array.from(newVisibleSchemas)));
		}, 300);
	}, []);

	const handleResetSchemaFilter = useCallback(() => {
		setVisibleSchemas(new Set([defaultSchema]));
	}, [defaultSchema]);
	return (
		<FluentProvider theme={isDarkMode ? webDarkTheme : webLightTheme}>
			<div className={styles.app}>
				<div className={styles.toolbar}>
					<Dialog open={newDbDialogOpen} onOpenChange={(_, data) => setNewDbDialogOpen(data.open)}>
						<DialogTrigger disableButtonEnhancement>
							<Button icon={<DatabaseRegular />} appearance="subtle" size="small">
								New Database Diagram
							</Button>
						</DialogTrigger>
						<DialogSurface>
							<DialogBody>
								<DialogTitle>New Database Diagram</DialogTitle>
								<DialogContent>
									<div className={styles.formGroup}>
										<Label htmlFor="dbName">Database Name:</Label>
										<Input
											id="dbName"
											value={dbName}
											onChange={(e) => setDbName(e.target.value)}
											placeholder="MyDatabase"
										/>
									</div>
								</DialogContent>
								<DialogActions>
									<DialogTrigger disableButtonEnhancement>
										<Button appearance="subtle" size="small">Cancel</Button>
									</DialogTrigger>
									<Button appearance="subtle" size="small" onClick={handleCreateDatabase}>
										Create
									</Button>
								</DialogActions>
							</DialogBody>
						</DialogSurface>
					</Dialog>

					<Button
						icon={<DatabaseRegular />}
						appearance="subtle"
						size="small"
						onClick={() => vscode.postMessage({ command: 'loadDatabase' })}
					>
						Load Database
					</Button>

					<Dialog
						open={addSchemaDialogOpen}
						onOpenChange={(_, data) => setAddSchemaDialogOpen(data.open)}
					>
						<DialogTrigger disableButtonEnhancement>
							<Button
								icon={<AddRegular />}
								appearance="subtle"
								size="small"
								disabled={!currentDatabase}
							>
								Add Schema
							</Button>
						</DialogTrigger>
						<DialogSurface>
							<DialogBody>
								<DialogTitle>Add Schema</DialogTitle>
								<DialogContent>
									<div className={styles.formGroup}>
										<Label htmlFor="schemaName">Schema Name:</Label>
										<Input
											id="schemaName"
											value={schemaName}
											onChange={(e) => setSchemaName(e.target.value)}
											placeholder="dbo"
										/>
									</div>
								</DialogContent>
								<DialogActions>
									<DialogTrigger disableButtonEnhancement>
										<Button appearance="subtle" size="small">Cancel</Button>
									</DialogTrigger>
									<Button appearance="subtle" size="small" onClick={handleAddSchema}>
										Add
									</Button>
								</DialogActions>
							</DialogBody>
						</DialogSurface>
					</Dialog>

				<Menu>
				<MenuTrigger disableButtonEnhancement>
					<Button
						icon={<TableRegular />}
						appearance="subtle"
						size="small"
						disabled={!currentDatabase || currentDatabase.schemas.length === 0}
					>
						Add Table
					</Button>
				</MenuTrigger>
				<MenuPopover>
					<MenuList>
						{currentDatabase?.schemas.map((schema) => (
							<MenuItem key={schema.name} onClick={() => handleAddTable(schema.name)}>
								{schema.name}
							</MenuItem>
						))}
					</MenuList>
				</MenuPopover>
			</Menu>

				<Button
					icon={<OrganizationRegular />}
					appearance="subtle"
					size="small"
					onClick={handleAutoLayout}
				disabled={!currentDatabase || nodes.length === 0}
				title="Auto Layout - Arrange tables using Dagre algorithm"
			>
				Auto Layout
			</Button>

				<Button
					icon={<SaveRegular />}
					appearance="primary"
					size="small"
					onClick={handleSaveDatabase}
					disabled={!currentDatabase}
				>
					Save
				</Button>

				<Button
					icon={<DocumentTextRegular />}
					appearance="subtle"
					size="small"
					onClick={handlePreviewSQL}
					disabled={!currentDatabase}
				>
					Preview SQL
				</Button>

				<div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '12px', borderLeft: `1px solid ${tokens.colorNeutralStroke2}` }}>
					<Checkbox 
						checked={useIfNotExists}
						onChange={toggleIfNotExists}
						label="Safe Create"
						title="Generate idempotent SQL that's safe to run multiple times"
					/>
				</div>

				<Button
				icon={<TagRegular />}
					appearance="subtle"
					size="small"
					onClick={toggleFKNames}
				title={showFKNames ? 'Hide FK Constraint Names' : 'Show FK Constraint Names'}
					style={{ opacity: showFKNames ? 1 : 0.5 }}
				/>

				<Button
					icon={isDarkMode ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
					appearance="subtle"
					size="small"
					onClick={toggleDarkMode}
					title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
				/>

				<div className={styles.dbInfo}>
					{currentDatabase ? `${currentDatabase.name} (${currentDatabase.schemas.length} schemas)` : 'No database'}
				</div>
			</div>

			<div className={styles.canvas}>
				<ReactFlow 
					nodes={nodes} 
					edges={edges} 
					onNodesChange={onNodesChange} 
					onEdgesChange={handleEdgesChange} 
					onConnect={onConnect} 
					nodeTypes={nodeTypes}
					connectionMode={"loose" as any}
					connectionLineType={"smoothstep" as any}
					connectionLineStyle={{ stroke: tokens.colorBrandBackground, strokeWidth: 2 }}
					nodesDraggable={true}
					nodesConnectable={true}
					elementsSelectable={true}
					zoomOnScroll={true}
					panOnScroll={false}
					preventScrolling={true}
					zoomOnDoubleClick={false}
					selectNodesOnDrag={false}
				>
					<Background color={isDarkMode ? '#444' : '#aaa'} />
					<Controls />
					<MiniMap 
						style={{
							background: isDarkMode ? '#1e1e1e' : '#fff',
							border: `1px solid ${isDarkMode ? '#3e3e3e' : '#ddd'}`,
						}}
						nodeColor={isDarkMode ? '#555' : '#e2e8f0'}
						maskColor={isDarkMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)'}
					/>
				</ReactFlow>
				
				{currentDatabase && availableSchemas.length > 0 && (
					<SchemaFilterPanel
						schemas={availableSchemas}
						visibleSchemas={visibleSchemas}
						defaultSchema={defaultSchema}
						onVisibilityChange={handleSchemaVisibilityChange}
						onReset={handleResetSchemaFilter}
					/>
				)}
			</div>

			{sidebarOpen && editingTable && (
				<TableEditorSidebar
					schemaName={editingTable.schema}
					table={editingTable.table}
					availableTables={getAllTablesForFKReferences()}
					sidebarMode={sidebarMode}
					onClose={() => setSidebarOpen(false)}
					onSave={handleSaveTable}
					onDelete={handleDeleteTable}
				/>
			)}

			<Dialog open={previewDialogOpen} onOpenChange={(_, data) => setPreviewDialogOpen(data.open)}>
				<DialogSurface className={styles.previewDialog}>
					<DialogBody>
						<DialogTitle>SQL Preview</DialogTitle>
						<DialogContent className={styles.previewContent}>
							<div className={styles.sqlPreview}>{previewSQL}</div>
						</DialogContent>
						<DialogActions>
							<Button appearance="subtle" size="small" onClick={() => setPreviewDialogOpen(false)}>
								Close
							</Button>
						</DialogActions>
					</DialogBody>
				</DialogSurface>
			</Dialog>
		</div>
	</FluentProvider>
	);
};