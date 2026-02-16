/**
 * UI Utilities - Shared helper functions used across all UI components
 *
 * Contains reusable functions for:
 *   - License risk icons and colors (green/yellow/red based on license type)
 *   - Severity formatting for vulnerabilities
 *   - Text truncation and formatting
 *   - HTML escaping to prevent XSS in webview panels
 */

import { LicenseRisk } from '../types';
import { ThemeIcon } from 'vscode';

/**
 * Get icon for license risk level
 */
export function getLicenseIcon(risk: LicenseRisk): ThemeIcon {
  switch (risk) {
    case 'permissive':
      return new ThemeIcon('pass', /* ThemeColor */ undefined);
    case 'weak-copyleft':
      return new ThemeIcon('warning', /* ThemeColor */ undefined);
    case 'strong-copyleft':
      return new ThemeIcon('error', /* ThemeColor */ undefined);
    case 'proprietary':
      return new ThemeIcon('lock', /* ThemeColor */ undefined);
    case 'unknown':
    default:
      return new ThemeIcon('question', /* ThemeColor */ undefined);
  }
}

/**
 * Get color for license risk (for webview)
 */
export function getLicenseColor(risk: LicenseRisk): string {
  switch (risk) {
    case 'permissive':
      return '#4caf50'; // Green
    case 'weak-copyleft':
      return '#ff9800'; // Orange
    case 'strong-copyleft':
      return '#f44336'; // Red
    case 'proprietary':
      return '#9c27b0'; // Purple
    case 'unknown':
    default:
      return '#9e9e9e'; // Gray
  }
}

/**
 * Get status bar icon based on compliance status
 */
export function getStatusBarIcon(status: 'compliant' | 'issues' | 'critical' | 'unknown'): string {
  switch (status) {
    case 'compliant':
      return '$(pass)';
    case 'issues':
      return '$(warning)';
    case 'critical':
      return '$(error)';
    case 'unknown':
    default:
      return '$(question)';
  }
}

/**
 * Format license name for display
 */
export function formatLicense(license: string | undefined): string {
  if (!license) {
    return 'Unknown';
  }

  // Clean up common SPDX expressions
  return license
    .replace(/\s+OR\s+/g, ' | ')
    .replace(/\s+AND\s+/g, ' & ')
    .replace(/[()]/g, '');
}

/**
 * Format vulnerability severity
 */
export function formatSeverity(severity: string | undefined): string {
  if (!severity) {
    return 'UNKNOWN';
  }
  return severity.toUpperCase();
}

/**
 * Get severity color
 */
export function getSeverityColor(severity: string | undefined): string {
  if (!severity) {
    return '#9e9e9e';
  }

  const sev = severity.toUpperCase();
  if (sev.includes('CRITICAL') || sev.includes('HIGH')) {
    return '#f44336'; // Red
  }
  if (sev.includes('MEDIUM') || sev.includes('MODERATE')) {
    return '#ff9800'; // Orange
  }
  if (sev.includes('LOW')) {
    return '#ffeb3b'; // Yellow
  }

  return '#9e9e9e'; // Gray
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format package count
 */
export function formatPackageCount(count: number): string {
  if (count === 0) {
    return 'No packages';
  }
  if (count === 1) {
    return '1 package';
  }
  return `${count} packages`;
}

/**
 * Get vulnerability icon
 */
export function getVulnerabilityIcon(severity: string | undefined): ThemeIcon {
  if (!severity) {
    return new ThemeIcon('shield');
  }

  const sev = severity.toUpperCase();
  if (sev.includes('CRITICAL') || sev.includes('HIGH')) {
    return new ThemeIcon('error');
  }
  if (sev.includes('MEDIUM') || sev.includes('MODERATE')) {
    return new ThemeIcon('warning');
  }
  if (sev.includes('LOW')) {
    return new ThemeIcon('info');
  }

  return new ThemeIcon('shield');
}

/**
 * Escapes HTML special characters to prevent XSS when injecting data into webviews.
 * Converts &, <, >, ", ' into their HTML entity equivalents.
 * Used by extension.ts and dashboard-webview.ts for all dynamic content.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
