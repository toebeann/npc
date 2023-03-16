import { EventEmitter } from "events"
import { createServer, Server, Socket, connect, ListenOptions } from "net"
import { EOL } from "os"
import { join } from "path"
import { Observable, fromEventPattern } from "rxjs"
import { first } from "rxjs/operators"
import TypedEmitter from "typed-emitter"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"

/**
 * {@link https://zod.dev Zod schema} for {@link NpcProcedure npc procedure} arguments.
 * @see {@link https://zod.dev Zod}
 */
export const inputSchema = z.unknown()

/**
 * npc procedure arguments, inferred from {@link inputSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Input = z.infer<typeof inputSchema>

/**
 * {@link https://zod.dev Zod schema} for npc request/response IDs.
 * @see {@link https://zod.dev Zod}
 */
export const idSchema = z.union([z.string(), z.number().int(), z.null()])

/**
 * npc request/response IDs, inferred from {@link idSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Id = z.infer<typeof idSchema>

/**
 * {@link https://zod.dev Zod schema} for the output of npc callbacks.
 * @see {@link https://zod.dev Zod}
 */
export const resultSchema = z.unknown()

/**
 * The output of an npc callback, inferred from {@link resultSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Result = z.infer<typeof resultSchema>

/**
 * {@link https://zod.dev Zod schema} for errors.
 * @see {@link https://zod.dev Zod}
 */
export const errorDataSchema = z.unknown()

/**
 * Generic error data, inferred from {@link errorDataSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type ErrorData = z.infer<typeof errorDataSchema>

/**
 * {@link https://zod.dev Zod schema} for the underlying callback of an npc procedure.
 * @see {@link https://zod.dev Zod}
 */
export const callbackSchema = z.function().args(inputSchema).returns(resultSchema)

/**
 * An underlying callback of an npc procedure, inferred from {@link callbackSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Callback = z.infer<typeof callbackSchema>

const winRoot = join("\\\\.", "pipe")
/**
 * The root namespace for npc endpoints: `\\.\pipe\.npc`
 */
export const rootNamespace = join(winRoot, ".npc")

/**
 * The namespace for npc events: `\\.\pipe\.npc\.events`
 */
export const eventsNamespace = join(rootNamespace, ".events")

/**
 * {@link https://zod.dev Zod schema} for npc client requests
 * @see {@link https://zod.dev Zod}
 */
export const requestSchema = z.object({
  npc: z.literal("0.1"),
  id: idSchema.optional(),
  input: inputSchema.optional(),
})

/**
 * An npc client request, inferred from {@link requestSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Request = z.infer<typeof requestSchema>

/**
 * {@link https://zod.dev Zod schema} for npc errors
 * @see {@link https://zod.dev Zod}
 */
export const errorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: errorDataSchema.optional(),
})

/**
 * An npc error, inferred from {@link errorSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Error = z.infer<typeof errorSchema>

/**
 * {@link https://zod.dev Zod schema} for npc server responses.
 * @see {@link https://zod.dev Zod}
 */
export const responseSchema = z.intersection(
  z.object({
    npc: z.literal("0.1"),
    id: idSchema,
  }),
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("success"),
      result: resultSchema,
    }),
    z.object({
      status: z.literal("error"),
      error: errorSchema,
    }),
  ]),
)

/**
 * An npc server response, inferred from {@link responseSchema its schema}.
 * @see {@link https://zod.dev Zod}
 */
export type Response = z.infer<typeof responseSchema>

/**
 * {@link typed-emitter!TypedEventEmitter TypedEmitter} mapping for {@link NpcProcedure npc} events.
 */
export type NpcEvents = {
  request: (request: Request) => void
  error: (error: Error) => void
  close: () => void
}

/**
 * Options for {@link NpcProcedure.listen}.
 */
export type NpcListenOptions = Omit<ListenOptions, "path" | "port" | "host" | "ipv6Only">

/**
 * A simple implementation of an npc procedure.
 */
