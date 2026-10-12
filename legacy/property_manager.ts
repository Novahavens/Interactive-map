/**
 * Property Database Manager Panel (Sidebar Tab Component)
 */

import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Property, propertyDB, mondayDB, geocodeAddress, formatCurrency } from './property_db';
import { MondaySyncService } from './monday_sync_service';

interface MondaySyncToastInfo {
  count: number;
  boardUrl: string;
  boardId: string;
  propertyTitle?: string;
}

export interface ParsedBatchCandidate {
  id: string;
  rawLine: string;
  address: string;
  title: string;
  price: number;
  priceType: 'sale' | 'rent';
  status: 'For Rent' | 'Available' | 'Pending' | 'Leased';
  propertyType: 'Single Family' | 'Condo' | 'Townhouse' | 'Multi-Family' | 'Penthouse' | 'Estate' | 'Studio' | 'Loft';
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lat: number;
  lng: number;
  geocodeStatus: 'pending' | 'loading' | 'success' | 'failed';
  formattedAddress?: string;
  geocodeError?: string;
}

@customElement('property-db-manager')
export class PropertyDbManager extends LitElement {
  @state() properties: Property[] = [];
  @state() searchQuery = '';
  @state() statusFilter = 'ALL';
  @state() typeFilter = 'ALL';
  @state() priceFilter = 'ALL';

  @state() isAddEditModalOpen = false;
  @state() editingPropertyId: string | null = null;

  @state() formTitle = '';
  @state() formAddress = '';
  @state() formLat: number = 37.7749;
  @state() formLng: number = -122.4194;
  @state() formPrice: number = 4500;
  @state() formPriceType: 'sale' | 'rent' = 'rent';
  @state() formStatus: 'For Rent' | 'Available' | 'Pending' | 'Leased' = 'For Rent';
  @state() formPropertyType: 'Single Family' | 'Condo' | 'Townhouse' | 'Multi-Family' | 'Penthouse' | 'Estate' | 'Studio' | 'Loft' = 'Single Family';
  @state() formBedrooms: number = 3;
  @state() formBathrooms: number = 2;
  @state() formSqft: number = 1800;
  @state() formNextAvailability: string = "2026-09-01";
  @state() formLandlordName: string = "";
  @state() formLandlordPhone: string = "";
  @state() formLandlordEmail: string = "";
  @state() formDescription = '';
  @state() formInternalNotes = '';
  @state() formPhotosText = '';
  @state() formAmenitiesText = '';
  @state() formCustomFields: { key: string; value: string }[] = [];
  @state() formAgentName = 'Nova Agent';
  @state() formAgentPhone = '(415) 555-0199';
  @state() formAgentEmail = 'agent@novahavens.com';

  @state() isGeocoding = false;
  @state() geocodeStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  @state() geocodeError = '';
  @state() geocodeSuccessMsg = '';
  @state() justAutoUpdatedCoords = false;
  @state() lastGeocodedAddress = '';

  // Batch / Multi-Address Parser States
  @state() isBatchModalOpen = false;
  @state() batchAddressText = '';
  @state() batchCandidates: ParsedBatchCandidate[] = [];
  @state() isBatchGeocoding = false;
  @state() batchGeocodeProgress = { current: 0, total: 0 };
  @state() batchDefaultStatus: 'For Rent' | 'Available' | 'Pending' | 'Leased' = 'For Rent';
  @state() batchDefaultType: 'Single Family' | 'Condo' | 'Townhouse' | 'Multi-Family' | 'Penthouse' | 'Estate' | 'Studio' | 'Loft' = 'Condo';
  @state() batchDefaultPrice: number = 4200;
  @state() batchDefaultPriceType: 'sale' | 'rent' = 'rent';
  @state() batchDefaultBedrooms: number = 2;
  @state() batchDefaultBathrooms: number = 2;
  @state() batchDefaultSqft: number = 1200;
  @state() batchAutoFitMap = true;
  @state() batchNotificationMsg = '';
  @state() batchActiveTab: 'input' | 'preview' = 'input';

  @state() importExportModalOpen = false;
  @state() importJsonText = '';
  @state() importMessage = '';

  private geocodeDebounceTimer: any = null;
  private addressAutocomplete: any = null;
  private unsubscribeDB?: () => void;

  createRenderRoot() {
    return this; // Render in light DOM for styling
  }

  connectedCallback() {
    super.connectedCallback();
    this.properties = propertyDB.getProperties();
    this.unsubscribeDB = propertyDB.subscribe(() => {
      this.properties = propertyDB.getProperties();
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.unsubscribeDB) {
      this.unsubscribeDB();
    }
    if (this.geocodeDebounceTimer) {
      clearTimeout(this.geocodeDebounceTimer);
    }
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('isAddEditModalOpen') && this.isAddEditModalOpen) {
      setTimeout(() => {
        this.initAddressAutocomplete();
      }, 150);
    }
  }

  private initAddressAutocomplete() {
    const input = this.querySelector('#form-address-input') as HTMLInputElement;
    if (!input || !(window as any).google?.maps?.places?.Autocomplete) return;

    try {
      if (this.addressAutocomplete) {
        (window as any).google.maps.event.clearInstanceListeners(this.addressAutocomplete);
      }

      this.addressAutocomplete = new (window as any).google.maps.places.Autocomplete(input, {
        fields: ['address_components', 'geometry', 'formatted_address', 'name']
      });

      this.addressAutocomplete.addListener('place_changed', () => {
        const place = this.addressAutocomplete.getPlace();
        if (place && place.geometry && place.geometry.location) {
          const lat = Number(place.geometry.location.lat().toFixed(6));
          const lng = Number(place.geometry.location.lng().toFixed(6));
          this.formAddress = place.formatted_address || place.name || input.value;
          this.formLat = lat;
          this.formLng = lng;
          this.lastGeocodedAddress = this.formAddress;
          this.geocodeStatus = 'success';
          this.geocodeSuccessMsg = `✓ Coordinates auto-fetched: (${lat}, ${lng})`;
          this.geocodeError = '';
          this.justAutoUpdatedCoords = true;
          setTimeout(() => {
            this.justAutoUpdatedCoords = false;
            this.requestUpdate();
          }, 2500);
          this.requestUpdate();
        }
      });
    } catch (err) {
      console.warn('Autocomplete init skipped or failed:', err);
    }
  }

  public openAddModal() {
    this.editingPropertyId = null;
    this.formTitle = 'New Sunset Modern Residence';
    this.formAddress = '100 California St, San Francisco, CA 94111';
    this.formLat = 37.7937;
    this.formLng = -122.3978;
    this.lastGeocodedAddress = this.formAddress;
    this.geocodeStatus = 'idle';
    this.geocodeError = '';
    this.geocodeSuccessMsg = '';
    this.formPrice = 4200;
    this.formPriceType = 'rent';
    this.formStatus = 'For Rent';
    this.formPropertyType = 'Condo';
    this.formBedrooms = 2;
    this.formBathrooms = 2;
    this.formSqft = 1350;
    this.formNextAvailability = "2026-09-01";
    this.formLandlordName = "John Doe";
    this.formLandlordPhone = "555-123-4567";
    this.formLandlordEmail = "john@example.com";
    this.formDescription = 'Modern high-floor urban condominium in premier downtown location with floor-to-ceiling glass and chef kitchen.';
    this.formInternalNotes = '• **[Status: Tour Scheduled]** Prospective applicant tour booked for Saturday.\n• Verified credit score 740+.\n> *Note: Confirm keybox code with concierge prior to arrival.*';
    this.formPhotosText = 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80';
    this.formAmenitiesText = 'Downtown View, Concierge, Gym, Parking';
    this.formCustomFields = [
      { key: 'HOA Fee', value: '$650 / month' },
      { key: 'Tax ID', value: 'SF-10492' }
    ];
    this.formAgentName = 'Nova Havens Agent';
    this.formAgentPhone = '(415) 890-3321';
    this.formAgentEmail = 'info@novahavens.com';
    this.isAddEditModalOpen = true;
  }

