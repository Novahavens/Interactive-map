/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable
import {html, LitElement} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';

import {MapParams} from './mcp_maps_server';
import { propertyDB, Property, formatCurrency, geocodeAddress } from './property_db';
import './property_modal';
import './property_manager';
import './travel_calculator';
import './search_agent';
import { RouteCalculationResult } from './travel_calculator';

export const ICON_INFO = html`
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M11 7H13V9H11V7ZM11 11H13V17H11V11ZM12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="currentColor"/>
</svg>`;

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const LOCAL_STORAGE_GET_STARTED_KEY =
  'ai_studio_maps_styling_sandbox_get_started_dialog';

/**
 * Chat state enum to manage the current state of the chat interface.
 */
export enum ChatState {
  IDLE = 'idle',
  THINKING = 'thinking',
  EXECUTING = 'executing',
  GENERATING = 'generating',
}

interface Viewport {
  lat: number;
  lng: number;
  zoom: number;
}

const DEFAULT_VIEWPORT = {
  lat: 37.7749,
  lng: -122.4194,
  zoom: 12,
};

async function waitForGoogleMaps(): Promise<void> {
  const g = (window as any).google;
  if (typeof g?.maps?.Map === 'function') {
    return;
  }

  if (g?.maps?.importLibrary) {
    try {
      await Promise.all([
        g.maps.importLibrary('maps'),
        g.maps.importLibrary('places'),
        g.maps.importLibrary('geometry'),
        g.maps.importLibrary('marker'),
        g.maps.importLibrary('routes')
      ]);
      if (typeof (window as any).google?.maps?.Map === 'function') {
        return;
      }
    } catch (_err) {
      console.warn('Google Maps importLibrary error:', _err);
    }
  }

  return new Promise((resolve) => {
    let count = 0;
    const interval = setInterval(async () => {
      count++;
      const google = (window as any).google;
      if (typeof google?.maps?.Map === 'function') {
        clearInterval(interval);
        resolve();
      } else if (google?.maps?.importLibrary) {
        clearInterval(interval);
        try {
          await Promise.all([
            google.maps.importLibrary('maps'),
            google.maps.importLibrary('places'),
            google.maps.importLibrary('geometry'),
            google.maps.importLibrary('marker'),
            google.maps.importLibrary('routes')
          ]);
        } catch (_e) {}
        resolve();
      } else if (count > 200) {
        clearInterval(interval);
        console.warn('Google Maps took too long to load.');
        resolve();
      }
    }, 50);
  });
}

@customElement('gdm-playground')
export class Playground extends LitElement {
  @query('#anchor') anchor?: HTMLDivElement;
  @query('#inputArea') inputArea?: HTMLDivElement;
  @query('#messageInput') messageInput?: HTMLInputElement;
  @query('#imageUpload') imageUpload?: HTMLInputElement;

  @state() isRunning = true;
  @state() isAboutDialogVisible = false;
  private focusedElementBeforeDialog: HTMLElement | null = null;
  @state() inputMessage = '';
  @state() placeholderQuery = '';
  @state() messages: HTMLElement[] = [];
  @state()
  droppedImage: {data: string; mimeType: string; dataUrl: string} | null =
    null;
  private readonly map: HTMLDivElement = document.createElement('div');
  private readonly initMap: HTMLDivElement = document.createElement('div');

  sendMessageHandler?: (
    input: string,
    role: string,
    image?: {mimeType: string; data: string},
  ) => Promise<void>;

  viewport: Viewport = DEFAULT_VIEWPORT;

  // Google Map
  googleMap: any;
  geocoder: any;
  directionsService: any;
  directionsRenderer: any;
  placesService: any;
  infoWindow: any;
  markers: any[] = [];
  styleTableBytes?: Uint8Array;
  placeholderIndex = 0;

  resolveConfigVersion: (configVersion: string) => void;
  configVersion: Promise<string> = new Promise(res => {
    this.resolveConfigVersion = res;
  });

  // Will be populated by the agent if necessary
  @state() jsonStyle: string;
  @state() userFriendlyName: string;