export interface NpcProcedure extends TypedEmitter<NpcEvents> {
  /**
   * The endpoint at which an {@link NpcProcedure npc procedure} is available to be {@link call called}
   * or {@link notify notified}.
   */
  endpoint?: string | undefined
  /**
   * Stops the {@link NpcProcedure npc procedure} from accepting new connections and closes it when all clients have disconnected.
   * @param {boolean} [gracefulDisconnect=true] Whether existing connections should be maintained until they are ended.
   * Passing `false` will immediately disconnect all connected clients. Defaults to `true`.
   * @returns {Promise<NpcProcedure>} A {@link !Promise Promise} which when resolved indicates the underlying
   * {@link node!net.Server Node.js Server} has closed.
   */
  close(gracefulDisconnect?: boolean): Promise<NpcProcedure>
  /**
   * Starts the {@link NpcProcedure npc procedure} listening for client connections.
   * @remarks The {@link endpoint} will be prefixed with the {@link rootNamespace root npc namespace}.
   * @param {string} endpoint The endpoint at which the {@link NpcProcedure npc procedure} will be available to be
   * {@link call called} or {@link notify notified}.
   * @param {Omit<ListenOptions, 'path' | 'port' | 'host' | 'ipv6Only'} [options]
   * {@link @types/node!ListenOptions Options} to pass to the underlying {@link node!net.Server Node.js Server}.
   * @returns {Promise<NpcProcedure>} A {@link !Promise Promise} which when resolved indicates the {@link NpcProcedure npc procedure}
   * is ready to receive client connections.
   */
  listen(endpoint: string, options?: NpcListenOptions): Promise<NpcProcedure>
}

/**
 * Initializes a new {@link NpcProcedure npc procedure}.
 * @remarks The callback will only receive a single argument when called.
 * It is your responsibility to validate this argument. We recommend {@link https://zod.dev Zod} for validation.
 * @param {Callback} callback The underlying {@link Callback callback} function which will be
 * {@link call called} by clients.
 */
export function createProcedure(callback: Callback): NpcProcedure
/**
 * Initializes a new {@link NpcProcedure npc procedure} with input validation.
 * @remarks The callback will only receive a single argument when called.
 * It is your responsibility to validate this argument. We recommend {@link https://zod.dev Zod} for validation.
 * @param {(input: T) => Result} callback The underlying {@link Callback callback} function which will be
 * {@link call called} by clients.
 * @param {(input: unknown) => T} validator A validation function which will be called on the input argument.
 * The return of this function will be passed to the callback as its input. Useful for inserting argument validation
 * and/or transformation.
 */
