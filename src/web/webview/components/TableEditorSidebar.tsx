import React, { useState } from 'react';
import {
	makeStyles,
	tokens,
	Button,
	Input,
	Label,
	Select,
	Checkbox,
	Dialog,
	DialogSurface,
	DialogTitle,
	DialogBody,
	DialogContent,
	DialogActions,
	TabList,
	Tab,
	SelectTabData,
	SelectTabEvent,
} from '@fluentui/react-components';
import {
	AddRegular,
	DeleteRegular,
	MoreVerticalRegular,
	DismissRegular,
} from '@fluentui/react-icons';
import { Table, Column } from '../types';

interface TableEditorSidebarProps {
	schemaName: string;
	table: Table;
	availableTables: Array<{ schema: string; table: string; columns: Column[] }>;
	sidebarMode: 'add' | 'edit';
	onClose: () => void;
	onSave: (schemaName: string, oldTableName: string, updatedTable: Table) => void;
	onDelete?: (schemaName: string, tableName: string) => void;
}

const useStyles = makeStyles({
	sidebar: {
		position: 'fixed',
		right: 0,
		top: 0,
		bottom: 0,
		width: '500px',
		backgroundColor: tokens.colorNeutralBackground1,
		borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
		display: 'flex',
		flexDirection: 'column',
		boxShadow: tokens.shadow16,
		zIndex: 1000,
	},
	header: {
		padding: tokens.spacingHorizontalM,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		backgroundColor: tokens.colorNeutralBackground2,
	},
	title: {
		fontSize: tokens.fontSizeBase400,
		fontWeight: tokens.fontWeightSemibold,
	},
	metadata: {
		padding: tokens.spacingHorizontalM,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		backgroundColor: tokens.colorNeutralBackground1,
	},
	metadataRow: {
		marginBottom: tokens.spacingVerticalS,
	},
	tabs: {
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
	},
	content: {
		flex: 1,
		overflowY: 'auto',
		padding: tokens.spacingHorizontalM,
	},
	formGroup: {
		marginBottom: tokens.spacingVerticalM,
	},
	columnList: {
		display: 'flex',
		flexDirection: 'column',
		gap: '0px',
	},
	columnRow: {
		display: 'flex',
		flexDirection: 'column',
		gap: tokens.spacingHorizontalS,
		paddingTop: tokens.spacingVerticalM,
		paddingBottom: tokens.spacingVerticalM,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	columnRowMain: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalS,
	},
	columnDetails: {
		display: 'flex',
		flexDirection: 'column',
		gap: tokens.spacingVerticalS,
		paddingLeft: tokens.spacingHorizontalM,
		marginTop: tokens.spacingVerticalS,
	},
	constraintRow: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalS,
	},
	columnNameInput: {
		flex: '1 1 150px',
	},
	columnTypeSelect: {
		flex: '0 0 130px',
	},
	columnActions: {
		display: 'flex',
		gap: tokens.spacingHorizontalXXS,
		alignItems: 'center',
	},
	footer: {
		padding: tokens.spacingHorizontalM,
		borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
		display: 'flex',
		gap: tokens.spacingHorizontalS,
		justifyContent: 'flex-end',
	},
	addButton: {
		width: '100%',
		marginBottom: tokens.spacingVerticalM,
	},
	dialogContent: {
		display: 'flex',
		flexDirection: 'column',
		gap: tokens.spacingVerticalM,
	},
	emptyState: {
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase200,
		textAlign: 'center',
		padding: tokens.spacingVerticalL,
	},
});

