/**
 * Compact single-file dropdown selector.
 * Renders a labelled Combobox that lets the user pick (or clear) one SQL file.
 */

import React from 'react';
import {
	makeStyles,
	tokens,
	Label,
	Combobox,
	Option,
} from '@fluentui/react-components';

const useStyles = makeStyles({
	root: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalXS,
		minWidth: 0,
	},
	label: {
		fontWeight: tokens.fontWeightSemibold,
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground2,
		whiteSpace: 'nowrap',
		flexShrink: 0,
	},
	combobox: {
		minWidth: '180px',
		maxWidth: '340px',
		flex: 1,
	},
});

interface FileDropdownProps {
	id: string;
	label: string;
	accentColor: string;
	files: string[];
	value: string | null;
	onChange: (file: string | null) => void;
}

export function FileDropdown({ id, label, accentColor, files, value, onChange }: FileDropdownProps) {
	const styles = useStyles();

	return (
		<div className={styles.root}>
			<Label htmlFor={id} className={styles.label} style={{ color: accentColor }}>
				{label}
			</Label>
			<Combobox
				id={id}
				className={styles.combobox}
				size="small"
				placeholder="Select file…"
				value={value ?? ''}
				selectedOptions={value ? [value] : []}
				onOptionSelect={(_, data) => {
					onChange(data.optionValue ?? null);
				}}
				clearable
				freeform={false}
			>
				{files.map(f => (
					<Option key={f} value={f} text={f}>
						{f}
					</Option>
				))}
			</Combobox>
		</div>
	);
}
