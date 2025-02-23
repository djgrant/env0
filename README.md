# env0

Load environment variables directly from 1Password and never store secrets in .env files again.

## Features

- Load environment variables directly from 1Password vaults
- Simple configuration using a `.env0` file to declare required envs
- Mask secrets in logs when using GitHub Actions
- Easy integration with any command or script

## Prerequisites

- [1Password CLI](https://1password.com/downloads/command-line/) installed and configured

## Installation

```bash
npm install env0
```

## Usage

#### 1. Create a `.env0` file

In your project root, add a .env0 file (this can be commited in version control) with the environment variable names that should be loaded from 1Password:

```plaintext
# Shorthand assignment - loads TEST_ENV_VAR from 1Password
TEST_ENV_VAR

# Literal string assignment
LITERAL_VAR="my static value"

# Reference assignment - loads SOURCE_VAR from 1Password
RENAMED_VAR=SOURCE_VAR
```

#### 2. Create secrets in 1Password

Create a 1Password vault and add the environment variables to it:

![1Password Vault](./.github/assets/create-1password-secret.png)

#### 3. Run commands with env0

Use env0 to load environment variables into a sub process that runs the specified command.

```bash
# Basic usage
env0 --vault "your-vault-name" your-command

# Use a custom env0 file
env0 --vault "your-vault-name" --file "./env0.custom" your-command

# Alternatively, print environment variables for shell export
env0 --vault "your-vault-name" --print
```

## CLI Options

- `-V, --vault <name>`: Specify the 1Password vault name (required)
- `-F, --file <path>`: Path to an env0 file (defaults to `.env0` unless `-e` is used)
- `-e, --entry <entries...>`: Specify environment variable entries inline
- `-P, --print`: Print environment variables for shell export
- Any additional arguments are passed to the command being executed

## How It Works

1. The CLI loads environment variables using either:
   - The env0 file specified by `-F, --file`, or
   - Inline entries specified via `-e, --entry`, or
   - Both sources when both `-F` and `-e` are both explicitly specified
2. For each entry, it processes the environment variable based on its type:
   - Shorthand (e.g., `VAR`): Fetches the corresponding item from the specified 1Password vault
   - Literal (e.g., `VAR="value"`): Uses the literal string value provided
   - Reference (e.g., `VAR=SOURCE_VAR`): Fetches the value from another 1Password item
3. Environment variables are loaded into the process
4. If using GitHub Actions, any 1Password password fields are automatically masked in logs
5. The specified command is executed with the loaded environment variables

## Examples

```bash
# Run a Node.js application with environment variables from 1Password
env0 --vault "dev" node app.js

# Use specific environment variables without a env0 file
env0 --vault "dev" --entry DB_URL --entry API_KEY node app.js

# Use literal and reference assignments inline
env0 --vault "dev" --entry 'STAGE="development"' --entry 'DB_PASS=PROD_DB_PASS' node app.js

# Combine env0 file with additional entries
env0 --vault "dev" --file .env0 --entry EXTRA_VAR1 --entry EXTRA_VAR2 node app.js

# Export variables to your shell and run a command
eval $(env0 --vault "dev" --print) && node app.js
```

## License

MIT License

## Contributors

- [Daniel Grant](https://github.com/djgrant)