export function createProcedure<T>(
  callback: (input: T) => Result,
  validator: (input: unknown) => T,
): NpcProcedure
export function createProcedure<T = unknown>(
  callback: Callback | ((input: T) => Result),
  validator?: (input: unknown) => T,
): NpcProcedure {
  const emitter = new EventEmitter() as TypedEmitter<NpcEvents>
  const cb = callbackSchema.parse(
    validator ? async (input: unknown) => callback(await validator(input)) : callback,
  )

  let _server: Server | undefined
  let _socket: Socket | undefined

  const respond = async (response: Response) => {
    if (_socket?.writable) {
      return new Promise<void>((resolve, reject) => {
        try {
          _socket?.write(`${JSON.stringify(response)}${EOL}`, "utf8", (error) => {
            if (error) {
              reject(error)
            } else {
              resolve()
            }
          })
        } catch (e) {
          reject(e)
        }
      })
    }
  }

  const npc: NpcProcedure = Object.assign(emitter, {
    close: async (gracefulDisconnect = true) => {
      const closing = _server?.listening
        ? new Promise<NpcProcedure>((resolve) =>
            _server?.close(() => {
              _server = undefined
              resolve(npc)
            }),
          )
        : Promise.resolve(npc)

      if (!gracefulDisconnect) {
        _socket?.destroy()
      }
      await closing
      if (gracefulDisconnect) {
        _socket?.destroy()
      }
      _socket = undefined
      delete npc.endpoint
      return npc
    },
    listen: async (endpoint: string, options?: NpcListenOptions) => {
      await npc.close()
      return new Promise<NpcProcedure>((resolve, reject) => {
        _server = createServer((socket) => {
          _socket = socket

          _socket
            .once("close", () => {
              npc.emit("close")
            })
            .once("error", (data) => {
              npc.emit("error", {
                code: -32000,
                message: "Internal server error",
                data,
              })
            })
            .on("data", async (buffer) => {
              for (const line of buffer.toString("utf8").split(EOL).filter(Boolean)) {
                let data: unknown
                try {
                  data = JSON.parse(line)
                } catch (data) {
                  const error = {
                    code: -32700,
                    message: "Invalid JSON was received by the server.",
                    data,
                  }

                  npc.emit("error", error)
                }

                const parsed = requestSchema.safeParse(data)

                if (!parsed.success) {
                  const error = {
                    code: -32600,
                    message: "The JSON sent is not a valid Request object.",
                    data: parsed.error,
                  }
                  npc.emit("error", error)

                  try {
                    await respond({
                      status: "error",
                      npc: "0.1",
                      id: null,
                      error,
                    })
                  } catch (e) {
                    npc.emit("error", {
                      code: -32000,
                      message: "Internal server error",
                      data: e,
                    })
                  }
                } else {
                  npc.emit("request", parsed.data)

                  try {
                    const result = await cb(parsed.data.input)
                    if (parsed.data.id) {
                      await respond({
                        status: "success",
                        npc: "0.1",
                        id: parsed.data.id,
                        result,
                      })
                    }
                  } catch (e) {
                    const parsedError = errorSchema.safeParse(e)
                    const error = parsedError.success
                      ? parsedError.data
                      : {
                          code: -32000,
                          message: "Internal server error",
                          data: e,
                        }

                    npc.emit("error", error)
                    if (parsed.data.id) {
                      await respond({
                        status: "error",
                        npc: "0.1",
                        id: parsed.data.id,
                        error,
                      })
                    }
                  }
                }
              }
            })
        })
          .once("error", (error) => reject(error))
          .listen({ ...options, path: join(rootNamespace, endpoint) }, () => {
            npc.endpoint = endpoint
            resolve(npc)
          })
      })
    },
  })

  return npc
}
/**
 * @deprecated Planned to be removed before the v1 release. Use {@link createProcedure} instead.
 * @see {@link createProcedure}
 * @inheritDoc createProcedure
 */
export const create = createProcedure

/**
 * {@link https://zod.dev Zod schema} for {@link call} or {@link notify} options.
 * @see {@link https://zod.dev Zod}
 */
export const callOptionsSchema = z.object({
  endpoint: z.string(),
  input: inputSchema,
  signal: z.instanceof(AbortSignal).optional(),
})

/**
 * Options for {@link call} or {@link notify}, inferred from {@link callOptionsSchema the schema}.
 */
export type CallOptions = z.infer<typeof callOptionsSchema>

/**
 * Asynchronously calls an {@link NpcProcedure npc procedure} and awaits a response.
 * @remarks If you do not require any output from the procedure and do not need to ensure the procedure has completed
 * before proceeding, you should instead consider using {@link notify} as it is more efficient.
 * @param {string} endpoint The endpoint at which an {@link NpcProcedure npc procedure} is listening.
 * @param {unknown} [input] An input argument to pass to the {@link NpcProcedure npc procedure}.
 * @param {AbortSignal} [signal] An {@link !AbortSignal AbortSignal} which will be used to abort awaiting a response.
 * @returns {Promise<unknown>} A {@link !Promise Promise} which when resolves passes the output of the call to the
 * {@link !Promise.then then} handler(s).
 * @see {@link notify}
 */
export async function call(endpoint: string, input?: unknown, signal?: AbortSignal): Promise<unknown>
/**
 * Asynchronously calls an {@link NpcProcedure npc procedure} and awaits a response.
 * @remarks If you do not require any output from the procedure and do not need to ensure the procedure has completed
 * before proceeding, you should instead consider using {@link notify} as it is more efficient.
 * @param {CallOptions} options Options for calling the {@link NpcProcedure procedure}.
 * @returns {Promise<unknown>} A {@link !Promise Promise} which when resolves passes the output of the call to the
 * {@link !Promise.then then} handler(s).
 * @see {@link notify}
 */
