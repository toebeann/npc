import { EventEmitter } from 'events';
import { createServer, Server, Socket, connect, ListenOptions } from 'net';
import { EOL } from 'os';
import { join } from 'path';
import TypedEmitter from 'typed-emitter';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

/**
 * {@link https://zod.dev Zod schema} for {@link Npc npc procedure} arguments.
 * @see {@link https://zod.dev Zod}
 */
export const inputSchema = z.unknown();

/**
 * npc procedure arguments, inferred from {@link inputSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Input = z.infer<typeof inputSchema>;

/**
 * {@link https://zod.dev Zod schema} for npc request/response IDs.
 * @see {@link https://zod.dev Zod}
 */
export const idSchema = z.union([z.string(), z.number().int(), z.null()]);

/**
 * npc request/response IDs, inferred from {@link idSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Id = z.infer<typeof idSchema>;

/**
 * {@link https://zod.dev Zod schema} for the output of npc callbacks.
 * @see {@link https://zod.dev Zod}
 */
export const resultSchema = z.unknown();

/**
 * The output of an npc callback, inferred from {@link resultSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Result = z.infer<typeof resultSchema>;

/**
 * {@link https://zod.dev Zod schema} for errors.
 * @see {@link https://zod.dev Zod}
 */
export const errorDataSchema = z.unknown();

/**
 * Generic error data, inferred from {@link errorDataSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type ErrorData = z.infer<typeof errorDataSchema>;

/**
 * {@link https://zod.dev Zod schema} for the underlying callback of an npc procedure.
 * @see {@link https://zod.dev Zod}
 */
export const callbackSchema = z
    .function()
    .args(inputSchema)
    .returns(resultSchema);

/**
 * An underlying callback of an npc procedure, inferred from {@link callbackSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Callback = z.infer<typeof callbackSchema>;

const winRoot = join('\\\\.', 'pipe');
/**
 * The root namespace for npc endpoints: `\\.\pipe\.npc`
 */
export const rootNamespace = join(winRoot, '.npc');

/**
 * {@link https://zod.dev Zod schema} for npc client requests
 * @see {@link https://zod.dev Zod}
 */
export const requestSchema = z.object({
    npc: z.literal('0.1'),
    id: idSchema.optional(),
    input: inputSchema.optional(),
});

/**
 * An npc client request, inferred from {@link requestSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Request = z.infer<typeof requestSchema>;

/**
 * {@link https://zod.dev Zod schema} for npc errors
 * @see {@link https://zod.dev Zod}
 */
export const errorSchema = z.object({
    code: z.number().int(),
    message: z.string(),
    data: errorDataSchema.optional(),
});

/**
 * An npc error, inferred from {@link errorSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Error = z.infer<typeof errorSchema>;

/**
 * {@link https://zod.dev Zod schema} for npc server responses.
 * @see {@link https://zod.dev Zod}
 */
export const responseSchema = z.intersection(
    z.object({
        npc: z.literal('0.1'),
        id: idSchema,
    }),
    z.discriminatedUnion('status', [
        z.object({
            status: z.literal('success'),
            result: resultSchema,
        }),
        z.object({
            status: z.literal('error'),
            error: errorSchema,
        }),
    ])
);

/**
 * An npc server response, inferred from {@link responseSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Response = z.infer<typeof responseSchema>;

/**
 * {@link typed-emitter!TypedEventEmitter TypedEmitter} mapping for {@link Npc npc} events.
 */
export type NpcEvents = {
    request: (request: Request) => void;
    error: (error: Error) => void;
    close: () => void;
};

/**
 * Options for {@link Npc.listen}.
 */
export type NpcListenOptions = Omit<ListenOptions, 'path' | 'port' | 'host' | 'ipv6Only'>;

/**
 * A simple implementation of an npc procedure.
 */
