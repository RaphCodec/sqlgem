import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { 
	makeStyles, 
	tokens, 
	Button, 
	Menu, 
	MenuTrigger, 
	MenuPopover, 
	MenuList, 
	MenuItem,
	Dialog,
	DialogSurface,
	DialogTitle,
	DialogBody,
	DialogContent,
	DialogActions
} from '@fluentui/react-components';
import { KeyRegular, EditRegular, MoreVerticalRegular, DeleteRegular, ShieldCheckmarkRegular } from '@fluentui/react-icons';
import { Table } from '../types';

interface TableNodeProps {
	data: {
		schemaName: string;
		table: Table;
		onEdit?: (schemaName: string, table: Table) => void;
		onDelete?: (schemaName: string, tableName: string) => void;
	};
}


const useStyles = makeStyles({
	tableNode: {
		backgroundColor: tokens.colorNeutralBackground1,
		border: `2px solid ${tokens.colorBrandBackground}`,
		borderRadius: tokens.borderRadiusMedium,
		minWidth: '220px',
		boxShadow: tokens.shadow8,
	},
	header: {
		backgroundColor: tokens.colorBrandBackground,
		color: tokens.colorNeutralForegroundOnBrand,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		fontWeight: tokens.fontWeightSemibold,
		borderRadius: `${tokens.borderRadiusMedium} ${tokens.borderRadiusMedium} 0 0`,
		fontSize: tokens.fontSizeBase300,
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	headerTitle: {
		flex: 1,
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	},
	headerActions: {
		display: 'flex',
		gap: tokens.spacingHorizontalXXS,
	},
	editButton: {
		minWidth: 'auto',
		padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXXS}`,
	},
	columns: {
		padding: `${tokens.spacingVerticalS} 0`,
	},
	separator: {
		borderTop: `1px solid ${tokens.colorNeutralStrokeAccessible}`,
		width: '80%',
		margin: `${tokens.spacingVerticalXS} auto`,
		height: '1px',
	},
	columnRow: {
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		display: 'flex',
		justifyContent: 'space-between',
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground1,
		alignItems: 'center',
		position: 'relative',
	},
	columnName: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalXXS,
	},
	columnType: {
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase100,
		marginLeft: tokens.spacingHorizontalS,
	},
	keyIcon: {
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorPaletteDarkOrangeForeground1,
	},
	fkIcon: {
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorPaletteBlueForeground2,
		transform: 'rotate(180deg)',
		display: 'inline-block',
	},
	uniqueIcon: {
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorPaletteGreenForeground1,
	},
});

const TableNode: React.FC<TableNodeProps> = ({ data }) => {
	const styles = useStyles();
	const { schemaName, table, onEdit, onDelete } = data;
	const tableId = `${schemaName}.${table.name}`;
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const getFullType = (col: any): string => {
		const baseType = col.type;
		if (baseType === 'VARCHAR' || baseType === 'NVARCHAR') {
			return `${baseType}(${col.length || 255})`;
		} else if (baseType === 'DECIMAL') {
			return `DECIMAL(${col.precision || 18},${col.scale || 2})`;
		}
		return baseType;
	};

	return (
		<>
		<div className={styles.tableNode}>
			<div className={styles.header}>
				<div className={styles.headerTitle}>
					{schemaName}.{table.name}
				</div>
				<div className={styles.headerActions}>
					{onEdit && (
						<Button
							appearance="transparent"
							icon={<EditRegular />}
							onClick={(e) => {
								e.stopPropagation();
								onEdit(schemaName, table);
							}}
							className={styles.editButton}
							size="small"
						/>
					)}
					{(onEdit || onDelete) && (
						<Menu>
							<MenuTrigger disableButtonEnhancement>
								<Button
									appearance="transparent"
									icon={<MoreVerticalRegular />}
									onClick={(e) => e.stopPropagation()}
									className={styles.editButton}
									size="small"
								/>
							</MenuTrigger>
							<MenuPopover>
								<MenuList>
									{onEdit && (
										<MenuItem
											icon={<EditRegular />}
											onClick={(e) => {
												e.stopPropagation();
												onEdit(schemaName, table);
											}}
										>
											Edit Table
										</MenuItem>
									)}
									{onDelete && (
										<MenuItem
											icon={<DeleteRegular />}
											onClick={(e) => {
												e.stopPropagation();
									setDeleteDialogOpen(true);
											}}
										>
											Delete Table
										</MenuItem>
									)}
								</MenuList>
							</MenuPopover>
						</Menu>
					)}
				</div>
			</div>
			<div className={styles.columns}>
				{/* Render actual columns first */}
				{table.columns.map((col, index) => (
					<div key={`col-${index}`} className={styles.columnRow}>
						<Handle
							type="target"
							position={Position.Left}
							id={`${tableId}-${col.name}-target`}
							style={{ left: -8, top: '50%' }}
							isConnectable={true}
						/>
						<span className={styles.columnName}>
							{col.isPrimaryKey && <KeyRegular className={styles.keyIcon} />}
							{!col.isPrimaryKey && col.isUniqueConstraint && <ShieldCheckmarkRegular className={styles.uniqueIcon} />}
							{col.isForeignKey && <KeyRegular className={styles.fkIcon} />}
							{col.name}
						</span>
						<span className={styles.columnType}>
							{getFullType(col)}
							{!col.isNullable && ' NOT NULL'}
						</span>
						<Handle
							type="source"
							position={Position.Right}
							id={`${tableId}-${col.name}-source`}
							style={{ right: -8, top: '50%' }}
							isConnectable={true}
						/>
					</div>
				))}

				{/* Separator between columns and indexes */}
				{((data as any).showIndexes) && ((data as any).indexes || table.indexes) && ((data as any).indexes || table.indexes).length > 0 && (
					<div className={styles.separator} />
				)}

				{/* Render indexes as pseudo-columns when enabled */}
				{((data as any).showIndexes) && ((data as any).indexes || table.indexes) && ((data as any).indexes || table.indexes).length > 0 && (
					((data as any).indexes || table.indexes).map((idx: any, i: number) => (
						<div key={`idx-${idx?.name || i}`} className={styles.columnRow}>
							<span className={styles.columnName}>
								{idx?.name}
							</span>
							<span className={styles.columnType}>
								{idx?.isUnique ? 'unique' : 'index'}
							</span>
						</div>
					))
				)}
			</div>
		</div>

			<Dialog open={deleteDialogOpen} onOpenChange={(_, data) => setDeleteDialogOpen(data.open)}>
				<DialogSurface>
					<DialogBody>
						<DialogTitle>Delete Table</DialogTitle>
						<DialogContent>
							Are you sure you want to delete table {table.name}?
						</DialogContent>
						<DialogActions>
							<Button appearance="secondary" onClick={() => setDeleteDialogOpen(false)}>
								Cancel
							</Button>
							<Button
								appearance="primary"
								onClick={() => {
									if (onDelete) {
										onDelete(schemaName, table.name);
									}
									setDeleteDialogOpen(false);
								}}
							>
								Delete
							</Button>
						</DialogActions>
					</DialogBody>
				</DialogSurface>
			</Dialog>
		</>
	);
};

// Memoize component to prevent unnecessary re-renders
// Deep comparison of column data to ensure icons update when PK/FK status changes
export default React.memo(TableNode, (prevProps, nextProps) => {
	// Check if basic table info changed
	if (
		prevProps.data.schemaName !== nextProps.data.schemaName ||
		prevProps.data.table.name !== nextProps.data.table.name ||
		prevProps.data.table.columns.length !== nextProps.data.table.columns.length ||
		prevProps.data.onEdit !== nextProps.data.onEdit ||
		prevProps.data.onDelete !== nextProps.data.onDelete
	) {
		return false; // Re-render needed
	}

	// Deep check: compare each column's key properties
	// This ensures PK and FK icons update immediately when column properties change
	for (let i = 0; i < prevProps.data.table.columns.length; i++) {
		const prevCol = prevProps.data.table.columns[i];
		const nextCol = nextProps.data.table.columns[i];
		
		if (
			prevCol.name !== nextCol.name ||
			prevCol.isPrimaryKey !== nextCol.isPrimaryKey ||
			prevCol.isForeignKey !== nextCol.isForeignKey ||
			prevCol.isUniqueConstraint !== nextCol.isUniqueConstraint ||
			prevCol.isNullable !== nextCol.isNullable ||
			prevCol.length !== nextCol.length ||
			prevCol.precision !== nextCol.precision ||
			prevCol.scale !== nextCol.scale ||
			JSON.stringify(prevCol.foreignKeyRef) !== JSON.stringify(nextCol.foreignKeyRef)
		) {
			return false; // Re-render needed
		}
	}

	// Check showIndexes flag change
	if ((prevProps.data as any).showIndexes !== (nextProps.data as any).showIndexes) {
		return false;
	}

	// Check indexes change
	const prevIndexes = (prevProps.data as any).indexes || prevProps.data.table.indexes || [];
	const nextIndexes = (nextProps.data as any).indexes || nextProps.data.table.indexes || [];
	if (prevIndexes.length !== nextIndexes.length) return false;
	if (JSON.stringify(prevIndexes) !== JSON.stringify(nextIndexes)) return false;

	// No changes detected, skip re-render
	return true;
});
