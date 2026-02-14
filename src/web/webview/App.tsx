import React, { useState, useCallback, useEffect, useRef } from 'react';
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
	const [currentDatabase, setCurrentDatabase] = useState<Database | null>(null);
	const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

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
		vscode.postMessage({ command: 'saveDatabase' });
	};

	const handlePreviewSQL = () => {
		vscode.postMessage({ command: 'previewSQL' });
	};

	const updateNodesFromDatabase = useCallback((database: Database | null) => {
		console.log('[Webview] updateNodesFromDatabase called with:', database);
		
		if (!database) {
			console.log('[Webview] No database, clearing nodes/edges');
			setNodes([]);
			setEdges([]);
			return;
		}

		console.log('[Webview] Processing database:', database.name);
		console.log('[Webview] Number of schemas:', database.schemas?.length);

		const newEdges: Edge[] = [];

		setNodes((currentNodes) => {
			const newNodes: Node[] = [];
			let yOffset = 50;

			database.schemas.forEach((schema) => {
				console.log(`[Webview] Processing schema: ${schema.name}, tables: ${schema.tables?.length}`);
				if (!schema || !schema.tables) return;
				let xOffset = 50;
				schema.tables.forEach((table) => {
					console.log(`[Webview]   Processing table: ${table.name}, columns: ${table.columns?.length}`);
					if (!table || !table.name || !table.columns) return;

					const nodeId = `${schema.name}.${table.name}`;
					// Preserve existing node position if it exists
					const existingNode = currentNodes.find(n => n.id === nodeId);
					const position = existingNode?.position || { x: table.x || xOffset, y: table.y || yOffset };

					newNodes.push({
						id: nodeId,
						type: 'tableNode',
						position: position,
						data: {
							schemaName: schema.name,
							table: table,
							onEdit: handleEditTable,
							onDelete: handleDeleteTable,
						},
					});
					console.log(`[Webview]     Created node: ${nodeId} at (${position.x}, ${position.y})`);

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
						
						newEdges.push({
							id: `${sourceId}-${col.name}-${targetId}`,
							source: sourceId,
							target: targetId,
							sourceHandle: `${sourceId}-${col.name}-source`,
							targetHandle: `${targetId}-${col.foreignKeyRef.column}-target`,
							label: fkLabel,
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
							console.log(`[Webview]       Created FK edge: ${sourceId} -> ${targetId}`);
						}
					});

					xOffset += 300;
				});
				yOffset += 350;
			});

			console.log(`[Webview] Total nodes created: ${newNodes.length}`);
			return newNodes;
		});

		console.log(`[Webview] Total edges created: ${newEdges.length}`);
		setEdges(newEdges);
	}, [setNodes, setEdges, handleEditTable, handleDeleteTable, showFKNames]);

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
				fitView({ padding: 0.2, duration: 300 });
			}, 50);
		}
	}, [nodes, edges, currentDatabase, setNodes, fitView]);

	const onConnect = useCallback(
		(params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
		[setEdges]
	);

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
			fitView({ padding: 0.2, duration: 300 });
		}, 50);
	}, [currentDatabase, nodes, edges, setNodes, fitView]);

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
				<ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView>
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
);};