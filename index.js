'use strict';
import * as vscode from 'vscode';

const adapters = new Map;

const sessionInfo = session => ({
	id: session.id,
	type: session.type,
	name: session.name,
	workspaceFolder: session.workspaceFolder?.uri.toString() ?? null,
	configuration: session.configuration
});

class BusDebugAdapter
{
	constructor(session)
	{
		this.session = session;
		this.emitter = new vscode.EventEmitter;
	}

	get onDidSendMessage()
	{
		return this.emitter.event;
	}

	async handleMessage(message)
	{
		return vscode.commands.executeCommand(
			'dbgBus.call',
			'acceptVSCodeMessage',
			sessionInfo(this.session),
			message
		);
	}

	acceptMessage(message)
	{
		this.emitter.fire(message);
	}

	dispose()
	{
		this.emitter.dispose();
	}
}

class BusDebugAdapterDescriptorFactory
{
	createDebugAdapterDescriptor(session)
	{
		const adapter = new BusDebugAdapter(session);
		adapters.set(session.id, adapter);

		void vscode.commands.executeCommand(
			'dbgBus.call',
			'debugSessionStarted',
			sessionInfo(session)
		);

		return new vscode.DebugAdapterInlineImplementation(adapter);
	}
}

class BusDebugConfigurationProvider
{
	resolveDebugConfiguration(folder, config)
	{
		return {
			type: 'dbgBus',
			request: 'launch',
			name: 'Debug Bus',
			...config
		};
	}
}

const getSession = sessionId => {
	if(!sessionId)
	{
		return vscode.debug.activeDebugSession ?? null;
	}

	return vscode.debug.sessions.find(session => session.id === sessionId) ?? null;
};

export function activate(context)
{
	const descriptorFactory = new BusDebugAdapterDescriptorFactory;
	const configurationProvider = new BusDebugConfigurationProvider;

	context.subscriptions.push(
		vscode.debug.registerDebugAdapterDescriptorFactory('dbgBus', descriptorFactory),
		vscode.debug.registerDebugConfigurationProvider('dbgBus', configurationProvider),
		vscode.commands.registerCommand('dbgBus.startDebugging', async (folderUri, configuration, options = {}) => {
			const folder = folderUri
				? vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(folderUri))
				: undefined;

			return vscode.debug.startDebugging(folder, configuration, options);
		}),
		vscode.commands.registerCommand('dbgBus.stopDebugging', async sessionId => {
			const session = getSession(sessionId);

			if(!session)
			{
				return false;
			}

			return vscode.debug.stopDebugging(session);
		}),
		vscode.commands.registerCommand('dbgBus.acceptAdapterMessage', async (sessionId, message) => {
			const adapter = adapters.get(sessionId);

			if(!adapter)
			{
				throw new Error(`Unknown debug session: ${sessionId}`);
			}

			adapter.acceptMessage(message);
			return true;
		}),
		vscode.commands.registerCommand('dbgBus.customRequest', async (sessionId, command, args) => {
			const session = getSession(sessionId);

			if(!session)
			{
				throw new Error(`Unknown debug session: ${sessionId}`);
			}

			return session.customRequest(command, args);
		}),
		vscode.commands.registerCommand('dbgBus.listSessions', () => {
			return vscode.debug.sessions.map(sessionInfo);
		}),
		vscode.debug.onDidStartDebugSession(session => {
			void vscode.commands.executeCommand('dbgBus.call', 'didStartDebugSession', sessionInfo(session));
		}),
		vscode.debug.onDidTerminateDebugSession(session => {
			const adapter = adapters.get(session.id);

			if(adapter)
			{
				adapter.dispose();
				adapters.delete(session.id);
			}

			void vscode.commands.executeCommand('dbgBus.call', 'didTerminateDebugSession', sessionInfo(session));
		}),
		vscode.debug.onDidChangeActiveDebugSession(session => {
			void vscode.commands.executeCommand(
				'dbgBus.call',
				'didChangeActiveDebugSession',
				session ? sessionInfo(session) : null
			);
		})
	);
}