export async function call(options: CallOptions): Promise<unknown>
export async function call(endpointOrOptions: string | CallOptions, input?: unknown, signal?: AbortSignal) {
  const options = callOptionsSchema.parse(
    callOptionsSchema.safeParse(endpointOrOptions).success
      ? endpointOrOptions
      : { endpoint: z.string().parse(endpointOrOptions), input, signal },
  )

  options.signal?.throwIfAborted()

  const socket = await new Promise<Socket>((resolve, reject) => {
    const abort = (ev: Event) => () => {
      options.signal?.removeEventListener("abort", abort)
      reject(ev)
    }
    options.signal?.addEventListener("abort", abort)

    try {
      const client = connect(join(rootNamespace, options.endpoint), () => {
        options.signal?.removeEventListener("abort", abort)
        resolve(client)
      })
    } catch (e) {
      options.signal?.removeEventListener("abort", abort)
      reject(e)
    }
  })

  try {
    options.signal?.throwIfAborted()

    if (socket.writable) {
      const result = await new Promise((resolve, reject) => {
        const abort = (ev: Event) => () => {
          options.signal?.removeEventListener("abort", abort)
          reject(ev)
        }
        options.signal?.addEventListener("abort", abort)

        const id = uuidv4()

        const request: Request = {
          npc: "0.1",
          id,
          input: options.input,
        }

        socket.once("close", () => {
          options.signal?.removeEventListener("abort", abort)
          reject()
        })

        socket.once("error", () => {
          options.signal?.removeEventListener("abort", abort)
          reject()
        })

        socket.on("data", (buffer) => {
          for (const line of buffer.toString("utf8").split(EOL).filter(Boolean)) {
            try {
              const data = JSON.parse(line)
              const response = responseSchema.parse(data)
              if (response.id === id) {
                if (response.status === "success") {
                  options.signal?.removeEventListener("abort", abort)
                  resolve(response.result)
                } else {
                  options.signal?.removeEventListener("abort", abort)
                  reject(response.error)
                }
              }
            } catch (e) {
              options.signal?.removeEventListener("abort", abort)
              reject(e)
            }
          }
        })

        socket.write(`${JSON.stringify(request)}${EOL}`, "utf8", (error) => {
          if (error) {
            options.signal?.removeEventListener("abort", abort)
            reject(error)
          }
        })
      })
      return result
    }
  } finally {
    socket.destroy()
  }
}

/**
 * Asynchronously notifies an {@link NpcProcedure npc procedure} without awaiting a response.
 * @remarks Differs from {@link call} in that the procedure will not transmit any response, and the returned
 * {@link !Promise Promise} will resolve as soon as the input argument has been sent. This also means that if the
 * procedure throws, the call to {@link notify} will neither throw nor output error information.
 *
 * If you wish to ensure the procedure has completed before proceeding or need to know whether the call succeeded,
 * you should instead use {@link call}.
 * @param {string} endpoint The endpoint at which an {@link NpcProcedure npc procedure} is listening.
 * @param {unknown} [input] An input argument to pass to the {@link NpcProcedure npc procedure}.
 * @param {AbortSignal} [signal] An {@link !AbortSignal AbortSignal} which will be used to abort connecting to
 * the pipe or transmitting input.
 * @see {@link call}
 */
export async function notify(endpoint: string, input?: unknown, signal?: AbortSignal): Promise<unknown>
/**
 * Asynchronously notifies an {@link NpcProcedure npc procedure} without awaiting a response.
 * @remarks Differs from {@link call} in that the procedure will not transmit any response, and the returned
 * {@link !Promise Promise} will resolve as soon as the input argument has been sent. This also means that if the
 * procedure throws, the call to {@link notify} will neither throw nor output error information.
 *
 * If you wish to ensure the procedure has completed before proceeding or need to know whether the call succeeded,
 * you should instead use {@link call}.
 * @param {CallOptions} options Options for notifying the {@link NpcProcedure procedure}.
 * @see {@link call}
 */
