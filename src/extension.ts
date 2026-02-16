/**
 * ORT Insight - Main Extension Entry Point
 *
 * VS Code extension for OSS Review Toolkit (ORT) integration
 */

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ORTWrapper } from './ort-wrapper';
import { DependencyTreeProvider } from './ui/dependency-tree-provider';
import { VulnerabilityTreeProvider } from './ui/vulnerability-tree-provider';
import { StatusBarProvider } from './ui/status-bar';
import { DiagnosticsProvider } from './ui/diagnostics-provider';
import { DashboardWebviewProvider } from './ui/dashboard-webview';
import { SetupWizard } from './ui/setup-wizard';
import { SetupDetector } from './setup-detector';
import { Vulnerability } from './types';
import { escapeHtml } from './ui/ui-utils';

let outputChannel: vscode.OutputChannel;
let ortWrapper: ORTWrapper;
let dependencyTreeProvider: DependencyTreeProvider;
let vulnerabilityTreeProvider: VulnerabilityTreeProvider;
let statusBarProvider: StatusBarProvider;
let diagnosticsProvider: DiagnosticsProvider;
let dashboardProvider: DashboardWebviewProvider;
let setupWizard: SetupWizard;

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
  setupWizard = new SetupWizard(context);

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

  // First-run setup wizard
  if (setupWizard.shouldShowWizard()) {
    setupWizard.show();
  } else {
    // Not first run — check if ORT is available and show actionable error if not
    const ortInstalled = await ortWrapper.checkOrtInstallation();
    if (!ortInstalled) {
      const action = await vscode.window.showWarningMessage(
        'ORT not found. Run the setup wizard to configure ORT Insight.',
        'Open Setup Wizard',
        'Download ORT',
        'Configure Path'
      );

      if (action === 'Open Setup Wizard') {
        setupWizard.show();
      } else if (action === 'Download ORT') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/oss-review-toolkit/ort/releases'));
      } else if (action === 'Configure Path') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'ortInsight.ortPath');
      }
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

  // Setup Wizard
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.showSetup', async () => {
      setupWizard.show();
    })
  );

  // Generate ORT HTML Report
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.generateReport', async () => {
      await generateReport();
    })
  );

  // Evaluate Policies
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.evaluatePolicy', async () => {
      await evaluatePolicy(context);
    })
  );

  // Initialize Policy Rules (create template files)
  context.subscriptions.push(
    vscode.commands.registerCommand('ort-insight.initPolicyRules', async () => {
      await initPolicyRules(context);
    })
  );
}

/**
 * Run ORT Analyzer
 */
