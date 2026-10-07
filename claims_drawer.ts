/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, LitElement} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import { propertyDB, Property } from './property_db';

@customElement('claims-drawer')
export class ClaimsDrawer extends LitElement {
  @state() isOpen = false;
  @state() activeClaims: Property[] = [];
  @state() isLoading = false;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadActiveClaims();
  }

  async loadActiveClaims() {
    this.isLoading = true;
    try {
      const claims = await propertyDB.getActiveClaims();
      this.activeClaims = claims || [];
    } catch (err) {
      console.error('Failed to load active claims:', err);
      this.activeClaims = [];
    } finally {
      this.isLoading = false;
    }
  }

  toggleDrawer() {
    this.isOpen = !this.isOpen;
  }

  closeDrawer() {
    this.isOpen = false;
  }

  dispatchPropertySelected(property: Property) {
    this.dispatchEvent(new CustomEvent('property-selected', {
      detail: { property },
      bubbles: true,
      composed: true
    }));
    this.closeDrawer();
  }

  createRenderRoot() {
    return this;
  }

  render() {
    const claimsCount = this.activeClaims.length;

    return html`
      <style>
        .claims-hamburger-btn {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 100;
          background: white;
          border: none;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transition: all 0.2s ease;
        }

        .claims-hamburger-btn:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transform: translateY(-2px);
        }

        .hamburger-icon {
          width: 24px;
          height: 20px;
          display: flex;
          flex-direction: column;
          justify-content: space-around;
        }

        .hamburger-line {
          height: 2px;
          background: #333;
          width: 100%;
          transition: all 0.3s ease;
        }

        .claims-drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 199;
          display: ${this.isOpen ? 'block' : 'none'};
        }

        .claims-drawer {
          position: fixed;
          top: 0;
          left: 0;
          height: 100%;
          width: 320px;
          background: white;
          z-index: 200;
          box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
          transform: translateX(${this.isOpen ? '0' : '-100%'});
          transition: transform 0.3s ease;
          display: flex;
          flex-direction: column;
        }

        .drawer-header {
          padding: 16px;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .drawer-title {
          font-weight: 700;
          font-size: 18px;
          color: #333;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .drawer-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .claims-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .claim-item {
          padding: 12px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #f9f9f9;
        }

        .claim-item:hover {
          background: #f0f0f0;
          border-color: #999;
          transform: translateX(4px);
        }

        .claim-name {
          font-weight: 600;
          font-size: 14px;
          color: #333;
          margin-bottom: 4px;
        }

        .claim-address {
          font-size: 12px;
          color: #666;
          margin-bottom: 6px;
          line-height: 1.4;
        }

        .claim-status {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
          display: inline-block;
          font-weight: 600;
        }

        .status-active {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .status-pending {
          background: #fff3e0;
          color: #e65100;
        }

        .empty-state {
          text-align: center;
          color: #999;
          padding: 32px 16px;
          font-size: 14px;
        }

        .loading {
          text-align: center;
          padding: 32px 16px;
          color: #666;
        }

        @media (max-width: 640px) {
          .claims-drawer {
            width: 100%;
          }
        }
      </style>

      <button class="claims-hamburger-btn" @click=${this.toggleDrawer}>
        <div class="hamburger-icon">
          <div class="hamburger-line"></div>
          <div class="hamburger-line"></div>
          <div class="hamburger-line"></div>
        </div>
        <span>${claimsCount} Claims</span>
      </button>

      <div class="claims-drawer-overlay" @click=${() => this.closeDrawer()}></div>

      <div class="claims-drawer">
        <div class="drawer-header">
          <div class="drawer-title">Active Claims</div>
          <button class="close-btn" @click=${() => this.closeDrawer()}>✕</button>
        </div>
        <div class="drawer-content">
          ${this.isLoading ? html`
            <div class="loading">Loading claims...</div>
          ` : this.activeClaims.length === 0 ? html`
            <div class="empty-state">No active claims</div>
          ` : html`
            <div class="claims-list">
              ${this.activeClaims.map(claim => html`
                <div class="claim-item" @click=${() => this.dispatchPropertySelected(claim)}>
                  <div class="claim-name">${claim.name}</div>
                  <div class="claim-address">${claim.city}${claim.state ? ', ' + claim.state : ''}</div>
                  <div class="claim-status ${claim.status === 'active' ? 'status-active' : 'status-pending'}">
                    ${claim.status?.toUpperCase() || 'PENDING'}
                  </div>
                </div>
              `)}
            </div>
          `}
        </div>
      </div>
    `;
  }
}
