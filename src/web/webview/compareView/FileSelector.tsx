/**
 * File selector component.
 *
 * Allows the user to pick SQL files from the workspace for one side of the
 * comparison (Source or Target).
 */

import React from 'react';
import {
	makeStyles,
	tokens,
	Button,
	Badge,
	Text,
	mergeClasses,
} from '@fluentui/react-components';
import {
	DocumentRegular,
	DismissRegular,
	AddRegular,
	FolderRegular,
} from '@fluentui/react-icons';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
	root: {
		display: 'flex',
		flexDirection: 'column',
		height: '100%',
		overflow: 'hidden',
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		borderRadius: tokens.borderRadiusMedium,
	},
	header: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorNeutralBackground2,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		flexShrink: 0,
	},
	headerLabel: {
		fontWeight: tokens.fontWeightSemibold,
		fontSize: tokens.fontSizeBase300,
		flex: 1,
	},
	fileList: {
		flex: 1,
		overflowY: 'auto',
		padding: tokens.spacingVerticalXS,
	},
	fileItem: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalXS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
		borderRadius: tokens.borderRadiusSmall,
		':hover': {
			backgroundColor: tokens.colorNeutralBackground3,
		},
	},
	fileName: {
		flex: 1,
		fontSize: tokens.fontSizeBase200,
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		color: tokens.colorNeutralForeground1,
	},
	empty: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		height: '100%',
		gap: tokens.spacingVerticalS,
		color: tokens.colorNeutralForeground3,
		padding: tokens.spacingHorizontalL,
		textAlign: 'center',
	},
	picker: {
		flexShrink: 0,
		borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
		padding: tokens.spacingVerticalXS,
		maxHeight: '200px',
		overflowY: 'auto',
	},
	pickerItem: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalXS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
		cursor: 'pointer',
		borderRadius: tokens.borderRadiusSmall,
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground2,
		':hover': {
			backgroundColor: tokens.colorBrandBackground2,
			color: tokens.colorBrandForeground2,
		},
	},
	pickerItemSelected: {
		color: tokens.colorNeutralForeground4,
		cursor: 'default',
		':hover': {
			backgroundColor: 'transparent',
			color: tokens.colorNeutralForeground4,
		},
	},
	divider: {
		height: '1px',
		backgroundColor: tokens.colorNeutralStroke2,
		margin: `${tokens.spacingVerticalXS} 0`,
	},
	removeBtn: {
		minWidth: 'unset',
		padding: '0 2px',
		height: '20px',
		flexShrink: 0,
	},
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FileSelectorProps {
	label: string;
	accentColor: string;
	availableFiles: string[];
	selectedFiles: string[];
	onChange: (files: string[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileSelector({
	label,
	accentColor,
	availableFiles,
	selectedFiles,
	onChange,
}: FileSelectorProps) {
	const styles = useStyles();
	const selectedSet = new Set(selectedFiles);

	const addFile = (file: string) => {
		if (!selectedSet.has(file)) {
			onChange([...selectedFiles, file]);
		}
	};

	const removeFile = (file: string) => {
		onChange(selectedFiles.filter(f => f !== file));
	};

	const unselectedFiles = availableFiles.filter(f => !selectedSet.has(f));

	return (
		<div className={styles.root}>
			{/* Header */}
			<div className={styles.header}>
				<FolderRegular style={{ color: accentColor }} />
				<Text className={styles.headerLabel}>{label}</Text>
				<Badge appearance="filled" color="informative" size="small">
					{selectedFiles.length}
				</Badge>
			</div>

			{/* Selected files */}
			<div className={styles.fileList}>
				{selectedFiles.length === 0 ? (
					<div className={styles.empty}>
						<DocumentRegular fontSize={24} />
						<Text size={200}>
							Pick SQL files below to add to this side.
						</Text>
					</div>
				) : (
					selectedFiles.map(file => (
						<div key={file} className={styles.fileItem}>
							<DocumentRegular fontSize={14} />
							<span className={styles.fileName} title={file}>{file}</span>
							<Button
								className={styles.removeBtn}
								appearance="subtle"
								size="small"
								icon={<DismissRegular />}
								onClick={() => removeFile(file)}
								title="Remove"
							/>
						</div>
					))
				)}
			</div>

			{/* Available files to add */}
			{unselectedFiles.length > 0 && (
				<div className={styles.picker}>
					<div className={styles.divider} />
					{unselectedFiles.map(file => (
						<div
							key={file}
							className={styles.pickerItem}
							onClick={() => addFile(file)}
							title={`Add ${file}`}
						>
							<AddRegular fontSize={12} />
							<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
								{file}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
