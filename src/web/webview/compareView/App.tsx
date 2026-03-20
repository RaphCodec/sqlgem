/**
 * Schema Compare — main React application.
 *
 * Layout:
 *   Setup view  — two file selectors (Source / Target) + Compare button
 *   Results view — results tree on the left, side-by-side diff on the right
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
	FluentProvider,
	webLightTheme,
	webDarkTheme,
	Button,
	Checkbox,
	makeStyles,
	tokens,
	Spinner,
	Text,
	Divider,
	Toolbar,
	ToolbarButton,
	Tooltip,
	Badge,
} from '@fluentui/react-components';
import {
	ArrowSyncRegular,
	ScriptRegular,
	ArrowLeftRegular,
	DocumentTextRegular,
	ArrowSwapRegular,
} from '@fluentui/react-icons';
import { FileSelector } from './FileSelector';
import { ResultsTree } from './ResultsTree';
import { DiffView } from './DiffView';
import type { ExtensionMessage, WebviewMessage, CompareResult } from './types';

// ---------------------------------------------------------------------------
// VS Code API bridge
// ---------------------------------------------------------------------------

declare const acquireVsCodeApi: () => {
	postMessage(message: WebviewMessage): void;
	getState(): unknown;
	setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
	root: {
		width: '100vw',
		height: '100vh',
		display: 'flex',
		flexDirection: 'column',
		overflow: 'hidden',
	},
	toolbar: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorNeutralBackground1,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		flexShrink: 0,
		flexWrap: 'wrap',
	},
	toolbarTitle: {
		fontWeight: tokens.fontWeightSemibold,
		fontSize: tokens.fontSizeBase400,
		marginRight: tokens.spacingHorizontalM,
	},
	toolbarSpacer: {
		flex: 1,
	},
	// ---- Setup view ----
	setupView: {
		flex: 1,
		display: 'flex',
		flexDirection: 'column',
		overflow: 'hidden',
		padding: tokens.spacingHorizontalM,
		gap: tokens.spacingVerticalM,
	},
	setupSelectors: {
		flex: 1,
		display: 'grid',
		gridTemplateColumns: '1fr 1fr',
		gap: tokens.spacingHorizontalM,
		minHeight: 0,
	},
	setupActions: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalM,
		flexShrink: 0,
	},
	// ---- Results view ----
	resultsView: {
		flex: 1,
		display: 'grid',
		gridTemplateColumns: '280px 1fr',
		overflow: 'hidden',
	},
	treePanel: {
		borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
		overflow: 'hidden',
		display: 'flex',
		flexDirection: 'column',
	},
	diffPanel: {
		overflow: 'hidden',
		display: 'flex',
		flexDirection: 'column',
	},
	diffPanelHeader: {
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground2,
		backgroundColor: tokens.colorNeutralBackground2,
		flexShrink: 0,
	},
	diffContent: {
		flex: 1,
		overflow: 'hidden',
	},
	// ---- Loading / error ----
	centered: {
		flex: 1,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: tokens.spacingVerticalM,
	},
	errorText: {
		color: tokens.colorStatusDangerForeground1,
		maxWidth: '600px',
		textAlign: 'center',
	},
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppView = 'setup' | 'comparing' | 'results';

interface DiffPair {
	sourceSql: string;
	targetSql: string;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
	const styles = useStyles();

	// Theme detection
	const [isDark, setIsDark] = useState(
		document.body.classList.contains('vscode-dark') ||
		document.body.classList.contains('vscode-high-contrast'),
	);

	useEffect(() => {
		const observer = new MutationObserver(() => {
			setIsDark(
				document.body.classList.contains('vscode-dark') ||
				document.body.classList.contains('vscode-high-contrast'),
			);
		});
		observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	}, []);

	// Application state
	const [view,         setView]         = useState<AppView>('setup');
	const [files,        setFiles]        = useState<string[]>([]);
	const [sourceFiles,  setSourceFiles]  = useState<string[]>([]);
	const [targetFiles,  setTargetFiles]  = useState<string[]>([]);
	const [result,       setResult]       = useState<CompareResult | null>(null);
	const [selectedKey,  setSelectedKey]  = useState<string | null>(null);
	const [diffMap,      setDiffMap]      = useState<Record<string, DiffPair>>({});
	const [ignoreCase,   setIgnoreCase]   = useState(false);
	const [error,        setError]        = useState<string | null>(null);
	const [genMigration, setGenMigration] = useState(false);

	// Message handler
	const handleMessage = useCallback((event: MessageEvent) => {
		const msg = event.data as ExtensionMessage;
		switch (msg.command) {
			case 'filesListed':
				setFiles(msg.files);
				break;
			case 'compareResult':
				setResult(msg.result);
				setView('results');
				setSelectedKey(null);
				break;
			case 'diffContent':
				setDiffMap(prev => ({
					...prev,
					[msg.key]: { sourceSql: msg.sourceSql, targetSql: msg.targetSql },
				}));
				break;
			case 'migrationReady':
				setGenMigration(false);
				break;
			case 'error':
				setError(msg.message);
				setView('setup');
				break;
		}
	}, []);

	useEffect(() => {
		window.addEventListener('message', handleMessage);
		vscode.postMessage({ command: 'ready' });
		return () => window.removeEventListener('message', handleMessage);
	}, [handleMessage]);

	// Actions
	const swapSides = () => {
		setSourceFiles(targetFiles);
		setTargetFiles(sourceFiles);
	};

	const swapAndRecompare = () => {
		if (targetFiles.length === 0 && sourceFiles.length === 0) { return; }
		const newSource = targetFiles;
		const newTarget = sourceFiles;
		setSourceFiles(newSource);
		setTargetFiles(newTarget);
		setError(null);
		setView('comparing');
		setDiffMap({});
		vscode.postMessage({
			command: 'compare',
			sourceFiles: newSource,
			targetFiles: newTarget,
			options: { ignoreCase },
		});
	};

	const runComparison = () => {
		if (sourceFiles.length === 0 || targetFiles.length === 0) { return; }
		setError(null);
		setView('comparing');
		setDiffMap({});
		vscode.postMessage({
			command: 'compare',
			sourceFiles,
			targetFiles,
			options: { ignoreCase },
		});
	};

	const handleSelectObject = (key: string) => {
		setSelectedKey(key);
		if (!diffMap[key]) {
			vscode.postMessage({ command: 'requestDiff', key });
		}
	};

	const handleGenerateMigration = () => {
		setGenMigration(true);
		vscode.postMessage({ command: 'generateMigration' });
	};

	const handleRefreshFiles = () => {
		vscode.postMessage({ command: 'listFiles' });
	};

	const currentDiff = selectedKey ? diffMap[selectedKey] : null;
	const selectedObj = result?.objects.find(o => o.key === selectedKey);

	// ---------------------------------------------------------------------------
	// Render helpers
	// ---------------------------------------------------------------------------

	const renderToolbar = () => (
		<div className={styles.toolbar}>
			<Text className={styles.toolbarTitle}>Schema Compare</Text>

			{view === 'results' && (
				<>
					<Button
						appearance="subtle"
						icon={<ArrowLeftRegular />}
						onClick={() => setView('setup')}
						size="small"
					>
						Back to Setup
					</Button>
					<Tooltip content="Swap source and target, then re-compare" relationship="label">
						<Button
							appearance="subtle"
							icon={<ArrowSwapRegular />}
							onClick={swapAndRecompare}
							size="small"
						>
							Swap &amp; Re-compare
						</Button>
					</Tooltip>
					<Tooltip content="Run comparison again" relationship="label">
						<Button
							appearance="subtle"
							icon={<ArrowSyncRegular />}
							onClick={runComparison}
							size="small"
						>
							Re-compare
						</Button>
					</Tooltip>
					<Tooltip content="Generate migration SQL and open in editor" relationship="label">
						<Button
							appearance="subtle"
							icon={<ScriptRegular />}
							onClick={handleGenerateMigration}
							disabled={genMigration || !result}
							size="small"
						>
							{genMigration ? 'Generating…' : 'Migration Script'}
						</Button>
					</Tooltip>
				</>
			)}

			<div className={styles.toolbarSpacer} />

			{view === 'setup' && (
				<Tooltip content="Refresh file list from workspace" relationship="label">
					<Button
						appearance="subtle"
						icon={<ArrowSyncRegular />}
						onClick={handleRefreshFiles}
						size="small"
					>
						Refresh Files
					</Button>
				</Tooltip>
			)}
		</div>
	);

	// ---- Setup view ----
	const renderSetup = () => (
		<div className={styles.setupView}>
			{error && (
				<Text className={styles.errorText}>{error}</Text>
			)}

			<div className={styles.setupSelectors}>
				<FileSelector
					label="Source"
					accentColor="#2563eb"
					availableFiles={files}
					selectedFiles={sourceFiles}
					onChange={setSourceFiles}
				/>
				<FileSelector
					label="Target"
					accentColor="#16a34a"
					availableFiles={files}
					selectedFiles={targetFiles}
					onChange={setTargetFiles}
				/>
			</div>

			<div className={styles.setupActions}>
				<Button
					appearance="primary"
					icon={<ArrowSyncRegular />}
					onClick={runComparison}
					disabled={sourceFiles.length === 0 || targetFiles.length === 0}
				>
					Compare
				</Button>
				<Tooltip content="Swap source and target files" relationship="label">
					<Button
						appearance="secondary"
						icon={<ArrowSwapRegular />}
						onClick={swapSides}
						disabled={sourceFiles.length === 0 && targetFiles.length === 0}
					>
						Swap
					</Button>
				</Tooltip>
				<Checkbox
					label="Ignore case differences"
					checked={ignoreCase}
					onChange={(_, data) => setIgnoreCase(!!data.checked)}
				/>
				{(sourceFiles.length === 0 || targetFiles.length === 0) && (
					<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
						Select at least one file on each side.
					</Text>
				)}
			</div>
		</div>
	);

	// ---- Comparing spinner ----
	const renderComparing = () => (
		<div className={styles.centered}>
			<Spinner size="large" label="Comparing schemas…" />
		</div>
	);

	// ---- Results view ----
	const renderResults = () => (
		<div className={styles.resultsView}>
			{/* Left: results tree */}
			<div className={styles.treePanel}>
				{result && (
					<ResultsTree
						result={result}
						selectedKey={selectedKey}
						onSelect={handleSelectObject}
					/>
				)}
			</div>

			{/* Right: diff view */}
			<div className={styles.diffPanel}>
				{selectedObj && (
					<div className={styles.diffPanelHeader}>
						<strong>
							{selectedObj.schemaName !== 'dbo'
								? `${selectedObj.schemaName}.${selectedObj.name}`
								: selectedObj.name}
						</strong>
						{' — '}
						{selectedObj.change === 'added'    && <Badge color="success">Added</Badge>}
						{selectedObj.change === 'removed'  && <Badge color="danger">Removed</Badge>}
						{selectedObj.change === 'modified' && <Badge color="warning">Modified</Badge>}
						{selectedObj.change === 'unchanged'&& <Badge color="informative">Unchanged</Badge>}
						{currentDiff == null && selectedObj.change !== 'unchanged' && (
							<Spinner size="tiny" style={{ marginLeft: 8 }} />
						)}
					</div>
				)}

				<div className={styles.diffContent}>
					<DiffView
						sourceSql={currentDiff?.sourceSql ?? ''}
						targetSql={currentDiff?.targetSql ?? ''}
						sourceLabel={result?.sourceLabel ?? 'Source'}
						targetLabel={result?.targetLabel ?? 'Target'}
					/>
				</div>
			</div>
		</div>
	);

	// ---------------------------------------------------------------------------
	return (
		<FluentProvider theme={isDark ? webDarkTheme : webLightTheme} style={{ height: '100%' }}>
			<div className={styles.root}>
				{renderToolbar()}
				{view === 'setup'     && renderSetup()}
				{view === 'comparing' && renderComparing()}
				{view === 'results'   && renderResults()}
			</div>
		</FluentProvider>
	);
}
