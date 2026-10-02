import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { VENDOR } from './consts';
import { logger } from './logger';
import { QwenChatProvider } from './provider';

let provider: QwenChatProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
	const version = (context.extension.packageJSON as { version?: string }).version ?? 'unknown';
	logger.info(`Activating Qwen for Copilot Chat v${version}`);

	provider = new QwenChatProvider(context);
	context.subscriptions.push(provider, vscode.lm.registerLanguageModelChatProvider(VENDOR, provider));
	registerCommands(context, provider);

	// Make models discoverable without waiting for Copilot Chat, which may itself
	// be waiting for BYOK providers to register.
	provider.refresh();
	void refreshAfterCopilotActivation(provider);
}

async function refreshAfterCopilotActivation(chatProvider: QwenChatProvider): Promise<void> {
	try {
		await vscode.extensions.getExtension('github.copilot-chat')?.activate();
		chatProvider.refresh();
	} catch (error) {
		logger.debug(true, 'Could not activate GitHub Copilot Chat for an early model refresh.', error);
	}
}

export function deactivate(): void {
	logger.info('Qwen for Copilot Chat deactivated.');
	logger.dispose();
	provider = undefined;
}