export async function notify(options: CallOptions): Promise<unknown>
export async function notify(endpointOrOptions: string | CallOptions, input?: unknown, signal?: AbortSignal) {
  const options = callOptionsSchema.parse(
    callOptionsSchema.safeParse(endpointOrOptions).success
      ? endpointOrOptions
      : { endpoint: z.string().parse(endpointOrOptions), input, signal },
  )

  options.signal?.throwIfAborted()

  const socket = await new Promise<Socket>((resolve, reject) => {
    const abort = (ev: Event) => () => {
      options.signal?.removeEventListener("abort", abort)
      reject(ev)
    }
    options.signal?.addEventListener("abort", abort)

    try {
      const client = connect(join(rootNamespace, options.endpoint), () => {
        options.signal?.removeEventListener("abort", abort)
        resolve(client)
      })
    } catch (e) {
      options.signal?.removeEventListener("abort", abort)
      reject(e)
    }
  })

  try {
    options.signal?.throwIfAborted()

    if (socket.writable) {
      await new Promise<void>((resolve, reject) => {
        const abort = (ev: Event) => () => {
          options.signal?.removeEventListener("abort", abort)
          reject(ev)
        }
        options.signal?.addEventListener("abort", abort)

        const request: Request = {
          npc: "0.1",
          input: options.input,
        }

        socket
          .once("close", () => {
            options.signal?.removeEventListener("abort", abort)
            reject()
          })
          .once("error", () => {
            options.signal?.removeEventListener("abort", abort)
            reject()
          })
          .write(`${JSON.stringify(request)}${EOL}`, "utf8", (error) => {
            if (error) {
              options.signal?.removeEventListener("abort", abort)
              reject(error)
            } else {
              options.signal?.removeEventListener("abort", abort)
              resolve()
            }
          })
      })
    }
  } finally {
    socket.destroy()
  }
}

/**
 * A simple implementation of an npc event publisher.
 */
export interface NpcPublisher {
  /**
   * The endpoint at which the {@link NpcPublisher npc publisher} is available to be {@link subscribe subscribed}.
   */
  endpoint?: string | undefined
  /**
   * Stops the {@link NpcPublisher npc publisher} from accepting new connections and closes it when all clients have disconnected.
   * @param {boolean} [gracefulDisconnect=true] Whether existing connections should be maintained until they are ended.
   * Passing `false` will immediately disconnect all connected clients. Defaults to `true`.
   * @returns {Promise<NpcPublisher>} A {@link !Promise Promise} which when resolved indicates the underlying
   * {@link node!net.Server Node.js Server} has closed.
   */
  close(gracefulDisconnect?: boolean): Promise<NpcPublisher>
  /**
   * Publishes an event to all connected subscribers.
   * @param {string} eventName The name of the event to publish.
   * @param {unknown} [data] The data to publish with the event.
   */
  publish(eventName: string, data?: unknown): Promise<void>
  /**
   * Starts the {@link NpcPublisher npc publisher} listening for client connections.
   * @remarks The {@link endpoint} will be prefixed with the {@link rootNamespace root npc namespace}.
   * @param {string} endpoint The endpoint at which an {@link NpcPublisher npc publisher} will be available to be {@link subscribe subscribed}.
   * @param {Omit<ListenOptions, 'path' | 'port' | 'host' | 'ipv6Only'} [options] {@link @types/node!ListenOptions Options}
   * to pass to the underlying {@link node!net.Server Node.js Server}.
   * @returns {Promise<NpcPublisher>} A {@link !Promise Promise} which when resolved indicates the {@link NpcPublisher npc publisher} is ready to receive client connections.
   */
  listen(endpoint: string, options?: NpcListenOptions): Promise<NpcPublisher>
}

/**
 * {@link https://zod.dev Zod schema} for {@link NpcEvent event messages}.
 * @see {@link https://zod.dev Zod}
 */
export const npcEventSchema = z.object({
  npc: z.literal("0.2"),
  eventName: z.string(),
  data: z.unknown().optional(),
})

/**
 * An event message, inferred from {@link npcEventSchema its schema}.
 */
export type NpcEvent = z.infer<typeof npcEventSchema>

/**
 * Initializes a new {@link NpcPublisher npc event publisher}.
 * @returns {NpcPublisher} A new {@link NpcPublisher npc event publisher}.
 */
