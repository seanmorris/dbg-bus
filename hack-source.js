import { Client, Server } from 'quickbus';

let executeVSCodeCommandPromise;

const getExecuteVSCodeCommand = () => {
	if(executeVSCodeCommandPromise)
	{
		return executeVSCodeCommandPromise;
	}

	const getWindowCommandExecutor = async () => {
		if(window.vscodeEditor?.commands?.executeCommand)
		{
			return window.vscodeEditor.commands.executeCommand.bind(window.vscodeEditor.commands);
		}

		const vscodeEditor = await window.vscodeEditorReady;

		if(vscodeEditor?.commands?.executeCommand)
		{
			return vscodeEditor.commands.executeCommand.bind(vscodeEditor.commands);
		}

		throw new Error('The VS Code command bridge became ready without a commands API.');
	};

	executeVSCodeCommandPromise = new Promise((resolve, reject) => {
		const finishWithFallback = error => {
			getWindowCommandExecutor().then(resolve, fallbackError => reject(error || fallbackError));
		};

		if(typeof window.require !== 'function')
		{
			finishWithFallback();
			return;
		}

		try
		{
			window.require(
				['vs/workbench/browser/web.factory']
				, module => {
					const executeCommand = module?.commands?.executeCommand;

					if(typeof executeCommand === 'function')
					{
						resolve(executeCommand);
						return;
					}

					finishWithFallback();
				}
				, finishWithFallback
			);
		}
		catch(error)
		{
			finishWithFallback(error);
		}
	});

	return executeVSCodeCommandPromise;
};

const dbgBusHack = config => {
	const searchParams = new URLSearchParams(location.search);
	const callbackOrigin = searchParams.get('origin');

	const client = Client.forWindow(window.parent ?? window.opener, callbackOrigin);
	const server = new Server({
		startDebugging: async (configuration, options = {}) => {
			const executeCommand = await getExecuteVSCodeCommand();

			return executeCommand(
				'dbgBus.startDebugging',
				options.workspaceFolderUri ?? null,
				configuration,
				options
			);
		},
		stopDebugging: async sessionId => {
			const executeCommand = await getExecuteVSCodeCommand();

			return executeCommand('dbgBus.stopDebugging', sessionId);
		},
		sendDebugAdapterMessage: async (sessionId, message) => {
			const executeCommand = await getExecuteVSCodeCommand();

			return executeCommand('dbgBus.acceptAdapterMessage', sessionId, message);
		},
		customRequest: async (sessionId, command, args) => {
			const executeCommand = await getExecuteVSCodeCommand();

			return executeCommand('dbgBus.customRequest', sessionId, command, args);
		},
		listDebugSessions: async () => {
			const executeCommand = await getExecuteVSCodeCommand();

			return executeCommand('dbgBus.listSessions');
		},
		listBreakpoints: async () => {
			const executeCommand = await getExecuteVSCodeCommand();

			return executeCommand('dbgBus.listBreakpoints');
		},
		listOpenBreakpoints: async () => {
			const executeCommand = await getExecuteVSCodeCommand();

			return executeCommand('dbgBus.listOpenBreakpoints');
		},
		addBreakpoint: async (uri, line, column = 1) => {
			const executeCommand = await getExecuteVSCodeCommand();

			return executeCommand('dbgBus.addBreakpoint', uri, line, column);
		},
		executeDebugCommand: async (command, ...args) => {
			const executeCommand = await getExecuteVSCodeCommand();

			return executeCommand(command, ...args);
		},
		executeCommand: async (command, ...args) => {
			const executeCommand = await getExecuteVSCodeCommand();

			return executeCommand(command, ...args);
		}
	}, callbackOrigin);

	window.addEventListener('message', event => server.handleMessageEvent(event));

	config.commands.push({
		id: 'dbgBus.call',
		handler: (method, ...args) => client[method](...args)
	});
};

export default dbgBusHack;
