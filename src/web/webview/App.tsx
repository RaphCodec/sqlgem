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
} from '@fluentui/react-components';
import {
	AddRegular,
	DatabaseRegular,
	TableRegular,
	WeatherMoonRegular,
	WeatherSunnyRegular,
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
	const [addTableDialogOpen, setAddTableDialogOpen] = useState(false);
	const [editTableDialogOpen, setEditTableDialogOpen] = useState(false);

	// Form states
	const [dbName, setDbName] = useState('');
	const [schemaName, setSchemaName] = useState('');
	const [tableName, setTableName] = useState('');
	const [selectedSchema, setSelectedSchema] = useState('');
	const [columns, setColumns] = useState<Column[]>([
		{ name: '', type: 'INT', isPrimaryKey: false, isForeignKey: false, isNullable: true },
	]);
	
	// Edit mode states
	const [editingTable, setEditingTable] = useState<{ schema: string; table: Table } | null>(null);

	useEffect(() => {
		vscode.postMessage({ command: 'getDatabaseState' });

		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			if (message.command === 'updateDatabase') {
				setCurrentDatabase(message.database);
				updateNodesFromDatabase(message.database);
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	const updateNodesFromDatabase = (database: Database | null) => {
		if (!database) {
			setNodes([]);
			setEdges([]);
			return;
		}

		const newNodes: Node[] = [];
		const newEdges: Edge[] = [];
		let yOffset = 50;

		database.schemas.forEach((schema) => {
			let xOffset = 50;
			schema.tables.forEach((table) => {
				newNodes.push({
					id: `${schema.name}.${table.name}`,
					type: 'tableNode',
					position: { x: table.x || xOffset, y: table.y || yOffset },
					data: {
						schemaName: schema.name,
						table: table,
						onEdit: (schemaName: string, table: Table) => handleEditTable(schemaName, table),
					},
				});

				// Create edges for foreign keys
				table.columns.forEach((col) => {
					if (col.isForeignKey && col.foreignKeyRef) {
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
	};

	const handleEditTable = (schemaName: string, table: Table) => {
		setEditingTable({ schema: schemaName, table });
		setSelectedSchema(schemaName);
		setTableName(table.name);
		setColumns(table.columns.map(col => ({ ...col })));
		setEditTableDialogOpen(true);
	};

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

	const handleAddTable = () => {
		if (!selectedSchema || !tableName.trim()) {
			return;
		}

		const validColumns = columns.filter((col) => col.name.trim());
		if (validColumns.length === 0) {
			return;
		}

		vscode.postMessage({
			command: 'addTable',
			schemaName: selectedSchema,
			table: {
				name: tableName.trim(),
				columns: validColumns,
			},
		});

		setTableName('');
		setColumns([
			{ name: '', type: 'INT', isPrimaryKey: false, isForeignKey: false, isNullable: true },
		]);
		setAddTableDialogOpen(false);
	};

	const handleSaveEditedTable = () => {
		if (!editingTable || !selectedSchema || !tableName.trim()) {
			return;
		}

		const validColumns = columns.filter((col) => col.name.trim());
		if (validColumns.length === 0) {
			return;
		}

		vscode.postMessage({
			command: 'updateTable',
			schemaName: selectedSchema,
			oldTableName: editingTable.table.name,
			table: {
				name: tableName.trim(),
				columns: validColumns,
				x: editingTable.table.x,
				y: editingTable.table.y,
			},
		});

		setEditingTable(null);
		setTableName('');
		setColumns([
			{ name: '', type: 'INT', isPrimaryKey: false, isForeignKey: false, isNullable: true },
		]);
		setEditTableDialogOpen(false);
	};

	const addColumn = () => {
		setColumns([
			...columns,
			{ name: '', type: 'INT', isPrimaryKey: false, isForeignKey: false, isNullable: true },
		]);
	};

	const updateColumn = (index: number, field: keyof Column, value: any) => {
		const newColumns = [...columns];
		newColumns[index] = { ...newColumns[index], [field]: value };
		setColumns(newColumns);
	};

	const removeColumn = (index: number) => {
		setColumns(columns.filter((_, i) => i !== index));
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

					<Dialog
						open={addTableDialogOpen}
						onOpenChange={(_, data) => setAddTableDialogOpen(data.open)}
					>
						<DialogTrigger disableButtonEnhancement>
							<Button
								icon={<TableRegular />}
								appearance="secondary"
								disabled={!currentDatabase || currentDatabase.schemas.length === 0}
							>
								Add Table
							</Button>
						</DialogTrigger>
						<DialogSurface>
							<DialogBody>
								<DialogTitle>Add Table</DialogTitle>
								<DialogContent>
									<div className={styles.formGroup}>
										<Label htmlFor="tableSchema">Schema:</Label>
										<Select
											id="tableSchema"
											value={selectedSchema}
											onChange={(e) => setSelectedSchema(e.target.value)}
										>
											<option value="">Select schema...</option>
											{currentDatabase?.schemas.map((schema) => (
												<option key={schema.name} value={schema.name}>
													{schema.name}
												</option>
											))}
										</Select>
									</div>
									<div className={styles.formGroup}>
										<Label htmlFor="tableName">Table Name:</Label>
										<Input
											id="tableName"
											value={tableName}
											onChange={(e) => setTableName(e.target.value)}
											placeholder="Users"
										/>
									</div>
									<div className={styles.formGroup}>
										<Label>Columns:</Label>
										<div className={styles.columnsList}>
											{columns.map((col, index) => (
												<div key={index} className={styles.columnItem}>
													<Input
														className={styles.columnItemInput}
														value={col.name}
														onChange={(e) =>
															updateColumn(index, 'name', e.target.value)
														}
														placeholder="Column name"
													/>
													<Select
														value={col.type}
														onChange={(e) =>
															updateColumn(index, 'type', e.target.value)
														}
													>
														<option>INT</option>
														<option>VARCHAR(255)</option>
														<option>NVARCHAR(255)</option>
														<option>TEXT</option>
														<option>DATETIME</option>
														<option>BIT</option>
														<option>DECIMAL(18,2)</option>
													</Select>
													<Checkbox
														label="PK"
														checked={col.isPrimaryKey}
														onChange={(e, data) =>
															updateColumn(index, 'isPrimaryKey', data.checked)
														}
													/>
													<Checkbox
														label="FK"
														checked={col.isForeignKey}
														onChange={(e, data) =>
															updateColumn(index, 'isForeignKey', data.checked)
														}
													/>
													{col.isForeignKey && (
														<Select
															value={col.foreignKeyRef ? `${col.foreignKeyRef.schema}.${col.foreignKeyRef.table}.${col.foreignKeyRef.column}` : ''}
															onChange={(e) => {
																const [schema, table, column] = e.target.value.split('.');
																updateColumn(index, 'foreignKeyRef', { schema, table, column });
															}}
														>
															<option value="">Select reference...</option>
															{currentDatabase?.schemas.flatMap((s) =>
																s.tables.flatMap((t) =>
																	t.columns
																		.filter((c) => c.isPrimaryKey)
																		.map((c) => (
																			<option key={`${s.name}.${t.name}.${c.name}`} value={`${s.name}.${t.name}.${c.name}`}>
																				{s.name}.{t.name}.{c.name}
																			</option>
																		))
																)
															)}
														</Select>
													)}
													<Checkbox
														label="Nullable"
														checked={col.isNullable}
														onChange={(e, data) =>
															updateColumn(index, 'isNullable', data.checked)
														}
													/>
													<Button
														appearance="subtle"
														onClick={() => removeColumn(index)}
													>
														Remove
													</Button>
												</div>
											))}
										</div>
										<Button onClick={addColumn} appearance="primary">
											Add Column
										</Button>
									</div>
								</DialogContent>
								<DialogActions>
									<DialogTrigger disableButtonEnhancement>
										<Button appearance="secondary">Cancel</Button>
									</DialogTrigger>
									<Button appearance="primary" onClick={handleAddTable}>
										Create Table
									</Button>
								</DialogActions>
							</DialogBody>
						</DialogSurface>
					</Dialog>

					<Dialog
						open={editTableDialogOpen}
						onOpenChange={(_, data) => setEditTableDialogOpen(data.open)}
					>
						<DialogSurface>
							<DialogBody>
								<DialogTitle>Edit Table</DialogTitle>
								<DialogContent>
									<div className={styles.formGroup}>
										<Label htmlFor="editTableSchema">Schema:</Label>
										<Input
											id="editTableSchema"
											value={selectedSchema}
											disabled
										/>
									</div>
									<div className={styles.formGroup}>
										<Label htmlFor="editTableName">Table Name:</Label>
										<Input
											id="editTableName"
											value={tableName}
											onChange={(e) => setTableName(e.target.value)}
											placeholder="Users"
										/>
									</div>
									<div className={styles.formGroup}>
										<Label>Columns:</Label>
										<div className={styles.columnsList}>
											{columns.map((col, index) => (
												<div key={index} className={styles.columnItem}>
													<Input
														className={styles.columnItemInput}
														value={col.name}
														onChange={(e) =>
															updateColumn(index, 'name', e.target.value)
														}
														placeholder="Column name"
													/>
													<Select
														value={col.type}
														onChange={(e) =>
															updateColumn(index, 'type', e.target.value)
														}
													>
														<option>INT</option>
														<option>VARCHAR(255)</option>
														<option>NVARCHAR(255)</option>
														<option>TEXT</option>
														<option>DATETIME</option>
														<option>BIT</option>
														<option>DECIMAL(18,2)</option>
													</Select>
													<Checkbox
														label="PK"
														checked={col.isPrimaryKey}
														onChange={(e, data) =>
															updateColumn(index, 'isPrimaryKey', data.checked)
														}
													/>
													<Checkbox
														label="FK"
														checked={col.isForeignKey}
														onChange={(e, data) =>
															updateColumn(index, 'isForeignKey', data.checked)
														}
													/>
													{col.isForeignKey && (
														<>
															<Select
																value={col.foreignKeyRef ? `${col.foreignKeyRef.schema}.${col.foreignKeyRef.table}.${col.foreignKeyRef.column}` : ''}
																onChange={(e) => {
																	const [schema, table, column] = e.target.value.split('.');
																	updateColumn(index, 'foreignKeyRef', { schema, table, column });
																}}
															>
																<option value="">Select reference...</option>
																{currentDatabase?.schemas.flatMap((s) =>
																	s.tables.flatMap((t) =>
																		t.columns
																			.filter((c) => c.isPrimaryKey)
																			.map((c) => (
																				<option key={`${s.name}.${t.name}.${c.name}`} value={`${s.name}.${t.name}.${c.name}`}>
																					{s.name}.{t.name}.{c.name}
																				</option>
																			))
																	)
																)}
															</Select>
														</>
													)}
													<Checkbox
														label="Nullable"
														checked={col.isNullable}
														onChange={(e, data) =>
															updateColumn(index, 'isNullable', data.checked)
														}
													/>
													<Button
														appearance="subtle"
														onClick={() => removeColumn(index)}
													>
														Remove
													</Button>
												</div>
											))}
										</div>
										<Button onClick={addColumn} appearance="primary">
											Add Column
										</Button>
									</div>
								</DialogContent>
								<DialogActions>
									<Button appearance="secondary" onClick={() => setEditTableDialogOpen(false)}>
										Cancel
									</Button>
									<Button appearance="primary" onClick={handleSaveEditedTable}>
										Save Changes
									</Button>
								</DialogActions>
							</DialogBody>
						</DialogSurface>
					</Dialog>

					<Button
						icon={isDarkMode ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
						appearance="subtle"
						onClick={toggleDarkMode}
					/>

					<div className={styles.dbInfo}>
						{currentDatabase
							? `${currentDatabase.name} (${currentDatabase.schemas.length} schemas)`
							: 'No database'}
					</div>
				</div>

				<div className={styles.canvas}>
					<ReactFlow
						nodes={nodes}
						edges={edges}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
						onConnect={onConnect}
						nodeTypes={nodeTypes}
						fitView
					>
						<Background />
						<Controls />
						<MiniMap />
					</ReactFlow>
				</div>
			</div>
		</FluentProvider>
	);
};