export const TableEditorSidebar: React.FC<TableEditorSidebarProps> = ({
	schemaName,
	table,
	availableTables,
	sidebarMode,
	onClose,
	onSave,
	onDelete,
}) => {
	const styles = useStyles();
	const [localSchemaName, setLocalSchemaName] = useState(schemaName);
	const [localTable, setLocalTable] = useState<Table>({ 
		...table, 
		columns: [...table.columns],
		uniqueConstraints: table.uniqueConstraints || [],
		indexes: table.indexes || [],
		primaryKey: table.primaryKey
	});
	const [originalTableName] = useState(table.name);
	const [typeConfigDialogOpen, setTypeConfigDialogOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [selectedColumnIndex, setSelectedColumnIndex] = useState<number | null>(null);
	const [selectedTab, setSelectedTab] = useState<string>('columns');
	
	// Index management state
	const [editingIndexId, setEditingIndexId] = useState<string | null>(null);
	const [newIndexName, setNewIndexName] = useState('');
	const [newIndexColumns, setNewIndexColumns] = useState<string[]>([]);
	const [newIndexIsClustered, setNewIndexIsClustered] = useState(false);
	const [newIndexIsUnique, setNewIndexIsUnique] = useState(false);
	
	// Temporary input state (allows empty strings during editing)
	const [lengthInput, setLengthInput] = useState<string>('');
	const [precisionInput, setPrecisionInput] = useState<string>('');
	const [scaleInput, setScaleInput] = useState<string>('');

	const updateTableName = (name: string) => {
		setLocalTable({ ...localTable, name });
	};

	const updateColumn = (index: number, field: keyof Column, value: any) => {
		const newColumns = [...localTable.columns];
		const col = { ...newColumns[index] };
		
		if (field === 'type') {
			// When changing type, set appropriate defaults
			col.type = value;
			if (value === 'VARCHAR' || value === 'NVARCHAR') {
				col.length = col.length || 255;
			} else if (value === 'CHAR' || value === 'NCHAR') {
				col.length = col.length || 1;
			} else if (value === 'DECIMAL' || value === 'NUMERIC') {
				col.precision = col.precision || 18;
				col.scale = col.scale || 2;
			}
		} else {
			(col as any)[field] = value;
		}
		
		newColumns[index] = col;
		setLocalTable({ ...localTable, columns: newColumns });
	};

	const addColumn = () => {
		const newColumns = [
			...localTable.columns,
			{ name: 'NewColumn', type: 'INT', isPrimaryKey: false, isForeignKey: false, isNullable: true }
		];
		setLocalTable({ ...localTable, columns: newColumns });
	};

	const removeColumn = (index: number) => {
		const newColumns = localTable.columns.filter((_, i) => i !== index);
		setLocalTable({ ...localTable, columns: newColumns });
	};

	const handleSave = () => {
		// Sync column-level flags with table-level structures before saving
		// This ensures consistency between UI state and data model
		
		// Sync PRIMARY KEY: collect columns with isPrimaryKey = true
		const pkColumns = localTable.columns
			.filter(col => col.isPrimaryKey)
			.map(col => col.name);
		
		if (pkColumns.length > 0) {
			// Find if any PK column has a custom name, or use first one's name
			const firstPkCol = localTable.columns.find(col => col.isPrimaryKey);
			const pkName = firstPkCol?.pkName || `PK_${localTable.name}`;
			
			// Merge with existing primaryKey or create new one
			localTable.primaryKey = {
				name: pkName,
				columns: pkColumns,
				isClustered: localTable.primaryKey?.isClustered !== false // Default to clustered
			};
		} else {
			// No PK columns, remove primaryKey
			localTable.primaryKey = undefined;
		}

		// Sync UNIQUE CONSTRAINTS: collect single-column unique constraints from isUniqueConstraint flags
		// Note: Multi-column unique constraints are managed via uniqueConstraints array directly
		const singleColUniqueConstraints = localTable.columns
			.filter(col => col.isUniqueConstraint && !col.isPrimaryKey) // Don't create UNIQUE for PK columns
			.map(col => ({
				name: col.uniqueConstraintName || `UQ_${localTable.name}_${col.name}`,
				columns: [col.name]
			}));
		
		// Merge with existing multi-column unique constraints
		const existingMultiColUC = (localTable.uniqueConstraints || [])
			.filter(uc => uc.columns.length > 1);
		
		localTable.uniqueConstraints = [
			...singleColUniqueConstraints,
			...existingMultiColUC
		];

		onSave(localSchemaName, originalTableName, localTable);
		onClose();
	};

	const handleDelete = () => {
		setDeleteDialogOpen(true);
	};

	const confirmDelete = () => {
		if (onDelete) {
			onDelete(localSchemaName, originalTableName);
			onClose();
		}
		setDeleteDialogOpen(false);
	};

	const handleTabSelect = (event: SelectTabEvent, data: SelectTabData) => {
		setSelectedTab(data.value as string);
	};

	// Index management functions
	const getTotalClusteredIndexes = (): number => {
		let count = 0;
		if (localTable.primaryKey?.isClustered) {
			count++;
		}
		if (localTable.indexes) {
			count += localTable.indexes.filter(idx => idx.isClustered).length;
		}
		return count;
	};

	const canAddClusteredIndex = (): boolean => {
		return getTotalClusteredIndexes() < 1;
	};

	const addIndex = () => {
		if (!newIndexName || newIndexColumns.length === 0) {
			return;
		}

		// Validate clustered index rule
		if (newIndexIsClustered && !canAddClusteredIndex()) {
			alert('A table can only have one clustered index. Remove the existing clustered index or primary key first.');
			return;
		}

		const newIndexes = [
			...(localTable.indexes || []),
			{
				name: newIndexName,
				columns: newIndexColumns,
				isClustered: newIndexIsClustered,
				isUnique: newIndexIsUnique
			}
		];

		setLocalTable({ ...localTable, indexes: newIndexes });

		// Reset form
		setNewIndexName('');
		setNewIndexColumns([]);
		setNewIndexIsClustered(false);
		setNewIndexIsUnique(false);
	};

	const removeIndex = (indexName: string) => {
		const newIndexes = (localTable.indexes || []).filter(idx => idx.name !== indexName);
		setLocalTable({ ...localTable, indexes: newIndexes });
	};

	const toggleIndexColumn = (columnName: string) => {
		if (newIndexColumns.includes(columnName)) {
			setNewIndexColumns(newIndexColumns.filter(c => c !== columnName));
		} else {
			setNewIndexColumns([...newIndexColumns, columnName]);
		}
	};

	const generateIndexName = (): string => {
 		const prefix = newIndexIsUnique ? 'UQ' : 'IX'; // UQ for unique indexes, IX for non-unique
		const colPart = newIndexColumns.length > 0 ? newIndexColumns.join('_') : 'Column';
		return `${prefix}_${localTable.name}_${colPart}`;
	};

	const useGeneratedIndexName = () => {
		setNewIndexName(generateIndexName());
	};

	const openTypeConfig = (index: number) => {
		setSelectedColumnIndex(index);
		setTypeConfigDialogOpen(true);
	};

	const needsTypeConfig = (type: string) => {
		return ['VARCHAR', 'NVARCHAR', 'DECIMAL', 'NUMERIC', 'CHAR', 'NCHAR'].includes(type);
	};

	// Include columns from the current table being edited (for self-referencing FKs)
	// and from all other tables in the database
	const currentTablePKs = localTable.columns
		.filter(c => c.isPrimaryKey)
		.map(c => ({ schema: localSchemaName, table: localTable.name, column: c.name }));
	
	const otherTablePKs = availableTables
		.filter(t => !(t.schema === localSchemaName && t.table === localTable.name))
		.flatMap(t =>
			t.columns
				.filter(c => c.isPrimaryKey)
				.map(c => ({ schema: t.schema, table: t.table, column: c.name }))
		);
	
	const availablePKColumns = [...currentTablePKs, ...otherTablePKs];

	const selectedColumn = selectedColumnIndex !== null ? localTable.columns[selectedColumnIndex] : null;

	return (
		<div className={styles.sidebar}>
			<div className={styles.header}>
				<div className={styles.title}>{sidebarMode === 'add' ? 'Add Table' : 'Edit Table'}</div>
				<Button
					appearance="subtle"
					icon={<DismissRegular />}
					onClick={onClose}
					size="small"
				/>
			</div>

			{/* Schema and Table Name */}
			<div className={styles.metadata}>
				<div className={styles.metadataRow}>
					<Label size="small">Schema</Label>
					<Input
						value={localSchemaName}
						onChange={(e) => setLocalSchemaName(e.target.value)}
						size="small"
					/>
				</div>
				<div className={styles.metadataRow}>
					<Label size="small">Table Name</Label>
					<Input
						value={localTable.name}
						onChange={(e) => updateTableName(e.target.value)}
						size="small"
					/>
				</div>
			</div>

			{/* Tabs */}
			<TabList selectedValue={selectedTab} onTabSelect={handleTabSelect} className={styles.tabs}>
				<Tab value="columns">Columns</Tab>
				<Tab value="foreignKeys">Foreign Keys</Tab>
				<Tab value="indexes">Indexes</Tab>
			</TabList>

			<div className={styles.content}>
				{selectedTab === 'columns' && (
					<div>
						<Button
							appearance="subtle"
							icon={<AddRegular />}
							onClick={addColumn}
							className={styles.addButton}
							size="small"
						>
							Add Column
						</Button>

						<div className={styles.columnList}>
							{localTable.columns.map((col, index) => (
								<div key={index} className={styles.columnRow}>
									<div className={styles.columnRowMain}>
										<Input
											className={styles.columnNameInput}
											value={col.name}
											onChange={(e) => updateColumn(index, 'name', e.target.value)}
											placeholder="Column name"
											size="small"
										/>
										<Select
											className={styles.columnTypeSelect}
											value={col.type}
											onChange={(e) => updateColumn(index, 'type', e.target.value)}
											size="small"
										>
											<option>INT</option>
											<option>BIGINT</option>
											<option>SMALLINT</option>
											<option>TINYINT</option>
											<option>VARCHAR</option>
											<option>NVARCHAR</option>
											<option>CHAR</option>
											<option>NCHAR</option>
											<option>TEXT</option>
											<option>NTEXT</option>
											<option>DATETIME</option>
											<option>DATETIME2</option>
											<option>DATE</option>
											<option>TIME</option>
											<option>BIT</option>
											<option>DECIMAL</option>
											<option>NUMERIC</option>
											<option>FLOAT</option>
											<option>REAL</option>
											<option>MONEY</option>
											<option>UNIQUEIDENTIFIER</option>
										</Select>
										<div className={styles.columnActions}>
											{needsTypeConfig(col.type) && (
												<Button
													appearance="subtle"
													icon={<MoreVerticalRegular />}
													onClick={() => openTypeConfig(index)}
													size="small"
													title="Configure type parameters"
												/>
											)}
											<Checkbox
												checked={col.isPrimaryKey}
												onChange={(e, data) => updateColumn(index, 'isPrimaryKey', data.checked)}
												label="PK"
											/>
											<Checkbox
												checked={col.isForeignKey}
												onChange={(e, data) => updateColumn(index, 'isForeignKey', data.checked)}
												label="FK"
											/>
											<Checkbox
											checked={col.isUniqueConstraint || false}
											onChange={(e, data) => updateColumn(index, 'isUniqueConstraint', data.checked)}
												label="UNIQUE"
											/>
											<Button
												appearance="subtle"
												icon={<DeleteRegular />}
												onClick={() => removeColumn(index)}
												size="small"
												title="Remove column"
											/>
										</div>
									</div>

								{(col.isPrimaryKey || col.isForeignKey || col.isUniqueConstraint) && (
										<div className={styles.columnDetails}>
											{col.isPrimaryKey && (
												<div className={styles.constraintRow}>
													<Label size="small" style={{ width: '100px' }}>PK Name:</Label>
													<Input
														value={col.pkName || ''}
														onChange={(e) => updateColumn(index, 'pkName', e.target.value)}
														placeholder={`PK_${localTable.name}_${col.name}`}
														size="small"
														style={{ flex: 1 }}
													/>
												</div>
											)}
											{col.isUniqueConstraint && !col.isPrimaryKey && (
												<div className={styles.constraintRow}>
													<Label size="small" style={{ width: '100px' }}>UNIQUE Name:</Label>
													<Input
														value={col.uniqueConstraintName || ''}
														onChange={(e) => updateColumn(index, 'uniqueConstraintName', e.target.value)}
														placeholder={`UQ_${localTable.name}_${col.name}`}
														size="small"
														style={{ flex: 1 }}
													/>
												</div>
											)}
											{col.isForeignKey && (
												<>
													<div className={styles.constraintRow}>
														<Label size="small" style={{ width: '100px' }}>References:</Label>
														<Select
															value={col.foreignKeyRef ? `${col.foreignKeyRef.schema}.${col.foreignKeyRef.table}.${col.foreignKeyRef.column}` : ''}
															onChange={(e) => {
																const [s, t, c] = e.target.value.split('.');
																updateColumn(index, 'foreignKeyRef', { schema: s, table: t, column: c });
															}}
															size="small"
															style={{ flex: 1 }}
														>
															<option value="">Select reference...</option>
															{availablePKColumns.map((pk) => (
																<option key={`${pk.schema}.${pk.table}.${pk.column}`} value={`${pk.schema}.${pk.table}.${pk.column}`}>
																	{pk.schema}.{pk.table}.{pk.column}
																</option>
															))}
														</Select>
													</div>
													<div className={styles.constraintRow}>
														<Label size="small" style={{ width: '100px' }}>FK Name:</Label>
														<Input
															value={col.fkConstraintName || ''}
															onChange={(e) => updateColumn(index, 'fkConstraintName', e.target.value)}
															placeholder={`FK_${localTable.name}_${col.name}`}
															size="small"
															style={{ flex: 1 }}
														/>
													</div>
												</>
											)}
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				)}

				{selectedTab === 'foreignKeys' && (
					<div>
						<div className={styles.columnList}>
							{localTable.columns
								.map((col, index) => ({ col, index }))
								.filter(({ col }) => col.isForeignKey)
								.map(({ col, index }) => (
									<div key={index} style={{ marginBottom: tokens.spacingVerticalM }}>
										<Label>{col.name}</Label>
										<Select
											value={col.foreignKeyRef ? `${col.foreignKeyRef.schema}.${col.foreignKeyRef.table}.${col.foreignKeyRef.column}` : ''}
											onChange={(e) => {
												const [s, t, c] = e.target.value.split('.');
												updateColumn(index, 'foreignKeyRef', { schema: s, table: t, column: c });
											}}
											size="small"
										>
											<option value="">Select reference...</option>
											{availablePKColumns.map((pk) => (
												<option key={`${pk.schema}.${pk.table}.${pk.column}`} value={`${pk.schema}.${pk.table}.${pk.column}`}>
													{pk.schema}.{pk.table}.{pk.column}
												</option>
											))}
										</Select>
										<Checkbox
											checked={col.isForeignKey}
											onChange={(e, data) => updateColumn(index, 'isForeignKey', data.checked)}
											label="Is Foreign Key"
											style={{ marginTop: tokens.spacingVerticalXS }}
										/>
									</div>
								))}
							{localTable.columns.filter(col => col.isForeignKey).length === 0 && (
								<div className={styles.emptyState}>
									No foreign keys defined. Mark a column as FK in the Columns tab to create one.
								</div>
							)}
						</div>
					</div>
				)}

				{selectedTab === 'indexes' && (
					<div>
						<div style={{ marginBottom: tokens.spacingVerticalL }}>
							<Label weight="semibold" size="large" style={{ marginBottom: tokens.spacingVerticalS }}>
								Create New Index
							</Label>
							
							{/* Index Name */}
							<div className={styles.formGroup}>
								<Label size="small">Index Name</Label>
								<div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
									<Input
										value={newIndexName}
										onChange={(e) => setNewIndexName(e.target.value)}
										placeholder="Enter index name..."
										size="small"
										style={{ flex: 1 }}
									/>
									<Button
										appearance="subtle"
										onClick={useGeneratedIndexName}
										size="small"
										title="Generate name automatically"
									>
										Generate
									</Button>
								</div>
							</div>

							{/* Column Selection */}
							<div className={styles.formGroup}>
								<Label size="small">Columns (select in order)</Label>
								<div style={{ 
									border: `1px solid ${tokens.colorNeutralStroke1}`, 
									borderRadius: tokens.borderRadiusMedium,
									padding: tokens.spacingVerticalS,
									maxHeight: '150px',
									overflowY: 'auto'
								}}>
									{localTable.columns.map((col) => (
										<Checkbox
											key={col.name}
											checked={newIndexColumns.includes(col.name)}
											onChange={() => toggleIndexColumn(col.name)}
											label={`${col.name} (${col.type})`}
											style={{ display: 'block', marginBottom: tokens.spacingVerticalXS }}
										/>
									))}
									{localTable.columns.length === 0 && (
										<Label size="small" style={{ color: tokens.colorNeutralForeground3 }}>
											Add columns to the table first
										</Label>
									)}
								</div>
								{newIndexColumns.length > 0 && (
									<Label size="small" style={{ marginTop: tokens.spacingVerticalXS, color: tokens.colorNeutralForeground3 }}>
										Selected: {newIndexColumns.join(', ')}
									</Label>
								)}
							</div>

							{/* Index Options */}
							<div className={styles.formGroup}>
								<Checkbox
									checked={newIndexIsClustered}
									onChange={(e, data) => setNewIndexIsClustered(data.checked === true)}
									label="Clustered"
									disabled={!canAddClusteredIndex()}
								/>
								{!canAddClusteredIndex() && (
									<Label size="small" style={{ color: tokens.colorPaletteRedForeground1, marginLeft: tokens.spacingHorizontalM }}>
										Table already has a clustered index
									</Label>
								)}
							</div>

							<div className={styles.formGroup}>
								<Checkbox
									checked={newIndexIsUnique}
									onChange={(e, data) => setNewIndexIsUnique(data.checked === true)}
									label="Unique"
								/>
							</div>

							<Button
								appearance="primary"
								icon={<AddRegular />}
								onClick={addIndex}
								size="small"
								disabled={!newIndexName || newIndexColumns.length === 0}
							>
								Add Index
							</Button>
						</div>

						{/* Existing Indexes */}
						<div>
							<Label weight="semibold" size="large" style={{ marginBottom: tokens.spacingVerticalS }}>
								Existing Indexes
							</Label>

							{/* Primary Key Display */}
							{localTable.primaryKey && (
								<div style={{ 
									padding: tokens.spacingVerticalM,
									border: `1px solid ${tokens.colorNeutralStroke1}`,
									borderRadius: tokens.borderRadiusMedium,
									marginBottom: tokens.spacingVerticalM,
									backgroundColor: tokens.colorNeutralBackground2
								}}>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
										<div>
											<Label weight="semibold">
												{localTable.primaryKey.name || `PK_${localTable.name}`}
											</Label>
											<div style={{ color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 }}>
												PRIMARY KEY {localTable.primaryKey.isClustered ? '(CLUSTERED)' : '(NONCLUSTERED)'}
											</div>
											<div style={{ fontSize: tokens.fontSizeBase200, marginTop: tokens.spacingVerticalXXS }}>
												Columns: {localTable.primaryKey.columns.join(', ')}
											</div>
										</div>
									</div>
								</div>
							)}

							{/* Unique Constraints */}
							{localTable.uniqueConstraints && localTable.uniqueConstraints.length > 0 && (
								<div style={{ marginBottom: tokens.spacingVerticalM }}>
									<Label size="small" style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalXS }}>
										Unique Constraints
									</Label>
									{localTable.uniqueConstraints.map((uc, idx) => (
										<div key={idx} style={{ 
											padding: tokens.spacingVerticalS,
											border: `1px solid ${tokens.colorNeutralStroke2}`,
											borderRadius: tokens.borderRadiusMedium,
											marginBottom: tokens.spacingVerticalS,
											fontSize: tokens.fontSizeBase200
										}}>
											<Label size="small" weight="semibold">{uc.name}</Label>
											<div style={{ color: tokens.colorNeutralForeground3 }}>
												Columns: {uc.columns.join(', ')}
											</div>
										</div>
									))}
								</div>
							)}

							{/* User Indexes */}
							{localTable.indexes && localTable.indexes.length > 0 ? (
								<div className={styles.columnList}>
									{localTable.indexes.map((idx, index) => (
										<div key={index} style={{ 
											display: 'flex', 
											justifyContent: 'space-between', 
											alignItems: 'center',
											padding: tokens.spacingVerticalM,
											border: `1px solid ${tokens.colorNeutralStroke1}`,
											borderRadius: tokens.borderRadiusMedium,
											marginBottom: tokens.spacingVerticalS
										}}>
											<div>
												<Label weight="semibold">{idx.name}</Label>
												<div style={{ color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 }}>
													{idx.isUnique ? 'UNIQUE ' : ''}
													{idx.isClustered ? 'CLUSTERED' : 'NONCLUSTERED'}
												</div>
												<div style={{ fontSize: tokens.fontSizeBase200, marginTop: tokens.spacingVerticalXXS }}>
													Columns: {idx.columns.join(', ')}
												</div>
											</div>
											<Button
												appearance="subtle"
												icon={<DeleteRegular />}
												onClick={() => removeIndex(idx.name)}
												size="small"
												title="Remove index"
											/>
										</div>
									))}
								</div>
							) : (
								<div style={{ 
									padding: tokens.spacingVerticalL,
									textAlign: 'center',
									color: tokens.colorNeutralForeground3,
									fontSize: tokens.fontSizeBase200
								}}>
									No indexes defined. Create one above.
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			<div className={styles.footer}>
				<Button appearance="subtle" onClick={onClose} size="small">
					Cancel
				</Button>
				{sidebarMode === 'edit' && onDelete && (
					<Button appearance="subtle" icon={<DeleteRegular />} onClick={handleDelete} size="small">
						Delete Table
					</Button>
				)}
				<Button appearance="primary" onClick={handleSave} size="small">
					Save Changes
				</Button>
			</div>

			{/* Type Configuration Dialog */}
			<Dialog open={typeConfigDialogOpen} onOpenChange={(_, data) => setTypeConfigDialogOpen(data.open)}>
				<DialogSurface>
					<DialogBody>
						<DialogTitle>Configure {selectedColumn?.type} Parameters</DialogTitle>
						<DialogContent className={styles.dialogContent}>
							{selectedColumn && selectedColumnIndex !== null && (
								<>
									{(selectedColumn.type === 'VARCHAR' || selectedColumn.type === 'NVARCHAR' || selectedColumn.type === 'CHAR' || selectedColumn.type === 'NCHAR') && (
										<div>
											<Label>Length</Label>
											<Input
												type="number"
											value={lengthInput}
											onFocus={() => {
												// Initialize with current value when focused
												setLengthInput(String(selectedColumn.length || (selectedColumn.type.includes('VAR') ? 255 : 1)));
											}}
											onChange={(e) => {
												// Allow temporary empty state and any numeric input
												const value = e.target.value;
												if (value === '' || /^\d+$/.test(value)) {
													setLengthInput(value);
												}
											}}
											onBlur={() => {
												// Validate and apply default on blur
												const parsed = parseInt(lengthInput);
												const defaultValue = selectedColumn.type.includes('VAR') ? 255 : 1;
												const finalValue = isNaN(parsed) || parsed <= 0 ? defaultValue : parsed;
												updateColumn(selectedColumnIndex, 'length', finalValue);
												setLengthInput(String(finalValue));
											}}
											/>
										</div>
									)}
									{(selectedColumn.type === 'DECIMAL' || selectedColumn.type === 'NUMERIC') && (
										<>
											<div>
												<Label>Precision (total digits)</Label>
												<Input
													type="number"
												value={precisionInput}
												onFocus={() => {
													// Initialize with current value when focused
													setPrecisionInput(String(selectedColumn.precision || 18));
												}}
												onChange={(e) => {
													// Allow temporary empty state and any numeric input
													const value = e.target.value;
													if (value === '' || /^\d+$/.test(value)) {
														setPrecisionInput(value);
													}
												}}
												onBlur={() => {
													// Validate and apply default on blur
													const parsed = parseInt(precisionInput);
													const finalValue = isNaN(parsed) || parsed <= 0 ? 18 : parsed;
													updateColumn(selectedColumnIndex, 'precision', finalValue);
													setPrecisionInput(String(finalValue));
												}}
											/>
										</div>
										<div>
											<Label>Scale (decimal digits)</Label>
											<Input
												type="number"
												value={scaleInput}
												onFocus={() => {
													// Initialize with current value when focused
													setScaleInput(String(selectedColumn.scale || 2));
												}}
												onChange={(e) => {
													// Allow temporary empty state and any numeric input
													const value = e.target.value;
													if (value === '' || /^\d+$/.test(value)) {
														setScaleInput(value);
													}
												}}
												onBlur={() => {
													// Validate and apply default on blur
													const parsed = parseInt(scaleInput);
													const finalValue = isNaN(parsed) || parsed < 0 ? 2 : parsed;
													updateColumn(selectedColumnIndex, 'scale', finalValue);
													setScaleInput(String(finalValue));
												}}
												/>
											</div>
										</>
									)}
									<div>
										<Label>Default Value (optional)</Label>
										<Input
											value={selectedColumn.defaultValue || ''}
											onChange={(e) => updateColumn(selectedColumnIndex, 'defaultValue', e.target.value)}
											placeholder="e.g. GETDATE() or 'default'"
										/>
									</div>
									<div>
										<Checkbox
											checked={selectedColumn.isNullable}
											onChange={(e, data) => updateColumn(selectedColumnIndex, 'isNullable', data.checked)}
											label="Allow NULL values"
										/>
									</div>
								</>
							)}
						</DialogContent>
						<DialogActions>
						<Button appearance="subtle" onClick={() => setTypeConfigDialogOpen(false)} size="small">
								Close
							</Button>
						</DialogActions>
					</DialogBody>
				</DialogSurface>
			</Dialog>

		<Dialog open={deleteDialogOpen} onOpenChange={(_, data) => setDeleteDialogOpen(data.open)}>
			<DialogSurface>
				<DialogBody>
					<DialogTitle>Delete Table</DialogTitle>
					<DialogContent>
						Are you sure you want to delete table {localTable.name}? This will also remove all foreign key references to this table.
					</DialogContent>
					<DialogActions>
					<Button appearance="subtle" onClick={() => setDeleteDialogOpen(false)} size="small">
						Cancel
					</Button>
					<Button appearance="primary" onClick={confirmDelete} size="small">
							Delete
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
		</div>
	);
};
