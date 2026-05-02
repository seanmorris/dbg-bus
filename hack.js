(() => {
var __dbgBusBundle = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // hack-source.js
  var hack_source_exports = {};
  __export(hack_source_exports, {
    default: () => hack_source_default
  });

  // node_modules/quickbus/Client.mjs
  var incomplete = /* @__PURE__ */ new Map();
  var originSymbol = /* @__PURE__ */ Symbol("origin");
  var toSymbol = /* @__PURE__ */ Symbol("to");
  var fromSymbol = /* @__PURE__ */ Symbol("from");
  var canListen = (target) => target && typeof target.addEventListener === "function";
  var getGlobalListenerTarget = () => canListen(globalThis) ? globalThis : null;
  var normalizeOptions = (options) => {
    if (options && typeof options === "object" && "to" in options) {
      return {
        to: options.to,
        origin: options.origin ?? void 0,
        from: options.from ?? void 0
      };
    }
    throw new TypeError('Client requires a named options object with a "to" target.');
  };
  var resolveListenerTarget = (to, from) => {
    if (canListen(from)) {
      return from;
    }
    const globalTarget = getGlobalListenerTarget();
    if (globalTarget) {
      return globalTarget;
    }
    if (canListen(to)) {
      return to;
    }
    throw new TypeError("No valid message event target was provided for Client replies.");
  };
  var onMessage = (event) => {
    if (event.data.re && incomplete.has(event.data.re)) {
      const callbacks = incomplete.get(event.data.re);
      if (!event.data.error) {
        callbacks[0](event.data.result);
      } else {
        callbacks[1](event.data.error);
      }
    }
  };
  var sendMessage = (client, action, params, accept, reject) => {
    const token = crypto.randomUUID();
    const result = new Promise((_accept, _reject) => [accept, reject] = [_accept, _reject]);
    incomplete.set(token, [accept, reject]);
    let recipient = client[toSymbol];
    if (client[originSymbol]) {
      recipient.postMessage({ action, params, token }, client[originSymbol]);
    } else {
      recipient.postMessage({ action, params, token });
    }
    return result;
  };
  var Client = class _Client {
    /**
     * Create an RPC client around a `postMessage` transport.
     * @param {ClientOptions} options Named transport options.
     */
    constructor(options) {
      const normalized = normalizeOptions(options);
      this[originSymbol] = normalized.origin ?? void 0;
      this[toSymbol] = normalized.to;
      this[fromSymbol] = resolveListenerTarget(normalized.to, normalized.from);
      this[fromSymbol].addEventListener("message", onMessage);
      return new Proxy(this, {
        get: (target, action, receiver) => {
          if (typeof action === "symbol") {
            return target[action];
          }
          return (...params) => sendMessage(receiver, action, params);
        }
      });
    }
    /**
     * Create a client that sends requests to an iframe window.
     * @param {IframeLike} iframe Iframe element or iframe-like wrapper with `contentWindow`.
     * @param {string} [origin] Optional target origin for cross-origin iframe messaging.
     * @param {MessageEventTarget | null} [from] Optional local event target that receives replies.
     * @returns {Client} Configured iframe client.
     */
    static forIframe(iframe, origin, from = null) {
      if (!iframe?.contentWindow) {
        throw new TypeError("Iframe client requires an iframe with a contentWindow.");
      }
      return new _Client({ to: iframe.contentWindow, origin, from });
    }
    /**
     * Create a client for another window, such as `window.parent` or a popup.
     * @param {PostMessageTarget} targetWindow Remote window-like target that receives requests.
     * @param {string} [origin] Optional target origin for cross-origin messaging.
     * @param {MessageEventTarget | null} [from] Optional local event target that receives replies.
     * @returns {Client} Configured window client.
     */
    static forWindow(targetWindow, origin, from = null) {
      return new _Client({ to: targetWindow, origin, from });
    }
    /**
     * Create a client that both sends and receives on the same `MessagePort`.
     * @param {PostMessageTarget & MessageEventTarget} port Message port used for both directions.
     * @param {string} [origin] Optional target origin, accepted for API consistency.
     * @returns {Client} Configured message-port client.
     */
    static forMessagePort(port, origin) {
      return new _Client({ to: port, from: port, origin });
    }
    /**
     * Create a client for a `ServiceWorker` or `ServiceWorkerContainer`.
     * @param {PostMessageTarget | ServiceWorkerContainerLike} serviceWorker Service worker target or container with a `controller`.
     * @param {MessageEventTarget | null} [from] Optional local event target that receives replies.
     * @returns {Client} Configured service-worker client.
     */
    static forServiceWorker(serviceWorker, from = null) {
      const to = serviceWorker && "controller" in serviceWorker ? serviceWorker.controller : (
        /** @type {PostMessageTarget} */
        serviceWorker
      );
      const replyTarget = from ?? (serviceWorker && "controller" in serviceWorker && canListen(serviceWorker) ? serviceWorker : null);
      if (!to) {
        throw new TypeError("ServiceWorker client requires a controller or ServiceWorker target.");
      }
      return new _Client({ to, from: replyTarget });
    }
  };

  // node_modules/quickbus/Server.mjs
  var Server = class {
    /**
     * Create an RPC server that dispatches incoming actions to the supplied handler object.
     * @param {Record<string, (...params: unknown[]) => unknown | Promise<unknown>>} handler Method map used to service RPC calls.
     * @param {string[]} [origins] Allowed origins for replies when `event.origin` is present.
     */
    constructor(handler, ...origins) {
      this.handler = handler;
      this.origins = new Set(origins);
    }
    /**
     * Handle one inbound `message` event and post the result back to the event source.
     * @param {MessageEvent<RpcRequest> & { source: ReplyTarget | null }} event Incoming RPC message event.
     */
    async handleMessageEvent(event) {
      const { data, source } = event;
      const { action, token, params = [] } = data;
      if (action in this.handler) {
        let result, error;
        try {
          result = await this.handler[action](...params);
        } catch (_error) {
          error = JSON.parse(JSON.stringify(_error));
          console.error(_error);
        } finally {
          if (this.origins.size && event.origin) {
            if (!this.origins.has(event.origin)) {
              console.warn(`Got a message from unauthorized origin: ${event.origin}`);
            } else {
              source.postMessage({ re: token, result, error }, event.origin);
            }
          } else {
            source.postMessage({ re: token, result, error });
          }
        }
      }
    }
  };

  // hack-source.js
  var dbgBusHack = (config) => {
    const searchParams = new URLSearchParams(location.search);
    const callbackOrigin = searchParams.get("origin");
    const client = Client.forWindow(window.parent ?? window.opener, callbackOrigin);
    const server = new Server({
      startDebugging: (configuration, options = {}) => {
        return window.vscodeEditor.commands.executeCommand(
          "dbgBus.startDebugging",
          options.workspaceFolderUri ?? null,
          configuration,
          options
        );
      },
      stopDebugging: (sessionId) => {
        return window.vscodeEditor.commands.executeCommand("dbgBus.stopDebugging", sessionId);
      },
      sendDebugAdapterMessage: (sessionId, message) => {
        return window.vscodeEditor.commands.executeCommand("dbgBus.acceptAdapterMessage", sessionId, message);
      },
      customRequest: (sessionId, command, args) => {
        return window.vscodeEditor.commands.executeCommand("dbgBus.customRequest", sessionId, command, args);
      },
      listDebugSessions: () => {
        return window.vscodeEditor.commands.executeCommand("dbgBus.listSessions");
      },
      executeCommand: (command, ...args) => {
        return window.vscodeEditor.commands.executeCommand(command, ...args);
      }
    }, callbackOrigin);
    window.addEventListener("message", (event) => server.handleMessageEvent(event));
    config.commands.push({
      id: "dbgBus.call",
      handler: (method, ...args) => client[method](...args)
    });
  };
  var hack_source_default = dbgBusHack;
  return __toCommonJS(hack_source_exports);
})();

return __dbgBusBundle.default;
})()