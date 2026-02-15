/**
 * ORT Insight - Main Extension Entry Point
 *
 * VS Code extension for OSS Review Toolkit (ORT) integration
 */

import * as vscode from 'vscode';
import { ORTWrapper } from './ort-wrapper';
import { DependencyTreeProvider } from './ui/dependency-tree-provider';
import { VulnerabilityTreeProvider } from './ui/vulnerability-tree-provider';
import { StatusBarProvider } from './ui/status-bar';
import { DiagnosticsProvider } from './ui/diagnostics-provider';
import { DashboardWebviewProvider } from './ui/dashboard-webview';
import { Vulnerability } from './types';

let outputChannel: vscode.OutputChannel;
let ortWrapper: ORTWrapper;
let dependencyTreeProvider: DependencyTreeProvider;
let vulnerabilityTreeProvider: VulnerabilityTreeProvider;
let statusBarProvider: StatusBarProvider;
let diagnosticsProvider: DiagnosticsProvider;
let dashboardProvider: DashboardWebviewProvider;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('ORT Insight extension is activating...');

  // Create output channel
  outputChannel = vscode.window.createOutputChannel('ORT Insight');

  // Initialize components
  ortWrapper = new ORTWrapper(outputChannel);
  dependencyTreeProvider = new DependencyTreeProvider();
  vulnerabilityTreeProvider = new VulnerabilityTreeProvider();
  statusBarProvider = new StatusBarProvider();
  diagnosticsProvider = new DiagnosticsProvider();
  dashboardProvider = new DashboardWebviewProvider(context.extensionUri);

  // Register tree views
  vscode.window.registerTreeDataProvider('ort-insight.dependencyTree', dependencyTreeProvider);
  vscode.window.registerTreeDataProvider('ort-insight.vulnerabilities', vulnerabilityTreeProvider);

  // Show status bar
  statusBarProvider.show();

  // Register commands
  registerCommands(context);

  // Listen to document changes for diagnostics
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => diagnosticsProvider.updateDiagnostics(doc)),
    vscode.workspace.onDidSaveTextDocument(doc => diagnosticsProvider.updateDiagnostics(doc)),
    vscode.workspace.onDidChangeTextDocument(e => diagnosticsProvider.updateDiagnostics(e.document))
  );

  // Check if ORT is installed
  const ortInstalled = await ortWrapper.checkOrtInstallation();
  if (!ortInstalled) {
    const message = 'ORT (OSS Review Toolkit) not found in PATH. Please install ORT to use this extension.';
    const action = await vscode.window.showWarningMessage(
      message,
      'Open ORT Documentation'
    );

    if (action === 'Open ORT Documentation') {
      vscode.env.openExternal(vscode.Uri.parse('https://github.com/oss-review-toolkit/ort'));
    }
  }

  // Load existing results if available
  await loadExistingResults();

  console.log('ORT Insight extension activated successfully');
}

/**
 * Extension deactivation
 */
export function deactivate() {
  statusBarProvider?.dispose();
  diagnosticsProvider?.dispose();
  dashboardProvider?.dispose();
}

/**
 * Register all commands
 */
function registerCommands(context: vscode.ExtensionContext) {
  // Run ORT Analyzer
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.analyze', async () => {
      await runAnalyzer();
    })
  );

  // Show Dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.showDashboard', async () => {
      await showDashboard();
    })
  );

  // Generate SBOM
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.generateSBOM', async () => {
      await generateSBOM();
    })
  );

  // Check Advisories
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.checkAdvisories', async () => {
      await checkAdvisories();
    })
  );

  // Refresh Tree
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.refreshTree', async () => {
      await loadExistingResults();
    })
  );

  // Clear Cache
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.clearCache', async () => {
      await clearCache();
    })
  );

  // Show Vulnerability Details
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.showVulnerabilityDetails', async (vuln: Vulnerability) => {
      showVulnerabilityDetails(vuln);
    })
  );
}

/**
 * Run ORT Analyzer
 */
