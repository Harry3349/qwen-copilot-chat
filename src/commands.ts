import * as vscode from 'vscode';
import { CONFIG_SECTION, EXTERNAL_URLS } from './consts';
import { logger } from './logger';
import type { QwenChatProvider } from './provider';

/** Registers all user-facing commands of the extension. */
export function registerCommands(context: vscode.ExtensionContext, provider: QwenChatProvider): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('qwen-copilot.setApiKey', () => provider.configureApiKey()),
		vscode.commands.registerCommand('qwen-copilot.clearApiKey', () => provider.clearApiKey()),
		vscode.commands.registerCommand('qwen-copilot.getApiKey', () =>
			vscode.env.openExternal(vscode.Uri.parse(EXTERNAL_URLS.apiKeys)),
		),
		vscode.commands.registerCommand('qwen-copilot.refreshModels', () => provider.refresh()),
		vscode.commands.registerCommand('qwen-copilot.testConnection', () => provider.testConnection()),
		vscode.commands.registerCommand('qwen-copilot.openSettings', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_SECTION),
		),
		vscode.commands.registerCommand('qwen-copilot.showLogs', () => logger.show()),
	);
}