async function runAnalyzer() {
  const workspaceFolder = await getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  // Pre-flight check: ensure ORT is available
  const ortReady = await ortWrapper.checkOrtInstallation();
  if (!ortReady) {
    const action = await vscode.window.showErrorMessage(
      'Cannot run analysis: ORT is not installed or not configured.',
      'Open Setup Wizard',
      'Download ORT',
      'Configure Path'
    );
    if (action === 'Open Setup Wizard') { setupWizard.show(); }
    else if (action === 'Download ORT') { vscode.env.openExternal(vscode.Uri.parse('https://github.com/oss-review-toolkit/ort/releases')); }
    else if (action === 'Configure Path') { vscode.commands.executeCommand('workbench.action.openSettings', 'ortInsight.ortPath'); }
    return;
  }

  // Pre-flight check: ensure Java is available
  const javaStatus = SetupDetector.detectJava();
  if (!javaStatus.installed) {
    const action = await vscode.window.showErrorMessage(
      'Cannot run analysis: Java 21+ is required but not found.',
      'Open Setup Wizard',
      'Download Java 21'
    );
    if (action === 'Open Setup Wizard') { setupWizard.show(); }
    else if (action === 'Download Java 21') { vscode.env.openExternal(vscode.Uri.parse('https://adoptium.net/temurin/releases/?version=21')); }
    return;
  }

  // Pre-flight check: warn if not a git repository
  const gitDir = path.join(workspaceFolder.uri.fsPath, '.git');
  if (!fs.existsSync(gitDir)) {
    const action = await vscode.window.showWarningMessage(
      'This folder is not a git repository. ORT works best with git-initialized projects.',
      'Initialize Git & Continue',
      'Continue Anyway',
      'Cancel'
    );
    if (action === 'Initialize Git & Continue') {
      try {
        child_process.execSync('git init', { cwd: workspaceFolder.uri.fsPath });
        child_process.execSync('git add -A', { cwd: workspaceFolder.uri.fsPath });
        child_process.execSync('git commit -m "Initial commit for ORT analysis" --allow-empty', { cwd: workspaceFolder.uri.fsPath });
        outputChannel.appendLine('Git repository initialized.');
      } catch (e) {
        outputChannel.appendLine(`Warning: Git init failed: ${e}`);
      }
    } else if (action === 'Cancel' || !action) {
      return;
    }
  }

  try {
    statusBarProvider.showScanning();
    vscode.window.showInformationMessage('Running ORT Analyzer... This may take several minutes.');

    const resultFile = await ortWrapper.runAnalyzer(workspaceFolder);

    // Load results into UI
    await loadResults(resultFile);

    vscode.window.showInformationMessage('ORT Analysis completed successfully!', 'Show Dashboard').then(action => {
      if (action === 'Show Dashboard') {
        vscode.commands.executeCommand('ort-insight.showDashboard');
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const action = await vscode.window.showErrorMessage(
      `ORT Analysis failed: ${message}`,
      'Show Output',
      'Open Setup Wizard'
    );
    if (action === 'Show Output') { outputChannel.show(); }
    else if (action === 'Open Setup Wizard') { setupWizard.show(); }
    statusBarProvider.loadResults('');
  }
}

/**
 * Show Dashboard
 */
async function showDashboard() {
  const workspaceFolder = await getWorkspaceFolder();
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
  const workspaceFolder = await getWorkspaceFolder();
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
 * Generate ORT's native HTML report
 */
async function generateReport() {
  const workspaceFolder = await getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const resultFile = ORTWrapper.findLatestResult(workspaceFolder);
  if (!resultFile) {
    vscode.window.showWarningMessage('No ORT results found. Please run ORT Analyzer first.');
    return;
  }

  const format = await vscode.window.showQuickPick(
    [
      { label: 'StaticHTML', description: 'Single-file HTML report with full details' },
      { label: 'WebApp', description: 'Interactive web application with filtering and search' }
    ],
    {
      placeHolder: 'Select ORT report format',
      title: 'Generate ORT HTML Report'
    }
  );

  if (!format) {
    return;
  }

  try {
    vscode.window.showInformationMessage(`Generating ORT ${format.label} report... This may take a minute.`);

    const reportFile = await ortWrapper.generateReport(
      resultFile,
      format.label as 'StaticHTML' | 'WebApp'
    );

    const action = await vscode.window.showInformationMessage(
      `ORT ${format.label} report generated!`,
      'Open in Browser',
      'Open in Editor'
    );

    if (action === 'Open in Browser') {
      vscode.env.openExternal(vscode.Uri.file(reportFile));
    } else if (action === 'Open in Editor') {
      const doc = await vscode.workspace.openTextDocument(reportFile);
      await vscode.window.showTextDocument(doc);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Report generation failed: ${message}`);
  }
}

/**
 * Evaluate Policy Rules using ORT Evaluator
 */
async function evaluatePolicy(context: vscode.ExtensionContext) {
  const workspaceFolder = await getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const resultFile = ORTWrapper.findLatestResult(workspaceFolder);
  if (!resultFile) {
    vscode.window.showWarningMessage('No ORT results found. Please run ORT Analyzer first.');
    return;
  }

  // Check for policy files in workspace
  const ortConfigDir = path.join(workspaceFolder.uri.fsPath, '.ort-config');
  const rulesFile = path.join(ortConfigDir, 'evaluator.rules.kts');
  const licenseClassFile = path.join(ortConfigDir, 'license-classifications.yml');

  // Check if policy files exist
  const hasRulesFile = fs.existsSync(rulesFile);
  const hasLicenseClassFile = fs.existsSync(licenseClassFile);

  if (!hasRulesFile || !hasLicenseClassFile) {
    const action = await vscode.window.showWarningMessage(
      'Policy rules not found in .ort-config/ directory. Would you like to create template files?',
      'Create Templates',
      'Browse for Files',
      'Run Without Rules'
    );

    if (action === 'Create Templates') {
      await initPolicyRules(context);
      vscode.window.showInformationMessage(
        'Policy templates created in .ort-config/ folder. Customize them, then run Evaluate Policies again.'
      );
      return;
    } else if (action === 'Browse for Files') {
      // Let user pick rules file
      const selectedFiles = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Rules File': ['kts'] },
        openLabel: 'Select Rules File (.rules.kts)',
        title: 'Select ORT Evaluator Rules File'
      });

      if (!selectedFiles || selectedFiles.length === 0) {
        return;
      }

      // Run with user-selected file
      try {
        vscode.window.showInformationMessage('Running ORT Policy Evaluator...');
        const evalResult = await ortWrapper.runEvaluator(
          resultFile,
          selectedFiles[0].fsPath,
          undefined
        );

        if (evalResult) {
          await showEvaluatorResults(evalResult);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Policy evaluation failed: ${message}`);
      }
      return;
    } else if (action !== 'Run Without Rules') {
      return;
    }
  }

  // Run the evaluator
  try {
    vscode.window.showInformationMessage('Running ORT Policy Evaluator... This may take a minute.');

    const evalResult = await ortWrapper.runEvaluator(
      resultFile,
      hasRulesFile ? rulesFile : undefined,
      hasLicenseClassFile ? licenseClassFile : undefined
    );

    if (evalResult) {
      await showEvaluatorResults(evalResult);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const action = await vscode.window.showErrorMessage(
      `Policy evaluation failed: ${message}`,
      'Show Output',
      'Create Templates'
    );
    if (action === 'Show Output') { outputChannel.show(); }
    else if (action === 'Create Templates') { await initPolicyRules(context); }
  }
}

/**
 * Show evaluator results in a webview panel
 */
async function showEvaluatorResults(evalResultFile: string) {
  try {
    const content = fs.readFileSync(evalResultFile, 'utf-8');
    const evalData = JSON.parse(content);

    // Extract violations from evaluator result
    const violations: Array<{
      rule: string;
      pkg: string;
      license: string;
      severity: string;
      message: string;
      howToFix: string;
    }> = [];

    // ORT evaluator result structure: evaluator.violations[]
    const evaluator = evalData.evaluator || {};
    const rawViolations = evaluator.violations || [];

    for (const v of rawViolations) {
      violations.push({
        rule: v.rule || 'Unknown',
        pkg: v.pkg || v.packageId || 'Unknown',
        license: v.license || v.licenseId || '',
        severity: v.severity || 'ERROR',
        message: v.message || '',
        howToFix: v.howToFix || ''
      });
    }

    // Create webview panel to show results
    const panel = vscode.window.createWebviewPanel(
      'policyResults',
      'ORT Policy Evaluation Results',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const errors = violations.filter(v => v.severity === 'ERROR');
    const warnings = violations.filter(v => v.severity === 'WARNING');
    const hints = violations.filter(v => v.severity === 'HINT');

    panel.webview.html = getPolicyResultsHtml(violations, errors.length, warnings.length, hints.length);

    // Also show summary notification
    if (violations.length === 0) {
      vscode.window.showInformationMessage(
        'Policy Evaluation: No violations found! All dependencies are compliant.'
      );
    } else {
      vscode.window.showWarningMessage(
        `Policy Evaluation: ${errors.length} error(s), ${warnings.length} warning(s), ${hints.length} hint(s) found.`,
        'View Results'
      ).then(action => {
        if (action === 'View Results') {
          panel.reveal();
        }
      });
    }
  } catch (error) {
    // If JSON parsing fails, open the raw file
    const doc = await vscode.workspace.openTextDocument(evalResultFile);
    await vscode.window.showTextDocument(doc);
  }
}

/**
 * Generate HTML for policy evaluation results
 */
function getPolicyResultsHtml(
  violations: Array<{ rule: string; pkg: string; license: string; severity: string; message: string; howToFix: string }>,
  errorCount: number,
  warningCount: number,
  hintCount: number
): string {
  const violationRows = violations.map(v => {
    const severityClass = v.severity === 'ERROR' ? 'error' : v.severity === 'WARNING' ? 'warning' : 'hint';
    const severityIcon = v.severity === 'ERROR' ? '&#10060;' : v.severity === 'WARNING' ? '&#9888;' : '&#8505;';
    return `
      <tr class="${severityClass}">
        <td>${severityIcon} ${escapeHtml(v.severity)}</td>
        <td title="${escapeHtml(v.pkg)}">${escapeHtml(v.pkg.length > 50 ? v.pkg.substring(0, 50) + '...' : v.pkg)}</td>
        <td>${escapeHtml(v.license)}</td>
        <td>${escapeHtml(v.rule)}</td>
        <td>${escapeHtml(v.message)}</td>
        <td class="howtofix">${escapeHtml(v.howToFix)}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>ORT Policy Evaluation Results</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    h1 { margin-bottom: 5px; }
    .summary {
      display: flex;
      gap: 20px;
      margin: 20px 0;
      flex-wrap: wrap;
    }
    .summary-card {
      padding: 15px 25px;
      border-radius: 8px;
      text-align: center;
      min-width: 120px;
    }
    .summary-card.errors { background: rgba(220, 53, 69, 0.2); border: 1px solid rgba(220, 53, 69, 0.5); }
    .summary-card.warnings { background: rgba(255, 193, 7, 0.2); border: 1px solid rgba(255, 193, 7, 0.5); }
    .summary-card.hints { background: rgba(23, 162, 184, 0.2); border: 1px solid rgba(23, 162, 184, 0.5); }
    .summary-card.pass { background: rgba(40, 167, 69, 0.2); border: 1px solid rgba(40, 167, 69, 0.5); }
    .summary-card .count { font-size: 32px; font-weight: bold; }
    .summary-card .label { font-size: 12px; opacity: 0.8; text-transform: uppercase; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      font-size: 13px;
    }
    th {
      background: var(--vscode-editor-selectionBackground);
      padding: 10px 12px;
      text-align: left;
      font-weight: bold;
      position: sticky;
      top: 0;
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      vertical-align: top;
    }
    tr.error td:first-child { color: #dc3545; font-weight: bold; }
    tr.warning td:first-child { color: #ffc107; font-weight: bold; }
    tr.hint td:first-child { color: #17a2b8; }
    .howtofix { font-style: italic; opacity: 0.8; font-size: 12px; }
    .no-violations {
      text-align: center;
      padding: 60px 20px;
      font-size: 18px;
    }
    .no-violations .checkmark { font-size: 64px; margin-bottom: 15px; }
    .filter-bar {
      margin: 15px 0;
      display: flex;
      gap: 10px;
    }
    .filter-btn {
      padding: 6px 14px;
      border: 1px solid var(--vscode-panel-border);
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      border-radius: 4px;
      font-size: 12px;
    }
    .filter-btn:hover, .filter-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
  </style>
</head>
<body>
  <h1>&#128220; ORT Policy Evaluation Results</h1>
  <p style="opacity:0.7">Powered by ORT Evaluator</p>

  <div class="summary">
    ${errorCount > 0 ? `<div class="summary-card errors"><div class="count">${errorCount}</div><div class="label">Errors</div></div>` : ''}
    ${warningCount > 0 ? `<div class="summary-card warnings"><div class="count">${warningCount}</div><div class="label">Warnings</div></div>` : ''}
    ${hintCount > 0 ? `<div class="summary-card hints"><div class="count">${hintCount}</div><div class="label">Hints</div></div>` : ''}
    ${violations.length === 0 ? `<div class="summary-card pass"><div class="count">&#10004;</div><div class="label">All Clear</div></div>` : ''}
  </div>

  ${violations.length === 0 ? `
    <div class="no-violations">
      <div class="checkmark">&#9989;</div>
      <div>No policy violations found!</div>
      <div style="opacity:0.6;margin-top:10px;">All dependencies comply with your policy rules.</div>
    </div>
  ` : `
    <div class="filter-bar">
      <button class="filter-btn active" onclick="filterRows('all')">All (${violations.length})</button>
      ${errorCount > 0 ? `<button class="filter-btn" onclick="filterRows('error')">Errors (${errorCount})</button>` : ''}
      ${warningCount > 0 ? `<button class="filter-btn" onclick="filterRows('warning')">Warnings (${warningCount})</button>` : ''}
      ${hintCount > 0 ? `<button class="filter-btn" onclick="filterRows('hint')">Hints (${hintCount})</button>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Package</th>
          <th>License</th>
          <th>Rule</th>
          <th>Message</th>
          <th>How to Fix</th>
        </tr>
      </thead>
      <tbody>
        ${violationRows}
      </tbody>
    </table>
  `}

  <script>
    function filterRows(type) {
      const rows = document.querySelectorAll('tbody tr');
      const btns = document.querySelectorAll('.filter-btn');
      btns.forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      rows.forEach(row => {
        if (type === 'all') {
          row.style.display = '';
        } else {
          row.style.display = row.classList.contains(type) ? '' : 'none';
        }
      });
    }
  </script>
</body>
</html>`;
}

/**
 * Initialize policy rules templates in workspace
 */
async function initPolicyRules(context: vscode.ExtensionContext) {
  const workspaceFolder = await getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const ortConfigDir = path.join(workspaceFolder.uri.fsPath, '.ort-config');

  // Create .ort-config directory
  if (!fs.existsSync(ortConfigDir)) {
    fs.mkdirSync(ortConfigDir, { recursive: true });
  }

  // Copy template files from extension resources
  const templatesDir = path.join(context.extensionPath, 'resources', 'templates');

  const rulesTarget = path.join(ortConfigDir, 'evaluator.rules.kts');
  const licenseTarget = path.join(ortConfigDir, 'license-classifications.yml');

  let filesCreated = 0;

  if (!fs.existsSync(rulesTarget)) {
    const rulesTemplate = path.join(templatesDir, 'evaluator.rules.kts');
    if (fs.existsSync(rulesTemplate)) {
      fs.copyFileSync(rulesTemplate, rulesTarget);
    } else {
      // Fallback: write a minimal template
      fs.writeFileSync(rulesTarget, '// ORT Evaluator Rules\n// See: https://oss-review-toolkit.org/ort/docs/configuration/evaluator-rules\n\n' +
        'val permissiveLicenses = licenseClassifications.licensesByCategory["permissive"].orEmpty()\n\n' +
        'packageRule("FLAG_COPYLEFT") {\n' +
        '    require {\n' +
        '        -isExcluded()\n' +
        '    }\n' +
        '    licenseRule("COPYLEFT_IN_DEPENDENCY", LicenseView.CONCLUDED_OR_DECLARED_AND_DETECTED) {\n' +
        '        require {\n' +
        '            +isCategorized("copyleft")\n' +
        '        }\n' +
        '        error(\n' +
        '            "Package uses a copyleft license: ${license.simpleLicense()}",\n' +
        '            "Review if this dependency can be replaced."\n' +
        '        )\n' +
        '    }\n' +
        '}\n');
    }
    filesCreated++;
  }

  if (!fs.existsSync(licenseTarget)) {
    const licenseTemplate = path.join(templatesDir, 'license-classifications.yml');
    if (fs.existsSync(licenseTemplate)) {
      fs.copyFileSync(licenseTemplate, licenseTarget);
    } else {
      // Fallback: write a minimal template
      fs.writeFileSync(licenseTarget, '---\ncategories:\n  - name: "permissive"\n    description: "Permissive licenses"\n  - name: "copyleft"\n    description: "Copyleft licenses"\n\ncategorizations:\n  - id: "MIT"\n    categories: ["permissive"]\n  - id: "Apache-2.0"\n    categories: ["permissive"]\n  - id: "GPL-3.0-only"\n    categories: ["copyleft"]\n');
    }
    filesCreated++;
  }

  if (filesCreated > 0) {
    const action = await vscode.window.showInformationMessage(
      `Created ${filesCreated} policy template(s) in .ort-config/ folder. Customize them for your project.`,
      'Open Rules File',
      'Open License Classifications'
    );

    if (action === 'Open Rules File') {
      const doc = await vscode.workspace.openTextDocument(rulesTarget);
      await vscode.window.showTextDocument(doc);
    } else if (action === 'Open License Classifications') {
      const doc = await vscode.workspace.openTextDocument(licenseTarget);
      await vscode.window.showTextDocument(doc);
    }
  } else {
    vscode.window.showInformationMessage('Policy templates already exist in .ort-config/ folder.');
  }
}

/**
 * Check for vulnerabilities using ORT Advisor
 */
async function checkAdvisories() {
  const workspaceFolder = await getWorkspaceFolder();
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
  const workspaceFolder = await getWorkspaceFolder();
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
  try {
    const workspaceFolder = await getWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    const resultFile = ORTWrapper.findLatestResult(workspaceFolder);
    if (resultFile) {
      await loadResults(resultFile);
    }
  } catch (error) {
    console.error('Failed to load existing ORT results:', error);
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>${escapeHtml(vuln.id)}</title>
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
  <h1>${escapeHtml(vuln.id)}</h1>

  ${vuln.severity ? `
    <div class="field">
      <div class="label">Severity</div>
      <div class="value">${escapeHtml(vuln.severity)}</div>
    </div>
  ` : ''}

  ${vuln.cvss ? `
    <div class="field">
      <div class="label">CVSS Score</div>
      <div class="value">${escapeHtml(String(vuln.cvss))}</div>
    </div>
  ` : ''}

  ${vuln.summary ? `
    <div class="field">
      <div class="label">Summary</div>
      <div class="value">${escapeHtml(vuln.summary)}</div>
    </div>
  ` : ''}

  ${vuln.description ? `
    <div class="field">
      <div class="label">Description</div>
      <div class="value">${escapeHtml(vuln.description)}</div>
    </div>
  ` : ''}

  ${vuln.references && vuln.references.length > 0 ? `
    <div class="field">
      <div class="label">References</div>
      <div class="value">
        <ul>
          ${vuln.references.map(ref => `<li><a href="${escapeHtml(ref.url)}">${escapeHtml(ref.url)}</a></li>`).join('')}
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
async function getWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open. Please open a project folder first.');
    return undefined;
  }

  if (folders.length === 1) {
    return folders[0];
  }

  // Multiple folders - let user choose
  const selected = await vscode.window.showQuickPick(
    folders.map(f => ({ label: f.name, description: f.uri.fsPath, folder: f })),
    { placeHolder: 'Select workspace folder for ORT analysis' }
  );

  return selected?.folder;
}
