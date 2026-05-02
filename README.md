# Debug Bus

`dbg-bus` is a web-focused VS Code extension that exposes the embedded VS Code debugger to a host-page runtime.

It mirrors the same structural pattern as `file-bus`:

- `index.js` registers the VS Code-side bridge and inline debug adapter.
- `hack-source.js` is the browser-side source that imports `quickbus`.
- `hack.js` is the bundled single-file hack artifact shipped to the web extension host.

## Architecture

The extension registers a debugger type named `dbgBus`.

When VS Code starts a `dbgBus` session:

- VS Code sends Debug Adapter Protocol messages into the inline adapter.
- The inline adapter forwards those messages to the host page using `quickbus`.
- The host page runtime responds by sending DAP messages back into the session with `sendDebugAdapterMessage(sessionId, message)`.

The browser hack also exposes a small control surface to the host page:

- `startDebugging(configuration, options?)`
- `stopDebugging(sessionId?)`
- `sendDebugAdapterMessage(sessionId, message)`
- `customRequest(sessionId, command, args?)`
- `listDebugSessions()`
- `executeCommand(command, ...args)`

## Build

```bash
npm install
npm run compile
```

This emits:

- `dist/index.js`
- `hack.js`

That artifact shape matches the web-extension loading pattern used by `vscode-web-static`.

## Host Example

The host page should provide the runtime-facing half of the bridge. A minimal shape looks like:

```js
import { Client, Server } from 'quickbus';

const iframe = document.querySelector('iframe');
const origin = new URL(iframe.src).origin;

const vscode = Client.forIframe(iframe, origin);

const dapServer = new Server({
  acceptVSCodeMessage(session, message) {
    return phpDbgAdapter.acceptMessage(session, message);
  },
  debugSessionStarted(session) {
    phpDbgAdapter.createSession(session);
  },
  didStartDebugSession(session) {
    phpDbgAdapter.markStarted(session);
  },
  didTerminateDebugSession(session) {
    phpDbgAdapter.destroySession(session.id);
  },
  didChangeActiveDebugSession(session) {
    phpDbgAdapter.setActiveSession(session?.id ?? null);
  }
}, origin);

window.addEventListener('message', event => dapServer.handleMessageEvent(event));

async function startPhpDebug(config) {
  return vscode.startDebugging({
    type: 'dbgBus',
    request: 'launch',
    name: 'PHP DBG Wasm',
    ...config
  });
}

async function sendRuntimeMessage(sessionId, message) {
  return vscode.sendDebugAdapterMessage(sessionId, message);
}
```

The phpdbg wasm integration can sit entirely on the host page side and map between its own runtime state and DAP messages.
