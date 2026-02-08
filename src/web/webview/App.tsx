import React, { useState, useCallback, useEffect } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Database, Schema, Table, Column, VSCodeAPI } from './types';
import TableNode from './components/TableNode';
import { TableEditorSidebar } from './components/TableEditorSidebar';

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
		gap: tokens.spacingHorizontalS,
		padding: tokens.spacingVerticalM,
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
	const [isDarkMode, setIsDarkMode] = useState(() => {
		return localStorage.getItem('sqlgem-dark-mode') === 'true';
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
		if (!database) {
			setNodes([]);
			setEdges([]);
			return;
		}

		const newNodes: Node[] = [];
		const newEdges: Edge[] = [];
		let yOffset = 50;

		database.schemas.forEach((schema) => {
			if (!schema || !schema.tables) return;
			let xOffset = 50;
			schema.tables.forEach((table) => {
				if (!table || !table.name || !table.columns) return;

				newNodes.push({
					id: `${schema.name}.${table.name}`,
					type: 'tableNode',
					position: { x: table.x || xOffset, y: table.y || yOffset },
					data: {
						schemaName: schema.name,
						table: table,
						onEdit: handleEditTable,
					},
				});

				// Create edges for foreign keys
				table.columns.forEach((col) => {
					if (col.isForeignKey && col.foreignKeyRef && col.foreignKeyRef.schema && col.foreignKeyRef.table && col.foreignKeyRef.column) {
						const sourceId = `${schema.name}.${table.name}`;
						const targetId = `${col.foreignKeyRef.schema}.${col.foreignKeyRef.table}`;
						newEdges.push({
							id: `${sourceId}-${col.name}-${targetId}`,
							source: sourceId,
							target: targetId,
							sourceHandle: `${sourceId}-${col.name}-source`,
							targetHandle: `${targetId}-${col.foreignKeyRef.column}-target`,
							label: col.name,
							type: 'smoothstep',
							animated: true,
							style: { stroke: '#007acc', strokeWidth: 2 },
						});
					}
				});

				xOffset += 300;
			});
			yOffset += 350;
		});

		setNodes(newNodes);
		setEdges(newEdges);
	}, [setNodes, setEdges, handleEditTable]);

	useEffect(() => {
		vscode.postMessage({ command: 'getDatabaseState' });

		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			if (message.command === 'updateDatabase') {
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



	const onConnect = useCallback(
		(params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
		[setEdges]
	);

	const toggleDarkMode = () => {
		const newMode = !isDarkMode;
		setIsDarkMode(newMode);
		localStorage.setItem('sqlgem-dark-mode', String(newMode));
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

	return (
		<FluentProvider theme={isDarkMode ? webDarkTheme : webLightTheme}>
			<div className={styles.app}>
				<div className={styles.toolbar}>
					<Dialog open={newDbDialogOpen} onOpenChange={(_, data) => setNewDbDialogOpen(data.open)}>
						<DialogTrigger disableButtonEnhancement>
							<Button icon={<DatabaseRegular />} appearance="primary">
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
										<Button appearance="secondary">Cancel</Button>
									</DialogTrigger>
									<Button appearance="primary" onClick={handleCreateDatabase}>
										Create
									</Button>
								</DialogActions>
							</DialogBody>
						</DialogSurface>
					</Dialog>

					<Button
						icon={<DatabaseRegular />}
						appearance="primary"
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
								appearance="secondary"
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
										<Button appearance="secondary">Cancel</Button>
									</DialogTrigger>
									<Button appearance="primary" onClick={handleAddSchema}>
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
						appearance="secondary"
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
					icon={<SaveRegular />}
					appearance="primary"
					onClick={handleSaveDatabase}
					disabled={!currentDatabase}
				>
					Save
				</Button>

				<Button
					icon={<DocumentTextRegular />}
					appearance="secondary"
					onClick={handlePreviewSQL}
					disabled={!currentDatabase}
				>
					Preview SQL
				</Button>

				<div className={styles.dbInfo}>
					{currentDatabase ? `${currentDatabase.name} (${currentDatabase.schemas.length} schemas)` : 'No database'}
				</div>
			</div>

			<div className={styles.canvas}>
				<ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView>
					<Background />
					<Controls />
					<MiniMap />
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
							<Button appearance="secondary" onClick={() => setPreviewDialogOpen(false)}>
								Close
							</Button>
						</DialogActions>
					</DialogBody>
				</DialogSurface>
			</Dialog>
		</div>
	</FluentProvider>
);};