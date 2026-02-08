// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "sqlgem" is now active in the web extension host!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('sqlgem.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from sqlgem in a web extension host!');
	});

	const windowDisposable = vscode.commands.registerCommand('sqlgem.showWindow', () => {
		const panel = vscode.window.createWebviewPanel(
			'sqlgemWindow',
			'SQLGem Window',
			vscode.ViewColumn.One,
			{
				enableScripts: true
			}
		);

		panel.webview.html = getWebviewContent();
	});

	context.subscriptions.push(windowDisposable);
	context.subscriptions.push(disposable);

	function getWebviewContent(): string {
	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>SQLGem Window</title>
			<style>
				body { font-family: sans-serif; margin: 0; padding: 0; }
				.window { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; transition: background 0.3s; }
				.content { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 32px; color: #222; transition: background 0.3s, color 0.3s; }
				.dark .window { background: #23272e; }
				.dark .content { background: #23272e; color: #f5f5f5; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
				.toggle-btn {
					margin-bottom: 16px;
					padding: 8px 16px;
					border: none;
					border-radius: 4px;
					background: #007acc;
					color: #fff;
					cursor: pointer;
					font-size: 1rem;
					transition: background 0.2s;
				}
				.toggle-btn:hover { background: #005fa3; }
			</style>
		</head>
		<body>
			<div class="window">
				<div class="content">
					<button class="toggle-btn" id="toggleMode">Toggle Light/Dark Mode</button>
					<h1>SQLGem Window</h1>
					<p>This is a sample window rendered in a webview.</p>
				</div>
			</div>
			<script>
				const root = document.documentElement;
				const btn = document.getElementById('toggleMode');
				btn.addEventListener('click', () => {
					root.classList.toggle('dark');
					localStorage.setItem('sqlgem-dark-mode', root.classList.contains('dark'));
				});
				// On load, restore mode
				if (localStorage.getItem('sqlgem-dark-mode') === 'true') {
					root.classList.add('dark');
				}
			</script>
		</body>
		</html>
	`;
	}

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
