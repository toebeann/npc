<center>

# npc 🛠️

Easy RPC over Named Pipes

[![typedocs](https://img.shields.io/badge/docs-informational.svg?logo=typescript&labelColor=222&style=flat-square)](https://toebeann.github.io/npc "Read the documentation on Github Pages") [![license](https://img.shields.io/github/license/toebeann/npc.svg?logo=open-source-initiative&logoColor=3DA639&color=informational&labelColor=222&style=flat-square)](https://github.com/toebeann/npc/blob/main/LICENSE "View the license on GitHub")

[![github](https://img.shields.io/badge/source-informational.svg?logo=github&labelColor=222&style=flat-square)](https://github.com/toebeann/npc "View npc on GitHub") [![twitter](https://img.shields.io/badge/follow-blue.svg?logo=twitter&label&labelColor=222&style=flat-square)](https://twitter.com/toebean__ "Follow @toebean__ on Twitter") [![GitHub Sponsors donation button](https://img.shields.io/badge/sponsor-e5b.svg?logo=github%20sponsors&labelColor=222&style=flat-square)](https://github.com/sponsors/toebeann "Sponsor npc on GitHub") [![PayPal donation button](https://img.shields.io/badge/donate-e5b.svg?logo=paypal&labelColor=222&style=flat-square)](https://paypal.me/tobeyblaber "Donate to npc with PayPal")

</center>

## Description

npc gives you simple tools to implement functions in one process/thread, and call them from another.

```js
// my-app/index.js

// a simple function which returns the square of a given number
const npc = await create((n) => n ** 2).listen("square");
```

```js
// some-other-app/index.js

const squared = await call("square", 8);
console.log(squared); // outputs 64
```

At present, npc only supports Windows Named Pipes. Unix Named Pipes is not a priority for this package at present, but is certainly something we would like to add in future. Pull requests welcome!

## Tables of contents

- [npc 🛠️](#npc-️)
  - [Description](#description)
  - [Tables of contents](#tables-of-contents)
  - [Installation](#installation)
    - [pnpm](#pnpm)
    - [yarn](#yarn)
    - [npm](#npm)
  - [Usage](#usage)
    - [`async`/`await`](#asyncawait)
    - [`notify`: disregarding output for efficiency](#notify-disregarding-output-for-efficiency)
      - [Implications of the `notify` API](#implications-of-the-notify-api)
    - [Argument and return types](#argument-and-return-types)
  - [License](#license)

## Installation

### [pnpm](https://pnpm.io "pnpm is a fast, disk space efficient package manager")

```shell
pnpm add github:toebeann/npc
```

### [yarn](https://yarnpkg.com "Yarn is a package manager that doubles down as project manager")

```shell
yarn add https://github.com/toebeann/npc.git
```

### [npm](https://npmjs.com "npm is the package manager for Node.js")

```shell
npm i github:toebeann/npc
```

## Usage

Setting up a function to be called from a local process is easy with npc:

```js
import { create } from "@toebean/npc";

const npc = create((n) => n ** 2);
await npc.listen("square");
```

And calling it is just as easy:

```js
import { call } from "@toebean/npc";

const x = 8;
const xSquared = await call("square", 8);
console.log(xSquared); // outputs 64
console.log(typeof xSquared); // outputs 'number'
```

Please note that it is the callee's responsibility to validate input, and the caller's responsibility to validate the return output. We recommend [Zod](https://zod.dev) for validation.

For convenience, there is an alternative constructor which takes a middleware callback as the second argument. This middleware function can be used to validate and/or transform the incoming argument before it is passed to the callback.

Here is an example which uses [Zod](https://zod.dev) to validate the input is a number:

```js
import { create } from "@toebean/npc";
import { z } from "zod";

const npc = await create((n) => n ** 2, z.number().parse).listen("square");
```

Now, if the client passes an invalid argument, Zod will throw an exception detailing the cause of the exception:

```js
import { inspect } from "util";
import { call } from "@toebean/npc";

try {
  console.log(await call("square", "foo"));
} catch (error) {
  console.error("error:", inspect(error, false, null));
}
// error: {
//   code: -32000,
//   message: 'Internal server error',
//   data: {
//     issues: [
//       {
//         code: 'invalid_type',
//         expected: 'number',
//         received: 'string',
//         path: [],
//         message: 'Expected number, received string'
//       }
//     ],
//     name: 'ZodError'
//   }
// }
```

### `async`/`await`

Asynchronous functions are fully supported:

```js
await create(async () => {
  const response = await fetch("https://catfact.ninja/fact");
  if (response.ok) {
    return (await response.json()).fact;
  } else {
    throw `${response.status}: ${response.statusText}`;
  }
}).listen("getCatFact");
```

### `notify`: disregarding output for efficiency

If you do not require any output from an npc procedure and do not need to wait for it to complete, consider using the `notify` API instead of `call`:

```js
import { notify } from "@toebean/npc";

await notify("registerData", { foo: "bar", bar: 123 });
```

The above call to `notify` will resolve as soon as the input argument `{ foo: "bar" }` has been transmitted across the named pipe without waiting for a response. If the npc procedure at the other end of the pipe was implemented with this library, it will also not transmit a response, resulting in more efficient usage of the pipe.

#### Implications of the `notify` API

- The procedure at the other end of the pipe will likely not have completed when `notify` resolves. If you need to perform an action upon its completion, you should instead use the `call` API.
- If an error is thrown at the other end of the pipe, `notify` will neither throw nor output error information. If you need to know whether the call succeeded, you should instead use the `call` API.

### Argument and return types

Input arguments and return outputs are serialized to JSON using `JSON.stringify` before being transmitted over the named pipe, and deserialized using `JSON.parse` at the other end. This means that types which cannot be (de)serialized using these functions will be transmitted as `undefined`. We generally recommend sticking to [PODs](https://en.wikipedia.org/wiki/Passive_data_structure "plain old data objects") and [primitives](https://developer.mozilla.org/en-US/docs/Glossary/Primitive) (with the exception of `bigint` and `symbol`).

npc procedures only support a maximum of one argument for simplicity. If you require multiple arguments you can handle this with [PODs](https://en.wikipedia.org/wiki/Passive_data_structure "plain old data objects") (e.g. object literals, property bags) or arrays.

## License

npc is licensed under [MIT](https://github.com/toebeann/npc/blob/main/LICENSE) © 2023 Tobey Blaber.