  // Property Database Waypoints State
  @state() activeSidebarTab: 'search_agent' | 'properties' = 'search_agent';
  @state() selectedPropertyForModal?: Property;
  @state() isPlaceModalOpen = false;
  @state() modalActiveTab: 'overview' | 'notes' | 'custom_fields' | 'streetview' | 'contact' = 'overview';
  @state() propertyWaypointsCount = 0;
  private propertyMarkers: any[] = [];
  private unsubscribePropertyDB?: () => void;
  private radiusCircle: any = null;
  private searchCenterMarker: any = null;

  // Travel Distance & Routing State
  @state() isTravelCalculatorOpen = false;
  @state() travelOriginPropId?: string;
  @state() travelDestPropId?: string;
  @state() activeRouteResult?: RouteCalculationResult;
  @state() isRouteActiveOnMap = false;

  private restyleCount = 0;
  private chatTurnCount = 0;

  constructor() {
    super();
    this.map.setAttribute('id', 'map');
    this.initMap.setAttribute('id', 'initMap');
  }

  public setRadiusCircle(lat: number, lng: number, radiusMiles = 10, addressLabel = '') {
    if (!this.googleMap || !(window as any).google?.maps) {
      setTimeout(() => this.setRadiusCircle(lat, lng, radiusMiles, addressLabel), 300);
      return;
    }

    // Clear previous circle and marker
    if (this.radiusCircle) {
      this.radiusCircle.setMap(null);
    }
    if (this.searchCenterMarker) {
      this.searchCenterMarker.setMap(null);
    }

    const center = { lat, lng };
    const radiusMeters = radiusMiles * 1609.344;

    this.radiusCircle = new (window as any).google.maps.Circle({
      strokeColor: '#2563eb',
      strokeOpacity: 0.85,
      strokeWeight: 2.5,
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      map: this.googleMap,
      center: center,
      radius: radiusMeters,
    });

    this.searchCenterMarker = new (window as any).google.maps.Marker({
      position: center,
      map: this.googleMap,
      title: `Search Epicenter (10-mile radius): ${addressLabel || 'Custom Location'}`,
      icon: {
        path: (window as any).google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#1d4ed8',
        fillOpacity: 1.0,
        strokeWeight: 2.5,
        strokeColor: '#ffffff'
      }
    });

    this.googleMap.panTo(center);
    this.googleMap.setZoom(12);
  }

  public openTravelCalculator(originProp?: Property, destProp?: Property) {
    if (originProp) {
      this.travelOriginPropId = originProp.id;
    }
    if (destProp) {
      this.travelDestPropId = destProp.id;
    }
    this.isTravelCalculatorOpen = true;
    this.requestUpdate();

    setTimeout(() => {
      const calc = this.querySelector('property-travel-calculator') as any;
      if (calc && originProp) {
        calc.setRoute(originProp.id, destProp?.id);
      }
    }, 100);
  }

  private handleRouteCalculated(e: CustomEvent) {
    const { directionsResponse, result } = e.detail;
    this.activeRouteResult = result;
    this.isRouteActiveOnMap = true;
    if (this.directionsRenderer && this.googleMap) {
      this.directionsRenderer.setMap(this.googleMap);
      this.directionsRenderer.setDirections(directionsResponse);
    }
    this.requestUpdate();
  }

  public clearActiveRoute() {
    if (this.directionsRenderer) {
      this.directionsRenderer.setMap(null);
      this.directionsRenderer = new (window as any).google.maps.DirectionsRenderer();
      if (this.googleMap) {
        this.directionsRenderer.setMap(this.googleMap);
      }
    }
    this.activeRouteResult = undefined;
    this.isRouteActiveOnMap = false;
    this.requestUpdate();
  }

  private clearPropertyWaypoints() {
    for (const marker of this.propertyMarkers) {
      marker.setMap(null);
    }
    this.propertyMarkers = [];
  }