  public openEditModal(prop: Property) {
    this.editingPropertyId = prop.id;
    this.formTitle = prop.title;
    this.formAddress = prop.address;
    this.formLat = prop.lat;
    this.formLng = prop.lng;
    this.lastGeocodedAddress = prop.address;
    this.geocodeStatus = 'idle';
    this.geocodeError = '';
    this.geocodeSuccessMsg = '';
    this.formPrice = prop.price;
    this.formPriceType = prop.priceType || 'sale';
    this.formStatus = prop.status;
    this.formPropertyType = prop.propertyType;
    this.formBedrooms = prop.bedrooms;
    this.formBathrooms = prop.bathrooms;
    this.formSqft = prop.sqft;
    this.formNextAvailability = prop.nextAvailability || "";
    this.formLandlordName = prop.landlordName || "";
    this.formLandlordPhone = prop.landlordPhone || "";
    this.formLandlordEmail = prop.landlordEmail || "";
    this.formDescription = prop.description;
    this.formInternalNotes = prop.internalNotes || '';
    this.formPhotosText = (prop.photos || []).join('\n');
    this.formAmenitiesText = (prop.amenities || []).join(', ');
    this.formCustomFields = Object.entries(prop.customFields || {}).map(([key, value]) => ({ key, value }));
    this.formAgentName = prop.agent?.name || '';
    this.formAgentPhone = prop.agent?.phone || '';
    this.formAgentEmail = prop.agent?.email || '';
    this.isAddEditModalOpen = true;
  }

  private handleAddressInput(e: any) {
    this.formAddress = e.target.value;
    this.geocodeError = '';

    if (this.geocodeDebounceTimer) {
      clearTimeout(this.geocodeDebounceTimer);
    }

    const trimmed = this.formAddress.trim();
    if (trimmed.length >= 5 && trimmed !== this.lastGeocodedAddress) {
      this.geocodeStatus = 'loading';
      this.geocodeDebounceTimer = setTimeout(() => {
        this.autoGeocodeFormAddress(true);
      }, 700);
    } else if (trimmed.length < 5) {
      this.geocodeStatus = 'idle';
      this.geocodeSuccessMsg = '';
    }
  }

  private handleAddressBlur() {
    if (this.geocodeDebounceTimer) {
      clearTimeout(this.geocodeDebounceTimer);
    }
    const trimmed = this.formAddress.trim();
    if (trimmed.length >= 4 && trimmed !== this.lastGeocodedAddress && !this.isGeocoding) {
      this.autoGeocodeFormAddress(false);
    }
  }

  public async autoGeocodeFormAddress(isAuto = false) {
    const addressToGeocode = this.formAddress.trim();
    if (!addressToGeocode) {
      if (!isAuto) {
        this.geocodeError = 'Please enter an address first.';
        this.geocodeStatus = 'error';
      }
      return;
    }

    this.isGeocoding = true;
    this.geocodeStatus = 'loading';
    this.geocodeError = '';
    this.geocodeSuccessMsg = '';

    const res = await geocodeAddress(addressToGeocode);
    this.isGeocoding = false;

    if (res) {
      this.formLat = Number(res.lat.toFixed(6));
      this.formLng = Number(res.lng.toFixed(6));
      this.lastGeocodedAddress = addressToGeocode;
      this.geocodeStatus = 'success';
      this.geocodeSuccessMsg = `✓ Auto-geocoded: (${this.formLat}, ${this.formLng})`;
      this.geocodeError = '';
      
      this.justAutoUpdatedCoords = true;
      setTimeout(() => {
        this.justAutoUpdatedCoords = false;
        this.requestUpdate();
      }, 2500);

      this.requestUpdate();
    } else {
      this.geocodeStatus = 'error';
      this.geocodeError = isAuto
        ? 'Could not automatically locate coordinates. You can type coordinates manually below or refine the address.'
        : 'Could not geocode this address. Please verify or manually set coordinates.';
      this.requestUpdate();
    }
  }

  private addCustomFieldRow() {
    this.formCustomFields = [...this.formCustomFields, { key: '', value: '' }];
  }

  private removeCustomFieldRow(index: number) {
    this.formCustomFields = this.formCustomFields.filter((_, i) => i !== index);
  }

  // ==================== BATCH ADDRESS PARSER METHODS ====================

  public openBatchModal() {
    this.isBatchModalOpen = true;
    this.batchNotificationMsg = '';
    if (this.batchCandidates.length === 0 && !this.batchAddressText) {
      this.applyPreset('sf');
    }
  }

  public handleBatchInput(text: string) {
    this.batchAddressText = text;
    this.batchCandidates = this.parseBatchAddressLines(text);
  }

  public parseBatchAddressLines(rawText: string): ParsedBatchCandidate[] {
    const lines = rawText
      .split(/\r?\n|;(?=\s*[A-Za-z0-9])/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

    return lines.map((line, index) => {
      // Clean up common bullet points or numbering: 1. / 1) / - / * / •
      const cleanLine = line.replace(/^(\d+[\.\)\-:]\s*|[\*\-•]\s*)/, '').trim();

      // Check if line contains pipe/tab delimiters
      const pipeParts = cleanLine.split(/[|\t]/).map(s => s.trim()).filter(s => s.length > 0);

      let address = cleanLine;
      let title = '';
      let price = this.batchDefaultPrice;
      let priceType: 'sale' | 'rent' = this.batchDefaultPriceType;
      let status: 'For Rent' | 'Available' | 'Pending' | 'Leased' = this.batchDefaultStatus;
      let propertyType: 'Single Family' | 'Condo' | 'Townhouse' | 'Multi-Family' | 'Penthouse' | 'Estate' | 'Studio' | 'Loft' = this.batchDefaultType;
      let bedrooms = this.batchDefaultBedrooms;
      let bathrooms = this.batchDefaultBathrooms;
      let sqft = this.batchDefaultSqft;

      if (pipeParts.length > 1) {
        address = pipeParts[0];
        
        // Part 2 could be title or price
        if (pipeParts[1]) {
          if (pipeParts[1].startsWith('$') || /^\d+$/.test(pipeParts[1].replace(/,/g, ''))) {
            const parsedPrice = this.extractPriceNumber(pipeParts[1]);
            if (parsedPrice) {
              price = parsedPrice.price;
              priceType = parsedPrice.priceType;
            }
          } else {
            title = pipeParts[1];
          }
        }

        // Check remaining parts
        for (let i = 2; i < pipeParts.length; i++) {
          const p = pipeParts[i];
          const lower = p.toLowerCase();

          // Price check
          if (p.startsWith('$') || /^\d+[\d,]*$/.test(p)) {
            const parsedPrice = this.extractPriceNumber(p);
            if (parsedPrice) {
              price = parsedPrice.price;
              priceType = parsedPrice.priceType;
            }
          }

          // Status check
          if (lower.includes('for rent') || lower.includes('rental')) {
            status = 'For Rent';
            priceType = 'rent';
          } else if (lower.includes('available') || lower.includes('vacant')) {
            status = 'Available';
            priceType = 'rent';
          } else if (lower.includes('pending') || lower.includes('application')) {
            status = 'Pending';
          } else if (lower.includes('leased') || lower.includes('rented') || lower.includes('sold')) {
            status = 'Leased';
          }

          // Property type check
          if (lower.includes('single') || lower.includes('house') || lower.includes('home')) {
            propertyType = 'Single Family';
          } else if (lower.includes('penthouse')) {
            propertyType = 'Penthouse';
          } else if (lower.includes('condo') || lower.includes('apartment') || lower.includes('flat')) {
            propertyType = 'Condo';
          } else if (lower.includes('townhouse') || lower.includes('townhome')) {
            propertyType = 'Townhouse';
          } else if (lower.includes('estate') || lower.includes('villa') || lower.includes('mansion')) {
            propertyType = 'Estate';
          } else if (lower.includes('multi')) {
            propertyType = 'Multi-Family';
          }

          // Bed / Bath specs check
          const bedMatch = p.match(/(\d+)\s*(?:bed|bd|br)/i);
          if (bedMatch) bedrooms = parseInt(bedMatch[1]);

          const bathMatch = p.match(/([\d\.]+)\s*(?:bath|ba)/i);
          if (bathMatch) bathrooms = parseFloat(bathMatch[1]);

          const sqftMatch = p.match(/([\d,]+)\s*(?:sqft|sq\s*ft|ft)/i);
          if (sqftMatch) sqft = parseInt(sqftMatch[1].replace(/,/g, ''));
        }
      } else {
        // Plain single line without pipes - attempt smart pattern extraction
        const priceMatch = cleanLine.match(/\$([0-9,]+(?:\.[0-9]+)?)(?:\s*(M|k|K))?(?:\s*\/\s*(?:mo|month))?/i);
        if (priceMatch) {
          let num = parseFloat(priceMatch[1].replace(/,/g, ''));
          const multiplier = priceMatch[2]?.toUpperCase();
          if (multiplier === 'M') num = num * 1000000;
          else if (multiplier === 'K') num = num * 1000;

          if (priceMatch[0].includes('/mo') || priceMatch[0].includes('month')) {
            priceType = 'rent';
            status = 'For Rent';
          }
          price = Math.round(num);
          address = address.replace(priceMatch[0], '').trim();
        }

        const bedBathMatch = cleanLine.match(/(\d+)\s*(?:bed|bd|br)[,\s]+([\d\.]+)\s*(?:bath|ba)/i);
        if (bedBathMatch) {
          bedrooms = parseInt(bedBathMatch[1]);
          bathrooms = parseFloat(bedBathMatch[2]);
          address = address.replace(bedBathMatch[0], '').trim();
        }

        // Clean up trailing commas/dashes in address
        address = address.replace(/^[,\-\|\s]+|[,\-\|\s]+$/g, '').trim();
      }

      // Generate friendly default title if not explicit
      if (!title) {
        const firstSegment = address.split(',')[0] || address;
        title = `${firstSegment} Waypoint`;
      }

      // Provide jittered base coords near SF center until geocoded
      const fallbackLat = Number((37.7749 + (Math.sin(index * 1.5) * 0.03)).toFixed(6));
      const fallbackLng = Number((-122.4194 + (Math.cos(index * 1.5) * 0.04)).toFixed(6));

      return {
        id: `batch-cand-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 5)}`,
        rawLine: line,
        address,
        title,
        price,
        priceType,
        status,
        propertyType,
        bedrooms,
        bathrooms,
        sqft,
        lat: fallbackLat,
        lng: fallbackLng,
        geocodeStatus: 'pending'
      };
    });
  }

