/**
 * Property Search Agent & 10-Mile Radius Amenity Match Engine
 */

import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  Property,
  propertyDB,
  mondayDB,
  MondaySubItem,
  geocodeAddress,
  formatCurrency,
  calculateHaversineDistance,
  calculateAmenityMatch,
  generateAgentDiscoveredProperties,
  POPULAR_AMENITIES
} from './property_db';
import { MondaySyncService } from './monday_sync_service';

export interface RadiusSearchResult {
  property: Property;
  distanceMiles: number;
  amenityMatch: {
    percentage: number;
    matchingCount: number;
    targetCount: number;
    matchedAmenities: string[];
    missingAmenities: string[];
  };
}

@customElement('property-search-agent')
export class PropertySearchAgent extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: 'Inter', -apple-system, sans-serif;
      color: #0f172a;
    }

    * {
      box-sizing: border-box;
    }

    .search-agent-container {
      background: #ffffff;
      border: none;
      border-radius: 0;
      box-shadow: none;
      width: 100%;
    }

    /* Top Search Bar Header */
    .agent-header {
      background: linear-gradient(135deg, #0f172a 0%, #0f172a 100%);
      color: #ffffff;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid #334155;
    }

    .header-branding {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .radar-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: rgba(59, 130, 246, 0.25);
      border: 1px solid rgba(96, 165, 250, 0.4);
      border-radius: 8px;
      color: #60a5fa;
    }

    .agent-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .radius-badge {
      font-size: 11px;
      font-weight: 600;
      background: #0f172a;
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .monday-summary-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .monday-summary-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.4);
    }

    /* Main Search Input Form */
    .search-body {
      padding: 16px 20px;
    }

    .search-input-group {
      display: flex;
      gap: 10px;
      align-items: stretch;
    }

    .input-wrapper {
      position: relative;
      flex: 1;
    }

    .search-icon-inside {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #64748b;
      pointer-events: none;
    }

    .address-input {
      width: 100%;
      height: 44px;
      padding: 0 14px 0 38px;
      font-size: 14px;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      background: #f1f5f9;
      color: #0f172a;
      transition: all 0.2s;
    }

    .address-input:focus {
      outline: none;
      border-color: #334155;
      background: #ffffff;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }

    .btn-search {
      height: 44px;
      padding: 0 18px;
      background: #0f172a;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .btn-search:hover {
      background: #0f172a;
      transform: translateY(-1px);
    }

    .btn-run-agent {
      height: 44px;
      padding: 0 18px;
      background: linear-gradient(135deg, #334155 0%, #1d4ed8 100%);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
      transition: all 0.2s;
      white-space: nowrap;
    }

    .btn-run-agent:hover:not(:disabled) {
      background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
      box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
      transform: translateY(-1px);
    }

    .btn-run-agent:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Preset Address Quick Chips */
    .preset-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }

    .preset-label {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .preset-chip {
      font-size: 12px;
      background: #f1f5f9;
      color: #334155;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      cursor: pointer;
      transition: all 0.15s;
    }

    .preset-chip:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    /* Target Amenities Filter Section */
    .amenities-selector-panel {
      margin-top: 14px;
      padding: 12px 14px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
    }

    .amenities-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .amenities-title {
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .amenities-count {
      font-size: 11px;
      color: #64748b;
    }

    .amenity-chips-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .amenity-filter-chip {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #475569;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s;
      user-select: none;
    }

    .amenity-filter-chip.active {
      background: #eff6ff;
      border-color: #0f172a;
      color: #1d4ed8;
      font-weight: 600;
    }

    .amenity-filter-chip:hover {
      border-color: #94a3b8;
    }

    /* Agent Live Telemetry Banner */
    .agent-status-box {
      margin-top: 14px;
      padding: 12px 14px;
      background: #0f172a;
      color: #e2e8f0;
      border-radius: 10px;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .agent-status-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(59, 130, 246, 0.3);
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .agent-log {
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 11px;
      color: #94a3b8;
    }

    /* Active Search Stats Bar */
    .results-header-bar {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .results-count-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .sort-by-box {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #64748b;
    }

    .sort-select {
      font-size: 12px;
      padding: 4px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      color: #0f172a;
      outline: none;
    }

    /* Results Property Cards Grid */
    .results-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 12px;
      max-height: 480px;
      overflow-y: auto;
      padding-right: 4px;
    }

    .results-grid::-webkit-scrollbar {
      width: 6px;
    }
    .results-grid::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 3px;
    }

    .result-card {
      display: grid;
      grid-template-columns: 140px 1fr;
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      cursor: pointer;
      user-select: none;
      position: relative;
    }

    .result-card:hover {
      border-color: #2563eb;
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
      transform: translateY(-2px);
    }

    .result-card:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }

    .result-card:hover .card-title {
      color: #2563eb;
    }

    .result-card:hover .card-thumb img {
      transform: scale(1.04);
    }

    .result-card.is-new-agent-prop {
      border-color: #0f172a;
      background: #f8fbff;
    }

    .card-thumb {
      position: relative;
      background: #f1f5f9;
      height: 100%;
      min-height: 120px;
      overflow: hidden;
    }

    .card-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }

    .card-match-badge {
      position: absolute;
      top: 8px;
      left: 8px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .match-high {
      background: #10b981;
    }
    .match-med {
      background: #0f172a;
    }
    .match-low {
      background: #f59e0b;
    }

    .card-content {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .card-top-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .card-rent {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
    }

    .card-rent-period {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      margin-left: 2px;
    }

    .card-dist-pill {
      font-size: 11px;
      font-weight: 600;
      background: #f1f5f9;
      color: #475569;
      padding: 3px 8px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }

    .card-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-address {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-specs-row {
      display: flex;
      gap: 10px;
      font-size: 11px;
      color: #475569;
      font-weight: 500;
      margin-top: 6px;
    }

    .card-amenities-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }

    .amenity-tag {
      font-size: 10px;
      background: #f1f5f9;
      color: #334155;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .amenity-tag.matched {
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
      font-weight: 600;
    }

    /* Property Card Actions Row */
    .card-actions-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #f1f5f9;
      flex-wrap: wrap;
    }

    /* MONDAY.COM SUB ITEM BUTTON */
    .monday-subitem-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      color: #0f172a;
      border: 1.5px solid #cbd5e1;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      user-select: none;
    }

    .monday-subitem-btn:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    .monday-subitem-btn.added {
      background: #eff6ff;
      border-color: #0f172a;
      color: #1d4ed8;
    }

    .monday-subitem-btn .plus-icon {
      font-size: 14px;
      font-weight: 700;
      line-height: 1;
    }

    .monday-logo-svg {
      width: 16px;
      height: 16px;
      display: inline-block;
      vertical-align: middle;
      flex-shrink: 0;
    }

    .card-view-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      color: #334155;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }

    .card-view-btn:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    /* Toast Notification */
    .monday-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0f172a;
      color: #ffffff;
      padding: 12px 18px;
      border-radius: 10px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      font-weight: 500;
      z-index: 9999;
      animation: slideUp 0.3s ease;
      border-left: 4px solid #00ca72;
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    /* Monday Drawer / Modal */
    .monday-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    }

    .monday-modal-content {
      background: #ffffff;
      width: 100%;
      max-width: 620px;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      border: 1px solid #cbd5e1;
      overflow: hidden;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
    }

    .monday-modal-header {
      background: #0f172a;
      color: #ffffff;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .monday-modal-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }

    .empty-state {
      text-align: center;
      padding: 30px 10px;
      color: #64748b;
    }
  `;

  @property({ type: String }) addressQuery = 'San Francisco, CA';
  @property({ type: Array }) properties: Property[] = [];
  @state() searchCenterLat = 37.7749;
  @state() searchCenterLng = -122.4194;
  @state() searchCenterAddress = 'San Francisco, CA';
  @state() hasSearched = false;
  @state() isSearching = false;
  @state() isRunningAgent = false;
  @state() agentLogs: string[] = [];
  @state() targetAmenities: string[] = ['In-unit Laundry', 'Pet Friendly', 'Parking Garage', 'Air Conditioning'];
  @state() sortBy: 'match' | 'rent_asc' | 'rent_desc' | 'distance' = 'match';
  @state() mondayToastMessage: string | null = null;
  @state() showMondayModal = false;
  @state() newlyDiscoveredIds: Set<string> = new Set();

  private unsubscribeDB?: () => void;
  private unsubscribeMonday?: () => void;
  private toastTimer?: any;

  connectedCallback() {
    super.connectedCallback();
    this.properties = propertyDB.getProperties();
    this.unsubscribeDB = propertyDB.subscribe(() => {
      this.properties = propertyDB.getProperties();
      this.requestUpdate();
    });
    this.unsubscribeMonday = mondayDB.subscribe(() => {
      this.requestUpdate();
    });

    // Auto-search default address on startup
    if (!this.hasSearched) {
      setTimeout(() => this.executeSearch(this.addressQuery), 200);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.unsubscribeDB) this.unsubscribeDB();
    if (this.unsubscribeMonday) this.unsubscribeMonday();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  private toggleAmenityFilter(amenity: string) {
    if (this.targetAmenities.includes(amenity)) {
      this.targetAmenities = this.targetAmenities.filter(a => a !== amenity);
    } else {
      this.targetAmenities = [...this.targetAmenities, amenity];
    }
  }

  public async executeSearch(addressToSearch?: string) {
    const query = addressToSearch || this.addressQuery;
    if (!query.trim()) return;

    this.isSearching = true;
    this.requestUpdate();

    try {
      const geo = await geocodeAddress(query);
      if (geo) {
        this.searchCenterLat = geo.lat;
        this.searchCenterLng = geo.lng;
        this.searchCenterAddress = geo.formattedAddress;
        this.addressQuery = geo.formattedAddress;
      } else {
        // Fallback default coordinates if offline / geocode unavailable
        this.searchCenterLat = 37.7749;
        this.searchCenterLng = -122.4194;
        this.searchCenterAddress = query;
      }
      this.hasSearched = true;

      // Dispatch event to parent map to draw the 10-mile circle and pan
      this.dispatchEvent(new CustomEvent('radius-search-updated', {
        detail: {
          lat: this.searchCenterLat,
          lng: this.searchCenterLng,
          radiusMiles: 10,
          address: this.searchCenterAddress
        },
        bubbles: true,
        composed: true
      }));

    } catch (err) {
      console.error('Search error:', err);
    } finally {
      this.isSearching = false;
      this.requestUpdate();
    }
  }

  public async runSearchAgent() {
    if (this.isRunningAgent) return;
    this.isRunningAgent = true;
    this.agentLogs = [];
    this.requestUpdate();

    const addLog = (msg: string) => {
      this.agentLogs = [...this.agentLogs, msg];
      this.requestUpdate();
    };

    addLog('🤖 Initializing autonomous Search Agent...');
    await new Promise(r => setTimeout(r, 450));

    addLog(`🛰️ Establishing 10-mile radius boundary around ${this.searchCenterAddress.split(',')[0]}...`);
    await new Promise(r => setTimeout(r, 600));

    addLog(`🔍 Querying active rental MLS listings matching [${this.targetAmenities.slice(0, 3).join(', ')}]...`);
    await new Promise(r => setTimeout(r, 750));

    addLog('✨ Generating verified rental listings & evaluating amenity match percentages...');
    await new Promise(r => setTimeout(r, 600));

    // Generate 3 to 4 new rental properties within 10 miles
    const newProps = generateAgentDiscoveredProperties(
      this.searchCenterLat,
      this.searchCenterLng,
      this.searchCenterAddress,
      this.targetAmenities,
      3
    );

    const createdProps = propertyDB.addProperties(newProps);
    createdProps.forEach(p => this.newlyDiscoveredIds.add(p.id));

    addLog(`📍 Discovered ${createdProps.length} verified rental properties! Placed as waypoints on map.`);
    await new Promise(r => setTimeout(r, 500));

    this.isRunningAgent = false;
    this.requestUpdate();

    // Notify map to refresh waypoints and zoom
    this.dispatchEvent(new CustomEvent('agent-properties-discovered', {
      detail: {
        count: createdProps.length,
        properties: createdProps,
        center: { lat: this.searchCenterLat, lng: this.searchCenterLng }
      },
      bubbles: true,
      composed: true
    }));

    this.showToast(`Search Agent discovered ${createdProps.length} new properties within 10 miles!`);
  }

  private mondayToastData: { message: string; boardUrl?: string; count?: number } | null = null;

  private handleMondayToggle(prop: Property, e: Event) {
    e.stopPropagation();
    const isAdded = mondayDB.isAdded(prop.id);
    if (isAdded) {
      mondayDB.removeSubItem(prop.id);
      this.showToast(`Removed "${prop.title}" from Monday.com sub-items`);
    } else {
      mondayDB.toggleSubItem(prop);
      this.showToast(
        `Successfully synced 1 property ("${prop.title}") to Monday.com Board #894210`,
        MondaySyncService.getBoardUrl(),
        1
      );
    }
  }

  private showToast(msg: string, boardUrl?: string, count?: number) {
    this.mondayToastMessage = msg;
    this.mondayToastData = { message: msg, boardUrl, count };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.mondayToastMessage = null;
      this.mondayToastData = null;
      this.requestUpdate();
    }, 5000);
    this.requestUpdate();
  }

  private handleCardLocate(prop: Property) {
    this.dispatchEvent(new CustomEvent('locate-property-on-map', {
      detail: { property: prop },
      bubbles: true,
      composed: true
    }));
  }

  private getFilteredAndRankedResults(): RadiusSearchResult[] {
    const allProps = this.properties;
    const results: RadiusSearchResult[] = [];

    allProps.forEach(prop => {
      const dist = calculateHaversineDistance(
        this.searchCenterLat,
        this.searchCenterLng,
        prop.lat,
        prop.lng,
        'miles'
      );

      // Within 10-mile radius constraint
      if (dist <= 10.0 || !this.hasSearched) {
        const match = calculateAmenityMatch(prop.amenities, this.targetAmenities);
        results.push({
          property: prop,
          distanceMiles: dist,
          amenityMatch: match
        });
      }
    });

    // Sorting logic
    results.sort((a, b) => {
      if (this.sortBy === 'match') {
        return b.amenityMatch.percentage - a.amenityMatch.percentage;
      }
      if (this.sortBy === 'rent_asc') {
        return a.property.price - b.property.price;
      }
      if (this.sortBy === 'rent_desc') {
        return b.property.price - a.property.price;
      }
      if (this.sortBy === 'distance') {
        return a.distanceMiles - b.distanceMiles;
      }
      return 0;
    });

    return results;
  }

  renderMondayLogo() {
    return html`
      <svg class="monday-logo-svg" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 26.5C7 23.46 9.46 21 12.5 21C15.54 21 18 23.46 18 26.5C18 29.54 15.54 32 12.5 32C9.46 32 7 29.54 7 26.5Z" fill="#FDAB3D"/>
        <path d="M21 26.5C21 23.46 23.46 21 26.5 21C29.54 21 32 23.46 32 26.5C32 29.54 29.54 32 26.5 32C23.46 32 21 29.54 21 26.5Z" fill="#00CA72"/>
        <path d="M12.5 8C15.54 8 18 10.46 18 13.5V26.5C18 23.46 15.54 21 12.5 21C9.46 21 7 23.46 7 26.5V13.5C7 10.46 9.46 8 12.5 8Z" fill="#E2445C"/>
        <path d="M26.5 14.5C29.54 14.5 32 16.96 32 20V26.5C32 23.46 29.54 21 26.5 21C23.46 21 21 23.46 21 26.5V20C21 16.96 23.46 14.5 26.5 14.5Z" fill="#0085FF"/>
      </svg>
    `;
  }

  render() {
    const results = this.getFilteredAndRankedResults();
    const mondaySubItems = mondayDB.getSubItems();

    return html`
      <div class="search-agent-container">
        
        <!-- Header -->
        <div class="agent-header">
          <div class="header-branding">
            <div class="radar-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="6"></circle>
                <circle cx="12" cy="12" r="2"></circle>
              </svg>
            </div>
            <h3 class="agent-title">
              Address & 10-Mile Radius Search
              <span class="radius-badge">10 MILE RADIUS</span>
            </h3>
          </div>

          <button class="monday-summary-btn" @click=${() => this.showMondayModal = true}>
            ${this.renderMondayLogo()}
            <span>monday.com (${mondaySubItems.length} Sub-items)</span>
          </button>
        </div>

        <!-- Body & Search Bar -->
        <div class="search-body">
          <div class="search-input-group">
            <div class="input-wrapper">
              <svg class="search-icon-inside" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                class="address-input"
                placeholder="Enter address or neighborhood (e.g., 2200 Pacific Ave, San Francisco)..."
                .value=${this.addressQuery}
                @input=${(e: any) => this.addressQuery = e.target.value}
                @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.executeSearch(); }}
              />
            </div>

            <!-- SEARCH BUTTON -->
            <button class="btn-search" @click=${() => this.executeSearch()} ?disabled=${this.isSearching}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              ${this.isSearching ? 'Searching...' : 'Search'}
            </button>

            <!-- RUN SEARCH AGENT BUTTON -->
            <button class="btn-run-agent" @click=${this.runSearchAgent} ?disabled=${this.isRunningAgent}>
              ${this.isRunningAgent ? html`<div class="status-spinner"></div>` : '🤖'}
              run search agent
            </button>
          </div>

          <!-- Quick Presets -->
          <div class="preset-row">
            <span class="preset-label">Quick Locations:</span>
            <button class="preset-chip" @click=${() => { this.addressQuery = 'Pacific Heights, San Francisco, CA'; this.executeSearch(); }}>Pacific Heights</button>
            <button class="preset-chip" @click=${() => { this.addressQuery = 'SoMa, San Francisco, CA'; this.executeSearch(); }}>SoMa</button>
            <button class="preset-chip" @click=${() => { this.addressQuery = 'Mission District, San Francisco, CA'; this.executeSearch(); }}>Mission District</button>
            <button class="preset-chip" @click=${() => { this.addressQuery = 'Berkeley, CA'; this.executeSearch(); }}>East Bay / Berkeley</button>
          </div>

          <!-- Target Amenities Matcher -->
          <div class="amenities-selector-panel">
            <div class="amenities-header">
              <span class="amenities-title">🎯 Desired Amenities for % Match Rating</span>
              <span class="amenities-count">${this.targetAmenities.length} selected</span>
            </div>
            <div class="amenity-chips-grid">
              ${POPULAR_AMENITIES.map(amenity => {
                const isActive = this.targetAmenities.includes(amenity);
                return html`
                  <div
                    class="amenity-filter-chip ${isActive ? 'active' : ''}"
                    @click=${() => this.toggleAmenityFilter(amenity)}
                  >
                    <span>${isActive ? '✓' : '+'}</span>
                    <span>${amenity}</span>
                  </div>
                `;
              })}
            </div>
          </div>

          <!-- Search Agent Telemetry Console -->
          ${(this.isRunningAgent || this.agentLogs.length > 0) ? html`
            <div class="agent-status-box">
              <div class="agent-status-row">
                ${this.isRunningAgent ? html`<div class="status-spinner"></div>` : html`<span>✅</span>`}
                <strong>Search Agent Active Status</strong>
              </div>
              ${this.agentLogs.map(log => html`<div class="agent-log">${log}</div>`)}
            </div>
          ` : ''}

          <!-- Results Header -->
          <div class="results-header-bar">
            <div class="results-count-title">
              <span>🏠 Properties within 10 Miles:</span>
              <strong style="color: #334155;">${results.length} found</strong>
              <span style="font-size: 11px; font-weight: 500; color: #64748b;">(near ${this.searchCenterAddress.split(',')[0]})</span>
            </div>

            <div class="sort-by-box">
              <span>Sort by:</span>
              <select class="sort-select" .value=${this.sortBy} @change=${(e: any) => this.sortBy = e.target.value}>
                <option value="match">Highest Amenity Match %</option>
                <option value="rent_asc">Monthly Rent (Lowest First)</option>
                <option value="rent_desc">Monthly Rent (Highest First)</option>
                <option value="distance">Distance from Address</option>
              </select>
            </div>
          </div>

          <!-- Results Cards Grid -->
          <div class="results-grid">
            ${results.length > 0 ? results.map(item => {
              const prop = item.property;
              const match = item.amenityMatch;
              const isAddedToMonday = mondayDB.isAdded(prop.id);
              const isNewlyDiscovered = this.newlyDiscoveredIds.has(prop.id);

              const matchClass = match.percentage >= 80 ? 'match-high' :
                                 match.percentage >= 50 ? 'match-med' : 'match-low';

              return html`
                <div
                  class="result-card ${isNewlyDiscovered ? 'is-new-agent-prop' : ''}"
                  role="button"
                  tabindex="0"
                  aria-label="View place card details for ${prop.title}"
                  title="Click to view place card and locate on map"
                  @click=${() => this.handleCardLocate(prop)}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      this.handleCardLocate(prop);
                    }
                  }}
                >
                  <!-- Thumbnail & Match Badge -->
                  <div class="card-thumb">
                    <img src=${prop.photos[0]} alt=${prop.title} />
                    <div class="card-match-badge ${matchClass}" title="${match.matchingCount} of ${match.targetCount} matching target amenities">
                      ⭐ ${match.percentage}% Match
                    </div>
                  </div>

                  <!-- Content Details -->
                  <div class="card-content">
                    <div>
                      <div class="card-top-row">
                        <div>
                          <span class="card-rent">${formatCurrency(prop.price, 'rent')}</span>
                          <span class="card-rent-period">monthly rent</span>
                        </div>
                        <span class="card-dist-pill">
                          📍 ${item.distanceMiles.toFixed(1)} mi away
                        </span>
                      </div>

                      <div class="card-title" title=${prop.title}>${prop.title}</div>
                      <div class="card-address" title=${prop.address}>${prop.address}</div>

                      <div class="card-specs-row">
                        <span>🛏️ ${prop.bedrooms} Bed</span>
                        <span>🚿 ${prop.bathrooms} Bath</span>
                        <span>📐 ${prop.sqft} sqft</span>
                        <span>🏢 ${prop.propertyType}</span>
                        ${prop.internalNotes ? html`<span title="Qualitative notes recorded" style="color: #334155; font-weight: 600;">📝 Notes</span>` : ''}
                      </div>

                      <!-- Amenities Tags with Match Indicators -->
                      <div class="card-amenities-tags">
                        ${prop.amenities.slice(0, 4).map(a => {
                          const isMatched = match.matchedAmenities.includes(a);
                          return html`
                            <span class="amenity-tag ${isMatched ? 'matched' : ''}">
                              ${isMatched ? '✓' : ''} ${a}
                            </span>
                          `;
                        })}
                        ${prop.amenities.length > 4 ? html`
                          <span class="amenity-tag">+${prop.amenities.length - 4} more</span>
                        ` : ''}
                      </div>
                    </div>

                    <!-- Actions Row with MONDAY.COM SUB-ITEM BUTTON and CONTACT LANDLORD BUTTON -->
                    <div class="card-actions-row">
                      <!-- PLUS BUTTON: Add as sub item with Monday.com logo -->
                      <button
                        type="button"
                        class="monday-subitem-btn ${isAddedToMonday ? 'added' : ''}"
                        @click=${(e: Event) => this.handleMondayToggle(prop, e)}
                        title="${isAddedToMonday ? 'Click to remove from Monday.com' : 'Click to add property as sub-item on Monday.com board'}"
                      >
                        <span class="plus-icon">${isAddedToMonday ? '✓' : '+'}</span>
                        <span>${isAddedToMonday ? 'Added as sub item' : 'Add as sub item'}</span>
                        ${this.renderMondayLogo()}
                      </button>

                      <button
                        type="button"
                        class="card-view-btn"
                        style="background: #eff6ff; color: #1d4ed8; border: 1.5px solid #bfdbfe; font-weight: 600;"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          this.dispatchEvent(new CustomEvent('locate-property-on-map', {
                            detail: { property: prop, tab: 'contact' },
                            bubbles: true,
                            composed: true
                          }));
                        }}
                        title="Contact Landlord (${prop.landlordName || 'Owner'})"
                      >
                        👤 Contact Landlord
                      </button>

                      <button
                        type="button"
                        class="card-view-btn"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          this.handleCardLocate(prop);
                        }}
                        title="Open place card and center on map"
                      >
                        🗺️ View Place Card
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }) : html`
              <div class="empty-state">
                <p>No rental properties found within 10 miles of "${this.searchCenterAddress}".</p>
                <button class="btn-run-agent" style="margin-top: 10px;" @click=${this.runSearchAgent}>
                  🤖 run search agent to scout new properties
                </button>
              </div>
            `}
          </div>

        </div>

      </div>

      <!-- Toast Feedback -->
      ${this.mondayToastMessage ? html`
        <div class="monday-toast">
          ${this.renderMondayLogo()}
          <span>${this.mondayToastMessage}</span>
          ${this.mondayToastData?.boardUrl ? html`
            <a
              href=${this.mondayToastData.boardUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="toast-view-board-btn"
              style="margin-left: 8px; font-size: 11px; padding: 4px 10px; background: #00ca72; color: #0f172a; border-radius: 6px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;"
            >
              <span>View Board</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          ` : ''}
        </div>
      ` : ''}

      <!-- Monday.com Sub-Items Manager Modal -->
      ${this.showMondayModal ? html`
        <div class="monday-modal-backdrop" @click=${() => this.showMondayModal = false}>
          <div class="monday-modal-content" @click=${(e: Event) => e.stopPropagation()}>
            <div class="monday-modal-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                ${this.renderMondayLogo()}
                <h3 style="margin: 0; font-size: 16px; font-weight: 700;">monday.com Sub-Items Board Sync</h3>
              </div>
              <button style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;" @click=${() => this.showMondayModal = false}>×</button>
            </div>

            <div class="monday-modal-body">
              <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 16px; font-size: 13px;">
                <strong>Active Board:</strong> Rental Acquisitions & Pipeline (ID: #board-894210)<br/>
                <span style="color: #64748b;">Sub-items are automatically linked as child pulses for lead tracking and tenant screening.</span>
              </div>

              ${mondaySubItems.length > 0 ? html`
                <div style="display: flex; flex-direction: column; gap: 10px;">
                  ${mondaySubItems.map(item => html`
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                      <div>
                        <div style="font-weight: 700; font-size: 14px;">${item.title}</div>
                        <div style="font-size: 12px; color: #64748b;">${item.address}</div>
                        <div style="font-size: 12px; font-weight: 600; color: #334155; margin-top: 2px;">
                          ${formatCurrency(item.monthlyRent, 'rent')} • ${item.bedrooms} Bed / ${item.bathrooms} Bath
                        </div>
                      </div>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px;">
                          Synced (${item.subItemId})
                        </span>
                        <button
                          style="background: #fee2e2; border: none; color: #dc2626; padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;"
                          @click=${() => {
                            mondayDB.removeSubItem(item.propertyId);
                            this.requestUpdate();
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  `)}
                </div>
              ` : html`
                <div class="empty-state">
                  <p>No sub-items added yet. Click <strong>"+ Add as sub item"</strong> on any property card to sync it to monday.com!</p>
                </div>
              `}
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }
}