async function runAnalyzer() {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  try {
    statusBarProvider.showScanning();
    vscode.window.showInformationMessage('Running ORT Analyzer...');

    const resultFile = await ortWrapper.runAnalyzer(workspaceFolder);

    // Load results into UI
    await loadResults(resultFile);

    vscode.window.showInformationMessage('ORT Analysis completed successfully!');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ORT Analysis failed: ${message}`);
    statusBarProvider.loadResults('');
  }
}

/**
 * Show Dashboard
 */
async function showDashboard() {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const resultFile = ORTWrapper.findLatestResult(workspaceFolder);
  if (!resultFile) {
    vscode.window.showWarningMessage('No ORT results found. Please run ORT Analyzer first.');
    return;
  }

  await dashboardProvider.show(resultFile);
}

/**
 * Generate SBOM
 */
async function generateSBOM() {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const resultFile = ORTWrapper.findLatestResult(workspaceFolder);
  if (!resultFile) {
    vscode.window.showWarningMessage('No ORT results found. Please run ORT Analyzer first.');
    return;
  }

  // Ask user for SBOM format
  const format = await vscode.window.showQuickPick(['CycloneDX', 'SPDX'], {
    placeHolder: 'Select SBOM format',
    canPickMany: false,
    title: 'Generate SBOM'
  });

  if (!format) {
    return;
  }

  try {
    vscode.window.showInformationMessage(`Generating ${format} SBOM...`);

    const sbomFile = await ortWrapper.generateSBOM(
      resultFile,
      format as 'CycloneDX' | 'SPDX'
    );

    const action = await vscode.window.showInformationMessage(
      `SBOM generated: ${sbomFile}`,
      'Open File'
    );

    if (action === 'Open File') {
      const doc = await vscode.workspace.openTextDocument(sbomFile);
      await vscode.window.showTextDocument(doc);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`SBOM generation failed: ${message}`);
  }
}

/**
 * Check for vulnerabilities using ORT Advisor
 */
async function checkAdvisories() {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const resultFile = ORTWrapper.findLatestResult(workspaceFolder);
  if (!resultFile) {
    vscode.window.showWarningMessage('No ORT results found. Please run ORT Analyzer first.');
    return;
  }

  try {
    vscode.window.showInformationMessage('Checking for security advisories...');

    const advisorFile = await ortWrapper.runAdvisor(resultFile);

    if (advisorFile) {
      await loadResults(advisorFile);
      vscode.window.showInformationMessage('Security advisory check completed!');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Advisory check failed: ${message}`);
  }
}

/**
 * Clear ORT cache
 */
async function clearCache() {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    'This will delete all ORT analysis results. Continue?',
    'Yes',
    'No'
  );

  if (confirm !== 'Yes') {
    return;
  }

  try {
    ORTWrapper.clearCache(workspaceFolder);

    // Clear UI
    dependencyTreeProvider.clear();
    vulnerabilityTreeProvider.clear();
    diagnosticsProvider.clearAll();
    statusBarProvider.loadResults('');

    vscode.window.showInformationMessage('ORT cache cleared successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to clear cache: ${message}`);
  }
}

/**
 * Load existing results on activation
 */
async function loadExistingResults() {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const resultFile = ORTWrapper.findLatestResult(workspaceFolder);
  if (resultFile) {
    await loadResults(resultFile);
  }
}

/**
 * Load results into all UI components
 */
async function loadResults(resultFile: string) {
  await dependencyTreeProvider.loadResults(resultFile);
  await vulnerabilityTreeProvider.loadResults(resultFile);
  await statusBarProvider.loadResults(resultFile);
  await diagnosticsProvider.loadResults(resultFile);
}

/**
 * Show vulnerability details in a modal
 */
function showVulnerabilityDetails(vuln: Vulnerability) {
  const panel = vscode.window.createWebviewPanel(
    'vulnerabilityDetails',
    `Vulnerability: ${vuln.id}`,
    vscode.ViewColumn.Two,
    {}
  );

  panel.webview.html = getVulnerabilityDetailsHtml(vuln);
}

/**
 * Get vulnerability details HTML
 */
function getVulnerabilityDetailsHtml(vuln: Vulnerability): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${vuln.id}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
    }
    h1 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
    .field { margin-bottom: 16px; }
    .label { font-weight: bold; opacity: 0.7; font-size: 12px; text-transform: uppercase; }
    .value { margin-top: 4px; }
    a { color: var(--vscode-textLink-foreground); }
  </style>
</head>
<body>
  <h1>${vuln.id}</h1>

  ${vuln.severity ? `
    <div class="field">
      <div class="label">Severity</div>
      <div class="value">${vuln.severity}</div>
    </div>
  ` : ''}

  ${vuln.cvss ? `
    <div class="field">
      <div class="label">CVSS Score</div>
      <div class="value">${vuln.cvss}</div>
    </div>
  ` : ''}

  ${vuln.summary ? `
    <div class="field">
      <div class="label">Summary</div>
      <div class="value">${vuln.summary}</div>
    </div>
  ` : ''}

  ${vuln.description ? `
    <div class="field">
      <div class="label">Description</div>
      <div class="value">${vuln.description}</div>
    </div>
  ` : ''}

  ${vuln.references && vuln.references.length > 0 ? `
    <div class="field">
      <div class="label">References</div>
      <div class="value">
        <ul>
          ${vuln.references.map(ref => `<li><a href="${ref.url}">${ref.url}</a></li>`).join('')}
        </ul>
      </div>
    </div>
  ` : ''}
</body>
</html>`;
}

/**
 * Get workspace folder or show error
 */
function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open');
    return undefined;
  }

  // If multiple folders, let user choose
  if (folders.length > 1) {
    vscode.window.showQuickPick(
      folders.map(f => f.name),
      { placeHolder: 'Select workspace folder for ORT analysis' }
    );
  }

  return folders[0];
}