  private extractPriceNumber(str: string): { price: number; priceType: 'sale' | 'rent' } | null {
    const isRent = str.toLowerCase().includes('/mo') || str.toLowerCase().includes('rent');
    const clean = str.replace(/[^0-9\.]/g, '');
    const num = parseFloat(clean);
    if (isNaN(num)) return null;

    let finalPrice = num;
    if (str.toUpperCase().includes('M') && num < 1000) {
      finalPrice = num * 1000000;
    } else if (str.toUpperCase().includes('K') && num < 1000) {
      finalPrice = num * 1000;
    }

    return {
      price: Math.round(finalPrice),
      priceType: isRent ? 'rent' : 'sale'
    };
  }

  public applyPreset(presetType: 'sf' | 'silicon_valley' | 'rentals') {
    let presetText = '';
    if (presetType === 'sf') {
      presetText = [
        '555 California St, San Francisco, CA 94104 | 555 California Tower | $4,500,000 | 3 bed, 3 bath | Condo | For Sale',
        '600 Montgomery St, San Francisco, CA 94111 | Transamerica Loft Suite | $3,200,000 | 2 bed, 2.5 bath | Penthouse | For Sale',
        '1000 Chestnut St, San Francisco, CA 94109 | Russian Hill Panoramic | $2,750,000 | 3 bed, 2 bath | Single Family | For Sale',
        '1 Embarcadero Center, San Francisco, CA 94111 | Financial Center Condo | $1,950,000 | 2 bed, 2 bath | Condo | For Sale'
      ].join('\n');
    } else if (presetType === 'silicon_valley') {
      presetText = [
        '100 University Ave, Palo Alto, CA 94301 | Downtown Palo Alto Modern | $4,200,000 | 4 bed, 4 bath | Estate | For Sale',
        '2500 Sand Hill Rd, Menlo Park, CA 94025 | Sand Hill Executive Villa | $5,800,000 | 5 bed, 5.5 bath | Estate | For Sale',
        '1 Infinite Loop, Cupertino, CA 95014 | Silicon Valley Smart Estate | $3,600,000 | 4 bed, 3 bath | Single Family | For Sale'
      ].join('\n');
    } else if (presetType === 'rentals') {
      presetText = [
        '2000 Mission St, San Francisco, CA 94110 | Mission Arts Loft | $4,500/mo | 2 bed, 1 bath | Condo | For Rent',
        '1500 Haight St, San Francisco, CA 94117 | Upper Haight Victorian Flat | $5,200/mo | 3 bed, 2 bath | Townhouse | For Rent',
        '400 Castro St, San Francisco, CA 94114 | Castro View Terrace | $4,800/mo | 2 bed, 2 bath | Condo | For Rent'
      ].join('\n');
    }

    this.batchAddressText = presetText;
    this.batchCandidates = this.parseBatchAddressLines(presetText);
    this.requestUpdate();
  }

  public clearBatchText() {
    this.batchAddressText = '';
    this.batchCandidates = [];
    this.requestUpdate();
  }

  public async runBatchGeocode() {
    if (this.isBatchGeocoding || this.batchCandidates.length === 0) return;

    this.isBatchGeocoding = true;
    const itemsToGeocode = this.batchCandidates.filter(c => c.geocodeStatus !== 'success');
    this.batchGeocodeProgress = { current: 0, total: itemsToGeocode.length };

    for (let i = 0; i < itemsToGeocode.length; i++) {
      const cand = itemsToGeocode[i];
      cand.geocodeStatus = 'loading';
      this.requestUpdate();

      try {
        const res = await geocodeAddress(cand.address);
        if (res) {
          cand.lat = Number(res.lat.toFixed(6));
          cand.lng = Number(res.lng.toFixed(6));
          cand.formattedAddress = res.formattedAddress;
          cand.geocodeStatus = 'success';
          cand.geocodeError = undefined;
        } else {
          cand.geocodeStatus = 'failed';
          cand.geocodeError = 'Could not resolve exact coordinates. Fallback used.';
        }
      } catch (err: any) {
        cand.geocodeStatus = 'failed';
        cand.geocodeError = err.message || 'Geocoding failed';
      }

      this.batchGeocodeProgress = { current: i + 1, total: itemsToGeocode.length };
      this.requestUpdate();

      // Paced delay to respect browser rate limits
      await new Promise(r => setTimeout(r, 160));
    }

    this.isBatchGeocoding = false;
    this.requestUpdate();
  }

  public async geocodeSingleCandidate(index: number) {
    const cand = this.batchCandidates[index];
    if (!cand) return;

    cand.geocodeStatus = 'loading';
    this.requestUpdate();

    const res = await geocodeAddress(cand.address);
    if (res) {
      cand.lat = Number(res.lat.toFixed(6));
      cand.lng = Number(res.lng.toFixed(6));
      cand.formattedAddress = res.formattedAddress;
      cand.geocodeStatus = 'success';
      cand.geocodeError = undefined;
    } else {
      cand.geocodeStatus = 'failed';
      cand.geocodeError = 'Address not resolved';
    }
    this.requestUpdate();
  }

  public updateCandidateField(index: number, field: keyof ParsedBatchCandidate, value: any) {
    if (this.batchCandidates[index]) {
      (this.batchCandidates[index] as any)[field] = value;
      if (field === 'address') {
        this.batchCandidates[index].geocodeStatus = 'pending';
      }
      this.requestUpdate();
    }
  }

  public removeCandidate(index: number) {
    this.batchCandidates = this.batchCandidates.filter((_, i) => i !== index);
    this.requestUpdate();
  }

