/**
 * Status Bar Provider - Shows compliance status in VS Code status bar
 */

import * as vscode from 'vscode';
import { ComplianceStatus } from '../types';
import { ORTParser } from '../ort-parser';
import { getStatusBarIcon } from './ui-utils';
import * as fs from 'fs';

export class StatusBarProvider {
  private statusBarItem: vscode.StatusBarItem;
  private parser: ORTParser;
  private currentStatus: ComplianceStatus | undefined;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.parser = new ORTParser();
    this.statusBarItem.command = 'ort-insight.showDashboard';
    this.updateStatus('unknown', 'ORT Insight: Not analyzed');
  }

  /**
   * Show the status bar item
   */
  show(): void {
    this.statusBarItem.show();
  }

  /**
   * Hide the status bar item
   */
  hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * Update status to scanning
   */
  showScanning(): void {
    this.updateStatus('unknown', 'ORT Insight: Scanning...', '$(loading~spin)');
  }

  /**
   * Load results and update status
   */
  async loadResults(resultFile: string): Promise<void> {
    try {
      if (!fs.existsSync(resultFile)) {
        this.updateStatus('unknown', 'ORT Insight: No results');
        return;
      }

      const ortResult = this.parser.parseResultFile(resultFile);
      const status = this.parser.getComplianceStatus(ortResult);

      this.currentStatus = status;
      this.updateFromComplianceStatus(status);
    } catch (error) {
      this.updateStatus('unknown', 'ORT Insight: Error loading results');
    }
  }

  /**
   * Update from compliance status
   */
  private updateFromComplianceStatus(status: ComplianceStatus): void {
    const icon = getStatusBarIcon(status.status);
    const text = `ORT Insight: ${status.message}`;

    this.statusBarItem.text = `${icon} ${text}`;
    this.statusBarItem.tooltip = this.buildTooltip(status);

    // Set background color for critical issues
    if (status.status === 'critical') {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      );
    } else if (status.status === 'issues') {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    } else {
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  /**
   * Update status manually
   */
  private updateStatus(
    status: 'compliant' | 'issues' | 'critical' | 'unknown',
    text: string,
    icon?: string
  ): void {
    const statusIcon = icon || getStatusBarIcon(status);
    this.statusBarItem.text = `${statusIcon} ${text}`;
    this.statusBarItem.tooltip = text;

    // Clear background color
    this.statusBarItem.backgroundColor = undefined;
  }

  /**
   * Build detailed tooltip
   */
  private buildTooltip(status: ComplianceStatus): vscode.MarkdownString {
    const md = new vscode.MarkdownString();

    md.appendMarkdown(`**ORT Insight - License Compliance**\n\n`);
    md.appendMarkdown(`**Status:** ${status.status.toUpperCase()}\n\n`);
    md.appendMarkdown(`**Message:** ${status.message}\n\n`);

    md.appendMarkdown(`---\n\n`);

    md.appendMarkdown(`**Total Packages:** ${status.details.totalPackages}\n\n`);

    if (status.details.issuesCount > 0) {
      md.appendMarkdown(`**Issues:** ${status.details.issuesCount}\n\n`);
    }

    if (status.details.vulnerabilitiesCount > 0) {
      md.appendMarkdown(`**Vulnerabilities:** ${status.details.vulnerabilitiesCount}\n\n`);
    }

    md.appendMarkdown(`**License Distribution:**\n`);
    md.appendMarkdown(`- 🟢 Permissive: ${status.details.licenseStats.permissive}\n`);
    md.appendMarkdown(`- 🟡 Weak Copyleft: ${status.details.licenseStats.weakCopyleft}\n`);
    md.appendMarkdown(`- 🔴 Strong Copyleft: ${status.details.licenseStats.strongCopyleft}\n`);
    md.appendMarkdown(`- ⚪ Unknown: ${status.details.licenseStats.unknown}\n`);

    md.appendMarkdown(`\n*Click to view dashboard*`);

    return md;
  }

  /**
   * Get current compliance status
   */
  getStatus(): ComplianceStatus | undefined {
    return this.currentStatus;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