export const createPublisher = () => {
  const sockets = new Set<Socket>()
  let server: Server | undefined

  const publisher: NpcPublisher = {
    close: async (gracefulDisconnect = true) => {
      const closing = server?.listening
        ? new Promise<void>((resolve) => {
            server?.close(() => {
              server = undefined
              resolve()
            })
          })
        : Promise.resolve()

      if (!gracefulDisconnect) {
        for (const socket of sockets) {
          socket?.destroy()
        }
      }
      await closing
      if (gracefulDisconnect) {
        for (const socket of sockets.values()) {
          socket?.destroy()
        }
      }
      sockets.clear()
      delete publisher.endpoint
      return publisher
    },
    listen: async (endpoint: string, options?: NpcListenOptions) => {
      await publisher.close()

      return new Promise<NpcPublisher>((resolve, reject) => {
        server = createServer((socket) => {
          sockets.add(socket)
          socket.once("close", () => sockets.delete(socket)).once("error", () => sockets.delete(socket))
        })
          .once("error", (error) => reject(error))
          .listen(
            {
              ...options,
              path: join(eventsNamespace, endpoint),
            },
            () => {
              publisher.endpoint = endpoint
              resolve(publisher)
            },
          )
      })
    },
    publish: async (eventName: string, data?: unknown) => {
      const encoding = "utf8"
      const event: NpcEvent = {
        npc: "0.2",
        eventName,
        data,
      }
      const stringified = `${JSON.stringify(event)}${EOL}`

      await Promise.all(
        [...sockets]
          .filter((socket) => socket.writable)
          .map(
            (socket) => new Promise<void>((resolve) => socket.write(stringified, encoding, () => resolve())),
          ),
      )
    },
  }
  return publisher
}

/**
 * {@link https://zod.dev Zod schema} for qualified event names, e.g. `my-event@my-namespace`.
 * @see {@link https://zod.dev Zod}
 */
export const qualifiedEventNameSchema = z.string().regex(/(.+)@(.+)/g)

/**
 * A qualified event name, e.g. `my-event@my-namespace`.
 */
export type QualifiedEventName = `${string}@${string}`

let subscriptionMap:
  | Map<
      string,
      {
        socket: Promise<Socket>
        subscriptions: Map<string, Set<(data: unknown) => void>>
      }
    >
  | undefined

const getSubscriptionMap = () => subscriptionMap ?? (subscriptionMap = new Map())

/**
 * Subscribe to an event published by an {@link NpcPublisher npc publisher}.
 * @param {QualifiedEventName} qualifiedEventName The qualified event name, e.g. `my-event@my-namespace`.
 * @param {(data: unknown) => void} subscriber The callback to invoke when the event is published.
 */
export function subscribe(qualifiedEventName: QualifiedEventName, subscriber: (data: unknown) => void): void
/**
 * Subscribe to an event published by an {@link NpcPublisher npc publisher}.
 * @param {string} endpoint The endpoint at which an {@link NpcPublisher npc publisher} is available to be {@link subscribe subscribed}.
 * @param {string} eventName The name of the event to subscribe to.
 * @param {(data: unknown) => void} subscriber The callback to invoke when the event is published.
 */
export function subscribe(endpoint: string, eventName: string, subscriber: (data: unknown) => void): void
export function subscribe(
  qualifiedEventNameOrEndpoint: QualifiedEventName | string,
  subscriberOrEventName: ((data: unknown) => void) | string,
  subscriber?: (data: unknown) => void,
) {
  const hasSeparateEventName = z.string().safeParse(subscriberOrEventName).success

  const eventName = hasSeparateEventName
    ? z.string().parse(subscriberOrEventName)
    : qualifiedEventNameSchema.parse(qualifiedEventNameOrEndpoint).split("@")[0]
  const endpoint = hasSeparateEventName
    ? z.string().parse(qualifiedEventNameOrEndpoint)
    : qualifiedEventNameSchema.parse(qualifiedEventNameOrEndpoint).split("@")[1]
  const callback = (hasSeparateEventName ? subscriber : subscriberOrEventName) as (data: unknown) => void

  let map = getSubscriptionMap().get(endpoint)
  if (!map) {
    map = {
      socket: new Promise<Socket>((resolve, reject) => {
        try {
          const socket = connect(join(eventsNamespace, endpoint), () => {
            resolve(socket)
          })
            .on("data", (buffer) => {
              for (const line of buffer.toString("utf8").split(EOL).filter(Boolean)) {
                const data = JSON.parse(line)
                const event = npcEventSchema.parse(data)
                for (const subscriber of getSubscriptionMap()
                  .get(endpoint)
                  ?.subscriptions.get(event.eventName) || []) {
                  subscriber?.(event.data)
                }
              }
            })
            .once("close", () => getSubscriptionMap().delete(endpoint))
            .once("error", () => getSubscriptionMap().delete(endpoint))
        } catch (e) {
          reject(e)
        }
      }),
      subscriptions: new Map<string, Set<(data: unknown) => void>>(),
    }
    getSubscriptionMap().set(endpoint, map)
  }

  if (map.subscriptions.has(eventName)) {
    map.subscriptions.get(eventName)?.add(callback)
  } else {
    map.subscriptions.set(eventName, new Set([callback]))
  }
}
export const on = subscribe

