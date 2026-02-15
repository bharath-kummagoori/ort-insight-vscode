# ORT Insight

ORT Insight is a Visual Studio Code extension that integrates the [OSS Review Toolkit (ORT)](https://github.com/oss-review-toolkit/ort) directly into your development workflow. Manage license compliance, generate SBOMs, and track security vulnerabilities without leaving your IDE.

## Features

### 🔍 Dependency Analysis
- Run ORT Analyzer directly from VS Code
- View dependency tree with license information
- Color-coded risk indicators:
  - 🟢 **Green**: Permissive licenses (MIT, Apache-2.0, BSD)
  - 🟡 **Yellow**: Weak copyleft (LGPL, MPL)
  - 🔴 **Red**: Strong copyleft (GPL, AGPL)
  - ⚪ **Gray**: Unknown/no license

### 📊 License Compliance Dashboard
- Beautiful visual dashboard with license distribution charts
- Summary cards showing package counts, issues, and vulnerabilities
- Top licenses table with risk classification
- Real-time compliance status

### 📄 SBOM Generation
- One-click SBOM generation
- Support for CycloneDX and SPDX formats
- Export and share software bill of materials

### 🛡️ Security Advisories
- Integration with ORT Advisor
- View vulnerability information for dependencies
- CVE details and severity ratings
- Direct links to security advisories

### 💡 Inline Diagnostics
- Real-time warnings on import statements
- Highlight problematic licenses in your code
- Configurable severity levels
- Quick access to license information

### ⚡ Status Bar Integration
- At-a-glance compliance status
- Click to open dashboard
- Real-time updates during scans
- Visual indicators for critical issues

## Prerequisites

### Install ORT

This extension requires ORT to be installed on your system. Install ORT using one of these methods:

**Option 1: Homebrew (macOS/Linux)**
```bash
brew install ort
```

**Option 2: Docker**
```bash
docker pull ort
```

**Option 3: From Source**
Follow the [official ORT installation guide](https://github.com/oss-review-toolkit/ort#installation).

### Verify Installation

```bash
ort --version
```

## Quick Start

1. **Install the extension** from the VS Code Marketplace

2. **Open a project** with a package manifest (package.json, pom.xml, build.gradle, etc.)

3. **Run ORT Analyzer**
   - Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "ORT Insight: Run ORT Analyzer"
   - Wait for analysis to complete

4. **View Results**
   - Check the **ORT Insight** panel in the Activity Bar
   - Click the status bar item to open the dashboard
   - Browse dependencies in the tree view
   - Review vulnerabilities in the vulnerabilities panel

## Commands

- `ORT Insight: Run ORT Analyzer` - Analyze project dependencies
- `ORT Insight: Show License Dashboard` - Open visual compliance dashboard
- `ORT Insight: Generate SBOM` - Create SBOM in CycloneDX or SPDX format
- `ORT Insight: Check Vulnerability Advisories` - Run ORT Advisor for security checks
- `ORT Insight: Refresh Dependency Tree` - Reload analysis results
- `ORT Insight: Clear ORT Cache` - Remove cached analysis data

## Configuration

Configure ORT Insight in your VS Code settings:

```json
{
  // Path to ORT executable (default: "ort" in PATH)
  "ortInsight.ortPath": "ort",

  // Analysis timeout in milliseconds (default: 5 minutes)
  "ortInsight.timeout": 300000,

  // Preferred SBOM format
  "ortInsight.sbomFormat": "CycloneDX",

  // Permissive licenses (green)
  "ortInsight.permissiveLicenses": [
    "MIT",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "ISC"
  ],

  // Weak copyleft licenses (yellow)
  "ortInsight.weakCopyleftLicenses": [
    "LGPL-2.0",
    "LGPL-2.1",
    "LGPL-3.0",
    "MPL-2.0"
  ],

  // Strong copyleft licenses (red)
  "ortInsight.strongCopyleftLicenses": [
    "GPL-2.0",
    "GPL-3.0",
    "AGPL-3.0"
  ],

  // Enable inline diagnostics
  "ortInsight.enableDiagnostics": true
}
```

## Usage Tips

### First Analysis
The first ORT analysis may take several minutes as ORT downloads and caches dependency information. Subsequent analyses will be faster.

### Multi-Root Workspaces
ORT Insight supports multi-root workspaces. When running commands, you'll be prompted to select which workspace folder to analyze.

### Large Projects
For large projects with many dependencies, consider:
- Increasing the timeout setting
- Running analysis outside of VS Code peak usage times
- Excluding test dependencies if possible

### Custom License Policies
Customize the license classification in settings to match your organization's policies. Add or remove licenses from each risk category as needed.

## Supported Package Managers

ORT Insight supports all package managers supported by ORT, including:

- **JavaScript/TypeScript**: npm, Yarn, pnpm
- **Java**: Maven, Gradle
- **Python**: pip, Poetry, Pipenv
- **Go**: Go modules
- **Rust**: Cargo
- **Ruby**: Bundler
- **PHP**: Composer
- **C/C++**: Conan
- **.NET**: NuGet

## Troubleshooting

### "ORT not found in PATH"
Make sure ORT is installed and available in your system PATH. Run `ort --version` in a terminal to verify.

### Analysis Timeout
If analysis times out, increase the timeout setting:
```json
{
  "ortInsight.timeout": 600000  // 10 minutes
}
```

### No Results Displayed
1. Check the ORT Insight output channel for errors
2. Verify your project has a supported package manifest
3. Try running `ort analyze` manually to see detailed errors

### Diagnostics Not Showing
1. Verify `ortInsight.enableDiagnostics` is set to `true`
2. Check that you've run an analysis first
3. Make sure you're editing a source file (not a config file)

## Contributing

Found a bug or have a feature request? Please open an issue on [GitHub](https://github.com/your-repo/ort-insight-vscode).

## License

MIT License - see LICENSE file for details.

## Acknowledgments

Built with the amazing [OSS Review Toolkit (ORT)](https://github.com/oss-review-toolkit/ort) by the ORT community.

## Learn More

- [ORT Documentation](https://oss-review-toolkit.org/)
- [SPDX License List](https://spdx.org/licenses/)
- [CycloneDX Specification](https://cyclonedx.org/)
- [Software Bill of Materials (SBOM)](https://www.ntia.gov/SBOM)
