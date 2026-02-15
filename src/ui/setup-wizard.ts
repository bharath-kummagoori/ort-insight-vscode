/**
 * Setup Wizard - Guided first-run setup experience for ORT Insight
 */

import * as vscode from 'vscode';
import { SetupDetector, SetupStatus } from '../setup-detector';

export class SetupWizard {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Check if this is first run and setup is needed
   */
  shouldShowWizard(): boolean {
    const hasShownWizard = this.context.globalState.get<boolean>('ortInsight.setupComplete', false);
    if (hasShownWizard) {
      return false;
    }

    // Check if everything is already configured
    const status = SetupDetector.detect();
    if (status.ready) {
      // Auto-configure paths if found
      this.autoConfigurePaths(status);
      this.context.globalState.update('ortInsight.setupComplete', true);
      return false;
    }

    return true;
  }

  /**
   * Show the setup wizard
   */
  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'ortInsightSetup',
      'ORT Insight — Setup',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'refresh':
          this.updateStatus();
          break;
        case 'openUrl':
          vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
        case 'configurePath':
          await this.promptForPath(message.type);
          this.updateStatus();
          break;
        case 'autoDetect':
          await this.runAutoDetect();
          this.updateStatus();
          break;
        case 'finish':
          this.context.globalState.update('ortInsight.setupComplete', true);
          this.panel?.dispose();
          vscode.window.showInformationMessage(
            'ORT Insight setup complete! Use "ORT Insight: Run ORT Analyzer" to get started.',
            'Run Analyzer'
          ).then(selection => {
            if (selection === 'Run Analyzer') {
              vscode.commands.executeCommand('ort-insight.analyze');
            }
          });
          break;
        case 'resetSetup':
          this.context.globalState.update('ortInsight.setupComplete', false);
          this.updateStatus();
          break;
      }
    });

    this.updateStatus();
  }

  /**
   * Update the webview with current detection status
   */
  private updateStatus(): void {
    if (!this.panel) { return; }

    const status = SetupDetector.detect();
    const config = vscode.workspace.getConfiguration('ortInsight');
    const configuredOrtPath = config.get<string>('ortPath', 'ort');

    this.panel.webview.html = this.getWizardHtml(status, configuredOrtPath);
  }

  /**
   * Auto-configure detected paths
   */
  private async autoConfigurePaths(status: SetupStatus): Promise<void> {
    const config = vscode.workspace.getConfiguration('ortInsight');

    if (status.ort.path) {
      await config.update('ortPath', status.ort.path, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Run auto-detection and save paths
   */
  private async runAutoDetect(): Promise<void> {
    const status = SetupDetector.detect();

    if (status.ort.path) {
      const config = vscode.workspace.getConfiguration('ortInsight');
      await config.update('ortPath', status.ort.path, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`ORT found at: ${status.ort.path}`);
    }

    if (status.java.javaHome && !process.env.JAVA_HOME) {
      vscode.window.showInformationMessage(`Java found at: ${status.java.javaHome}`);
    }
  }

  /**
   * Prompt user to browse for a path
   */
  private async promptForPath(type: 'java' | 'ort'): Promise<void> {
    const options: vscode.OpenDialogOptions = {
      canSelectFiles: type === 'ort',
      canSelectFolders: type === 'java',
      canSelectMany: false,
      title: type === 'java' ? 'Select Java Home Directory' : 'Select ORT Executable',
    };

    if (type === 'ort') {
      options.filters = process.platform === 'win32'
        ? { 'ORT Executable': ['bat', 'exe'] }
        : { 'All Files': ['*'] };
    }

    const result = await vscode.window.showOpenDialog(options);
    if (result && result[0]) {
      const selectedPath = result[0].fsPath;

      if (type === 'ort') {
        const config = vscode.workspace.getConfiguration('ortInsight');
        await config.update('ortPath', selectedPath, vscode.ConfigurationTarget.Global);
      }
      // Note: JAVA_HOME is typically set as an environment variable, not in VS Code settings
      // We inform the user about this
    }
  }

  /**
   * Generate the wizard HTML
   */
  private getWizardHtml(status: SetupStatus, configuredOrtPath: string): string {
    const urls = SetupDetector.getDownloadUrls();

    const platformName = process.platform === 'win32' ? 'Windows' :
      process.platform === 'darwin' ? 'macOS' : 'Linux';

    const platformInstructions = this.getPlatformInstructions();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ORT Insight Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      color: var(--vscode-foreground, #ccc);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 30px 40px;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      margin-bottom: 35px;
      padding-bottom: 25px;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
    }
    .header h1 {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-foreground, #fff);
    }
    .header .subtitle {
      color: var(--vscode-descriptionForeground, #999);
      font-size: 14px;
    }
    .header .shield {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .status-cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-widget-border, #444);
      border-radius: 8px;
      padding: 24px;
    }
    .card.ready { border-left: 4px solid #4ec9b0; }
    .card.missing { border-left: 4px solid #f14c4c; }
    .card h2 {
      font-size: 18px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card .status-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      color: white;
    }
    .status-icon.ok { background: #4ec9b0; }
    .status-icon.fail { background: #f14c4c; }
    .card .detail {
      font-size: 13px;
      color: var(--vscode-descriptionForeground, #999);
      margin: 4px 0;
      word-break: break-all;
    }
    .card .detail strong {
      color: var(--vscode-foreground, #ccc);
    }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      margin: 4px 4px 4px 0;
      font-family: inherit;
      text-decoration: none;
    }
    .btn-primary {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #fff);
    }
    .btn-secondary:hover { opacity: 0.9; }
    .btn-success {
      background: #4ec9b0;
      color: #1e1e1e;
      font-weight: 600;
      font-size: 15px;
      padding: 12px 28px;
    }
    .btn-success:hover { opacity: 0.9; }
    .btn-success:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .instructions {
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-widget-border, #444);
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 25px;
    }
    .instructions h3 {
      font-size: 16px;
      margin-bottom: 15px;
      color: var(--vscode-foreground, #fff);
    }
    .step {
      display: flex;
      gap: 15px;
      margin-bottom: 18px;
      align-items: flex-start;
    }
    .step-number {
      min-width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--vscode-button-background, #0e639c);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
    }
    .step-content { flex: 1; }
    .step-content h4 {
      font-size: 14px;
      margin-bottom: 5px;
    }
    .step-content p {
      font-size: 13px;
      color: var(--vscode-descriptionForeground, #999);
      margin-bottom: 8px;
    }
    code {
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }
    pre {
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
      font-size: 12px;
    }
    .footer {
      text-align: center;
      margin-top: 25px;
      padding-top: 20px;
      border-top: 1px solid var(--vscode-widget-border, #444);
    }
    .platform-badge {
      display: inline-block;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #fff);
      padding: 2px 10px;
      border-radius: 10px;
      font-size: 12px;
      margin-bottom: 10px;
    }
    .actions { margin-top: 15px; }
    .refresh-bar {
      text-align: right;
      margin-bottom: 15px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="shield">&#128737;</div>
    <h1>Welcome to ORT Insight</h1>
    <p class="subtitle">Open Source License Compliance &amp; Vulnerability Scanner for VS Code</p>
  </div>

  <div class="refresh-bar">
    <span class="platform-badge">${platformName}</span>
    &nbsp;
    <button class="btn btn-secondary" onclick="send('autoDetect')">&#128269; Auto-Detect</button>
    <button class="btn btn-secondary" onclick="send('refresh')">&#8635; Refresh Status</button>
  </div>

  <div class="status-cards">
    <!-- Java Card -->
    <div class="card ${status.java.installed ? 'ready' : 'missing'}">
      <h2>
        <span class="status-icon ${status.java.installed ? 'ok' : 'fail'}">${status.java.installed ? '&#10003;' : '&#10007;'}</span>
        Java ${status.java.installed ? status.java.version || '' : '(Not Found)'}
      </h2>
      ${status.java.installed ? `
        <p class="detail"><strong>Path:</strong> ${this.escapeHtml(status.java.path || 'In PATH')}</p>
        <p class="detail"><strong>JAVA_HOME:</strong> ${this.escapeHtml(status.java.javaHome || 'Not set (will auto-detect)')}</p>
      ` : `
        <p class="detail">Java 21 or higher is required to run ORT.</p>
        <p class="detail">We recommend Eclipse Temurin (free, open-source).</p>
      `}
      <div class="actions">
        ${!status.java.installed ? `
          <button class="btn btn-primary" onclick="send('openUrl', '${urls.java.adoptium}')">&#11015; Download Java 21 (Temurin)</button>
          <button class="btn btn-secondary" onclick="send('openUrl', '${urls.java.oracle}')">Oracle JDK</button>
        ` : ''}
      </div>
    </div>

    <!-- ORT Card -->
    <div class="card ${status.ort.installed ? 'ready' : 'missing'}">
      <h2>
        <span class="status-icon ${status.ort.installed ? 'ok' : 'fail'}">${status.ort.installed ? '&#10003;' : '&#10007;'}</span>
        ORT ${status.ort.installed ? (status.ort.version ? 'v' + status.ort.version : '(Found)') : '(Not Found)'}
      </h2>
      ${status.ort.installed ? `
        <p class="detail"><strong>Path:</strong> ${this.escapeHtml(status.ort.path || 'In PATH')}</p>
        <p class="detail"><strong>Configured:</strong> ${this.escapeHtml(configuredOrtPath)}</p>
      ` : `
        <p class="detail">OSS Review Toolkit (ORT) is required for dependency analysis.</p>
        <p class="detail">Download the latest release from GitHub.</p>
      `}
      <div class="actions">
        ${!status.ort.installed ? `
          <button class="btn btn-primary" onclick="send('openUrl', '${urls.ort.github}')">&#11015; Download ORT</button>
          <button class="btn btn-secondary" onclick="send('configurePath', 'ort')">&#128193; Browse for ORT</button>
        ` : `
          <button class="btn btn-secondary" onclick="send('configurePath', 'ort')">&#128193; Change Path</button>
        `}
      </div>
    </div>
  </div>

  ${!status.ready ? `
  <div class="instructions">
    <h3>&#128214; Setup Instructions for ${platformName}</h3>
    ${platformInstructions}
  </div>
  ` : ''}

  <div class="footer">
    ${status.ready ? `
      <p style="color: #4ec9b0; font-size: 16px; margin-bottom: 15px;">&#10003; Everything is ready! You can start using ORT Insight.</p>
      <button class="btn btn-success" onclick="send('finish')">&#128640; Get Started</button>
    ` : `
      <p style="color: var(--vscode-descriptionForeground); margin-bottom: 15px;">Install the missing dependencies above, then click Refresh to continue.</p>
      <button class="btn btn-success" disabled>&#128640; Get Started (Install dependencies first)</button>
    `}
    <br><br>
    <button class="btn btn-secondary" onclick="send('openUrl', '${urls.ort.docs}')" style="font-size: 12px;">&#128218; ORT Documentation</button>
    ${status.ready ? '' : `
      <button class="btn btn-secondary" onclick="send('finish')" style="font-size: 12px;">Skip Setup (Configure Later)</button>
    `}
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(command, data) {
      if (command === 'openUrl') {
        vscode.postMessage({ command: 'openUrl', url: data });
      } else if (command === 'configurePath') {
        vscode.postMessage({ command: 'configurePath', type: data });
      } else {
        vscode.postMessage({ command });
      }
    }
  </script>
</body>
</html>`;
  }

  /**
   * Get platform-specific installation instructions
   */
  private getPlatformInstructions(): string {
    const platform = process.platform;

    if (platform === 'win32') {
      return `
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-content">
            <h4>Install Java 21</h4>
            <p>Use winget (recommended) or download manually:</p>
            <pre>winget install EclipseAdoptium.Temurin.21.JDK</pre>
            <p>After installing, restart VS Code so it picks up the new PATH.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-content">
            <h4>Download ORT</h4>
            <p>Download the latest ORT release ZIP from GitHub and extract it:</p>
            <pre>1. Go to github.com/oss-review-toolkit/ort/releases
2. Download ort-*.zip
3. Extract to C:\\ort\\ or any folder
4. The executable is at: extracted-folder\\bin\\ort.bat</pre>
          </div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-content">
            <h4>Click "Auto-Detect" above</h4>
            <p>ORT Insight will find your installations automatically. If auto-detect doesn't find ORT, use "Browse for ORT" to select it manually.</p>
          </div>
        </div>
      `;
    }

    if (platform === 'darwin') {
      return `
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-content">
            <h4>Install Java 21</h4>
            <p>Using Homebrew (recommended):</p>
            <pre>brew install --cask temurin@21</pre>
            <p>Or using SDKMAN:</p>
            <pre>sdk install java 21-tem</pre>
          </div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-content">
            <h4>Install ORT</h4>
            <p>Download the latest release:</p>
            <pre>1. Go to github.com/oss-review-toolkit/ort/releases
2. Download ort-*.tar.gz
3. Extract: tar -xzf ort-*.tar.gz -C ~/ort
4. The executable is at: ~/ort/bin/ort</pre>
          </div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-content">
            <h4>Click "Auto-Detect" above</h4>
            <p>ORT Insight will find your installations automatically.</p>
          </div>
        </div>
      `;
    }

    // Linux
    return `
      <div class="step">
        <div class="step-number">1</div>
        <div class="step-content">
          <h4>Install Java 21</h4>
          <p>Ubuntu/Debian:</p>
          <pre>sudo apt install temurin-21-jdk</pre>
          <p>Fedora/RHEL:</p>
          <pre>sudo dnf install java-21-openjdk-devel</pre>
          <p>Or using SDKMAN:</p>
          <pre>sdk install java 21-tem</pre>
        </div>
      </div>
      <div class="step">
        <div class="step-number">2</div>
        <div class="step-content">
          <h4>Install ORT</h4>
          <pre>1. Go to github.com/oss-review-toolkit/ort/releases
2. Download ort-*.tar.gz
3. Extract: tar -xzf ort-*.tar.gz -C /opt/ort
4. The executable is at: /opt/ort/bin/ort</pre>
        </div>
      </div>
      <div class="step">
        <div class="step-number">3</div>
        <div class="step-content">
          <h4>Click "Auto-Detect" above</h4>
          <p>ORT Insight will find your installations automatically.</p>
        </div>
      </div>
    `;
  }

  /**
   * Escape HTML
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