  public handleSaveBatchProperties() {
    if (this.batchCandidates.length === 0) {
      this.batchNotificationMsg = 'Please provide at least one valid address to import.';
      return;
    }

    const defaultPhotos = [
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80'
    ];

    const propertiesToAdd = this.batchCandidates.map(cand => ({
      title: cand.title || `${cand.address.split(',')[0]} Residence`,
      address: cand.formattedAddress || cand.address,
      lat: cand.lat,
      lng: cand.lng,
      price: cand.price || 4200,
      priceType: cand.priceType || 'rent',
      status: cand.status || 'For Rent',
      propertyType: cand.propertyType || 'Condo',
      bedrooms: cand.bedrooms || 3,
      bathrooms: cand.bathrooms || 2,
      sqft: cand.sqft || 1800,
      nextAvailability: "2026-09-01",
      landlordName: "",
      landlordPhone: "",
      landlordEmail: "",
      description: `Premium ${cand.propertyType.toLowerCase()} waypoint located at ${cand.address}. Verified real estate record in our spatial property database.`,
      photos: defaultPhotos,
      amenities: ['Spatial Waypoint', 'Central Location', 'Database Verified', 'High Visibility'],
      customFields: {
        'Import Source': 'Batch Address Parser',
        'Geocode Verified': cand.geocodeStatus === 'success' ? 'Yes (Spatial Geocoder)' : 'Manual/Estimated'
      },
      agent: {
        name: this.formAgentName || 'Nova Agent',
        phone: this.formAgentPhone || '(415) 555-0199',
        email: this.formAgentEmail || 'agent@novahavens.com',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
        company: 'Nova Havens Real Estate'
      }
    }));

    propertyDB.addProperties(propertiesToAdd);

    this.dispatchEvent(new CustomEvent('batch-properties-added', {
      detail: { count: propertiesToAdd.length, autoFit: this.batchAutoFitMap },
      bubbles: true,
      composed: true
    }));

    this.batchNotificationMsg = `✓ Successfully added ${propertiesToAdd.length} property waypoints to your database!`;

    setTimeout(() => {
      this.isBatchModalOpen = false;
      this.batchNotificationMsg = '';
      this.batchAddressText = '';
      this.batchCandidates = [];
      this.requestUpdate();
    }, 1200);
  }

  private handleSaveProperty(e: Event) {
    e.preventDefault();

    const photos = this.formPhotosText
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const amenities = this.formAmenitiesText
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const customFields: Record<string, string> = {};
    this.formCustomFields.forEach(item => {
      if (item.key.trim()) {
        customFields[item.key.trim()] = item.value.trim();
      }
    });

    const propData = {
      title: this.formTitle,
      address: this.formAddress,
      lat: Number(this.formLat),
      lng: Number(this.formLng),
      price: Number(this.formPrice),
      priceType: this.formPriceType,
      status: this.formStatus,
      propertyType: this.formPropertyType,
      bedrooms: Number(this.formBedrooms),
      bathrooms: Number(this.formBathrooms),
      sqft: Number(this.formSqft),
      nextAvailability: this.formNextAvailability,
      landlordName: this.formLandlordName,
      landlordPhone: this.formLandlordPhone,
      landlordEmail: this.formLandlordEmail,
      description: this.formDescription,
      internalNotes: this.formInternalNotes,
      photos: photos.length > 0 ? photos : ['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80'],
      amenities,
      customFields,
      agent: {
        name: this.formAgentName || 'Agent',
        phone: this.formAgentPhone || '(555) 000-0000',
        email: this.formAgentEmail || 'agent@propertydb.com',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
        company: 'Nova Havens Real Estate'
      }
    };

    if (this.editingPropertyId) {
      propertyDB.updateProperty(this.editingPropertyId, propData);
    } else {
      propertyDB.addProperty(propData);
    }

    this.isAddEditModalOpen = false;
  }

  private handleDeleteProperty(id: string) {
    if (confirm('Are you sure you want to delete this property waypoint from your database?')) {
      propertyDB.deleteProperty(id);
    }
  }

  private handleLocateOnMap(prop: Property) {
    this.dispatchEvent(new CustomEvent('select-property', {
      detail: { property: prop },
      bubbles: true,
      composed: true
    }));
  }

  private handleResetDB() {
    if (confirm('Reset database to default sample properties? Custom entries will be overwritten.')) {
      propertyDB.resetToDefaults();
    }
  }

  private handleImportJSON() {
    if (!this.importJsonText.trim()) {
      this.importMessage = 'Please paste JSON string first.';
      return;
    }
    const res = propertyDB.importFromJSON(this.importJsonText);
    if (res.success) {
      this.importMessage = `Successfully imported ${res.count} property record(s)!`;
      setTimeout(() => {
        this.importExportModalOpen = false;
        this.importMessage = '';
        this.importJsonText = '';
      }, 1500);
    } else {
      this.importMessage = `Import error: ${res.error}`;
    }
  }

  private handleExportJSON() {
    const jsonStr = propertyDB.exportToJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `properties_database_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private handleExportCSV() {
    const csvStr = propertyDB.exportToCSV();
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `properties_database_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  getFilteredProperties(): Property[] {
    return this.properties.filter(p => {
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchAddress = p.address.toLowerCase().includes(q);
        const matchDescription = (p.description || '').toLowerCase().includes(q);
        if (!matchTitle && !matchAddress && !matchDescription) return false;
      }

      if (this.statusFilter !== 'ALL' && p.status !== this.statusFilter) {
        return false;
      }

      if (this.typeFilter !== 'ALL' && p.propertyType !== this.typeFilter) {
        return false;
      }

      if (this.priceFilter === 'UNDER_4K' && p.price >= 4000) return false;
      if (this.priceFilter === '4K_TO_7K' && (p.price < 4000 || p.price > 7000)) return false;
      if (this.priceFilter === 'OVER_7K' && p.price <= 7000) return false;

      return true;
    });
  }

  private renderMondayLogo() {
    return html`
      <svg class="monday-logo-svg" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;" viewBox="0 0 40 40" fill="none">
        <path d="M7 26.5C7 23.46 9.46 21 12.5 21C15.54 21 18 23.46 18 26.5C18 29.54 15.54 32 12.5 32C9.46 32 7 29.54 7 26.5Z" fill="#FDAB3D"/>
        <path d="M21 26.5C21 23.46 23.46 21 26.5 21C29.54 21 32 23.46 32 26.5C32 29.54 29.54 32 26.5 32C23.46 32 21 29.54 21 26.5Z" fill="#00CA72"/>
        <path d="M12.5 8C15.54 8 18 10.46 18 13.5V26.5C18 23.46 15.54 21 12.5 21C9.46 21 7 23.46 7 26.5V13.5C7 10.46 9.46 8 12.5 8Z" fill="#E2445C"/>
        <path d="M26.5 14.5C29.54 14.5 32 16.96 32 20V26.5C32 23.46 29.54 21 26.5 21C23.46 21 21 23.46 21 26.5V20C21 16.96 23.46 14.5 26.5 14.5Z" fill="#0085FF"/>
      </svg>
    `;
  }

  @state() syncToast: MondaySyncToastInfo | null = null;
  @state() isBatchSyncingMonday = false;
  private syncToastTimer: any = null;

  private showSyncToast(count: number, boardUrl: string, boardId: string, propertyTitle?: string) {
    if (this.syncToastTimer) {
      clearTimeout(this.syncToastTimer);
    }
    this.syncToast = {
      count,
      boardUrl,
      boardId,
      propertyTitle
    };
    this.syncToastTimer = setTimeout(() => {
      this.syncToast = null;
      this.requestUpdate();
    }, 6000);
    this.requestUpdate();
  }

  private closeSyncToast() {
    if (this.syncToastTimer) {
      clearTimeout(this.syncToastTimer);
    }
    this.syncToast = null;
    this.requestUpdate();
  }