/**
 * Unsubscribe from an event published by an {@link NpcPublisher npc publisher}.
 * @remarks Cannot unsubscribe subscriptions which were subscribed from a different module.
 * @param {QualifiedEventName} qualifiedEventName The qualified event name, e.g. `my-event@my-namespace`.
 * @param {(data: unknown) => void} subscriber The callback to unsubscribe.
 */
export function unsubscribe(qualifiedEventName: QualifiedEventName, subscriber: (data: unknown) => void): void
/**
 * Unsubscribe from an event published by an {@link NpcPublisher npc publisher}.
 * @remarks Cannot unsubscribe subscriptions which were subscribed from a different module.
 * @param {string} endpoint The endpoint at which an {@link NpcPublisher npc publisher} is available to be {@link subscribe subscribed}.
 * @param {string} eventName The name of the event to unsubscribe from.
 * @param {(data: unknown) => void} subscriber The callback to unsubscribe.
 */
export function unsubscribe(endpoint: string, eventName: string, subscriber: (data: unknown) => void): void
export function unsubscribe(
  qualifiedEventNameOrEndpoint: QualifiedEventName | string,
  subscriberOrEventName: ((data: unknown) => void) | string,
  subscriber?: (data: unknown) => void,
) {
  if (!subscriptionMap) return

  const hasSeparateEventName = z.string().safeParse(subscriberOrEventName).success

  const eventName = hasSeparateEventName
    ? z.string().parse(subscriberOrEventName)
    : qualifiedEventNameSchema.parse(qualifiedEventNameOrEndpoint).split("@")[0]
  const endpoint = hasSeparateEventName
    ? z.string().parse(qualifiedEventNameOrEndpoint)
    : qualifiedEventNameSchema.parse(qualifiedEventNameOrEndpoint).split("@")[1]
  const callback = (hasSeparateEventName ? subscriber : subscriberOrEventName) as (data: unknown) => void

  const map = subscriptionMap.get(endpoint)
  const subscriptions = map?.subscriptions.get(eventName)
  subscriptions?.delete(callback)
  if (subscriptions?.size === 0) {
    map?.subscriptions.delete(eventName)
  }
  if (map?.subscriptions.size === 0) {
    map.socket?.then((socket) => socket.destroy())
    subscriptionMap.delete(endpoint)
  }
}
export const off = unsubscribe

/**
 * Unsubscribe from all {@link NpcPublisher npc publisher} events subscribed to by this module.
 * @remarks Cannot unsubscribe subscriptions which were subscribed from a different module.
 */
export function unsubscribeAll(): void
/**
 * Unsubscribe from all events at a given endpoint published by an {@link NpcPublisher npc publisher}.
 * @remarks Cannot unsubscribe subscriptions which were subscribed from a different module.
 * @param {string} endpoint The endpoint at which an {@link NpcPublisher npc publisher} is available to be {@link subscribe subscribed}.
 * All subscriptions to all events at this endpoint will be unsubscribed.
 */
export function unsubscribeAll(endpoint: string): void
/**
 * Unsubscribe all subscribers from a given event published by an {@link NpcPublisher npc publisher}.
 * @remarks Cannot unsubscribe subscriptions which were subscribed from a different module.
 * @param {string} endpoint The endpoint at which an {@link NpcPublisher npc publisher} is available to be {@link subscribe subscribed}.
 * @param {string} eventName The name of the event to unsubscribe from. All subscriptions to this event will be unsubscribed.
 */
