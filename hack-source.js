import { Client, Server } from 'quickbus';

const dbgBusHack = config => {
	const searchParams = new URLSearchParams(location.search);
	const callbackOrigin = searchParams.get('origin');

	const client = Client.forWindow(window.parent ?? window.opener, callbackOrigin);
	const server = new Server({
		startDebugging: (configuration, options = {}) => {
			return window.vscodeEditor.commands.executeCommand(
				'dbgBus.startDebugging',
				options.workspaceFolderUri ?? null,
				configuration,
				options
			);
		},
		stopDebugging: sessionId => {
			return window.vscodeEditor.commands.executeCommand('dbgBus.stopDebugging', sessionId);
		},
		sendDebugAdapterMessage: (sessionId, message) => {
			return window.vscodeEditor.commands.executeCommand('dbgBus.acceptAdapterMessage', sessionId, message);
		},
		customRequest: (sessionId, command, args) => {
			return window.vscodeEditor.commands.executeCommand('dbgBus.customRequest', sessionId, command, args);
		},
		listDebugSessions: () => {
			return window.vscodeEditor.commands.executeCommand('dbgBus.listSessions');
		},
		listBreakpoints: () => {
			return window.vscodeEditor.commands.executeCommand('dbgBus.listBreakpoints');
		},
		addBreakpoint: (uri, line, column = 1) => {
			return window.vscodeEditor.commands.executeCommand('dbgBus.addBreakpoint', uri, line, column);
		},
		executeDebugCommand: (command, ...args) => {
			return window.vscodeEditor.commands.executeCommand(command, ...args);
		},
		executeCommand: (command, ...args) => {
			return window.vscodeEditor.commands.executeCommand(command, ...args);
		}
	}, callbackOrigin);

	window.addEventListener('message', event => server.handleMessageEvent(event));

	config.commands.push({
		id: 'dbgBus.call',
		handler: (method, ...args) => client[method](...args)
	});
};

export default dbgBusHack;
