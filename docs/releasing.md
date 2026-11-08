# Releasing

Unblok uses Bun for development and produces one JavaScript npm package for Node.js 26 and Bun. The package contains the CLI, library, and TypeScript declarations.

Before preparing a release, review the changelog and commit all changes. Verify npm ownership and trusted publishing for the `unblok` package and the `release.yml` GitHub Actions workflow with environment `release`.

Run the local checks from a checkout:

```bash
bun install --frozen-lockfile
bun run quality
bun run build
bun run release:check
```

The release check packs the staged package, installs it into a temporary project, and checks CLI help, version, YAML planning, library imports, and TypeScript declarations. It requires both Node.js and Bun and does not publish.

To prepare a version locally:

```bash
bun run release 0.1.7
```

Review the generated commit and annotated tag. The command does not push or publish. When ready, push the commit and then the tag; pushing the tag runs the GitHub release workflow, which checks, builds, validates the package, and publishes it to npm. npm may take time to make the new version visible. If publication fails, inspect the registry and workflow before retrying; an existing npm version cannot be overwritten.