  private async handleToggleMondaySubItem(prop: Property, e: Event) {
    e.stopPropagation();
    const isAdded = mondayDB.isAdded(prop.id);
    if (isAdded) {
      mondayDB.toggleSubItem(prop);
      this.requestUpdate();
      return;
    }

    const response = await MondaySyncService.syncPropertyToBoard(prop);
    if (response.success) {
      mondayDB.toggleSubItem(prop);
      const boardUrl = response.boardUrl || MondaySyncService.getBoardUrl();
      const boardId = response.boardId || MondaySyncService.DEFAULT_BOARD_ID;
      this.showSyncToast(1, boardUrl, boardId, prop.title);
    }
    this.requestUpdate();
  }

  private async handleBatchSyncMonday() {
    const filtered = this.getFilteredProperties();
    if (filtered.length === 0) return;

    this.isBatchSyncingMonday = true;
    this.requestUpdate();

    const response = await MondaySyncService.syncMultiplePropertiesToBoard(filtered);
    this.isBatchSyncingMonday = false;

    if (response.success) {
      filtered.forEach(p => {
        if (!mondayDB.isAdded(p.id)) {
          mondayDB.toggleSubItem(p);
        }
      });
      const boardUrl = response.boardUrl || MondaySyncService.getBoardUrl();
      const boardId = response.boardId || MondaySyncService.DEFAULT_BOARD_ID;
      this.showSyncToast(response.syncedCount, boardUrl, boardId);
    }
    this.requestUpdate();
  }

