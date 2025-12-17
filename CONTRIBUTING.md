# Contributing

## Setup

```sh
bun install
bun run build
bun run test
```

## Publishing

From the `package` directory:

```sh
bun release patch|minor|major
```

The `prepublishOnly` script automatically copies README.md and .github assets into the package before publishing.
