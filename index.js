'use strict';
import * as vscode from 'vscode';

const adapters = new Map;
const sessions = new Map;
let activeSessionId = null;
const languageAssociationRegexes = new Map;

const sessionInfo = session => ({
	id: session.id,
	type: session.type,
	name: session.name,
	workspaceFolder: session.workspaceFolder?.uri.toString() ?? null,
	configuration: session.configuration
});

const breakpointInfo = breakpoint => ({
	enabled: breakpoint.enabled,
	condition: breakpoint.condition ?? null,
	hitCondition: breakpoint.hitCondition ?? null,
	logMessage: breakpoint.logMessage ?? null,
	location: breakpoint.location
		? {
			uri: breakpoint.location.uri.toString(),
			line: breakpoint.location.range.start.line + 1,
			column: breakpoint.location.range.start.character + 1
		}
		: null
});

const listSessions = () => Array.from(sessions.values());

const getOpenTabUris = () => {
	const uris = new Set;

	for(const group of vscode.window.tabGroups?.all ?? [])
	{
		for(const tab of group.tabs ?? [])
		{
			const input = tab.input;

			if(typeof vscode.TabInputText !== 'undefined' && input instanceof vscode.TabInputText)
			{
				uris.add(input.uri.toString());
				continue;
			}

			if(typeof vscode.TabInputTextDiff !== 'undefined' && input instanceof vscode.TabInputTextDiff)
			{
				uris.add(input.original.toString());
				uris.add(input.modified.toString());
			}
		}
	}

	if(vscode.window.activeTextEditor?.document?.uri)
	{
		uris.add(vscode.window.activeTextEditor.document.uri.toString());
	}

	return uris;
};

const listOpenBreakpoints = () => {
	const openTabUris = getOpenTabUris();

	return vscode.debug.breakpoints
		.filter(breakpoint => {
			const uri = breakpoint.location?.uri?.toString();
			return uri && openTabUris.has(uri);
		})
		.map(breakpointInfo);
};

const escapeRegex = string => String(string).replace(/[|\\{}()[\]^$+?.]/g, '\\$&');

const globToRegExp = pattern => new RegExp(
	`^${escapeRegex(pattern).replaceAll('\\*', '.*').replaceAll('\\?', '.')}$`,
	'i'
);

const getLanguageAssociations = () => {
	const configuredAssociations = vscode.workspace
		.getConfiguration('dbgBus')
		.get('languageAssociations', {});

	const associations = configuredAssociations || {};

	if(!associations || typeof associations !== 'object')
	{
		return [];
	}

	return Object.entries(associations)
		.filter(([, languageId]) => typeof languageId === 'string' && languageId.trim())
		.map(([pattern, languageId]) => [String(pattern), languageId.trim()]);
};

const getAssociationRegex = pattern => {
	if(!languageAssociationRegexes.has(pattern))
	{
		languageAssociationRegexes.set(pattern, globToRegExp(pattern));
	}

	return languageAssociationRegexes.get(pattern);
};

const getAssociatedLanguageId = document => {
	const path = document.uri.path || '';
	const name = document.uri.path.split('/').pop() || '';

	for(const [pattern, languageId] of getLanguageAssociations())
	{
		if(pattern.startsWith('.') && !pattern.includes('*') && !pattern.includes('?'))
		{
			if(name.endsWith(pattern))
			{
				return languageId;
			}

			continue;
		}

		const regex = getAssociationRegex(pattern);

		if(regex.test(path) || regex.test(name))
		{
			return languageId;
		}
	}

	return null;
};

const maybeApplyLanguageAssociation = async document => {
	if(!document || document.isClosed)
	{
		return;
	}

	const languageId = getAssociatedLanguageId(document);

	if(!languageId || document.languageId === languageId)
	{
		return;
	}

	try
	{
		await vscode.languages.setTextDocumentLanguage(document, languageId);
	}
	catch(error)
	{
		console.warn('[dbg-bus] Failed to apply language association', {
			uri: document.uri.toString()
			, languageId
			, error: error?.message ?? String(error)
		});
	}
};

const refreshLanguageAssociations = async () => {
	for(const document of vscode.workspace.textDocuments)
	{
		await maybeApplyLanguageAssociation(document);
	}
};

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
		const response = await vscode.commands.executeCommand(
			'dbgBus.call',
			'acceptVSCodeMessage',
			sessionInfo(this.session),
			message
		);

		if(response)
		{
			this.acceptMessage(response);
		}
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
		sessions.set(session.id, session);
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
		return sessions.get(activeSessionId) ?? vscode.debug.activeDebugSession ?? null;
	}

	return sessions.get(sessionId) ?? null;
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
			return listSessions().map(sessionInfo);
		}),
		vscode.commands.registerCommand('dbgBus.listBreakpoints', () => {
			return vscode.debug.breakpoints.map(breakpointInfo);
		}),
		vscode.commands.registerCommand('dbgBus.listOpenBreakpoints', () => {
			return listOpenBreakpoints();
		}),
		vscode.commands.registerCommand('dbgBus.addBreakpoint', async (uri, line, column = 1) => {
			const breakpoint = new vscode.SourceBreakpoint(
				new vscode.Location(
					vscode.Uri.parse(uri),
					new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1))
				)
			);

			vscode.debug.addBreakpoints([breakpoint]);

			return breakpointInfo(breakpoint);
		}),
		vscode.debug.onDidStartDebugSession(session => {
			sessions.set(session.id, session);
			activeSessionId = session.id;
			void vscode.commands.executeCommand('dbgBus.call', 'didStartDebugSession', sessionInfo(session));
		}),
		vscode.debug.onDidTerminateDebugSession(session => {
			const adapter = adapters.get(session.id);
			sessions.delete(session.id);

			if(adapter)
			{
				adapter.dispose();
				adapters.delete(session.id);
			}

			if(activeSessionId === session.id)
			{
				activeSessionId = null;
			}

			void vscode.commands.executeCommand('dbgBus.call', 'didTerminateDebugSession', sessionInfo(session));
		}),
		vscode.debug.onDidChangeActiveDebugSession(session => {
			activeSessionId = session?.id ?? null;

			void vscode.commands.executeCommand(
				'dbgBus.call',
				'didChangeActiveDebugSession',
				session ? sessionInfo(session) : null
			);
		}),
		vscode.workspace.onDidOpenTextDocument(document => {
			void maybeApplyLanguageAssociation(document);
		}),
		vscode.window.onDidChangeVisibleTextEditors(editors => {
			void Promise.all(editors.map(editor => maybeApplyLanguageAssociation(editor.document)));
		}),
		vscode.workspace.onDidChangeConfiguration(event => {
			if(event.affectsConfiguration('dbgBus.languageAssociations'))
			{
				languageAssociationRegexes.clear();
				void refreshLanguageAssociations();
			}
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			void refreshLanguageAssociations();
		})
	);

	void refreshLanguageAssociations();
}
