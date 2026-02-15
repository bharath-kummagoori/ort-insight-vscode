/**
 * Dashboard Webview - License compliance dashboard with visualizations
 */

import * as vscode from 'vscode';
import { ORTResult, ComplianceStatus, LicenseStats } from '../types';
import { ORTParser } from '../ort-parser';
import { getLicenseColor, escapeHtml } from './ui-utils';
import * as fs from 'fs';

export class DashboardWebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private parser: ORTParser;
  private currentResultFile: string | undefined;

  constructor(_extensionUri: vscode.Uri) {
    this.parser = new ORTParser();
  }

  /**
   * Show the dashboard
   */
  async show(resultFile: string): Promise<void> {
    this.currentResultFile = resultFile;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      await this.updateContent();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'ortInsightDashboard',
      'ORT Insight Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    await this.updateContent();
  }

  /**
   * Update dashboard content
   */
  private async updateContent(): Promise<void> {
    if (!this.panel || !this.currentResultFile) {
      return;
    }

    try {
      if (!fs.existsSync(this.currentResultFile)) {
        this.panel.webview.html = this.getErrorHtml('No ORT results found');
        return;
      }

      const ortResult = this.parser.parseResultFile(this.currentResultFile);
      const status = this.parser.getComplianceStatus(ortResult);

      this.panel.webview.html = this.getDashboardHtml(ortResult, status);
    } catch (error) {
      this.panel.webview.html = this.getErrorHtml(`Failed to load results: ${error}`);
    }
  }

  /**
   * Get dashboard HTML
   */
  private getDashboardHtml(_ortResult: ORTResult, status: ComplianceStatus): string {
    const stats = status.details.licenseStats;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ORT Insight Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
    }

    h1, h2, h3 {
      margin-bottom: 16px;
      font-weight: 600;
    }

    h1 {
      font-size: 24px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 12px;
      margin-bottom: 24px;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .card {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 16px;
    }

    .card-title {
      font-size: 12px;
      text-transform: uppercase;
      opacity: 0.7;
      margin-bottom: 8px;
    }

    .card-value {
      font-size: 32px;
      font-weight: 600;
    }

    .status-indicator {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }

    .status-compliant { background-color: #4caf50; }
    .status-issues { background-color: #ff9800; }
    .status-critical { background-color: #f44336; }
    .status-unknown { background-color: #9e9e9e; }

    .chart-container {
      margin-bottom: 32px;
    }

    .bar-chart {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bar-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bar-label {
      min-width: 140px;
      font-size: 13px;
    }

    .bar-track {
      flex: 1;
      height: 24px;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }

    .bar-fill {
      height: 100%;
      transition: width 0.3s ease;
      display: flex;
      align-items: center;
      padding: 0 8px;
      font-size: 12px;
      color: white;
      font-weight: 500;
    }

    .license-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }

    .license-table th,
    .license-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .license-table th {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
    }

    .license-table tr:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .risk-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .risk-permissive { background-color: rgba(76, 175, 80, 0.2); color: #4caf50; }
    .risk-weak-copyleft { background-color: rgba(255, 152, 0, 0.2); color: #ff9800; }
    .risk-strong-copyleft { background-color: rgba(244, 67, 54, 0.2); color: #f44336; }
    .risk-unknown { background-color: rgba(158, 158, 158, 0.2); color: #9e9e9e; }

    .section {
      margin-bottom: 40px;
    }
  </style>
</head>
<body>
  <h1>📊 ORT Insight Dashboard</h1>

  <div class="summary">
    <div class="card">
      <div class="card-title">Status</div>
      <div class="card-value">
        <span class="status-indicator status-${status.status}"></span>
        ${escapeHtml(status.status.toUpperCase())}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Total Packages</div>
      <div class="card-value">${stats.total}</div>
    </div>

    <div class="card">
      <div class="card-title">Issues</div>
      <div class="card-value">${status.details.issuesCount}</div>
    </div>

    <div class="card">
      <div class="card-title">Vulnerabilities</div>
      <div class="card-value">${status.details.vulnerabilitiesCount}</div>
    </div>
  </div>

  <div class="section">
    <h2>License Distribution</h2>
    <div class="chart-container">
      <div class="bar-chart">
        ${this.createBarChartHtml('🟢 Permissive', stats.permissive, stats.total, getLicenseColor('permissive'))}
        ${this.createBarChartHtml('🟡 Weak Copyleft', stats.weakCopyleft, stats.total, getLicenseColor('weak-copyleft'))}
        ${this.createBarChartHtml('🔴 Strong Copyleft', stats.strongCopyleft, stats.total, getLicenseColor('strong-copyleft'))}
        ${this.createBarChartHtml('⚪ Unknown', stats.unknown, stats.total, getLicenseColor('unknown'))}
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Top Licenses</h2>
    ${this.createLicenseTableHtml(stats)}
  </div>

  <div class="section">
    <h2>Compliance Message</h2>
    <p>${escapeHtml(status.message)}</p>
  </div>

</body>
</html>`;
  }

  /**
   * Create bar chart HTML for a category
   */
  private createBarChartHtml(label: string, value: number, total: number, color: string): string {
    const percentage = total > 0 ? (value / total * 100).toFixed(1) : 0;

    return `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(label)}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${percentage}%; background-color: ${color};">
            ${value} (${percentage}%)
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Create license table HTML
   */
  private createLicenseTableHtml(stats: LicenseStats): string {
    const entries = Object.entries(stats.byLicense)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (entries.length === 0) {
      return '<p>No license data available</p>';
    }

    const rows = entries.map(([license, count]) => {
      const risk = this.parser.classifyLicenseRisk(license);
      const riskClass = risk.replace('-', '-');

      return `
        <tr>
          <td>${escapeHtml(license)}</td>
          <td><span class="risk-badge risk-${riskClass}">${escapeHtml(risk)}</span></td>
          <td>${count}</td>
          <td>${((count / stats.total) * 100).toFixed(1)}%</td>
        </tr>
      `;
    }).join('');

    return `
      <table class="license-table">
        <thead>
          <tr>
            <th>License</th>
            <th>Risk</th>
            <th>Count</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  /**
   * Get error HTML
   */
  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ORT Insight Dashboard - Error</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 40px;
      text-align: center;
    }
    .error {
      color: var(--vscode-errorForeground);
      font-size: 16px;
    }
  </style>
</head>
<body>
  <h1>ORT Insight Dashboard</h1>
  <p class="error">${escapeHtml(message)}</p>
</body>
</html>`;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.panel?.dispose();
  }
}
