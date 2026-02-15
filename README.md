# ORT Insight for Visual Studio Code

Integrate the [OSS Review Toolkit (ORT)](https://github.com/oss-review-toolkit/ort) directly into your development workflow. ORT Insight lets you analyze open-source dependencies, check license compliance, generate SBOMs, and scan for security vulnerabilities -- all without leaving VS Code.

[Screenshot placeholder]

## Features

- **Dependency Analysis** -- Run the ORT Analyzer on any project with a supported package manifest. View a color-coded dependency tree with license risk indicators (green for permissive, yellow for weak copyleft, red for strong copyleft).
- **License Compliance Dashboard** -- Interactive webview dashboard showing license distribution, package counts, risk summaries, and top licenses at a glance.
- **SBOM Generation** -- Export a Software Bill of Materials in CycloneDX or SPDX format with a single command.
- **ORT HTML Reports** -- Generate ORT's native StaticHTML or WebApp reports for sharing with stakeholders.
- **Vulnerability Advisories** -- Query the OSV vulnerability database through ORT Advisor and view CVE details, severity ratings, and references.
- **Inline Diagnostics** -- See real-time warnings on import statements when a dependency has a problematic license.
- **Status Bar Integration** -- A persistent status bar item shows your current compliance posture and provides one-click access to the dashboard.
- **Setup Wizard** -- A guided first-run experience that auto-detects Java and ORT installations across Windows, macOS, and Linux.

## Prerequisites

### Java 21+

ORT requires Java 21 or later. We recommend [Eclipse Temurin](https://adoptium.net/temurin/releases/?version=21).

| Platform | Install Command |
|----------|----------------|
| Windows  | `winget install EclipseAdoptium.Temurin.21.JDK` |
| macOS    | `brew install --cask temurin@21` |
| Ubuntu/Debian | `sudo apt install temurin-21-jdk` |

### OSS Review Toolkit (ORT)

Download the latest release from [ORT GitHub Releases](https://github.com/oss-review-toolkit/ort/releases). Extract the archive and note the path to the `ort` (or `ort.bat` on Windows) executable inside the `bin/` directory.

Verify both prerequisites are working:

```bash
java -version    # Should show 21.x or later
ort --version    # Should print the ORT version
```

## Installation

Install ORT Insight from the VS Code Marketplace:

1. Open VS Code.
2. Go to the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Search for **ORT Insight**.
4. Click **Install**.

Alternatively, install from a `.vsix` file:

```bash
code --install-extension ort-insight-0.1.0.vsix
```

## Quick Start

1. Open a project that contains a package manifest (`package.json`, `pom.xml`, `build.gradle`, `requirements.txt`, `go.mod`, etc.).
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **ORT Insight: Run ORT Analyzer**.
4. Wait for the analysis to complete (the first run may take several minutes while ORT resolves dependencies).
5. Browse results in the ORT Insight sidebar panel, or click the status bar item to open the dashboard.

If this is your first time using the extension, the Setup Wizard will open automatically to help you configure Java and ORT paths.

## Commands

All commands are available through the Command Palette under the **ORT Insight** category.

| Command | Description |
|---------|-------------|
| ORT Insight: Run ORT Analyzer | Analyze project dependencies and licenses |
| ORT Insight: Show License Dashboard | Open the visual compliance dashboard |
| ORT Insight: Generate SBOM | Export an SBOM in CycloneDX or SPDX format |
| ORT Insight: Generate ORT HTML Report | Create a StaticHTML or WebApp report |
| ORT Insight: Check Vulnerability Advisories | Run ORT Advisor against the OSV database |
| ORT Insight: Refresh Dependency Tree | Reload analysis results into the tree view |
| ORT Insight: Clear ORT Cache | Remove cached analysis data from the workspace |
| ORT Insight: Setup Wizard | Open the guided setup and environment check |

## Configuration

Configure ORT Insight under **Settings > Extensions > ORT Insight**, or edit `settings.json` directly.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ortInsight.ortPath` | string | `"ort"` | Path to the ORT executable. Defaults to `ort` on PATH. |
| `ortInsight.timeout` | number | `900000` | Timeout for ORT commands in milliseconds (default 15 minutes). |
| `ortInsight.sbomFormat` | string | `"CycloneDX"` | Preferred SBOM format (`CycloneDX` or `SPDX`). |
| `ortInsight.permissiveLicenses` | array | `["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD"]` | Licenses classified as permissive (green). |
| `ortInsight.weakCopyleftLicenses` | array | `["LGPL-2.0", "LGPL-2.1", "LGPL-3.0", "MPL-1.1", "MPL-2.0", "EPL-1.0", "EPL-2.0"]` | Licenses classified as weak copyleft (yellow). |
| `ortInsight.strongCopyleftLicenses` | array | `["GPL-2.0", "GPL-3.0", "AGPL-3.0"]` | Licenses classified as strong copyleft (red). |
| `ortInsight.enableDiagnostics` | boolean | `true` | Enable inline diagnostics for problematic licenses in source files. |

## Supported Package Managers

ORT Insight supports every package manager that ORT supports, including:

- **JavaScript/TypeScript**: npm, Yarn, pnpm
- **Java/Kotlin**: Maven, Gradle
- **Python**: pip, Poetry, Pipenv
- **Go**: Go Modules
- **Rust**: Cargo
- **Ruby**: Bundler
- **PHP**: Composer
- **C/C++**: Conan
- **.NET**: NuGet
- **Swift**: SwiftPM, CocoaPods

See the [ORT documentation](https://oss-review-toolkit.org/ort/docs/analyzers/) for the full list.

## Troubleshooting

### ORT not found

Make sure ORT is installed and either available on your system PATH or configured via `ortInsight.ortPath`. Run the Setup Wizard (**ORT Insight: Setup Wizard**) to auto-detect the installation.

### Java not found

ORT requires Java 21 or later. Verify with `java -version`. If Java is installed but not detected, set the `JAVA_HOME` environment variable. ORT Insight will also attempt to auto-detect common Java installation locations.

### Analysis times out

For large projects, increase the timeout:

```json
{
  "ortInsight.timeout": 1800000
}
```

This sets the timeout to 30 minutes. You can also check the ORT Insight output channel (**View > Output > ORT Insight**) to monitor progress.

### No results displayed

1. Open the ORT Insight output channel to check for errors.
2. Verify that the project contains a recognized package manifest file.
3. Try running `ort analyze -i . -o .ort -f JSON` manually in a terminal to see detailed output.

### Advisor fails with network errors

The ORT Advisor needs internet access to query the OSV vulnerability database. If you are behind a corporate proxy or firewall, configure your proxy settings in your environment variables (`HTTP_PROXY`, `HTTPS_PROXY`) before starting VS Code.

### Inline diagnostics not appearing

1. Confirm that `ortInsight.enableDiagnostics` is `true` in settings.
2. Run an analysis first -- diagnostics require analysis results.
3. Diagnostics appear on source files with import statements, not on configuration files.

### Not a git repository warning

ORT works best when the project is inside a git repository. If you see this warning, you can let ORT Insight initialize git for you, or continue without it. Some ORT features may produce incomplete results without git metadata.

## Resources

- [ORT Documentation](https://oss-review-toolkit.org/)
- [ORT GitHub Repository](https://github.com/oss-review-toolkit/ort)
- [SPDX License List](https://spdx.org/licenses/)
- [CycloneDX Specification](https://cyclonedx.org/)

## License

This extension is released under the [MIT License](LICENSE).