export function unsubscribeAll(endpoint: string, eventName: string): void
export function unsubscribeAll(endpoint?: string, eventName?: string) {
  if (!subscriptionMap) return

  if (endpoint && eventName) {
    subscriptionMap.get(endpoint)?.subscriptions.delete(eventName)
    if (subscriptionMap.get(endpoint)?.subscriptions.size === 0) {
      subscriptionMap.get(endpoint)?.socket.then((socket) => socket.destroy())
      subscriptionMap.delete(endpoint)
    }
  } else if (endpoint) {
    subscriptionMap.get(endpoint)?.socket.then((socket) => socket.destroy())
    subscriptionMap.delete(endpoint)
  } else {
    for (const map of subscriptionMap.values()) {
      map.socket.then((socket) => socket.destroy())
    }
    subscriptionMap.clear()
  }
}

/**
 * Create an observable from an {@link NpcPublisher npc publisher} event.
 * @param {QualifiedEventName} qualifiedEventName The qualified event name, e.g. `my-event@my-namespace`.
 * @returns {Observable<unknown>} An observable which emits the event data.
 */
export function createObservable(qualifiedEventName: QualifiedEventName): Observable<unknown>
/**
 * Create an observable from an {@link NpcPublisher npc publisher} event.
 * @param {string} endpoint The endpoint at which an {@link NpcPublisher npc publisher} is available to be {@link subscribe subscribed}.
 * @param {string} eventName The name of the event to subscribe to.
 * @returns {Observable<unknown>} An observable which emits the event data.
 */
export function createObservable(endpoint: string, eventName: string): Observable<unknown>
export function createObservable(
  qualifiedEventNameOrEndpoint: QualifiedEventName | string,
  eventName?: string,
) {
  const hasSeparateEventName = z.string().safeParse(eventName).success

  const endpoint = hasSeparateEventName
    ? z.string().parse(qualifiedEventNameOrEndpoint)
    : qualifiedEventNameSchema.parse(qualifiedEventNameOrEndpoint).split("@")[1]
  const event = hasSeparateEventName
    ? z.string().parse(eventName)
    : qualifiedEventNameSchema.parse(qualifiedEventNameOrEndpoint).split("@")[0]

  return fromEventPattern(
    (handler) => on(endpoint, event, handler),
    (handler) => off(endpoint, event, handler),
  )
}

/**
 * Register a one-time subscription to an event published by an {@link NpcPublisher npc publisher}.
 * The next time the event is published, the subscriber will be unsubscribed and then invoked.
 * @param {QualifiedEventName} qualifiedEventName The qualified event name, e.g. `my-event@my-namespace`.
 * @param {(data: unknown) => void} subscriber The callback to invoke when the event is published.
 */
export function subscribeOnce(qualifiedEventName: QualifiedEventName, subscriber: (data: unknown) => void): void
/**
 * Register a one-time subscription to an event published by an {@link NpcPublisher npc publisher}.
 * The next time the event is published, the subscriber will be unsubscribed and then invoked.
 * @param {string} endpoint The endpoint at which an {@link NpcPublisher npc publisher} is available to be {@link subscribe subscribed}.
 * @param {string} eventName The name of the event to subscribe to.
 * @param {(data: unknown) => void} subscriber The callback to invoke when the event is published.
 */
export function subscribeOnce(endpoint: string, eventName: string, subscriber: (data: unknown) => void): void
export function subscribeOnce(
  qualifiedEventNameOrEndpoint: QualifiedEventName | string,
  subscriberOrEventName: ((data: unknown) => void) | string,
  subscriber?: (data: unknown) => void,
) {
  const hasSeparateEventName = z.string().safeParse(subscriberOrEventName).success

  const eventName = hasSeparateEventName
    ? z.string().parse(subscriberOrEventName)
    : qualifiedEventNameSchema.parse(qualifiedEventNameOrEndpoint).split("@")[0]
  const endpoint = hasSeparateEventName
    ? z.string().parse(qualifiedEventNameOrEndpoint)
    : qualifiedEventNameSchema.parse(qualifiedEventNameOrEndpoint).split("@")[1]
  const callback = (hasSeparateEventName ? subscriber : subscriberOrEventName) as (data: unknown) => void

  createObservable(endpoint, eventName).pipe(first()).subscribe(callback)
}
export const once = subscribeOnce
