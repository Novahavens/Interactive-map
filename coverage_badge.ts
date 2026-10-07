/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, LitElement} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import { propertyDB } from './property_db';

@customElement('coverage-badge')
export class CoverageBadge extends LitElement {
  @state() coverage: number = 0;
  @state() totalProperties: number = 0;
  @state() mappedProperties: number = 0;
  @state() isLoading = true;
  private refreshInterval: any;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadCoverage();
    // Refresh coverage every 5 minutes
    this.refreshInterval = setInterval(() => this.loadCoverage(), 5 * 60 * 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadCoverage() {
    try {
      const result = await propertyDB.database_coverage();
      if (result) {
        this.coverage = result.coverage_percent;
        this.totalProperties = result.total_properties;
        this.mappedProperties = result.mapped_properties;
      }
    } catch (err) {
      console.error('Failed to load coverage:', err);
      this.coverage = 0;
    } finally {
      this.isLoading = false;
    }
  }

  getCoverageColor(): string {
    if (this.coverage >= 90) return '#2e7d32'; // green
    if (this.coverage >= 70) return '#f57c00'; // orange
    return '#c62828'; // red
  }

  createRenderRoot() {
    return this;
  }

  render() {
    const coverageColor = this.getCoverageColor();

    return html`
      <style>
        .coverage-badge {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 5;
          background-color: rgba(255, 255, 255, 0.95);
          border-radius: 8px;
          padding: 12px 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }

        .coverage-badge:hover {
          transform: translateY(-2px);
          background-color: #ffffff;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .coverage-percentage {
          color: ${coverageColor};
          font-weight: 700;
          font-size: 16px;
        }

        .coverage-label {
          color: #333;
        }

        .coverage-info {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
          line-height: 1.4;
        }

        .tooltip {
          position: absolute;
          bottom: -60px;
          right: 0;
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          white-space: nowrap;
          z-index: 1000;
          pointer-events: none;
        }

        .coverage-badge:hover .tooltip {
          display: block;
        }

        .loading {
          color: #999;
        }
      </style>

      <div class="coverage-badge" title="Geocoding coverage: percentage of properties with mapped locations">
        <div>
          <div class="coverage-percentage ${this.isLoading ? 'loading' : ''}">
            ${this.isLoading ? '...' : this.coverage + '%'}
          </div>
          <div class="coverage-label">Coverage</div>
        </div>
        <div class="tooltip">
          ${this.mappedProperties.toLocaleString()} of ${this.totalProperties.toLocaleString()} mapped
        </div>
      </div>
    `;
  }
}
