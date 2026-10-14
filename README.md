# Unfold

Read a code change the way the code actually runs.

Unfold splits every changed file into its functions and lays them out as blocks, tiered by who calls whom: entry points first, then what they call, then helpers and constants. Each block shows the whole function with the changed lines highlighted, and arrows connect calls, including calls between files. It's built for reviewing AI-generated changes, where a file-by-file diff hides the flow.

See [`examples/demo.html`](examples/demo.html) for a sample map.

## Use it locally

```bash
npx unfold-pr main --open            # changes on this branch vs main, open the map
npx unfold-pr main --worktree        # uncommitted changes
npx unfold-pr --help
```

The map is written to `.unfold/` at the repository root and kept out of git automatically (via `.git/info/exclude`, your `.gitignore` is never touched):

| File | For |
|---|---|
| `.unfold/map.html` | you: the interactive map. Click a block to highlight its callers and callees |
| `.unfold/map.md` | your AI agent: what to check first, calls between files, and the reading order with `file:line` ranges. Tell your agent to read it |
| `.unfold/map.json` | tools: the full map data |

`-o some/file.html` writes a single HTML file instead.

## Use it on every pull request

Add `.github/workflows/unfold.yml` to your repository:

```yaml
name: Unfold
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]
permissions:
  contents: read
  pull-requests: write
jobs:
  map:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: Alhiane/unfold-pr@v0
```

Each PR gets one comment, updated on every push, with a summary, review flags, a preview, and a link to the interactive map.

| Input | Values | |
|---|---|---|
| `preview` | `mermaid` (default), `images`, `none` | What the comment shows. `images` posts screenshots of the map; needs `contents: write` |
| `host` | `artifact` (default), `pages` | Where the interactive map lives. `pages` publishes it to GitHub Pages at `/pr-<number>/`; needs `contents: write` and Pages set to deploy from the `unfold-pages` branch |
| `all` | `false` (default), `true` | Show every function in changed files, not only changed ones and their neighbours |

> **GitHub Pages sites are public** (except private Pages on GitHub Enterprise Cloud), and the map contains the changed files' source. Use `host: pages` on public repositories only.

## What it understands

- **Blocks:** functions and methods, constants they use, and changed top-level code that does something (scripts, `if __name__ == "__main__"`, route files).
- **Arrows within a file:** calls by name, same-class methods first, constructors, decorators, callbacks passed by name.
- **Arrows between changed files:**
  - TypeScript, JavaScript and Vue: relative imports, `@/`-style aliases, named, default, namespace and CommonJS imports, member calls on imported objects.
  - PHP: namespaces and `use`, typed and constructor-promoted properties, typed parameters, static calls, `new`.
  - Only unambiguous targets are linked: a missing arrow is better than a wrong one.
- **Languages:** TypeScript, JavaScript, Vue (`<script>`), PHP, Python and Bash are tested. Go, Ruby, Rust, Java, Kotlin, C#, Swift and C/C++ are parsed but untested.
- **Review flags:** `private · never called`, `new · no in-file callers`, `fan-out N` (8+ calls), `N lines` (80+).

Files Unfold can't map are listed with the reason in the PR comment and in `map.md`.

## How it works

1. `git diff` gives the changed lines.
2. [tree-sitter](https://tree-sitter.github.io/) parses each changed file into functions, calls, imports and types.
3. Calls are resolved within each file, then between changed files.
4. Each block's tier is its longest call path from an entry point.
5. The result is written as one self-contained HTML page, a Markdown brief and JSON. Nothing leaves your machine.

## Contributing

Bug reports with a small code sample are the most useful contribution: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
