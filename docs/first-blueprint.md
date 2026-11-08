# Your first space setup blueprint

In this guide, you'll run Unblok, review a YAML blueprint, and apply it to an existing Storyblok space. The blueprint ensures Italian (`it`) is configured as an additional language. Choose a non-production space you have permission to update.

## 1. Run Unblok

With Node.js and npm installed, try Unblok without installing it globally:

```bash
npx unblok --version
```

You can also use `bunx --bun unblok --version` if you have Bun. If you prefer a global installation, run `npm install -g unblok` and replace `npx unblok` with `unblok` in the commands below. See [getting started](getting-started.md) for runtime requirements, installation, and source options.

## 2. Create a blueprint

Save the following as `first-setup.yaml` in your working directory:

```yaml
version: 1
template:
  name: My first space setup
execution:
  mode: reconcile
space:
  languages:
    - it
```

You can replace `it` with another supported language code. Keep the file in version control to review and reuse the setup.

## 3. Plan locally

```bash
npx unblok space setup plan --config first-setup.yaml
```

The output shows the resolved blueprint and its supported operations. Planning validates the file locally; it does not require a token, read the target space, or predict what will change.

## 4. Connect to Storyblok

Unblok uses a **Management API personal access token**, not a Content Delivery API public or preview token. In Storyblok, open [Account settings](https://app.storyblok.com/#/me/account?tab=token) → Personal access tokens and generate a token with access to your target space and permission to configure its languages. Copy it when it is created; Storyblok shows it only once. See [Storyblok's Management API access token guide](https://www.storyblok.com/docs/concepts/access-tokens#management-api-access-tokens) for detailed steps and permissions.

Set the token in your terminal environment:

```bash
export STORYBLOK_TOKEN="your-personal-access-token"
npx unblok space list
```

Replace the placeholder with your token and keep it out of the YAML file and version control. Find the ID of the space you want to use in the list or Storyblok. The example uses POSIX shell syntax; on PowerShell, set the variable with `$env:STORYBLOK_TOKEN = "your-personal-access-token"`.

## 5. Apply and verify

Replace `YOUR_SPACE_ID` with the selected space's numeric ID:

```bash
npx unblok space setup apply --config first-setup.yaml --space-id YOUR_SPACE_ID --yes
```

`--yes` authorizes changes. Check the report and the space's language settings in Storyblok. If the language is missing, Unblok adds it; if it already exists, Unblok leaves it unchanged. Existing languages are preserved. Repeat the command against the same space ID to see the unchanged result.

API errors or space limits can prevent an operation from succeeding. For larger blueprints, changes made before a failure are not rolled back; check the report and rerun against the same space ID after resolving the issue. Add `--json` to plan or apply for machine-readable output.

Next, explore [repeatable space setups](space-setups.md) for composing blueprints, inputs, and more operations.