  public renderPropertyWaypoints() {
    if (!this.googleMap) return;
    this.clearPropertyWaypoints();

    const properties = propertyDB.getProperties();
    this.propertyWaypointsCount = properties.length;
    if (properties.length === 0) return;

    properties.forEach(prop => {
      const pos = { lat: prop.lat, lng: prop.lng };

      const markerColor = prop.status === 'Available' ? '#10b981' :
                          prop.status === 'For Rent' ? '#3b82f6' :
                          prop.status === 'Pending' ? '#f59e0b' : '#6b7280';

      const marker = new (window as any).google.maps.Marker({
        position: pos,
        map: this.googleMap,
        title: `${prop.title} - ${formatCurrency(prop.price, prop.priceType)}`,
        icon: {
          path: (window as any).google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: markerColor,
          fillOpacity: 1.0,
          strokeWeight: 3,
          strokeColor: '#ffffff'
        }
      });

      marker.addListener('click', () => {
        this.selectedPropertyForModal = prop;
        this.isPlaceModalOpen = true;
        this.googleMap.panTo(pos);
        this.requestUpdate();
      });

      this.propertyMarkers.push(marker);
    });
  }

  public fitAllWaypointsOnMap() {
    if (!this.googleMap) return;
    const properties = propertyDB.getProperties();
    if (properties.length === 0) return;

    const bounds = new (window as any).google.maps.LatLngBounds();
    properties.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
    this.googleMap.fitBounds(bounds);
  }

  firstUpdated() {
    this.postRenderInit();
  }

  

  private changePlaceholder(query: string) {
    if (
      document.activeElement?.id === 'messageInput' ||
      this.inputMessage !== ''
    ) {
      return;
    }
    this.placeholderQuery = query;
  }

  private setupInputListeners() {
    if (this.inputArea) {
      this.inputArea.addEventListener('dragover', this.handleDragOver.bind(this));
      this.inputArea.addEventListener(
        'dragleave',
        this.handleDragLeave.bind(this),
      );
      this.inputArea.addEventListener('drop', this.handleDrop.bind(this));
    }
    this.messageInput?.addEventListener('paste', this.handlePaste.bind(this));
  }

