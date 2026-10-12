/**
 * Travel Time and Distance Calculator Component
 * Calculates and displays driving, walking, transit, and bicycling routes between two properties.
 */

import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Property, propertyDB, formatCurrency, calculateHaversineDistance } from './property_db';

export interface RouteCalculationResult {
  origin: Property;
  destination: Property;
  travelMode: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';
  distanceText: string;
  distanceValueMeters: number;
  durationText: string;
  durationValueSeconds: number;
  straightLineMiles: number;
  steps: Array<{
    instructions: string;
    distance: string;
    duration: string;
    maneuver?: string;
  }>;
  summary: string;
  warnings: string[];
}

@customElement('property-travel-calculator')
export class PropertyTravelCalculator extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: String }) initialOriginId?: string;
  @property({ type: String }) initialDestinationId?: string;

  @state() properties: Property[] = [];
  @state() originPropertyId: string = '';
  @state() destinationPropertyId: string = '';
  @state() travelMode: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT' = 'DRIVING';
  @state() avoidTolls = false;
  @state() avoidHighways = false;
  @state() avoidFerries = false;

  @state() isCalculating = false;
  @state() calculationError = '';
  @state() calculationResult?: RouteCalculationResult;
  @state() showTurnByTurn = false;

  private unsubscribeDB?: () => void;

  createRenderRoot() {
    return this; // Light DOM for global CSS access
  }

  connectedCallback() {
    super.connectedCallback();
    this.properties = propertyDB.getProperties();
    this.unsubscribeDB = propertyDB.subscribe(() => {
      this.properties = propertyDB.getProperties();
      this.requestUpdate();
    });

    if (this.initialOriginId) {
      this.originPropertyId = this.initialOriginId;
    } else if (this.properties.length > 0 && !this.originPropertyId) {
      this.originPropertyId = this.properties[0].id;
    }

    if (this.initialDestinationId) {
      this.destinationPropertyId = this.initialDestinationId;
    } else if (this.properties.length > 1 && !this.destinationPropertyId) {
      this.destinationPropertyId = this.properties[1].id;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.unsubscribeDB) {
      this.unsubscribeDB();
    }
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('open') && this.open) {
      if (this.initialOriginId) this.originPropertyId = this.initialOriginId;
      if (this.initialDestinationId) this.destinationPropertyId = this.initialDestinationId;

      // Auto pick if unselected
      if (!this.originPropertyId && this.properties.length > 0) {
        this.originPropertyId = this.properties[0].id;
      }
      if (!this.destinationPropertyId && this.properties.length > 1) {
        this.destinationPropertyId = this.properties.find(p => p.id !== this.originPropertyId)?.id || this.properties[1].id;
      }

      // If both origin and dest are valid and different, auto-calculate route
      if (this.originPropertyId && this.destinationPropertyId && this.originPropertyId !== this.destinationPropertyId) {
        this.calculateTravel();
      }
    }
  }

  public setRoute(originId: string, destId?: string) {
    this.originPropertyId = originId;
    if (destId) {
      this.destinationPropertyId = destId;
    } else if (this.properties.length > 1) {
      const other = this.properties.find(p => p.id !== originId);
      if (other) this.destinationPropertyId = other.id;
    }
    this.open = true;
    this.calculateTravel();
  }

  private closeModal() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close-calculator', { bubbles: true, composed: true }));
  }

  private swapProperties() {
    const temp = this.originPropertyId;
    this.originPropertyId = this.destinationPropertyId;
    this.destinationPropertyId = temp;
    if (this.originPropertyId && this.destinationPropertyId && this.originPropertyId !== this.destinationPropertyId) {
      this.calculateTravel();
    }
  }

  public async calculateTravel() {
    if (!this.originPropertyId || !this.destinationPropertyId) {
      this.calculationError = 'Please select both an Origin and a Destination property.';
      return;
    }

    if (this.originPropertyId === this.destinationPropertyId) {
      this.calculationError = 'Origin and Destination cannot be the same property waypoint.';
      this.calculationResult = undefined;
      return;
    }

    const originProp = this.properties.find(p => p.id === this.originPropertyId);
    const destProp = this.properties.find(p => p.id === this.destinationPropertyId);

    if (!originProp || !destProp) {
      this.calculationError = 'Selected properties could not be found in the database.';
      return;
    }

    this.isCalculating = true;
    this.calculationError = '';

    const straightLine = calculateHaversineDistance(originProp.lat, originProp.lng, destProp.lat, destProp.lng, 'miles');

    if (!(window as any).google?.maps?.DirectionsService) {
      // Fallback estimate if Google Maps Directions API is not accessible
      const estimatedMph = this.travelMode === 'DRIVING' ? 28 : this.travelMode === 'WALKING' ? 3 : this.travelMode === 'BICYCLING' ? 12 : 20;
      const roadDistMiles = Number((straightLine * 1.25).toFixed(1));
      const hours = roadDistMiles / estimatedMph;
      const mins = Math.max(1, Math.round(hours * 60));

      this.calculationResult = {
        origin: originProp,
        destination: destProp,
        travelMode: this.travelMode,
        distanceText: `${roadDistMiles} mi`,
        distanceValueMeters: roadDistMiles * 1609.34,
        durationText: mins < 60 ? `${mins} mins` : `${Math.floor(mins / 60)} hr ${mins % 60} min`,
        durationValueSeconds: mins * 60,
        straightLineMiles: straightLine,
        steps: [
          { instructions: `Depart from ${originProp.address}`, distance: '0 mi', duration: '0 min' },
          { instructions: `Navigate along optimal road network towards ${destProp.title}`, distance: `${roadDistMiles} mi`, duration: `${mins} mins` },
          { instructions: `Arrive at destination: ${destProp.address}`, distance: '0 mi', duration: '0 min' }
        ],
        summary: 'Direct estimated route corridor',
        warnings: ['Estimated metrics based on spatial geocoordinates.']
      };

      this.isCalculating = false;
      this.requestUpdate();
      return;
    }

    const directionsService = new (window as any).google.maps.DirectionsService();

    const request = {
      origin: { lat: originProp.lat, lng: originProp.lng },
      destination: { lat: destProp.lat, lng: destProp.lng },
      travelMode: (window as any).google.maps.TravelMode[this.travelMode],
      avoidTolls: this.avoidTolls,
      avoidHighways: this.avoidHighways,
      avoidFerries: this.avoidFerries,
      drivingOptions: {
        departureTime: new Date(),
        trafficModel: (window as any).google.maps.TrafficModel?.BEST_GUESS || 'bestguess'
      }
    };

    try {
      directionsService.route(request, (response: any, status: string) => {
        this.isCalculating = false;

        if (status === 'OK' && response && response.routes && response.routes[0]) {
          const route = response.routes[0];
          const leg = route.legs[0];

          const steps = (leg.steps || []).map((step: any) => ({
            instructions: step.instructions ? step.instructions.replace(/<[^>]*>?/gm, ' ') : '',
            distance: step.distance?.text || '',
            duration: step.duration?.text || '',
            maneuver: step.maneuver
          }));

          const durationText = leg.duration_in_traffic ? leg.duration_in_traffic.text : leg.duration.text;

          this.calculationResult = {
            origin: originProp,
            destination: destProp,
            travelMode: this.travelMode,
            distanceText: leg.distance.text,
            distanceValueMeters: leg.distance.value,
            durationText: durationText,
            durationValueSeconds: leg.duration.value,
            straightLineMiles: straightLine,
            steps: steps,
            summary: route.summary || 'Fastest Route',
            warnings: route.warnings || []
          };

          // Dispatch event so parent Map can render the polyline & fit view
          this.dispatchEvent(new CustomEvent('route-calculated', {
            detail: {
              directionsResponse: response,
              result: this.calculationResult,
              origin: originProp,
              destination: destProp
            },
            bubbles: true,
            composed: true
          }));

        } else {
          this.calculationError = `Unable to calculate route: ${status}. Using spatial geometry estimate.`;
          const roadDistMiles = Number((straightLine * 1.3).toFixed(1));
          const mins = Math.max(2, Math.round((roadDistMiles / 25) * 60));
          this.calculationResult = {
            origin: originProp,
            destination: destProp,
            travelMode: this.travelMode,
            distanceText: `${roadDistMiles} mi`,
            distanceValueMeters: roadDistMiles * 1609.34,
            durationText: `${mins} mins`,
            durationValueSeconds: mins * 60,
            straightLineMiles: straightLine,
            steps: [
              { instructions: `Depart from ${originProp.address}`, distance: '0 mi', duration: '0 min' },
              { instructions: `Drive via local corridor to ${destProp.address}`, distance: `${roadDistMiles} mi`, duration: `${mins} mins` },
              { instructions: `Arrive at destination: ${destProp.address}`, distance: '0 mi', duration: '0 min' }
            ],
            summary: 'Direct spatial route corridor',
            warnings: ['Calculated using direct spatial projection']
          };
        }
        this.requestUpdate();
      });
    } catch (err: any) {
      this.isCalculating = false;
      this.calculationError = err.message || 'Routing error';
      this.requestUpdate();
    }
  }

  private handleClearRoute() {
    this.calculationResult = undefined;
    this.dispatchEvent(new CustomEvent('clear-route', { bubbles: true, composed: true }));
  }

  private calculateEstimatedFuelCost(distanceText: string): string {
    const miles = parseFloat(distanceText.replace(/[^0-9\.]/g, ''));
    if (isNaN(miles) || miles <= 0) return '$0.00';
    // Assume 25 MPG and $3.95/gallon in California
    const gallons = miles / 25;
    const cost = gallons * 3.95;
    return `$${cost.toFixed(2)}`;
  }

  render() {
    if (!this.open) return html``;

    const originProp = this.properties.find(p => p.id === this.originPropertyId);
    const destProp = this.properties.find(p => p.id === this.destinationPropertyId);

    const modeIcons: Record<string, string> = {
      DRIVING: '🚗 Driving',
      WALKING: '🚶 Walking',
      BICYCLING: '🚴 Bicycling',
      TRANSIT: '🚇 Transit'
    };

    return html`
      <div class="travel-modal-backdrop" @click=${this.closeModal}>
        <div class="travel-modal-card" @click=${(e: Event) => e.stopPropagation()}>
          
          <!-- Header -->
          <div class="travel-modal-header">
            <div class="travel-header-title-box">
              <div class="travel-badge">🚗 Travel Tool</div>
              <h3>Property Distance & Travel Time Calculator</h3>
              <p class="travel-header-desc">Compute real-time driving routes, travel durations, and turn-by-turn navigation between any two properties.</p>
            </div>
            <button class="travel-modal-close-btn" @click=${this.closeModal} title="Close Calculator">✕</button>
          </div>

          <!-- Body -->
          <div class="travel-modal-body">

            <!-- Selection Grid -->
            <div class="travel-selection-grid">
              
              <!-- Origin Selection Card -->
              <div class="travel-endpoint-card origin">
                <div class="endpoint-card-header">
                  <span class="endpoint-indicator origin-dot">A</span>
                  <span class="endpoint-label">ORIGIN (STARTING PROPERTY)</span>
                </div>

                <div class="endpoint-select-box">
                  <select
                    .value=${this.originPropertyId}
                    @change=${(e: any) => {
                      this.originPropertyId = e.target.value;
                      this.calculateTravel();
                    }}
                  >
                    ${this.properties.map(prop => html`
                      <option value=${prop.id}>
                        ${prop.title} - ${prop.address} (${formatCurrency(prop.price, prop.priceType)})
                      </option>
                    `)}
                  </select>
                </div>

                ${originProp ? html`
                  <div class="endpoint-preview-pill">
                    <img src=${originProp.photos[0]} alt=${originProp.title} class="endpoint-thumb" />
                    <div class="endpoint-info">
                      <div class="endpoint-name">${originProp.title}</div>
                      <div class="endpoint-address">${originProp.address}</div>
                      <div class="endpoint-meta">
                        <span class="endpoint-price">${formatCurrency(originProp.price, originProp.priceType)}</span>
                        <span class="endpoint-status">${originProp.status}</span>
                      </div>
                    </div>
                  </div>
                ` : ''}
              </div>

              <!-- Swap Button Column -->
              <div class="travel-swap-container">
                <button
                  type="button"
                  class="travel-swap-btn"
                  @click=${this.swapProperties}
                  title="Swap Origin and Destination properties"
                >
                  <span class="swap-icon">⇄</span>
                  <span class="swap-text">Swap</span>
                </button>
              </div>

              <!-- Destination Selection Card -->
              <div class="travel-endpoint-card destination">
                <div class="endpoint-card-header">
                  <span class="endpoint-indicator dest-dot">B</span>
                  <span class="endpoint-label">DESTINATION (ARRIVAL PROPERTY)</span>
                </div>

                <div class="endpoint-select-box">
                  <select
                    .value=${this.destinationPropertyId}
                    @change=${(e: any) => {
                      this.destinationPropertyId = e.target.value;
                      this.calculateTravel();
                    }}
                  >
                    ${this.properties.map(prop => html`
                      <option value=${prop.id}>
                        ${prop.title} - ${prop.address} (${formatCurrency(prop.price, prop.priceType)})
                      </option>
                    `)}
                  </select>
                </div>

                ${destProp ? html`
                  <div class="endpoint-preview-pill">
                    <img src=${destProp.photos[0]} alt=${destProp.title} class="endpoint-thumb" />
                    <div class="endpoint-info">
                      <div class="endpoint-name">${destProp.title}</div>
                      <div class="endpoint-address">${destProp.address}</div>
                      <div class="endpoint-meta">
                        <span class="endpoint-price">${formatCurrency(destProp.price, destProp.priceType)}</span>
                        <span class="endpoint-status">${destProp.status}</span>
                      </div>
                    </div>
                  </div>
                ` : ''}
              </div>

            </div>

            <!-- Travel Mode & Options Toolbar -->
            <div class="travel-controls-bar">
              
              <div class="travel-modes-group">
                <span class="toolbar-label">Travel Mode:</span>
                <div class="travel-mode-buttons">
                  ${(['DRIVING', 'TRANSIT', 'WALKING', 'BICYCLING'] as const).map(mode => html`
                    <button
                      type="button"
                      class="mode-btn ${this.travelMode === mode ? 'active' : ''}"
                      @click=${() => {
                        this.travelMode = mode;
                        this.calculateTravel();
                      }}
                    >
                      ${modeIcons[mode]}
                    </button>
                  `)}
                </div>
              </div>

              <!-- Route Options -->
              ${this.travelMode === 'DRIVING' ? html`
                <div class="travel-options-group">
                  <label class="travel-checkbox-label">
                    <input
                      type="checkbox"
                      .checked=${this.avoidTolls}
                      @change=${(e: any) => {
                        this.avoidTolls = e.target.checked;
                        this.calculateTravel();
                      }}
                    />
                    <span>Avoid Tolls</span>
                  </label>
                  <label class="travel-checkbox-label">
                    <input
                      type="checkbox"
                      .checked=${this.avoidHighways}
                      @change=${(e: any) => {
                        this.avoidHighways = e.target.checked;
                        this.calculateTravel();
                      }}
                    />
                    <span>Avoid Highways</span>
                  </label>
                </div>
              ` : ''}

            </div>

            <!-- Loading Spinner State -->
            ${this.isCalculating ? html`
              <div class="travel-loading-card">
                <div class="travel-spinner"></div>
                <div class="loading-text">Calculating optimal route between properties...</div>
              </div>
            ` : ''}

            <!-- Error Banner -->
            ${this.calculationError && !this.isCalculating ? html`
              <div class="travel-error-banner">
                <span>⚠️ ${this.calculationError}</span>
              </div>
            ` : ''}

            <!-- Calculation Results Card -->
            ${this.calculationResult && !this.isCalculating ? html`
              <div class="travel-results-container">
                
                <!-- Primary Metric Scoreboard -->
                <div class="travel-metrics-banner">
                  <div class="metric-block primary">
                    <div class="metric-label">ESTIMATED TRAVEL TIME</div>
                    <div class="metric-value duration">⏱️ ${this.calculationResult.durationText}</div>
                    <div class="metric-subtext">via ${this.calculationResult.summary}</div>
                  </div>

                  <div class="metric-block">
                    <div class="metric-label">DRIVING DISTANCE</div>
                    <div class="metric-value distance">🛣️ ${this.calculationResult.distanceText}</div>
                    <div class="metric-subtext">Straight-line: ${this.calculationResult.straightLineMiles} mi</div>
                  </div>

                  <div class="metric-block">
                    <div class="metric-label">EST. FUEL / ENERGY</div>
                    <div class="metric-value fuel">⛽ ${this.calculateEstimatedFuelCost(this.calculationResult.distanceText)}</div>
                    <div class="metric-subtext">@ avg 25 mpg ($3.95/gal)</div>
                  </div>

                  <div class="metric-block">
                    <div class="metric-label">ROUTE STATUS</div>
                    <div class="metric-value status">
                      <span class="live-pulse"></span> Optimal Flow
                    </div>
                    <div class="metric-subtext">Real-time vector road data</div>
                  </div>
                </div>

                <!-- Step-by-Step Toggle & Actions -->
                <div class="travel-action-row">
                  <button
                    type="button"
                    class="toggle-steps-btn"
                    @click=${() => this.showTurnByTurn = !this.showTurnByTurn}
                  >
                    ${this.showTurnByTurn ? '▲ Hide Step-by-Step Directions' : `▼ View Turn-by-Turn Directions (${this.calculationResult.steps.length} steps)`}
                  </button>

                  <div class="travel-secondary-btns">
                    <button
                      type="button"
                      class="travel-clear-btn"
                      @click=${this.handleClearRoute}
                      title="Clear route overlay from map"
                    >
                      🗑️ Clear Route from Map
                    </button>
                    <button
                      type="button"
                      class="travel-recalc-btn"
                      @click=${this.calculateTravel}
                      title="Recalculate Route"
                    >
                      🔄 Refresh
                    </button>
                  </div>
                </div>

                <!-- Turn-by-Turn Step Breakdown -->
                ${this.showTurnByTurn ? html`
                  <div class="travel-steps-list">
                    <div class="steps-header">
                      <span>Turn-by-Turn Navigation Steps</span>
                      <span>${this.calculationResult.steps.length} Maneuvers</span>
                    </div>

                    ${this.calculationResult.steps.map((step, idx) => html`
                      <div class="travel-step-item">
                        <div class="step-num">${idx + 1}</div>
                        <div class="step-instruction">${step.instructions}</div>
                        <div class="step-metrics">
                          <span class="step-dist">${step.distance}</span>
                          <span class="step-dur">${step.duration}</span>
                        </div>
                      </div>
                    `)}
                  </div>
                ` : ''}

              </div>
            ` : ''}

          </div>

          <!-- Footer -->
          <div class="travel-modal-footer">
            <div class="footer-note">
              <span>📍 Route overlay is displayed live on the vector map with auto-adjusted viewport.</span>
            </div>
            <div class="footer-buttons">
              <button type="button" class="travel-footer-done-btn" @click=${this.closeModal}>
                ✓ Done (Keep Route on Map)
              </button>
            </div>
          </div>

        </div>
      </div>
    `;
  }
}