export interface Npc extends TypedEmitter<NpcEvents> {
    /**
     * The endpoint at which the {@link Npc npc procedure} is available to be {@link call called} or {@link notify notified}.
     */
    endpoint?: string | undefined,
    /**
     * Stops the {@link Npc npc procedure} from accepting new connections and closes it when all clients have disconnected.
     * @param {boolean} [gracefulDisconnect=true] Whether existing connections should be maintained until they are ended.
     * Passing `false` will immediately disconnect all connected clients. Defaults to `true`.
     * @returns {Promise<Npc>} A {@link !Promise Promise} which when resolved indicates the underlying {@link node!net.Server Node.js Server} has closed.
     */
    close(gracefulDisconnect?: boolean): Promise<Npc>,
    /**
     * Starts the {@link Npc npc procedure} listening for client connections.
     * @remarks The {@link endpoint} will be prefixed with the {@link rootNamespace root npc namespace}.
     * @param {string} endpoint The endpoint at which the {@link Npc npc procedure} will be available to be {@link call called} or {@link notify notified}.
     * @param {Omit<ListenOptions, 'path' | 'port' | 'host' | 'ipv6Only'} [options] {@link @types/node!ListenOptions Options}
     * to pass to the underlying {@link node!net.Server Node.js Server}.
     * @returns {Promise<Npc>} A {@link !Promise Promise} which when resolved indicates the {@link Npc npc procedure} is ready to receive client connections.
     */
    listen(endpoint: string, options?: NpcListenOptions): Promise<Npc>,
};

/**
 * Initializes a new {@link Npc npc procedure}.
 * @remarks The callback will only receive a single argument when called.
 * It is your responsibility to validate this argument. We recommend {@link https://zod.dev Zod} for validation.
 * @param {Callback} callback The underlying {@link Callback callback} function which will be {@link call called} by clients.
 */
export function create(callback: Callback): Npc;
/**
 * Initializes a new {@link Npc npc procedure} with middleware.
 * @remarks The callback will only receive a single argument when called.
 * It is your responsibility to validate this argument. We recommend {@link https://zod.dev Zod} for validation.
 * @param {(input: T) => Result} callback The underlying {@link Callback callback} function which will be {@link call called} by clients.
 * @param {(input: unknown) => T} middleware A middleware function which will be called on the input argument. The return of this function
 * will be passed to the callback as its input. Useful for inserting argument validation or transformation, for example.
 */
