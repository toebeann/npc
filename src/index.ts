import { EventEmitter } from 'events';
import { createServer, Server, Socket, connect, ListenOptions } from 'net';
import { EOL } from 'os';
import { join } from 'path';
import TypedEmitter from 'typed-emitter';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

export const argsSchema = z.optional(z.record(z.unknown()));
export type Args = z.infer<typeof argsSchema>;
export const idSchema = z.union([z.string(), z.number().int(), z.null()]);
export type Id = z.infer<typeof idSchema>;
export const resultSchema = z.unknown();
export type Result = z.infer<typeof resultSchema>;
export const errorDataSchema = z.unknown();
export type ErrorData = z.infer<typeof errorDataSchema>;
export const callbackSchema = z
    .function()
    .args(argsSchema)
    .returns(resultSchema);
export type Callback = z.infer<typeof callbackSchema>;

const windowsNamedPipeRoot = join('\\\\.', 'pipe');
export const endpointBaseNamespace = join(windowsNamedPipeRoot, '.npc');
export const requestSchema = z.object({
    npc: z.literal('0.1'),
    id: z.optional(idSchema),
    args: z.optional(argsSchema),
});
export type Request = z.infer<typeof requestSchema>;

export const errorSchema = z.object({
    code: z.number().int(),
    message: z.string(),
    data: z.optional(errorDataSchema),
});
export type Error = z.infer<typeof errorSchema>;

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
export type Response = z.infer<typeof responseSchema>;

export class Npc<
    T extends Callback
