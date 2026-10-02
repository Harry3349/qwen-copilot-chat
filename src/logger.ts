import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from './consts';

let channel: vscode.LogOutputChannel | undefined;

function getChannel(): vscode.LogOutputChannel {
	if (!channel) {
		channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME, { log: true });
	}
	return channel;
}

function format(args: readonly unknown[]): string {
	return args
		.map((arg) => {
			if (typeof arg === 'string') {
				return arg;
			}
			if (arg instanceof Error) {
				return arg.stack ?? `${arg.name}: ${arg.message}`;
			}
			try {
				return JSON.stringify(arg);
			} catch {
				return String(arg);
			}
		})
		.join(' ');
}

/**
 * Thin wrapper around a VS Code log output channel.
 *
 * `info`/`warn`/`error` are always written; `debug` messages are only written
 * when the `debugMode` setting enables diagnostic output.
 */
export const logger = {
	info(...args: unknown[]): void {
		getChannel().info(format(args));
	},
	warn(...args: unknown[]): void {
		getChannel().warn(format(args));
	},
	error(...args: unknown[]): void {
		getChannel().error(format(args));
	},
	debug(enabled: boolean, ...args: unknown[]): void {
		if (enabled) {
			getChannel().debug(format(args));
		}
	},
	show(): void {
		getChannel().show(true);
	},
	dispose(): void {
		channel?.dispose();
		channel = undefined;
	},
};