export function create<T>(callback: (input: T) => Result, middleware: (input: unknown) => T): Npc;
export function create<T = unknown>(callback: Callback | ((input: T) => Result), middleware?: (input: unknown) => T): Npc {
    const emitter = new EventEmitter() as TypedEmitter<NpcEvents>;
    const cb = callbackSchema.parse(middleware
        ? async (input: unknown) => callback(await middleware(input))
        : callback);

    let _server: Server | undefined;
    let _socket: Socket | undefined;

    const respond = async (response: Response) => {
        if (_socket?.writable) {
            return new Promise<void>((resolve, reject) => {
                try {
                    _socket?.write(`${JSON.stringify(response)}${EOL}`, 'utf8', (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                } catch (e) {
                    reject(e);
                }
            });
        }
    }

    const npc: Npc = Object.assign(emitter, {
        close: async (gracefulDisconnect = true) => {
            const closing = _server?.listening
                ? new Promise<Npc>((resolve) =>
                    _server?.close(() => {
                        _server = undefined;
                        resolve(npc);
                    })
                )
                : Promise.resolve(npc);

            if (!gracefulDisconnect) {
                _socket?.destroy();
            }
            await closing;
            if (gracefulDisconnect) {
                _socket?.destroy();
            }
            _socket = undefined;
            delete npc.endpoint;
            return npc;
        },
        listen: async (endpoint: string, options?: NpcListenOptions) => {
            await npc.close();
            return new Promise<Npc>((resolve, reject) => {
                _server = createServer((socket) => {
                    _socket = socket;

                    _socket
                        .on('close', () => {
                            npc.emit('close');
                        })
                        .on('error', (data) => {
                            console.error(endpoint, data);
                            npc.emit('error', {
                                code: -32000,
                                message: 'Internal server error',
                                data,
                            });
                        })
                        .on('data', async (buffer) => {
                            let data: unknown;
                            try {
                                data = JSON.parse(buffer.toString('utf8'));
                            } catch (data) {
                                console.error(endpoint, data);

                                const error = {
                                    code: -32700,
                                    message:
                                        'Invalid JSON was received by the server.',
                                    data,
                                };

                                npc.emit('error', error);
                            }

                            const parsed = requestSchema.safeParse(data);

                            if (!parsed.success) {
                                const error = {
                                    code: -32600,
                                    message:
                                        'The JSON sent is not a valid Request object.',
                                    data: parsed.error,
                                };
                                npc.emit('error', error);

                                try {
                                    await respond({
                                        status: 'error',
                                        npc: '0.1',
                                        id: null,
                                        error,
                                    });
                                } catch (e) {
                                    npc.emit('error', {
                                        code: -32000,
                                        message: 'Internal server error',
                                        data: e,
                                    });
                                }
                            } else {
                                npc.emit('request', parsed.data);

                                try {
                                    const result = await cb(parsed.data.input);
                                    if (parsed.data.id) {
                                        await respond({
                                            status: 'success',
                                            npc: '0.1',
                                            id: parsed.data.id,
                                            result,
                                        });
                                    }
                                } catch (e) {
                                    const parsedError = errorSchema.safeParse(e);
                                    const error = parsedError.success
                                        ? parsedError.data
                                        : {
                                            code: -32000,
                                            message: 'Internal server error',
                                            data: e,
                                        };

                                    npc.emit('error', error);
                                    if (parsed.data.id) {
                                        await respond({
                                            status: 'error',
                                            npc: '0.1',
                                            id: parsed.data.id,
                                            error,
                                        });
                                    }
                                }
                            }
                        });
                })
                    .once('error', (error) => reject(error))
                    .listen(
                        { ...options, path: join(rootNamespace, endpoint) },
                        () => {
                            npc.endpoint = endpoint;
                            resolve(npc);
                        }
                    );
            });
        }
    });

    return npc;
}

/**
 * {@link https://zod.dev Zod schema} for {@link call} or {@link notify} options.
 * @see {@link https://zod.dev Zod}
 */
export const callOptionsSchema = z.object({
    endpoint: z.string(),
    input: inputSchema,
    signal: z.instanceof(AbortSignal).optional(),
});

/**
 * Options for {@link call} or {@link notify}, inferred from {@link callOptionsSchema the schema}.
 */
export type CallOptions = z.infer<typeof callOptionsSchema>;

/**
 * Asynchronously calls an {@link Npc npc procedure} and awaits a response.
 * @remarks If you do not require any output from the procedure and do not need to ensure the procedure has completed before proceeding,
 * you should instead consider using {@link notify} as it is more efficient.
 * @param {CallOptions} options Options for calling the {@link Npc procedure}.
 * @returns {Promise<unknown>} A {@link !Promise Promise} which when resolves passes the output of the call to the {@link !Promise.then then} handler(s).
 * @see {@link notify}
 */
export async function call(options: CallOptions): Promise<unknown>;
/**
 * Asynchronously calls an {@link Npc npc procedure} and awaits a response.
 * @remarks If you do not require any output from the procedure and do not need to ensure the procedure has completed before proceeding,
 * you should instead consider using {@link notify} as it is more efficient.
 * @param {string} endpoint The endpoint at which the {@link Npc npc procedure} is listening.
 * @param {unknown} [input] An input argument to pass to the {@link Npc npc procedure}.
 * @param {AbortSignal} [signal] An {@link !AbortSignal AbortSignal} which will be used to abort awaiting a response.
 * @returns {Promise<unknown>} A {@link !Promise Promise} which when resolves passes the output of the call to the {@link !Promise.then then} handler(s).
 * @see {@link notify}
 */
export async function call(
    endpoint: string,
    input?: unknown,
    signal?: AbortSignal
): Promise<unknown>;
export async function call(
    endpointOrOptions: string | CallOptions,
    input?: unknown,
    signal?: AbortSignal
) {
    const options = callOptionsSchema.parse(
        callOptionsSchema.safeParse(endpointOrOptions).success
            ? endpointOrOptions
            : { endpoint: z.string().parse(endpointOrOptions), input, signal }
    );

    options.signal?.throwIfAborted();

    const socket = await new Promise<Socket>((resolve, reject) => {
        const abort = (ev: Event) => () => {
            options.signal?.removeEventListener('abort', abort);
            reject(ev);
        };
        options.signal?.addEventListener('abort', abort);

        try {
            const client = connect(
                join(rootNamespace, options.endpoint),
                () => {
                    options.signal?.removeEventListener('abort', abort);
                    resolve(client);
                }
            );
        } catch (e) {
            options.signal?.removeEventListener('abort', abort);
            reject(e);
        }
    });

    try {
        options.signal?.throwIfAborted();

        if (socket.writable) {
            const result = await new Promise((resolve, reject) => {
                const abort = (ev: Event) => () => {
                    options.signal?.removeEventListener('abort', abort);
                    reject(ev);
                };
                options.signal?.addEventListener('abort', abort);

                const id = uuidv4();

                const request: Request = {
                    npc: '0.1',
                    id,
                    input: options.input,
                };

                socket.on('close', () => {
                    options.signal?.removeEventListener('abort', abort);
                    reject();
                });

                socket.on('error', () => {
                    options.signal?.removeEventListener('abort', abort);
                    reject();
                });

                socket.on('data', (buffer) => {
                    let data: unknown;
                    try {
                        data = JSON.parse(buffer.toString('utf8'));
                        const response = responseSchema.parse(data);
                        if (response.id === id) {
                            if (response.status === 'success') {
                                options.signal?.removeEventListener(
                                    'abort',
                                    abort
                                );
                                resolve(response.result);
                            } else {
                                options.signal?.removeEventListener(
                                    'abort',
                                    abort
                                );
                                reject(response.error);
                            }
                        }
                    } catch (e) {
                        options.signal?.removeEventListener('abort', abort);
                        reject(e);
                    }
                });

                socket.write(
                    `${JSON.stringify(request)}${EOL}`,
                    'utf8',
                    (error) => {
                        if (error) {
                            options.signal?.removeEventListener('abort', abort);
                            reject(error);
                        }
                    }
                );
            });
            return result;
        }
    } finally {
        socket.destroy();
    }
}

/**
 * Asynchronously notifies an {@link Npc npc procedure} without awaiting a response.
 * @remarks Differs from {@link call} in that the procedure will not transmit any response, and the returned {@link !Promise Promise} will resolve
 * as soon as the input argument has been sent. This also means that if the procedure throws, the call to {@link notify} will neither throw nor output error information.
 *
 * If you wish to ensure the procedure has completed before proceeding or need to know whether the call succeeded, you should instead use {@link call}.
 * @param {CallOptions} options Options for notifying the {@link Npc procedure}.
 * @see {@link call}
 */
export async function notify(options: CallOptions): Promise<unknown>;
/**
 * Asynchronously notifies an {@link Npc npc procedure} without awaiting a response.
 * @remarks Differs from {@link call} in that the procedure will not transmit any response, and the returned {@link !Promise Promise} will resolve
 * as soon as the input argument has been sent. This also means that if the procedure throws, the call to {@link notify} will neither throw nor output error information.
 *
 * If you wish to ensure the procedure has completed before proceeding or need to know whether the call succeeded, you should instead use {@link call}.
 * @param {string} endpoint The endpoint at which the {@link Npc npc procedure} is listening.
 * @param {unknown} [input] An input argument to pass to the {@link Npc npc procedure}.
 * @param {AbortSignal} [signal] An {@link !AbortSignal AbortSignal} which will be used to abort connecting to the pipe or transmitting input.
 * @see {@link call}
 */
export async function notify(
    endpoint: string,
    input?: unknown,
    signal?: AbortSignal
): Promise<unknown>;
export async function notify(
    endpointOrOptions: string | CallOptions,
    input?: unknown,
    signal?: AbortSignal
) {
    const options = callOptionsSchema.parse(
        callOptionsSchema.safeParse(endpointOrOptions).success
            ? endpointOrOptions
            : { endpoint: z.string().parse(endpointOrOptions), input, signal }
    );

    options.signal?.throwIfAborted();

    const socket = await new Promise<Socket>((resolve, reject) => {
        const abort = (ev: Event) => () => {
            options.signal?.removeEventListener('abort', abort);
            reject(ev);
        };
        options.signal?.addEventListener('abort', abort);

        try {
            const client = connect(`\\\\.\\pipe\\${options.endpoint}`, () => {
                options.signal?.removeEventListener('abort', abort);
                resolve(client);
            });
        } catch (e) {
            options.signal?.removeEventListener('abort', abort);
            reject(e);
        }
    });

    try {
        options.signal?.throwIfAborted();

        if (socket.writable) {
            await new Promise<void>((resolve, reject) => {
                const abort = (ev: Event) => () => {
                    options.signal?.removeEventListener('abort', abort);
                    reject(ev);
                };
                options.signal?.addEventListener('abort', abort);

                const request: Request = {
                    npc: '0.1',
                    input: options.input,
                };

                socket
                    .on('close', () => {
                        options.signal?.removeEventListener('abort', abort);
                        reject();
                    })
                    .on('error', () => {
                        options.signal?.removeEventListener('abort', abort);
                        reject();
                    })
                    .write(
                        `${JSON.stringify(request)}${EOL}`,
                        'utf8',
                        (error) => {
                            if (error) {
                                options.signal?.removeEventListener(
                                    'abort',
                                    abort
                                );
                                reject(error);
                            } else {
                                options.signal?.removeEventListener(
                                    'abort',
                                    abort
                                );
                                resolve();
                            }
                        }
                    );
            });
        }
    } finally {
        socket.destroy();
    }
}