  render() {
    const filteredProps = this.getFilteredProperties();

    return html`
      <div class="db-manager-container">
        
        <!-- Header & Action Controls -->
        <div class="db-manager-header">
          <div class="db-title-row">
            <div class="db-heading">
              <span class="db-heading-text">Property Database</span>
              <span class="db-badge">${this.properties.length} Waypoints</span>
            </div>
            <div class="db-header-btns">
              <button class="add-prop-btn" @click=${this.openAddModal} title="Add Single Property Record">
                ➕ Add Single
              </button>
              <button class="batch-prop-btn" @click=${this.openBatchModal} title="Parse and Add Multiple Addresses">
                📑 Batch Add
              </button>
            </div>
          </div>

          <div class="db-secondary-actions">
            <button class="db-tool-btn primary-tool" @click=${() => {
              this.dispatchEvent(new CustomEvent('open-travel-calculator', {
                detail: {},
                bubbles: true,
                composed: true
              }));
            }} title="Calculate driving distance & travel times between properties">
              🚗 Travel & Distance Tool
            </button>
            <button
              class="db-tool-btn"
              @click=${this.handleBatchSyncMonday}
              ?disabled=${this.isBatchSyncingMonday || filteredProps.length === 0}
              title="Sync all currently filtered property records to Monday.com workspace board"
            >
              ${this.renderMondayLogo()}
              <span>${this.isBatchSyncingMonday ? 'Syncing...' : `Sync (${filteredProps.length}) to Monday`}</span>
            </button>
            <button class="db-tool-btn" @click=${() => this.importExportModalOpen = true}>
              📥 / 📤 Import / Export
            </button>
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="db-filters-panel">
          <div class="filter-search-box">
            <input
              type="text"
              placeholder="🔍 Search address, title or description..."
              .value=${this.searchQuery}
              @input=${(e: any) => this.searchQuery = e.target.value}
            />
          </div>

          <div class="filter-selects-row">
            <select .value=${this.statusFilter} @change=${(e: any) => this.statusFilter = e.target.value}>
              <option value="ALL">All Statuses</option>
              <option value="For Rent">For Rent</option>
              <option value="Available">Available</option>
              <option value="Pending">Pending</option>
              <option value="Leased">Leased</option>
            </select>

            <select .value=${this.typeFilter} @change=${(e: any) => this.typeFilter = e.target.value}>
              <option value="ALL">All Types</option>
              <option value="Single Family">Single Family</option>
              <option value="Condo">Condo</option>
              <option value="Townhouse">Townhouse</option>
              <option value="Penthouse">Penthouse</option>
              <option value="Loft">Loft</option>
            </select>

            <select .value=${this.priceFilter} @change=${(e: any) => this.priceFilter = e.target.value}>
              <option value="ALL">Any Monthly Rent</option>
              <option value="UNDER_4K">&lt; $4,000 / mo</option>
              <option value="4K_TO_7K">$4,000 - $7,000 / mo</option>
              <option value="OVER_7K">&gt; $7,000 / mo</option>
            </select>
          </div>
        </div>

        <!-- Property List -->
        <div class="db-property-list">
          ${filteredProps.length > 0 ? filteredProps.map(prop => {
            const isAddedMonday = mondayDB.isAdded(prop.id);
            return html`
            <div
              class="property-item-card"
              role="button"
              tabindex="0"
              title="Click to view place card and locate on map"
              @click=${() => this.handleLocateOnMap(prop)}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  this.handleLocateOnMap(prop);
                }
              }}
            >
              <div class="prop-card-thumb">
                <img src=${prop.photos[0]} alt=${prop.title} />
                <span class="prop-card-status ${prop.status.toLowerCase().replace(/\s+/g, '-')}">${prop.status}</span>
              </div>

              <div class="prop-card-info">
                <div class="prop-card-price">${formatCurrency(prop.price, 'rent')} <span style="font-size: 11px; font-weight: 500; color: #64748b;">monthly rent</span></div>
                <div class="prop-card-title">${prop.title}</div>
                <div class="prop-card-address">📍 ${prop.address}</div>

                <div class="prop-card-specs">
                  <span>🛏️ ${prop.bedrooms} Bed</span>
                  <span>🚿 ${prop.bathrooms} Bath</span>
                  <span>📐 ${prop.sqft} sqft</span>
                  ${prop.internalNotes ? html`<span title="Qualitative notes recorded" style="color: #0c67df; font-weight: 600;">📝 Notes</span>` : ''}
                </div>

                <!-- PLUS BUTTON: Add as sub item with Monday.com logo -->
                <div style="margin: 8px 0;">
                  <button
                    type="button"
                    class="monday-subitem-btn ${isAddedMonday ? 'added' : ''}"
                    style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1.5px solid ${isAddedMonday ? '#3b82f6' : '#cbd5e1'}; background: ${isAddedMonday ? '#eff6ff' : '#ffffff'}; color: ${isAddedMonday ? '#1d4ed8' : '#1e293b'};"
                    @click=${(e: Event) => this.handleToggleMondaySubItem(prop, e)}
                  >
                    <span style="font-size: 13px; font-weight: 700;">${isAddedMonday ? '✓' : '+'}</span>
                    <span>${isAddedMonday ? 'Added as sub item' : 'Add as sub item'}</span>
                    ${this.renderMondayLogo()}
                  </button>
                </div>

                <div class="prop-card-actions">
                  <button
                    type="button"
                    class="card-btn primary"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this.handleLocateOnMap(prop);
                    }}
                  >
                    🗺️ Place Card
                  </button>
                  <button
                    type="button"
                    class="card-btn contact-landlord-btn"
                    style="background: #eff6ff; color: #1d4ed8; border: 1.5px solid #bfdbfe; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this.dispatchEvent(new CustomEvent('select-property', {
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
                    class="card-btn travel"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this.dispatchEvent(new CustomEvent('open-travel-calculator', {
                        detail: { originProperty: prop },
                        bubbles: true,
                        composed: true
                      }));
                    }}
                    title="Calculate travel distance and time from this property"
                  >
                    🚗 Route
                  </button>
                  <button
                    type="button"
                    class="card-btn"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this.openEditModal(prop);
                    }}
                    title="Edit Property"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    class="card-btn danger"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this.handleDeleteProperty(prop.id);
                    }}
                    title="Delete Property"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          `;
          }) : html`
            <div class="empty-db-state">
              <p>No property waypoints found matching your search and filter settings.</p>
              <button class="add-prop-btn" style="margin-top: 10px;" @click=${this.openAddModal}>➕ Add Property Record</button>
            </div>
          `}
        </div>

        <!-- ADD / EDIT PROPERTY FORM MODAL -->
        ${this.isAddEditModalOpen ? html`
          <div class="db-modal-overlay" @click=${() => this.isAddEditModalOpen = false}>
            <div class="db-modal-content" @click=${(e: Event) => e.stopPropagation()}>
              <div class="db-modal-header">
                <h3>${this.editingPropertyId ? 'Edit Property Record' : 'Add Property to Database'}</h3>
                <button class="close-modal-btn" @click=${() => this.isAddEditModalOpen = false}>✕</button>
              </div>

              ${!this.editingPropertyId ? html`
                <div class="batch-shortcut-banner">
                  <span>💡 Have a list of multiple addresses?</span>
                  <button type="button" class="batch-shortcut-btn" @click=${() => {
                    this.isAddEditModalOpen = false;
                    this.openBatchModal();
                  }}>
                    ⚡ Open Batch Address Parser ➔
                  </button>
                </div>
              ` : ''}

              <form class="db-property-form" @submit=${this.handleSaveProperty}>
                
                <div class="form-group">
                  <label>Property Title</label>
                  <input type="text" required .value=${this.formTitle} @input=${(e: any) => this.formTitle = e.target.value} placeholder="e.g. Pacific Heights Modern Villa" />
                </div>

                <div class="form-group">
                  <div class="address-label-row">
                    <label for="form-address-input">Street Address</label>
                    <span class="auto-geocode-hint">⚡ Auto-geocoding coordinates</span>
                  </div>
                  <div class="address-input-row">
                    <input
                      id="form-address-input"
                      type="text"
                      required
                      .value=${this.formAddress}
                      @input=${this.handleAddressInput}
                      @blur=${this.handleAddressBlur}
                      @keydown=${(e: KeyboardEvent) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          this.autoGeocodeFormAddress(false);
                        }
                      }}
                      placeholder="e.g. 2200 Pacific Ave, San Francisco, CA"
                    />
                    <button
                      type="button"
                      class="geocode-btn ${this.isGeocoding ? 'loading' : ''}"
                      @click=${() => this.autoGeocodeFormAddress(false)}
                      ?disabled=${this.isGeocoding}
                      title="Geocode address manually">
                      ${this.isGeocoding ? html`<span class="btn-spinner"></span> Geocoding...` : '📍 Geocode'}
                    </button>
                  </div>

                  <!-- Real-time Auto-Geocode Status Feedback -->
                  ${this.geocodeStatus === 'loading' ? html`
                    <div class="geocode-status-box loading">
                      <span class="pulse-dot"></span>
                      <span>Auto-fetching coordinates from Google Maps...</span>
                    </div>
                  ` : ''}

                  ${this.geocodeStatus === 'success' && this.geocodeSuccessMsg ? html`
                    <div class="geocode-status-box success">
                      <span class="status-icon">✓</span>
                      <span>${this.geocodeSuccessMsg}</span>
                    </div>
                  ` : ''}

                  ${this.geocodeStatus === 'error' && this.geocodeError ? html`
                    <div class="geocode-status-box error">
                      <span class="status-icon">⚠️</span>
                      <span>${this.geocodeError}</span>
                    </div>
                  ` : ''}
                </div>

                <div class="form-row-2">
                  <div class="form-group ${this.justAutoUpdatedCoords ? 'coords-updated-pulse' : ''}">
                    <div class="coords-label-row">
                      <label>Latitude Coordinates</label>
                      ${this.justAutoUpdatedCoords ? html`<span class="auto-sync-tag">Auto-synced</span>` : ''}
                    </div>
                    <input type="number" step="any" required .value=${this.formLat} @input=${(e: any) => this.formLat = parseFloat(e.target.value)} />
                  </div>
                  <div class="form-group ${this.justAutoUpdatedCoords ? 'coords-updated-pulse' : ''}">
                    <div class="coords-label-row">
                      <label>Longitude Coordinates</label>
                      ${this.justAutoUpdatedCoords ? html`<span class="auto-sync-tag">Auto-synced</span>` : ''}
                    </div>
                    <input type="number" step="any" required .value=${this.formLng} @input=${(e: any) => this.formLng = parseFloat(e.target.value)} />
                  </div>
                </div>

                <div class="form-row-3">
                  <div class="form-group">
                    <label>Price ($)</label>
                    <input type="number" required .value=${this.formPrice} @input=${(e: any) => this.formPrice = parseInt(e.target.value)} />
                  </div>
                  <div class="form-group">
                    <label>Price Type</label>
                    <select .value=${this.formPriceType} @change=${(e: any) => this.formPriceType = e.target.value}>
                      <option value="sale">For Sale</option>
                      <option value="rent">For Rent</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Status</label>
                    <select .value=${this.formStatus} @change=${(e: any) => this.formStatus = e.target.value}>
                      <option value="For Sale">For Sale</option>
                      <option value="For Rent">For Rent</option>
                      <option value="Pending">Pending</option>
                      <option value="Sold">Sold</option>
                    </select>
                  </div>
                </div>

                <div class="form-row-4">
                  <div class="form-group">
                    <label>Type</label>
                    <select .value=${this.formPropertyType} @change=${(e: any) => this.formPropertyType = e.target.value}>
                      <option value="Single Family">Single Family</option>
                      <option value="Condo">Condo</option>
                      <option value="Townhouse">Townhouse</option>
                      <option value="Penthouse">Penthouse</option>
                      <option value="Multi-Family">Multi-Family</option>
                      <option value="Estate">Estate</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Bedrooms</label>
                    <input type="number" required .value=${this.formBedrooms} @input=${(e: any) => this.formBedrooms = parseInt(e.target.value)} />
                  </div>
                  <div class="form-group">
                    <label>Bathrooms</label>
                    <input type="number" step="0.5" required .value=${this.formBathrooms} @input=${(e: any) => this.formBathrooms = parseFloat(e.target.value)} />
                  </div>
                  <div class="form-group">
                    <label>SqFt</label>
                    <input type="number" required .value=${this.formSqft} @input=${(e: any) => this.formSqft = parseInt(e.target.value)} />
                  </div>
                  <div class="form-group">
                    <label>Next Availability / Last Used</label>
                    <input type="date" .value=${this.formNextAvailability} @input=${(e: any) => this.formNextAvailability = e.target.value} />
                  </div>
                  <div class="form-group">
                    <label>Landlord Name</label>
                    <input type="text" .value=${this.formLandlordName} @input=${(e: any) => this.formLandlordName = e.target.value} placeholder="e.g. John Doe" />
                  </div>
                  <div class="form-group">
                    <label>Landlord Phone</label>
                    <input type="tel" .value=${this.formLandlordPhone} @input=${(e: any) => this.formLandlordPhone = e.target.value} placeholder="e.g. 555-123-4567" />
                  </div>
                  <div class="form-group">
                    <label>Landlord Email</label>
                    <input type="email" .value=${this.formLandlordEmail} @input=${(e: any) => this.formLandlordEmail = e.target.value} placeholder="e.g. john@example.com" />
                  </div>
                </div>

                <div class="form-group">
                  <label>Description (Public Listing Text)</label>
                  <textarea rows="3" .value=${this.formDescription} @input=${(e: any) => this.formDescription = e.target.value} placeholder="Detailed property narrative..."></textarea>
                </div>

                <div class="form-group">
                  <label>📝 Internal Notes (Private Qualitative Comments & Screening)</label>
                  <textarea rows="3" .value=${this.formInternalNotes} @input=${(e: any) => this.formInternalNotes = e.target.value} placeholder="Private qualitative comments, tenant screening observations, tour logs, or HOA condition notes... (Supports **bold**, • bullets, and > quotes)"></textarea>
                </div>

                <div class="form-group">
                  <label>Photo Image URLs (one URL per line)</label>
                  <textarea rows="2" .value=${this.formPhotosText} @input=${(e: any) => this.formPhotosText = e.target.value}></textarea>
                </div>

                <div class="form-group">
                  <label>Amenities / Tags (comma separated)</label>
                  <input type="text" .value=${this.formAmenitiesText} @input=${(e: any) => this.formAmenitiesText = e.target.value} placeholder="Rooftop Deck, Private Elevator, EV Garage" />
                </div>

                <!-- Custom Fields Builder -->
                <div class="form-group">
                  <div class="custom-fields-builder-header">
                    <label>Custom Database Attributes (Our Own Key-Values)</label>
                    <button type="button" class="add-field-row-btn" @click=${this.addCustomFieldRow}>+ Add Attribute</button>
                  </div>
                  ${this.formCustomFields.map((field, idx) => html`
                    <div class="field-row-inputs">
                      <input type="text" placeholder="Key (e.g. HOA Fee)" .value=${field.key} @input=${(e: any) => {
                        this.formCustomFields[idx].key = e.target.value;
                      }} />
                      <input type="text" placeholder="Value (e.g. $450/mo)" .value=${field.value} @input=${(e: any) => {
                        this.formCustomFields[idx].value = e.target.value;
                      }} />
                      <button type="button" class="remove-row-btn" @click=${() => this.removeCustomFieldRow(idx)}>✕</button>
                    </div>
                  `)}
                </div>

                <div class="db-modal-footer">
                  <button type="button" class="cancel-btn" @click=${() => this.isAddEditModalOpen = false}>Cancel</button>
                  <button type="submit" class="save-btn">Save Property Record</button>
                </div>
              </form>

            </div>
          </div>
        ` : ''}

        <!-- BATCH ADDRESS PARSER MODAL -->
        ${this.isBatchModalOpen ? html`
          <div class="db-modal-overlay" @click=${() => this.isBatchModalOpen = false}>
            <div class="db-modal-content batch-modal-wide" @click=${(e: Event) => e.stopPropagation()}>
              <div class="db-modal-header">
                <div class="batch-header-title-group">
                  <h3>⚡ Batch Address Parser & Waypoint Importer</h3>
                  <p class="batch-header-subtitle">Paste multiple property addresses or listings at once to auto-geocode and add them to your map database.</p>
                </div>
                <button class="close-modal-btn" @click=${() => this.isBatchModalOpen = false}>✕</button>
              </div>

              <div class="batch-modal-body">
                
                <!-- Quick Preset Buttons -->
                <div class="batch-presets-bar">
                  <span class="presets-label">📋 Sample Presets:</span>
                  <button type="button" class="preset-chip-btn" @click=${() => this.applyPreset('sf')}>
                    🏛️ SF Landmarks (4)
                  </button>
                  <button type="button" class="preset-chip-btn" @click=${() => this.applyPreset('silicon_valley')}>
                    🌲 Silicon Valley (3)
                  </button>
                  <button type="button" class="preset-chip-btn" @click=${() => this.applyPreset('rentals')}>
                    🏢 SF Rentals (3)
                  </button>
                  <button type="button" class="preset-chip-btn clear" @click=${this.clearBatchText} title="Clear text">
                    🗑️ Clear
                  </button>
                </div>

                <!-- Step 1: Textarea Address Input Area -->
                <div class="batch-input-section">
                  <div class="batch-input-header">
                    <label for="batch-addresses-textarea">
                      <strong>Multi-Address Text Input</strong>
                      <span class="batch-format-hint">(One address per line, or optionally pipe-separated: <code>Address | Title | Price | Specs | Type</code>)</span>
                    </label>
                    <span class="batch-counter-badge">${this.batchCandidates.length} ${this.batchCandidates.length === 1 ? 'address' : 'addresses'} detected</span>
                  </div>
                  
                  <textarea
                    id="batch-addresses-textarea"
                    class="batch-addresses-input"
                    rows="5"
                    placeholder="Enter or paste addresses, one per line...&#10;e.g.&#10;500 Howard St, San Francisco, CA 94105&#10;2200 Pacific Ave, San Francisco, CA 94115 | Pacific Penthouse | $4,850,000 | 4 bed, 4 bath | Penthouse&#10;850 Steiner St, San Francisco, CA 94117"
                    .value=${this.batchAddressText}
                    @input=${(e: any) => this.handleBatchInput(e.target.value)}
                  ></textarea>
                </div>

                <!-- Batch Fallback Defaults Toolbar -->
                <div class="batch-defaults-panel">
                  <div class="defaults-title">⚙️ Default Attributes (Applied when not specified in line):</div>
                  <div class="defaults-grid">
                    <div class="default-item">
                      <label>Default Status</label>
                      <select .value=${this.batchDefaultStatus} @change=${(e: any) => {
                        this.batchDefaultStatus = e.target.value;
                        this.batchCandidates = this.parseBatchAddressLines(this.batchAddressText);
                      }}>
                        <option value="For Sale">For Sale</option>
                        <option value="For Rent">For Rent</option>
                        <option value="Pending">Pending</option>
                        <option value="Sold">Sold</option>
                      </select>
                    </div>

                    <div class="default-item">
                      <label>Default Type</label>
                      <select .value=${this.batchDefaultType} @change=${(e: any) => {
                        this.batchDefaultType = e.target.value;
                        this.batchCandidates = this.parseBatchAddressLines(this.batchAddressText);
                      }}>
                        <option value="Single Family">Single Family</option>
                        <option value="Condo">Condo</option>
                        <option value="Townhouse">Townhouse</option>
                        <option value="Penthouse">Penthouse</option>
                        <option value="Multi-Family">Multi-Family</option>
                        <option value="Estate">Estate</option>
                      </select>
                    </div>

                    <div class="default-item">
                      <label>Default Price ($)</label>
                      <input type="number" .value=${this.batchDefaultPrice} @input=${(e: any) => {
                        this.batchDefaultPrice = parseInt(e.target.value) || 1000000;
                        this.batchCandidates = this.parseBatchAddressLines(this.batchAddressText);
                      }} />
                    </div>

                    <div class="default-item">
                      <label>Default Beds / Baths</label>
                      <div class="beds-baths-mini-row">
                        <input type="number" title="Beds" style="width: 50%" .value=${this.batchDefaultBedrooms} @input=${(e: any) => {
                          this.batchDefaultBedrooms = parseInt(e.target.value) || 3;
                          this.batchCandidates = this.parseBatchAddressLines(this.batchAddressText);
                        }} />
                        <input type="number" title="Baths" step="0.5" style="width: 50%" .value=${this.batchDefaultBathrooms} @input=${(e: any) => {
                          this.batchDefaultBathrooms = parseFloat(e.target.value) || 2;
                          this.batchCandidates = this.parseBatchAddressLines(this.batchAddressText);
                        }} />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Step 2: Parsed Candidates Preview & Batch Geocoding Bar -->
                <div class="batch-preview-section">
                  <div class="batch-preview-header">
                    <div class="preview-stats-group">
                      <span class="preview-heading">Parsed Address Candidates (${this.batchCandidates.length})</span>
                      <span class="stat-tag success">✓ ${this.batchCandidates.filter(c => c.geocodeStatus === 'success').length} Geocoded</span>
                      ${this.batchCandidates.some(c => c.geocodeStatus !== 'success') ? html`
                        <span class="stat-tag pending">⏳ ${this.batchCandidates.filter(c => c.geocodeStatus !== 'success').length} Pending</span>
                      ` : ''}
                    </div>

                    <div class="preview-actions-group">
                      <button
                        type="button"
                        class="geocode-all-btn ${this.isBatchGeocoding ? 'loading' : ''}"
                        @click=${this.runBatchGeocode}
                        ?disabled=${this.isBatchGeocoding || this.batchCandidates.length === 0}
                        title="Fetch exact coordinates for all addresses via Google Maps Geocoder"
                      >
                        ${this.isBatchGeocoding
                          ? html`<span class="btn-spinner"></span> Geocoding (${this.batchGeocodeProgress.current}/${this.batchGeocodeProgress.total})...`
                          : html`📍 Geocode All (${this.batchCandidates.filter(c => c.geocodeStatus !== 'success').length} pending)`
                        }
                      </button>
                    </div>
                  </div>

                  <!-- Active Batch Geocode Progress Bar -->
                  ${this.isBatchGeocoding ? html`
                    <div class="batch-progress-container">
                      <div
                        class="batch-progress-bar"
                        style="width: ${this.batchGeocodeProgress.total > 0 ? (this.batchGeocodeProgress.current / this.batchGeocodeProgress.total) * 100 : 0}%"
                      ></div>
                    </div>
                  ` : ''}

                  <!-- Candidate Rows List -->
                  ${this.batchCandidates.length > 0 ? html`
                    <div class="batch-candidates-list">
                      ${this.batchCandidates.map((cand, idx) => html`
                        <div class="batch-candidate-row ${cand.geocodeStatus}">
                          <div class="cand-col-index">${idx + 1}</div>

                          <div class="cand-col-main">
                            <div class="cand-primary-line">
                              <input
                                type="text"
                                class="cand-address-input"
                                .value=${cand.address}
                                placeholder="Street Address"
                                @input=${(e: any) => this.updateCandidateField(idx, 'address', e.target.value)}
                              />

                              <!-- Geocode Status Pill -->
                              <div class="cand-geocode-badge ${cand.geocodeStatus}">
                                ${cand.geocodeStatus === 'success' ? html`
                                  <span title="Geocoded: ${cand.lat}, ${cand.lng}">✓ ${cand.lat.toFixed(4)}, ${cand.lng.toFixed(4)}</span>
                                ` : cand.geocodeStatus === 'loading' ? html`
                                  <span class="btn-spinner"></span> Geocoding...
                                ` : cand.geocodeStatus === 'failed' ? html`
                                  <span title="${cand.geocodeError || 'Failed to geocode'}">⚠️ Estimated (${cand.lat.toFixed(3)}, ${cand.lng.toFixed(3)})</span>
                                ` : html`
                                  <span>⏳ Pending geocode</span>
                                `}
                              </div>

                              <button
                                type="button"
                                class="cand-single-geocode-btn"
                                @click=${() => this.geocodeSingleCandidate(idx)}
                                title="Geocode this address individually"
                                ?disabled=${cand.geocodeStatus === 'loading'}
                              >
                                📍
                              </button>
                            </div>

                            <div class="cand-secondary-line">
                              <input
                                type="text"
                                class="cand-title-input"
                                .value=${cand.title}
                                placeholder="Property Title"
                                @input=${(e: any) => this.updateCandidateField(idx, 'title', e.target.value)}
                              />

                              <div class="cand-price-group">
                                <input
                                  type="number"
                                  class="cand-price-input"
                                  .value=${cand.price}
                                  placeholder="Price"
                                  @input=${(e: any) => this.updateCandidateField(idx, 'price', parseInt(e.target.value) || 0)}
                                />
                                <select
                                  class="cand-pricetype-select"
                                  .value=${cand.priceType}
                                  @change=${(e: any) => this.updateCandidateField(idx, 'priceType', e.target.value)}
                                >
                                  <option value="sale">Sale</option>
                                  <option value="rent">/mo</option>
                                </select>
                              </div>

                              <select
                                class="cand-type-select"
                                .value=${cand.propertyType}
                                @change=${(e: any) => this.updateCandidateField(idx, 'propertyType', e.target.value)}
                              >
                                <option value="Single Family">Single Family</option>
                                <option value="Condo">Condo</option>
                                <option value="Townhouse">Townhouse</option>
                                <option value="Penthouse">Penthouse</option>
                                <option value="Multi-Family">Multi-Family</option>
                                <option value="Estate">Estate</option>
                              </select>

                              <select
                                class="cand-status-select"
                                .value=${cand.status}
                                @change=${(e: any) => this.updateCandidateField(idx, 'status', e.target.value)}
                              >
                                <option value="For Sale">For Sale</option>
                                <option value="For Rent">For Rent</option>
                                <option value="Pending">Pending</option>
                                <option value="Sold">Sold</option>
                              </select>

                              <button
                                type="button"
                                class="cand-remove-btn"
                                @click=${() => this.removeCandidate(idx)}
                                title="Remove candidate"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        </div>
                      `)}
                    </div>
                  ` : html`
                    <div class="batch-empty-preview">
                      <p>No addresses entered yet. Type or paste addresses in the text area above, or choose a sample preset.</p>
                    </div>
                  `}
                </div>

                ${this.batchNotificationMsg ? html`
                  <div class="batch-notification-toast">
                    ${this.batchNotificationMsg}
                  </div>
                ` : ''}

                <!-- Modal Footer Controls -->
                <div class="batch-modal-footer">
                  <label class="batch-autofit-checkbox">
                    <input
                      type="checkbox"
                      .checked=${this.batchAutoFitMap}
                      @change=${(e: any) => this.batchAutoFitMap = e.target.checked}
                    />
                    <span>Auto-fit map view to new waypoints upon adding</span>
                  </label>

                  <div class="batch-footer-buttons">
                    <button type="button" class="cancel-btn" @click=${() => this.isBatchModalOpen = false}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="batch-save-all-btn"
                      @click=${this.handleSaveBatchProperties}
                      ?disabled=${this.batchCandidates.length === 0 || this.isBatchGeocoding}
                    >
                      ✨ Add All ${this.batchCandidates.length} Properties to Database
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        ` : ''}

        <!-- IMPORT / EXPORT MODAL -->
        ${this.importExportModalOpen ? html`
          <div class="db-modal-overlay" @click=${() => this.importExportModalOpen = false}>
            <div class="db-modal-content" @click=${(e: Event) => e.stopPropagation()}>
              <div class="db-modal-header">
                <h3>Connect & Sync Database Records</h3>
                <button class="close-modal-btn" @click=${() => this.importExportModalOpen = false}>✕</button>
              </div>

              <div class="import-export-body">
                <div class="section-title">Export Database</div>
                <div class="export-btns-row">
                  <button class="export-file-btn" @click=${this.handleExportJSON}>
                    📤 Export JSON File
                  </button>
                  <button class="export-file-btn" @click=${this.handleExportCSV}>
                    📊 Export CSV File
                  </button>
                </div>

                <div class="section-title" style="margin-top: 24px;">Import Custom Database Records (JSON)</div>
                <p class="subtext">Paste an array of property JSON objects to import them directly into your map database.</p>
                
                <textarea rows="5" class="import-textarea" placeholder='[{"title":"My Property","address":"123 Main St","lat":37.77,"lng":-122.41,"price":1200000}]' .value=${this.importJsonText} @input=${(e: any) => this.importJsonText = e.target.value}></textarea>

                ${this.importMessage ? html`<div class="import-feedback">${this.importMessage}</div>` : ''}

                <div class="db-modal-footer" style="margin-top: 16px;">
                  <button type="button" class="cancel-btn" @click=${() => this.importExportModalOpen = false}>Close</button>
                  <button type="button" class="save-btn" @click=${this.handleImportJSON}>Import JSON Database</button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Confirmation Toast for Monday.com Sync -->
        ${this.syncToast ? html`
          <div class="monday-sync-confirmation-toast" role="alert" aria-live="polite">
            <div class="toast-body">
              <div class="toast-icon-wrapper">
                ${this.renderMondayLogo()}
                <span class="toast-check-badge">✓</span>
              </div>
              <div class="toast-content-col">
                <div class="toast-title-row">
                  <span class="toast-title">Monday.com Board Sync</span>
                  <span class="toast-count-pill">${this.syncToast.count} ${this.syncToast.count === 1 ? 'Property' : 'Properties'} Synced</span>
                </div>
                <div class="toast-message-text">
                  Successfully synced <strong>${this.syncToast.count} ${this.syncToast.count === 1 ? 'property' : 'properties'}</strong> to Monday.com board <code>#${this.syncToast.boardId}</code>.
                </div>
                ${this.syncToast.propertyTitle ? html`
                  <div class="toast-property-name">Listing: <em>${this.syncToast.propertyTitle}</em></div>
                ` : ''}
              </div>
            </div>
            <div class="toast-actions">
              <a
                href=${this.syncToast.boardUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="toast-view-board-btn"
                title="Open Monday.com workspace board in new tab"
              >
                <span>View Board</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display: inline-block; vertical-align: middle;">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </a>
              <button
                type="button"
                class="toast-close-btn"
                @click=${this.closeSyncToast}
                aria-label="Dismiss toast"
                title="Dismiss notification"
              >
                ✕
              </button>
            </div>
          </div>
        ` : ''}

      </div>
    `;
  }
}
