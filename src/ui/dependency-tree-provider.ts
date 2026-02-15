/**
 * Dependency Tree Provider - Displays dependency tree with license information
 */

import * as vscode from 'vscode';
import { DependencyTreeItem } from '../types';
import { ORTParser } from '../ort-parser';
import { getLicenseIcon, formatLicense } from './ui-utils';
import * as fs from 'fs';

export class DependencyTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private treeData: DependencyTreeItem[] = [];
  private parser: ORTParser;

  constructor() {
    this.parser = new ORTParser();
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Load ORT results and refresh tree
   */
  async loadResults(resultFile: string): Promise<void> {
    try {
      if (!fs.existsSync(resultFile)) {
        this.treeData = [];
        this.refresh();
        return;
      }

      const ortResult = this.parser.parseResultFile(resultFile);
      this.treeData = this.parser.buildDependencyTree(ortResult);
      this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load ORT results: ${error}`);
      this.treeData = [];
      this.refresh();
    }
  }

  /**
   * Clear tree data
   */
  clear(): void {
    this.treeData = [];
    this.refresh();
  }

  /**
   * Get tree item
   */
  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of a tree node
   */
  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    if (!element) {
      // Root level
      return Promise.resolve(this.treeData.map(item => this.createTreeNode(item)));
    }

    // Children of an element
    if (element.data.children && element.data.children.length > 0) {
      return Promise.resolve(element.data.children.map(child => this.createTreeNode(child)));
    }

    return Promise.resolve([]);
  }

  /**
   * Create tree node from dependency item
   */
  private createTreeNode(item: DependencyTreeItem): TreeNode {
    const hasChildren = item.children && item.children.length > 0;
    const collapsibleState = hasChildren
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    const node = new TreeNode(
      item.label,
      collapsibleState,
      item
    );

    // Set icon based on license risk
    node.iconPath = getLicenseIcon(item.risk);

    // Set description to show license
    node.description = formatLicense(item.license);

    // Set tooltip with detailed information
    node.tooltip = this.buildTooltip(item);

    // Set context value for context menu
    node.contextValue = 'dependency';

    return node;
  }

  /**
   * Build tooltip with detailed information
   */
  private buildTooltip(item: DependencyTreeItem): vscode.MarkdownString {
    const md = new vscode.MarkdownString();

    md.appendMarkdown(`**${item.label}**\n\n`);

    if (item.license) {
      md.appendMarkdown(`**License:** ${item.license}\n\n`);
      md.appendMarkdown(`**Risk:** ${item.risk}\n\n`);
    } else {
      md.appendMarkdown(`**License:** Unknown\n\n`);
    }

    if (item.vulnerabilities && item.vulnerabilities.length > 0) {
      md.appendMarkdown(`**Vulnerabilities:** ${item.vulnerabilities.length}\n\n`);

      for (const vuln of item.vulnerabilities.slice(0, 3)) {
        md.appendMarkdown(`- ${vuln.id}: ${vuln.summary}\n`);
      }

      if (item.vulnerabilities.length > 3) {
        md.appendMarkdown(`\n... and ${item.vulnerabilities.length - 3} more\n`);
      }
    }

    if (item.children && item.children.length > 0) {
      md.appendMarkdown(`\n**Dependencies:** ${item.children.length}\n`);
    }

    return md;
  }

  /**
   * Get dependency tree data (for other components)
   */
  getTreeData(): DependencyTreeItem[] {
    return this.treeData;
  }
}

/**
 * Tree node representing a dependency
 */
class TreeNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data: DependencyTreeItem
  ) {
    super(label, collapsibleState);
  }
}