> extends (EventEmitter as new () => TypedEmitter<{
    request: (request: Request) => void;
    error: (error: Error) => void;
    close: () => void;
}>) {
    #endpoint?: string;
    get endpoint() {
        return this.#endpoint;
    }
    protected set endpoint(value) {
        this.#endpoint = value;
    }

    protected server: Server;
    protected socket?: Socket;

    constructor(callback: T) {
        super();
        this.server = createServer((socket) => {
            this.socket = socket;

            socket
                .on('close', () => {
                    this.emit('close');
                })
                .on('error', (data) => {
                    console.error(data, this.endpoint);
                    this.emit('error', {
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
                        console.error(data, this.endpoint);

                        const error = {
                            code: -32700,
                            message: 'Invalid JSON was received by the server.',
                            data,
                        };

                        this.emit('error', error);
                    }

                    const parsed = requestSchema.safeParse(data);

                    if (!parsed.success) {
                        const error = {
                            code: -32600,
                            message:
                                'The JSON sent is not a valid Request object.',
                            data: parsed.error,
                        };
                        this.emit('error', error);

                        try {
                            await this.respond({
                                status: 'error',
                                npc: '0.1',
                                id: null,
                                error,
                            });
                        } catch (e) {
                            this.emit('error', {
                                code: -32000,
                                message: 'Internal server error',
                                data,
                            });
                        }
                    } else {
                        this.emit('request', parsed.data);

                        try {
                            const result = await callback(parsed.data.args);
                            if (parsed.data.id) {
                                await this.respond({
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

                            this.emit('error', error);
                            if (parsed.data.id) {
                                await this.respond({
                                    status: 'error',
                                    npc: '0.1',
                                    id: parsed.data.id,
                                    error,
                                });
                            }
                        }
                    }
                });
        });
    }

    async listen(
        endpoint: string,
        options?: Omit<ListenOptions, 'path' | 'port' | 'host' | 'ipv6Only'>
    ) {
        return new Promise<this>((resolve) => {
            this.close();
            this.endpoint = endpoint;
            this.server.listen(
                { ...options, path: join(endpointBaseNamespace, endpoint) },
                () => resolve(this)
            );
        });
    }

    close(): this {
        this.socket?.destroy();
        this.server?.close();
        this.socket = undefined;
        return this;
    }

    protected async respond(response: Response) {
        if (this.socket?.writable) {
            return new Promise<void>((resolve, reject) => {
                try {
                    this.socket?.write(
                        `${JSON.stringify(response)}${EOL}`,
                        'utf8',
                        (error) => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve();
                            }
                        }
                    );
                } catch (e) {
                    reject(e);
                }
            });
        }
    }
}

const callOptionsSchema = z.object({
    endpoint: z.string(),
    args: argsSchema,
    signal: z.optional(z.instanceof(AbortSignal)),
});
export type CallOptions = z.infer<typeof callOptionsSchema>;

export const call = async (options: CallOptions) => {
    const { endpoint, args, signal } = callOptionsSchema.parse(options);
    signal?.throwIfAborted();

    const socket = await new Promise<Socket>((resolve, reject) => {
        const abort = (ev: Event) => () => {
            signal?.removeEventListener('abort', abort);
            reject(ev);
        };
        signal?.addEventListener('abort', abort);

        try {
            const client = connect(
                join(endpointBaseNamespace, endpoint),
                () => {
                    signal?.removeEventListener('abort', abort);
                    resolve(client);
                }
            );
        } catch (e) {
            signal?.removeEventListener('abort', abort);
            reject(e);
        }
    });

    try {
        signal?.throwIfAborted();

        if (socket.writable) {
            const result = await new Promise((resolve, reject) => {
                const abort = (ev: Event) => () => {
                    signal?.removeEventListener('abort', abort);
                    reject(ev);
                };
                signal?.addEventListener('abort', abort);

                const id = uuidv4();

                const request: Request = {
                    npc: '0.1',
                    id,
                    args: args,
                };

                socket.on('close', () => {
                    signal?.removeEventListener('abort', abort);
                    reject();
                });

                socket.on('error', () => {
                    signal?.removeEventListener('abort', abort);
                    reject();
                });

                socket.on('data', (buffer) => {
                    let data: unknown;
                    try {
                        data = JSON.parse(buffer.toString('utf8'));
                        const response = responseSchema.parse(data);
                        if (response.id === id) {
                            if (response.status === 'success') {
                                signal?.removeEventListener('abort', abort);
                                resolve(response.result);
                            } else {
                                signal?.removeEventListener('abort', abort);
                                reject(response.error);
                            }
                        }
                    } catch (e) {
                        signal?.removeEventListener('abort', abort);
                        reject(e);
                    }
                });

                socket.write(
                    `${JSON.stringify(request)}${EOL}`,
                    'utf8',
                    (error) => {
                        if (error) {
                            signal?.removeEventListener('abort', abort);
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
};

export const notify = async (options: CallOptions) => {
    const { endpoint, args, signal } = callOptionsSchema.parse(options);
    signal?.throwIfAborted();

    const socket = await new Promise<Socket>((resolve, reject) => {
        const abort = (ev: Event) => () => {
            signal?.removeEventListener('abort', abort);
            reject(ev);
        };
        signal?.addEventListener('abort', abort);

        try {
            const client = connect(`\\\\.\\pipe\\${endpoint}`, () => {
                signal?.removeEventListener('abort', abort);
                resolve(client);
            });
        } catch (e) {
            signal?.removeEventListener('abort', abort);
            reject(e);
        }
    });

    try {
        signal?.throwIfAborted();

        if (socket.writable) {
            await new Promise<void>((resolve, reject) => {
                const abort = (ev: Event) => () => {
                    signal?.removeEventListener('abort', abort);
                    reject(ev);
                };
                signal?.addEventListener('abort', abort);

                const request: Request = {
                    npc: '0.1',
                    args: args,
                };

                socket
                    .on('close', () => {
                        signal?.removeEventListener('abort', abort);
                        reject();
                    })
                    .on('error', () => {
                        signal?.removeEventListener('abort', abort);
                        reject();
                    })
                    .write(
                        `${JSON.stringify(request)}${EOL}`,
                        'utf8',
                        (error) => {
                            if (error) {
                                signal?.removeEventListener('abort', abort);
                                reject(error);
                            } else {
                                signal?.removeEventListener('abort', abort);
                                resolve();
                            }
                        }
                    );
            });
        }
    } finally {
        socket.destroy();
    }
};