  /** Code that must run after the DOM structure has been created */
  async postRenderInit() {
    await waitForGoogleMaps();
    this.createMap();
    if ((window as any).google?.maps) {
      try {
        this.directionsService = new (window as any).google.maps.DirectionsService();
      } catch (_e) {}
    }

    this.renderPropertyWaypoints();
    if (!this.unsubscribePropertyDB) {
      this.unsubscribePropertyDB = propertyDB.subscribe(() => {
        this.renderPropertyWaypoints();
      });
    }

    this.setupInputListeners();
  }

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.inputArea?.classList.add('dragover');
  }

  private handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.inputArea?.classList.remove('dragover');
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.inputArea?.classList.remove('dragover');
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      this.handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }

  private handlePaste(e: ClipboardEvent) {
    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      this.handleFile(e.clipboardData.files[0]);
    }
  }

  private handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      // Reset file input to allow selecting the same file again
      target.value = '';

      const tenMB = 10 * 1024 * 1024;
      if (file.size > tenMB) {
        
        this.scrollToTheEnd();
        return;
      }

      if (file.type === 'image/png' || file.type === 'image/jpeg') {
        this.handleFile(file);
      } else {
        
        this.scrollToTheEnd();
      }
    }
  }

  private handleFile(file: File) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target?.result as string;
        const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
        this.droppedImage = {
          data: base64Data,
          mimeType: file.type,
          dataUrl: dataUrl,
        };
      };
      reader.readAsDataURL(file);
    }
  }

  /** Disable shadow DOM */
  createRenderRoot() {
    return this;
  }

  private clearMarkers() {
    for (const marker of this.markers) {
      marker.setMap(null);
    }
    this.markers = [];
  }

  private clearMapOverlays() {
    this.clearMarkers();
    if (this.directionsRenderer) {
      this.directionsRenderer.setDirections({routes: []});
    }
  }

  /** Defined here to ensure that it's up to date when requesting a style table. */
  defineConfigVersion() {
    const api = (window as any).google?.maps;
    const mapElement = document.getElementById('initMap');
    if (!mapElement || typeof api?.Map !== 'function') return;

    const mapOptions = {
      renderingType: 'VECTOR',
      center: {lat: this.viewport.lat, lng: this.viewport.lng},
      zoom: this.viewport.zoom,
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    };

    try {
      const map = new api.Map(mapElement, mapOptions);

      api.event.addListenerOnce(map, 'tilesloaded', () => {
        const configVersion = api.styleEditor?.getConfigVersion(map);
        mapElement.parentElement?.removeChild(mapElement);
        this.resolveConfigVersion(configVersion);
      });
    } catch (_e) {
      console.warn('Failed to define config version:', _e);
    }
  }

  renderMapQuery(params: MapParams) {
    if (params.userFriendlyName) {
      this.userFriendlyName = params.userFriendlyName;
    }

    if (params.jsonStyle) {
      this.jsonStyle = params.jsonStyle;
      return;
    }

    if (params.base64StyleTable) {
      this.styleTableBytes = base64ToUint8Array(params.base64StyleTable);
      this.createMap();
      return;
    }

    if (!this.googleMap) {
      this.createMap();
    }

    if (params.location) {
      this.handleLocationQuery(params.location);
      return;
    }

    if (params.origin && params.destination) {
      this.handleDirections(params.origin, params.destination);
      return;
    }

    if (params.search) {
      this.handleSearch(params.search);
      return;
    }
  }

  private createMap() {
    this.restyleCount++;
    this.clearMapOverlays();

    const mapElement = document.getElementById('map') || this.map;
    const gmaps = (window as any).google?.maps;
    if (!mapElement || typeof gmaps?.Map !== 'function') {
      waitForGoogleMaps().then(() => {
        if (typeof (window as any).google?.maps?.Map === 'function' && !this.googleMap) {
          this.createMap();
        }
      });
      return;
    }

    let colorScheme = 'LIGHT';

    if (this.jsonStyle) {
      try {
        const style = JSON.parse(this.jsonStyle);
        if (style.variant === 'dark') {
          colorScheme = 'DARK';
        }
      } catch (e) {
        // swallow the error;
      }
    }

    const mapOptions: any = {
      center: {lat: this.viewport.lat, lng: this.viewport.lng},
      fullscreenControl: false,
      gestureHandling: 'greedy',
      renderingType: 'VECTOR',
      colorScheme,
      streetViewControl: false,
      mapTypeControl: false,
      zoom: this.viewport.zoom,
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    };

    if (this.styleTableBytes) {
      mapOptions.internalUsageAttributionIds = [
        'gmp_mcp_codeassist_v1_aistudio',
      ];
      mapOptions.styleTableBytes = this.styleTableBytes;
    }

    this.googleMap = new (window as any).google.maps.Map(mapElement, mapOptions);

    this.googleMap.addListener('bounds_changed', () => {
      const center = this.googleMap.getCenter();
      this.viewport.lat = center.lat();
      this.viewport.lng = center.lng();
      this.viewport.zoom = this.googleMap.getZoom();
    });

    this.placesService = new (window as any).google.maps.places.PlacesService(
      this.googleMap,
    );

    if (this.directionsRenderer) {
      this.directionsRenderer.setMap(this.googleMap);
    } else {
      this.directionsRenderer =
        new (window as any).google.maps.DirectionsRenderer();
      this.directionsRenderer.setMap(this.googleMap);
    }

    if (!this.infoWindow) {
      this.infoWindow = new (window as any).google.maps.InfoWindow();
    }

    this.renderPropertyWaypoints();
  }

  private getExportJsonStyleURL() {
    if (!this.jsonStyle) {
      return;
    }
    try {
      const condensed = JSON.stringify(JSON.parse(this.jsonStyle));
      const b64 = btoa(condensed);
      let displayNameParam = '';
      if (this.userFriendlyName) {
        displayNameParam = `displayName=${this.userFriendlyName};`;
      } 
      const url = `https://console.cloud.google.com/google/maps-apis/studio/quickstart;${displayNameParam}stylesheet=${b64};source=AI_STUDIO_SANDBOX`;
      return url;
    } catch (e) {
      console.error('Error processing jsonStyle for export URL:', e);
    }
  }

  private exceedsBrowserUrlLimit(url: string) {
    // Optimizing for Chrome browser and other browsers with ~10k limit.
    // Some older browsers have e.g. 2k limit will be excluded.
    return url && url.length > 10000;
  }

  private exportJsonStyle() {
    if (!this.jsonStyle) {
      return;
    }
    const url = this.getExportJsonStyleURL();
    if (!url || this.exceedsBrowserUrlLimit(url)) {
      return;
    }
    window.open(url, '_blank');
  }

  private async handleLocationQuery(location: string) {
    this.clearMapOverlays();
    const geocoded = await geocodeAddress(location);
    if (geocoded && this.googleMap) {
      this.googleMap.setCenter({ lat: geocoded.lat, lng: geocoded.lng });
      this.googleMap.setZoom(15);
    }
  }

  private async handleDirections(origin: string, destination: string) {
    this.clearMapOverlays();
    
    const originGeo = await geocodeAddress(origin);
    const destGeo = await geocodeAddress(destination);
    
    if (!originGeo || !destGeo) {
      console.error(`Could not resolve coordinates for directions. Origin: ${!!originGeo}, Dest: ${!!destGeo}`);
      return;
    }

    this.directionsService.route(
      {
        origin: { lat: originGeo.lat, lng: originGeo.lng },
        destination: { lat: destGeo.lat, lng: destGeo.lng },
        travelMode: (window as any).google.maps.TravelMode.DRIVING,
      },
      (response: any, status: any) => {
        if (status === 'OK') {
          this.directionsRenderer.setDirections(response);
        } else {
          console.error(`Directions request failed: ${status}`);
        }
      },
    );
  }

  private async initiateRestyle() {
    const configVersion = await this.configVersion;
    const publicStyleSheet = this.jsonStyle;
    if (!publicStyleSheet) return;

    try {
      const response = await fetch('https://mapsresources-pa.googleapis.com/v1/generateStyleTable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'config_version': configVersion,
          'version': 'sdk-',
          'public_style_sheet_json': publicStyleSheet,
          'config_set': 'roadmap',
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.style_table_bytes) {
          this.styleTableBytes = base64ToUint8Array(data.style_table_bytes);
          this.createMap();
        }
      }
    } catch (e) {
      console.error('Error initiating restyle:', e);
    }
  }

  async showAboutDialog() {
    this.focusedElementBeforeDialog = document.activeElement as HTMLElement;
    this.isAboutDialogVisible = true;

    await this.updateComplete;

    const dialogButton = this.querySelector(
      '.intro-dialog button',
    ) as HTMLElement;
    dialogButton?.focus();
  }

  hideAboutDialog() {
    if (!this.isAboutDialogVisible) return;
    this.isAboutDialogVisible = false;
    
    this.focusedElementBeforeDialog?.focus();
  }

  private handleDialogKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hideAboutDialog();
      return;
    }

    if (e.key === 'Tab') {
      const dialog = e.currentTarget as HTMLElement;
      if (!dialog) return;

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        ),
      ).filter((el) => el.offsetParent !== null);

      if (focusableElements.length <= 1) {
        e.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    }
  }

  private handleSearch(search: string) {
    this.clearMapOverlays();
    const request = {
      query: search,
      fields: ['name', 'geometry', 'formatted_address', 'place_id'],
      locationBias: this.googleMap.getCenter(),
    };

    this.placesService.textSearch(request, (results: any, status: any) => {
      if (
        status === (window as any).google.maps.places.PlacesServiceStatus.OK &&
        results
      ) {
        const bounds = new (window as any).google.maps.LatLngBounds();

        results.forEach((place: any) => {
          if (!place.geometry || !place.geometry.location) {
            return;
          }

          const marker = new (window as any).google.maps.Marker({
            map: this.googleMap,
            title: place.name,
            position: place.geometry.location,
          });
          this.markers.push(marker);

          marker.addListener('click', () => {
            this.infoWindow.setContent(
              `<strong>${place.name}</strong><br>${place.formatted_address}`,
            );
            this.infoWindow.open(this.googleMap, marker);
          });

          if (place.geometry.viewport) {
            bounds.union(place.geometry.viewport);
          } else {
            bounds.extend(place.geometry.location);
          }
        });

        if (results.length > 0) {
          this.googleMap.fitBounds(bounds);
        }
      } else {
        console.error(`Places search failed: ${status}`);
      }
    });
  }

  setInputField(message: string) {
    this.inputMessage = message.trim();
  }

  scrollToTheEnd() {
    if (!this.anchor) return;
    this.anchor.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }

  hasGottenStarted(): boolean {
    return true;
  }

  getStarted(): void {
    localStorage.setItem(LOCAL_STORAGE_GET_STARTED_KEY, 'true');
    this.requestUpdate();
  }

  private renderAboutDialog() {
    return html`<div
      class="intro-dialog-container"
      @click=${this.hideAboutDialog}
      @keydown=${this.handleDialogKeyDown}>
      <div class="intro-dialog" @click=${(e: Event) => e.stopPropagation()}>
        <div class="intro-dialog__title">Rental Property Search & Waypoints</div>
        <div class="intro-dialog__description">
          <p>
            Welcome to the <strong>Rental Property Search & Waypoint Hub</strong>. Discover, analyze, and manage real estate properties with powerful spatial tools:
          </p>
          <ol>
            <li>
              <strong>10-Mile Radius Search Agent:</strong>
              Specify any epicenter address to discover available rental listings within 10 miles, complete with amenity match scoring and visual map pins.
            </li>
            <li>
              <strong>Property Database Management:</strong>
              Add custom properties, import batch addresses, edit pricing ($/mo), and inspect detailed photo galleries.
            </li>
            <li>
              <strong>Monday.com Integration:</strong>
              Click "Add as sub item" on any rental listing to sync property records directly into your team's Monday.com workspace boards.
            </li>
            <li>
              <strong>Travel & Route Calculator:</strong>
              Calculate driving, transit, bicycling, and walking distance and estimated travel times between any two properties.
            </li>
          </ol>
        </div>
        <div class="intro-dialog__footer">
          <button @click=${this.hideAboutDialog}>Got it</button>
        </div>
      </div>
    </div>`;
  }

  render() {
    return html`<div class="playground">
      ${this.isAboutDialogVisible ? this.renderAboutDialog() : ''}
      <div class="sidebar">
        <div class="maps-styling-header">
          <div class="sidebar-title">Property Search & Waypoints</div>
          <button
            id="infoButton"
            title="About Property Search & Waypoints"
            @click=${this.showAboutDialog}>
            ${ICON_INFO}
          </button>
        </div>

        <div class="sidebar-nav-tabs">
          <button
            class="sidebar-tab-btn ${this.activeSidebarTab === 'search_agent' ? 'active agent-active' : ''}"
            @click=${() => this.activeSidebarTab = 'search_agent'}>
            🤖 10-Mi Search Agent
          </button>
          <button
            class="sidebar-tab-btn ${this.activeSidebarTab === 'properties' ? 'active' : ''}"
            @click=${() => this.activeSidebarTab = 'properties'}>
            📍 Database (${this.propertyWaypointsCount})
          </button>
        </div>

        ${this.activeSidebarTab === 'search_agent' ? html`
          <property-search-agent
            @radius-search-updated=${(e: CustomEvent) => {
              const { lat, lng, radiusMiles, address } = e.detail;
              this.setRadiusCircle(lat, lng, radiusMiles, address);
            }}
            @agent-properties-discovered=${(e: CustomEvent) => {
              this.renderPropertyWaypoints();
              setTimeout(() => {
                this.fitAllWaypointsOnMap();
              }, 200);
            }}
            @locate-property-on-map=${(e: CustomEvent) => {
              const prop = e.detail.property;
              this.selectedPropertyForModal = prop;
              this.modalActiveTab = e.detail.tab || 'overview';
              this.isPlaceModalOpen = true;
              if (this.googleMap) {
                this.googleMap.panTo({ lat: prop.lat, lng: prop.lng });
                this.googleMap.setZoom(16);
              }
              this.requestUpdate();
            }}
          ></property-search-agent>
        ` : html`
          <property-db-manager
            @select-property=${(e: CustomEvent) => {
              const prop = e.detail.property;
              this.selectedPropertyForModal = prop;
              this.modalActiveTab = e.detail.tab || 'overview';
              this.isPlaceModalOpen = true;
              if (this.googleMap) {
                this.googleMap.panTo({ lat: prop.lat, lng: prop.lng });
                this.googleMap.setZoom(16);
              }
              this.requestUpdate();
            }}
            @open-travel-calculator=${(e: CustomEvent) => {
              this.openTravelCalculator(e.detail.originProperty, e.detail.destProperty);
            }}
            @batch-properties-added=${(e: CustomEvent) => {
              if (e.detail?.autoFit !== false) {
                setTimeout(() => {
                  this.fitAllWaypointsOnMap();
                }, 200);
              }
            }}>
          </property-db-manager>
        `}
      </div>

      <div class="main-container">
        <div class="map-floating-top-bar">
          <button class="map-agent-tool-btn" @click=${() => {
            this.activeSidebarTab = 'search_agent';
            this.requestUpdate();
          }} title="Open 10-Mile Radius Property Search Agent">
            🤖 <span>10-Mile Search Agent</span>
          </button>

          <div class="map-waypoint-floating-badge" @click=${() => this.fitAllWaypointsOnMap()} title="Click to fit map view to all property database waypoints">
            📍 <span>${this.propertyWaypointsCount} Waypoints</span>
          </div>

          <button class="map-travel-tool-btn" @click=${() => this.openTravelCalculator()} title="Open Property Distance & Travel Time Calculator">
            🚗 <span>Travel & Distance Tool</span>
          </button>

          ${this.isRouteActiveOnMap && this.activeRouteResult ? html`
            <div class="active-route-pill" @click=${() => this.isTravelCalculatorOpen = true} title="Click to view full route breakdown">
              <span class="route-mode-icon">
                ${this.activeRouteResult.travelMode === 'DRIVING' ? '🚗' :
                  this.activeRouteResult.travelMode === 'WALKING' ? '🚶' :
                  this.activeRouteResult.travelMode === 'BICYCLING' ? '🚴' : '🚇'}
              </span>
              <span class="route-metric-dur">${this.activeRouteResult.durationText}</span>
              <span class="route-metric-dist">(${this.activeRouteResult.distanceText})</span>
              <span class="route-names-snippet">${this.activeRouteResult.origin.title} ➔ ${this.activeRouteResult.destination.title}</span>
              <button class="clear-route-pill-btn" @click=${(e: Event) => {
                e.stopPropagation();
                this.clearActiveRoute();
              }} title="Clear active route from map">✕</button>
            </div>
          ` : ''}
        </div>

        ${this.initMap} ${this.map}
      </div>

      <property-place-modal
        .propertyData=${this.selectedPropertyForModal}
        .open=${this.isPlaceModalOpen}
        .activeTab=${this.modalActiveTab}
        @close-modal=${() => this.isPlaceModalOpen = false}
        @open-travel-calculator=${(e: CustomEvent) => {
          this.openTravelCalculator(e.detail.originProperty, e.detail.destProperty);
        }}
        @get-directions=${(e: CustomEvent) => {
          const { destination } = e.detail;
          this.handleDirections('San Francisco, CA', destination);
        }}
        @property-notes-updated=${(e: CustomEvent) => {
          if (this.selectedPropertyForModal && this.selectedPropertyForModal.id === e.detail.propertyId) {
            this.selectedPropertyForModal = {
              ...this.selectedPropertyForModal,
              internalNotes: e.detail.internalNotes
            };
            this.requestUpdate();
          }
        }}
        @edit-property=${(e: CustomEvent) => {
          const prop = e.detail.property;
          this.activeSidebarTab = 'properties';
          this.isPlaceModalOpen = false;
          this.requestUpdate();
          setTimeout(() => {
            const mgr = this.querySelector('property-db-manager') as any;
            if (mgr && mgr.openEditModal) {
              mgr.openEditModal(prop);
            }
          }, 100);
        }}>
      </property-place-modal>

      <!-- TRAVEL TIME & DISTANCE CALCULATOR TOOL -->
      <property-travel-calculator
        .open=${this.isTravelCalculatorOpen}
        .initialOriginId=${this.travelOriginPropId}
        .initialDestinationId=${this.travelDestPropId}
        @close-calculator=${() => this.isTravelCalculatorOpen = false}
        @route-calculated=${this.handleRouteCalculated}
        @clear-route=${this.clearActiveRoute}
      ></property-travel-calculator>

      <div class="maps-styling-header mobile-view">
          <div class="sidebar-title">Property Search & Waypoints</div>
          <button
            id="infoButton"
            title="About Property Search & Waypoints"
            @click=${this.showAboutDialog}>
            ${ICON_INFO}
          </button>
        </div>
    </div>`;
  }
}
