/**
 * Custom Places-like UX/UI Modal Component for Property Waypoints
 */

import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Property, formatCurrency, mondayDB, propertyDB } from './property_db';
import { MondaySyncService } from './monday_sync_service';

interface MondaySyncToastInfo {
  count: number;
  boardUrl: string;
  boardId: string;
  propertyTitle?: string;
}

@customElement('property-place-modal')
export class PropertyPlaceModal extends LitElement {
  @property({ type: Object }) propertyData?: Property;
  @property({ type: Boolean }) open = false;
  @property({ type: String }) activeTab: 'overview' | 'notes' | 'custom_fields' | 'streetview' | 'contact' = 'overview';

  @state() currentPhotoIndex = 0;
  @state() showFullGallery = false;
  @state() inquirySent = false;
  @state() inquiryName = '';
  @state() inquiryEmail = '';
  @state() inquiryMessage = '';
  @state() isSyncingToMonday = false;
  @state() isStreetViewActive = false;
  @state() syncToast: MondaySyncToastInfo | null = null;
  private syncToastTimer: any = null;

  // Rich Text Internal Notes States
  @state() notesContent = '';
  @state() notesSavedStatus: 'saved' | 'unsaved' | 'saving' = 'saved';
  @state() notesViewMode: 'edit' | 'preview' | 'split' = 'edit';
  @state() notesLastSavedAt = '';
  private notesAutoSaveTimer: any = null;
  private currentPropId = '';

  private streetViewPanorama: any = null;

  createRenderRoot() {
    return this; // Render in light DOM to inherit global styling and z-indices
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

  private async handleToggleMonday() {
    if (!this.propertyData) return;
    const isAdded = mondayDB.isAdded(this.propertyData.id);
    if (isAdded) {
      mondayDB.toggleSubItem(this.propertyData);
      this.requestUpdate();
      return;
    }

    this.isSyncingToMonday = true;
    this.requestUpdate();

    const response = await MondaySyncService.syncPropertyToBoard(this.propertyData);
    
    this.isSyncingToMonday = false;
    
    if (response.success) {
      mondayDB.toggleSubItem(this.propertyData);
      const boardUrl = response.boardUrl || MondaySyncService.getBoardUrl();
      const boardId = response.boardId || MondaySyncService.DEFAULT_BOARD_ID;
      this.showSyncToast(response.syncedCount || 1, boardUrl, boardId, this.propertyData.title);
    } else {
      alert(`Failed to sync to Monday.com: ${response.error}`);
    }
    this.requestUpdate();
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('propertyData') && this.propertyData) {
      if (this.currentPropId !== this.propertyData.id) {
        this.currentPropId = this.propertyData.id;
        this.notesContent = this.propertyData.internalNotes || '';
        this.notesSavedStatus = 'saved';
        this.notesLastSavedAt = '';
      }
    }

    if (changedProperties.has('open') && this.open) {
      this.currentPhotoIndex = 0;
      this.inquirySent = false;
      this.isStreetViewActive = false;
      if (this.propertyData) {
        this.notesContent = this.propertyData.internalNotes || '';
        this.notesSavedStatus = 'saved';
      }
    }

    if (changedProperties.has('activeTab') && this.activeTab === 'streetview' && this.open && this.propertyData) {
      setTimeout(() => this.initStreetView(), 100);
    }
  }

  private initStreetView() {
    const container = this.querySelector('#streetview-container');
    if (!container || typeof (window as any).google?.maps?.StreetViewPanorama !== 'function' || !this.propertyData) return;

    try {
      this.streetViewPanorama = new (window as any).google.maps.StreetViewPanorama(container, {
        position: { lat: this.propertyData.lat, lng: this.propertyData.lng },
        pov: { heading: 165, pitch: 0 },
        zoom: 1,
        addressControl: true,
        showRoadLabels: true,
        internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio']
      });
    } catch (_e) {
      console.warn('Failed to load Street View Panorama:', _e);
    }
  }

  private closeModal() {
    // If there are unsaved notes, save them automatically
    if (this.notesSavedStatus === 'unsaved') {
      this.saveNotes(false);
    }
    this.open = false;
    this.dispatchEvent(new CustomEvent('close-modal', { bubbles: true, composed: true }));
  }

  private navigatePhotos(direction: 'prev' | 'next') {
    if (!this.propertyData || !this.propertyData.photos.length) return;
    const total = this.propertyData.photos.length;
    if (direction === 'prev') {
      this.currentPhotoIndex = (this.currentPhotoIndex - 1 + total) % total;
    } else {
      this.currentPhotoIndex = (this.currentPhotoIndex + 1) % total;
    }
  }

  private copyAddress() {
    if (!this.propertyData) return;
    navigator.clipboard.writeText(this.propertyData.address);
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.textContent = '📍 Address copied to clipboard!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  private triggerDirections() {
    if (!this.propertyData) return;
    this.dispatchEvent(new CustomEvent('get-directions', {
      detail: { destination: this.propertyData.address, lat: this.propertyData.lat, lng: this.propertyData.lng },
      bubbles: true,
      composed: true
    }));
    this.closeModal();
  }

  private triggerTravelCalculator() {
    if (!this.propertyData) return;
    this.dispatchEvent(new CustomEvent('open-travel-calculator', {
      detail: { originProperty: this.propertyData },
      bubbles: true,
      composed: true
    }));
    this.closeModal();
  }

  private triggerEdit() {
    if (!this.propertyData) return;
    this.dispatchEvent(new CustomEvent('edit-property', {
      detail: { property: this.propertyData },
      bubbles: true,
      composed: true
    }));
  }

  private handleInquirySubmit(e: Event) {
    e.preventDefault();
    this.inquirySent = true;
  }

  // ==========================================
  // RICH TEXT INTERNAL NOTES METHODS
  // ==========================================

  private handleNotesChange(text: string) {
    this.notesContent = text;
    this.notesSavedStatus = 'unsaved';

    if (this.notesAutoSaveTimer) {
      clearTimeout(this.notesAutoSaveTimer);
    }

    // Debounced auto-save after 1200ms
    this.notesAutoSaveTimer = setTimeout(() => {
      this.saveNotes(false);
    }, 1200);
  }

  public saveNotes(showToast = true) {
    if (!this.propertyData) return;

    this.notesSavedStatus = 'saving';
    propertyDB.saveNotes(this.propertyData.id, this.notesContent);
    this.propertyData = {
      ...this.propertyData,
      internalNotes: this.notesContent
    };

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.notesLastSavedAt = timeStr;
    this.notesSavedStatus = 'saved';

    this.dispatchEvent(new CustomEvent('property-notes-updated', {
      detail: {
        propertyId: this.propertyData.id,
        internalNotes: this.notesContent,
        property: this.propertyData
      },
      bubbles: true,
      composed: true
    }));

    if (showToast) {
      const toast = document.createElement('div');
      toast.className = 'custom-toast';
      toast.textContent = `📝 Qualitative internal notes saved for ${this.propertyData.address.split(',')[0]}!`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    }

    this.requestUpdate();
  }

  private insertFormatting(prefix: string, suffix = '') {
    const textarea = this.querySelector('#internal-notes-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const selected = textarea.value.substring(start, end);
    const replacement = selected ? `${prefix}${selected}${suffix}` : `${prefix}Text${suffix}`;

    const updated = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    textarea.value = updated;
    this.handleNotesChange(updated);

    textarea.focus();
    const cursor = start + prefix.length + (selected ? selected.length : 4);
    textarea.setSelectionRange(cursor, cursor);
  }

  private insertStamp(stamp: string) {
    const textarea = this.querySelector('#internal-notes-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart || textarea.value.length;
    const end = textarea.selectionEnd || textarea.value.length;

    const textToInsert = (start > 0 && !textarea.value.substring(0, start).endsWith('\n') ? '\n' : '') + stamp + '\n';
    const updated = textarea.value.substring(0, start) + textToInsert + textarea.value.substring(end);
    textarea.value = updated;
    this.handleNotesChange(updated);

    textarea.focus();
    const cursor = start + textToInsert.length;
    textarea.setSelectionRange(cursor, cursor);
  }

  private insertTimestamp() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    this.insertStamp(`📅 [${dateStr}, ${timeStr}] - `);
  }

  private copyNotesToClipboard() {
    if (!this.notesContent.trim()) return;
    navigator.clipboard.writeText(this.notesContent);
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.textContent = '📋 Notes copied to clipboard!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  private clearNotes() {
    if (!this.notesContent.trim()) return;
    if (confirm('Are you sure you want to clear all internal notes for this property?')) {
      this.notesContent = '';
      this.saveNotes(true);
    }
  }

  private handleEditorKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      this.saveNotes(true);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      this.insertFormatting('**', '**');
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      this.insertFormatting('*', '*');
    }
  }

  /**
   * Safely render qualitative notes markdown / rich text representation
   */
  private renderParsedNotesHTML(raw: string) {
    if (!raw || !raw.trim()) {
      return html`
        <div class="notes-preview-empty">
          <p>📝 No internal notes written yet for this address.</p>
          <p style="font-size: 11px; margin-top: 4px;">Switch to <strong>Edit Mode</strong> to record qualitative remarks, tour observations, and tenant screening comments.</p>
        </div>
      `;
    }

    // Process markdown and styled tokens line by line
    const lines = raw.split('\n');
    const renderedNodes: any[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        renderedNodes.push(html`<div style="height: 8px;"></div>`);
        return;
      }

      // Check headings
      if (trimmed.startsWith('### ')) {
        renderedNodes.push(html`<h5>${this.parseInlineTokens(trimmed.substring(4))}</h5>`);
        return;
      }
      if (trimmed.startsWith('## ')) {
        renderedNodes.push(html`<h4>${this.parseInlineTokens(trimmed.substring(3))}</h4>`);
        return;
      }
      if (trimmed.startsWith('# ')) {
        renderedNodes.push(html`<h4>${this.parseInlineTokens(trimmed.substring(2))}</h4>`);
        return;
      }

      // Check Blockquote
      if (trimmed.startsWith('>')) {
        const quoteContent = trimmed.replace(/^>\s*/, '');
        renderedNodes.push(html`<blockquote class="notes-quote">${this.parseInlineTokens(quoteContent)}</blockquote>`);
        return;
      }

      // Check Bullet list item
      if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const listContent = trimmed.replace(/^([•\-\*]\s*)/, '');
        renderedNodes.push(html`
          <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; padding-left: 6px;">
            <span style="color: #0c67df; font-weight: 700; font-size: 14px;">•</span>
            <div>${this.parseInlineTokens(listContent)}</div>
          </div>
        `);
        return;
      }

      // Check Numbered list item
      const numMatch = trimmed.match(/^(\d+)[\.\)]\s*(.*)$/);
      if (numMatch) {
        renderedNodes.push(html`
          <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; padding-left: 6px;">
            <span style="color: #0c67df; font-weight: 700; font-size: 11px; min-width: 14px;">${numMatch[1]}.</span>
            <div>${this.parseInlineTokens(numMatch[2])}</div>
          </div>
        `);
        return;
      }

      // Standard paragraph line
      renderedNodes.push(html`<p style="margin-bottom: 6px;">${this.parseInlineTokens(trimmed)}</p>`);
    });

    return html`<div class="notes-rendered-body">${renderedNodes}</div>`;
  }

  /**
   * Parse inline formatting: **bold**, *italic*, <u>underline</u>, <mark>, and [Tag: ...] pills
   */
  private parseInlineTokens(text: string): any {
    // Replace markdown tags with intermediate placeholders
    let formatted = text;

    // Badges / Tags: e.g. [Priority: High] or [Tour Completed] or 📅 [...]
    formatted = formatted.replace(/\[(Priority:[^\]]+)\]/gi, '<span class="notes-tag-badge priority">$1</span>');
    formatted = formatted.replace(/\[(Warning:[^\]]+|Action Item:[^\]]+|Maintenance:[^\]]+)\]/gi, '<span class="notes-tag-badge warning">$1</span>');
    formatted = formatted.replace(/\[(Status:[^\]]+|Screening:[^\]]+|Verified:[^\]]+)\]/gi, '<span class="notes-tag-badge success">$1</span>');
    formatted = formatted.replace(/\[([^\]]+)\]/g, '<span class="notes-tag-badge">$1</span>');

    // Bold: **text**
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic: *text*
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Highlight: ==text== or <mark>text</mark>
    formatted = formatted.replace(/==([^=]+)==/g, '<mark class="notes-mark">$1</mark>');

    // Strikethrough: ~~text~~
    formatted = formatted.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Create a container template
    const template = document.createElement('template');
    template.innerHTML = formatted;
    return html`${template.content}`;
  }

  render() {
    const toastHtml = this.syncToast ? html`
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
    ` : '';

    if (!this.open || !this.propertyData) {
      return toastHtml;
    }

    const prop = this.propertyData;
    const photos = prop.photos && prop.photos.length > 0 ? prop.photos : [
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80'
    ];
    const pricePerSqFt = prop.sqft ? Math.round(prop.price / prop.sqft) : null;

    const statusBg = prop.status === 'Available' ? '#10b981' :
                     prop.status === 'For Rent' ? '#3b82f6' :
                     prop.status === 'Pending' ? '#f59e0b' : '#6b7280';

    const wordCount = this.notesContent.trim() ? this.notesContent.trim().split(/\s+/).length : 0;
    const charCount = this.notesContent.length;
    const hasNotes = !!(prop.internalNotes && prop.internalNotes.trim().length > 0);

    return html`
      ${toastHtml}
      <div class="place-modal-backdrop" @click=${this.closeModal}>
        <div class="place-modal-card" @click=${(e: Event) => e.stopPropagation()}>
          
          <!-- Close Button -->
          <button class="place-modal-close" @click=${this.closeModal} title="Close Place Card">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          <!-- Photo Gallery Banner -->
          <div class="place-gallery">
            <img src=${photos[this.currentPhotoIndex]} alt=${prop.title} class="place-gallery-img" />
            
            ${photos.length > 1 ? html`
              <button class="gallery-nav prev" @click=${() => this.navigatePhotos('prev')}>‹</button>
              <button class="gallery-nav next" @click=${() => this.navigatePhotos('next')}>›</button>
              <div class="gallery-counter">
                📷 ${this.currentPhotoIndex + 1} / ${photos.length}
              </div>
            ` : ''}

            <div class="place-status-tag" style="background-color: ${statusBg}">
              ${prop.status}
            </div>

            <div class="place-type-pill">
              ${prop.propertyType}
            </div>
          </div>

          <!-- Main Header Info -->
          <div class="place-header">
            <div class="place-title-row">
              <h2 class="place-title">${prop.title}</h2>
              <div class="place-price">${formatCurrency(prop.price, prop.priceType)}</div>
            </div>

            <div class="place-address">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <span>${prop.address}</span>
            </div>

            <!-- Quick Actions Toolbar -->
            <div class="place-actions">
              <button
                class="action-btn contact-landlord-btn ${this.activeTab === 'contact' ? 'primary' : ''}"
                @click=${() => this.activeTab = 'contact'}
                style="display: inline-flex; align-items: center; gap: 5px; font-weight: 700; background: ${this.activeTab === 'contact' ? '#2563eb' : '#eff6ff'}; color: ${this.activeTab === 'contact' ? '#ffffff' : '#1d4ed8'}; border: 1.5px solid #93c5fd;"
                title="Contact Landlord & Owner"
              >
                👤 Contact Landlord
              </button>

              ${(() => {
                const isAdded = mondayDB.isAdded(prop.id);
                return html`
                  <button
                    class="action-btn ${isAdded ? 'primary' : ''}"
                    ?disabled=${this.isSyncingToMonday}
                    @click=${this.handleToggleMonday}
                    style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600;"
                    title="Sync property to Monday.com board via API"
                  >
                    <span style="font-weight: 700; font-size: 14px;">${isAdded ? '✓' : '+'}</span>
                    <span>${this.isSyncingToMonday ? 'Syncing...' : (isAdded ? 'Added to Board' : 'Sync to Board')}</span>
                    ${this.renderMondayLogo()}
                  </button>
                `;
              })()}
              
              <!-- Quick Jump to Internal Notes -->
              <button
                class="action-btn ${this.activeTab === 'notes' ? 'primary' : ''}"
                @click=${() => this.activeTab = 'notes'}
                title="View & Edit Qualitative Internal Notes"
                style="display: inline-flex; align-items: center; gap: 5px;"
              >
                📝 Notes ${hasNotes ? html`<span class="notes-tab-badge-dot"></span>` : ''}
              </button>

              <button class="action-btn travel-btn" @click=${this.triggerTravelCalculator} title="Calculate Driving Distance & Travel Time to other properties">
                🚗 Travel Distance
              </button>
              <button class="action-btn primary" @click=${this.triggerDirections}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
                Directions
              </button>
              <button class="action-btn" @click=${this.copyAddress}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy Address
              </button>
              <button class="action-btn" @click=${() => this.activeTab = 'streetview'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
                Street View
              </button>
              <button class="action-btn" @click=${this.triggerEdit}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                Edit Data
              </button>
            </div>

            <!-- Core Specs Matrix -->
            <div class="place-specs-grid">
              <div class="spec-item">
                <span class="spec-label">Bedrooms</span>
                <span class="spec-value">🛏️ ${prop.bedrooms}</span>
              </div>
              <div class="spec-item">
                <span class="spec-label">Bathrooms</span>
                <span class="spec-value">🚿 ${prop.bathrooms}</span>
              </div>
              <div class="spec-item">
                <span class="spec-label">Square Feet</span>
                <span class="spec-value">📐 ${prop.sqft.toLocaleString()}</span>
              </div>
              <div class="spec-item">
                <span class="spec-label">Next Availability / Last Used</span>
                <span class="spec-value">📅 ${prop.nextAvailability}</span>
              </div>
              ${pricePerSqFt ? html`
                <div class="spec-item">
                  <span class="spec-label">$/SqFt</span>
                  <span class="spec-value">💲 $${pricePerSqFt}</span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Places Content Navigation Tabs -->
          <div class="place-tabs">
            <button class="tab-btn ${this.activeTab === 'overview' ? 'active' : ''}" @click=${() => this.activeTab = 'overview'}>
              Overview
            </button>
            <button class="tab-btn ${this.activeTab === 'contact' ? 'active' : ''}" @click=${() => this.activeTab = 'contact'}>
              👤 Contact Landlord
            </button>
            <button class="tab-btn ${this.activeTab === 'notes' ? 'active' : ''}" @click=${() => this.activeTab = 'notes'}>
              📝 Internal Notes ${hasNotes ? html`<span class="notes-tab-badge-dot" title="Has internal comments"></span>` : ''}
            </button>
            <button class="tab-btn ${this.activeTab === 'custom_fields' ? 'active' : ''}" @click=${() => this.activeTab = 'custom_fields'}>
              Custom DB Attributes (${Object.keys(prop.customFields || {}).length})
            </button>
            <button class="tab-btn ${this.activeTab === 'streetview' ? 'active' : ''}" @click=${() => this.activeTab = 'streetview'}>
              Location & Street View
            </button>
          </div>

          <!-- Tab Panels -->
          <div class="place-tab-content">
            
            <!-- OVERVIEW TAB -->
            ${this.activeTab === 'overview' ? html`
              <div class="tab-pane">
                <!-- Landlord Quick Reach Card -->
                <div class="landlord-quick-box" style="margin-bottom: 18px; padding: 14px 16px; border-radius: 8px; border: 1.5px solid #bfdbfe; background: #eff6ff; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                  <div>
                    <div style="font-size: 11px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px;">👤 Landlord & Owner</div>
                    <div style="font-size: 15px; font-weight: 700; color: #1e3a8a; margin-top: 2px;">${prop.landlordName || prop.agent?.name || 'Property Owner / Landlord'}</div>
                    <div style="font-size: 12px; color: #3b82f6; margin-top: 2px;">
                      ${prop.landlordPhone ? html`<span style="margin-right: 12px;">📞 ${prop.landlordPhone}</span>` : ''}
                      ${prop.landlordEmail ? html`<span>✉️ ${prop.landlordEmail}</span>` : ''}
                    </div>
                  </div>
                  <div style="display: flex; gap: 8px;">
                    ${prop.landlordPhone ? html`
                      <a href="tel:${prop.landlordPhone.replace(/[^0-9+]/g, '')}" class="action-btn" style="background: #ffffff; color: #1d4ed8; border: 1px solid #bfdbfe; text-decoration: none; padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                        📞 Call
                      </a>
                    ` : ''}
                    <button class="action-btn primary" @click=${() => this.activeTab = 'contact'} style="padding: 6px 14px; font-size: 12px; font-weight: 600;">
                      👤 Contact Landlord
                    </button>
                  </div>
                </div>

                <div class="section-title">About Property</div>
                <p class="description-text">${prop.description || 'No detailed description provided for this property record.'}</p>

                <!-- Qualitative Internal Notes Snapshot Card in Overview -->
                <div class="notes-summary-card">
                  <div class="notes-summary-header">
                    <div class="notes-summary-title">
                      📝 Qualitative Internal Notes
                      ${this.notesSavedStatus === 'saved' ? html`<span style="font-size: 10px; font-weight: 500; color: #10b981;">(Synced)</span>` : ''}
                    </div>
                    <button class="notes-summary-btn" @click=${() => this.activeTab = 'notes'}>
                      ${hasNotes ? '✏️ Open Full Notes Editor' : '➕ Add Qualitative Notes'}
                    </button>
                  </div>
                  <div class="notes-summary-snippet">
                    ${hasNotes ? this.parseInlineTokens(prop.internalNotes!) : html`
                      <span style="color: var(--color-text2); font-style: italic;">
                        No internal qualitative comments added yet. Click "Add Qualitative Notes" to record tour feedback, screening remarks, or inspection notes.
                      </span>
                    `}
                  </div>
                </div>

                ${prop.amenities && prop.amenities.length > 0 ? html`
                  <div class="section-title" style="margin-top: 18px;">Key Amenities & Features</div>
                  <div class="amenities-tags">
                    ${prop.amenities.map(a => html`<span class="amenity-chip">✨ ${a}</span>`)}
                  </div>
                ` : ''}

                <div class="section-title" style="margin-top: 20px;">Waypoint Geolocation</div>
                <div class="geo-info-box">
                  <div><strong>Latitude:</strong> ${prop.lat.toFixed(6)}</div>
                  <div><strong>Longitude:</strong> ${prop.lng.toFixed(6)}</div>
                  <div><strong>Database Record ID:</strong> <code>${prop.id}</code></div>
                </div>
              </div>
            ` : ''}

            <!-- INTERNAL NOTES RICH TEXT TAB -->
            ${this.activeTab === 'notes' ? html`
              <div class="tab-pane notes-tab-container">
                
                <!-- Notes Header & Mode Bar -->
                <div class="notes-header-bar">
                  <div class="notes-header-left">
                    <div class="notes-header-title">
                      <span>📝 Qualitative Internal Notes</span>
                      <div class="notes-status-indicator">
                        <span class="notes-status-dot ${this.notesSavedStatus}"></span>
                        <span>
                          ${this.notesSavedStatus === 'saved' ? (this.notesLastSavedAt ? `Saved at ${this.notesLastSavedAt}` : 'Saved to database') :
                            this.notesSavedStatus === 'saving' ? 'Saving...' : 'Unsaved changes (auto-saving)'}
                        </span>
                      </div>
                    </div>
                    <div class="notes-header-subtext">
                      Private qualitative comments, tour observations, tenant screening feedback, and maintenance logs for this address.
                    </div>
                  </div>

                  <!-- View Mode Switcher -->
                  <div class="notes-view-mode-group">
                    <button
                      class="notes-mode-btn ${this.notesViewMode === 'edit' ? 'active' : ''}"
                      @click=${() => this.notesViewMode = 'edit'}
                      title="Edit qualitative notes"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      class="notes-mode-btn ${this.notesViewMode === 'split' ? 'active' : ''}"
                      @click=${() => this.notesViewMode = 'split'}
                      title="Side-by-side edit & preview"
                    >
                      🔀 Split View
                    </button>
                    <button
                      class="notes-mode-btn ${this.notesViewMode === 'preview' ? 'active' : ''}"
                      @click=${() => this.notesViewMode = 'preview'}
                      title="Formatted rendered preview"
                    >
                      👁️ Preview
                    </button>
                  </div>
                </div>

                <!-- Rich Text Formatting Toolbar (Visible in Edit & Split modes) -->
                ${this.notesViewMode !== 'preview' ? html`
                  <div class="notes-rich-toolbar">
                    <div class="toolbar-btn-group">
                      <button type="button" class="rich-tool-btn" @click=${() => this.insertFormatting('**', '**')} title="Bold (**Ctrl+B**)">
                        <strong>B</strong>
                      </button>
                      <button type="button" class="rich-tool-btn" @click=${() => this.insertFormatting('*', '*')} title="Italic (*Ctrl+I*)">
                        <em>I</em>
                      </button>
                      <button type="button" class="rich-tool-btn" @click=${() => this.insertFormatting('<u>', '</u>')} title="Underline">
                        <u>U</u>
                      </button>
                      <button type="button" class="rich-tool-btn" @click=${() => this.insertFormatting('~~', '~~')} title="Strikethrough">
                        <del>S</del>
                      </button>
                      <button type="button" class="rich-tool-btn" @click=${() => this.insertFormatting('==', '==')} title="Highlight Text">
                        <mark style="padding: 0 2px; border-radius: 2px;">H</mark>
                      </button>
                    </div>

                    <div class="toolbar-divider"></div>

                    <div class="toolbar-btn-group">
                      <button type="button" class="rich-tool-btn" @click=${() => this.insertFormatting('### ', '')} title="Section Heading (### )">
                        H3
                      </button>
                      <button type="button" class="rich-tool-btn" @click=${() => this.insertFormatting('• ', '')} title="Bullet Point (• )">
                        • List
                      </button>
                      <button type="button" class="rich-tool-btn" @click=${() => this.insertFormatting('1. ', '')} title="Numbered List (1. )">
                        1. List
                      </button>
                      <button type="button" class="rich-tool-btn" @click=${() => this.insertFormatting('> ', '')} title="Callout Quote Block (> )">
                        ❝ Quote
                      </button>
                    </div>

                    <div class="toolbar-divider"></div>

                    <div class="toolbar-btn-group">
                      <button type="button" class="rich-tool-btn" @click=${() => this.insertFormatting('[', ']')} title="Insert Tag Bracket">
                        [Tag]
                      </button>
                      <button type="button" class="rich-tool-btn" @click=${this.insertTimestamp} title="Insert current Date & Timestamp">
                        📅 Timestamp
                      </button>
                    </div>
                  </div>

                  <!-- Quick Qualitative Stamp Badges Bar -->
                  <div class="notes-stamps-bar">
                    <span class="stamps-label">Quick Stamps:</span>
                    <button type="button" class="stamp-chip-btn" @click=${() => this.insertStamp('• **[Status: Tour Completed]** ')}>
                      🏷️ Tour Completed
                    </button>
                    <button type="button" class="stamp-chip-btn" @click=${() => this.insertStamp('• **[Screening: 3x Income Verified]** ')}>
                      📞 Tenant Screened
                    </button>
                    <button type="button" class="stamp-chip-btn" @click=${() => this.insertStamp('• **[Priority: High ROI Prospect]** ')}>
                      ⭐ High Priority
                    </button>
                    <button type="button" class="stamp-chip-btn" @click=${() => this.insertStamp('• **[Status: Price Negotiable]** ')}>
                      💰 Price Negotiable
                    </button>
                    <button type="button" class="stamp-chip-btn" @click=${() => this.insertStamp('> *⚠️ [Maintenance: Follow-up required before lease]* ')}>
                      ⚠️ Maintenance Alert
                    </button>
                  </div>
                ` : ''}

                <!-- Editor Frame -->
                <div class="notes-editor-frame">
                  
                  <!-- EDIT ONLY MODE -->
                  ${this.notesViewMode === 'edit' ? html`
                    <textarea
                      id="internal-notes-textarea"
                      class="notes-textarea-input"
                      rows="10"
                      placeholder="Type private qualitative notes, observations, tenant screening remarks, and condition reports for this address...&#10;&#10;Formatting Tips:&#10;• Use **bold** or *italic* for emphasis&#10;• Use • or 1. for lists&#10;• Use > for callout quotes&#10;• Use [Priority: High] or [Status: Tour Scheduled] for custom badge tags"
                      .value=${this.notesContent}
                      @input=${(e: any) => this.handleNotesChange(e.target.value)}
                      @keydown=${this.handleEditorKeyDown}
                    ></textarea>
                  ` : ''}

                  <!-- SPLIT VIEW MODE -->
                  ${this.notesViewMode === 'split' ? html`
                    <div class="notes-editor-split">
                      <textarea
                        id="internal-notes-textarea"
                        class="notes-textarea-input"
                        placeholder="Write qualitative comments here..."
                        .value=${this.notesContent}
                        @input=${(e: any) => this.handleNotesChange(e.target.value)}
                        @keydown=${this.handleEditorKeyDown}
                      ></textarea>
                      <div class="notes-preview-pane">
                        ${this.renderParsedNotesHTML(this.notesContent)}
                      </div>
                    </div>
                  ` : ''}

                  <!-- PREVIEW ONLY MODE -->
                  ${this.notesViewMode === 'preview' ? html`
                    <div class="notes-preview-pane">
                      ${this.renderParsedNotesHTML(this.notesContent)}
                    </div>
                  ` : ''}

                </div>

                <!-- Footer Bar with Stats and Action Buttons -->
                <div class="notes-footer-bar">
                  <div class="notes-stats-info">
                    <span>${wordCount} words</span>
                    <span>${charCount} characters</span>
                    <span style="color: var(--color-text2); font-size: 10px;">Shortcut: Ctrl+S to save</span>
                  </div>

                  <div class="notes-footer-actions">
                    <button type="button" class="notes-clear-btn" @click=${this.clearNotes} title="Clear all notes">
                      🗑️ Clear
                    </button>
                    <button type="button" class="notes-copy-btn" @click=${this.copyNotesToClipboard} title="Copy notes text to clipboard">
                      📋 Copy Notes
                    </button>
                    <button
                      type="button"
                      class="notes-save-btn"
                      @click=${() => this.saveNotes(true)}
                      ?disabled=${this.notesSavedStatus === 'saving'}
                      title="Save qualitative notes to database"
                    >
                      💾 Save Notes Now
                    </button>
                  </div>
                </div>

              </div>
            ` : ''}

            <!-- CUSTOM DB ATTRIBUTES TAB -->
            ${this.activeTab === 'custom_fields' ? html`
              <div class="tab-pane">
                <div class="section-title">Our Own Database Attributes</div>
                <p class="subtext">Custom key-value metadata stored in your private property database table.</p>

                ${Object.keys(prop.customFields || {}).length > 0 ? html`
                  <div class="custom-fields-table">
                    ${Object.entries(prop.customFields).map(([key, val]) => html`
                      <div class="custom-field-row">
                        <span class="field-key">${key}</span>
                        <span class="field-val">${val}</span>
                      </div>
                    `)}
                  </div>
                ` : html`
                  <div class="empty-custom-fields">
                    No custom key-value fields defined yet. Click "Edit Data" above to add custom attributes (e.g. HOA Fee, Tax ID, MLS Number).
                  </div>
                `}
              </div>
            ` : ''}

            <!-- STREET VIEW TAB -->
            ${this.activeTab === 'streetview' ? html`
              <div class="tab-pane">
                <div class="section-title">Interactive Street View & Location</div>
                <div id="streetview-container" class="streetview-box">
                  <div class="streetview-placeholder">
                    Loading Google Street View Panorama for ${prop.address}...
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- CONTACT LANDLORD TAB -->
            ${this.activeTab === 'contact' ? html`
              <div class="tab-pane">
                <!-- Direct Landlord Profile & Quick Action Box -->
                <div class="agent-card landlord-card" style="border: 2px solid #93c5fd; background: #f0f7ff; padding: 18px; border-radius: 10px; margin-bottom: 20px;">
                  <div class="agent-details" style="width: 100%;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <div class="agent-name" style="color: #1e3a8a; font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                        <span>👤</span> ${prop.landlordName || 'Property Landlord / Owner'}
                      </div>
                      <span style="font-size: 11px; font-weight: 700; background: #dbeafe; color: #1d4ed8; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
                        Verified Landlord
                      </span>
                    </div>
                    <div style="font-size: 13px; color: #475569; margin-bottom: 12px; line-height: 1.4;">
                      Direct contact for owner lease approval, special requests, tenant screening questions, and viewing confirmations.
                    </div>
                    ${prop.landlordPhone ? html`
                      <div class="agent-contact-line" style="font-size: 14px; margin-bottom: 4px; color: #1e293b;">
                        📞 <strong>Direct Phone:</strong> <a href="tel:${prop.landlordPhone.replace(/[^0-9+]/g, '')}" style="color: #2563eb; text-decoration: underline; margin-left: 4px;">${prop.landlordPhone}</a>
                      </div>
                    ` : ''}
                    ${prop.landlordEmail ? html`
                      <div class="agent-contact-line" style="font-size: 14px; margin-bottom: 4px; color: #1e293b;">
                        ✉️ <strong>Direct Email:</strong> <a href="mailto:${prop.landlordEmail}?subject=Rental inquiry for ${encodeURIComponent(prop.title)}" style="color: #2563eb; text-decoration: underline; margin-left: 4px;">${prop.landlordEmail}</a>
                      </div>
                    ` : ''}
                    
                    <div class="landlord-actions" style="margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap;">
                      ${prop.landlordPhone ? html`
                        <a href="tel:${prop.landlordPhone.replace(/[^0-9+]/g, '')}" class="action-btn primary" style="text-decoration: none; display: inline-flex; justify-content: center; align-items: center; gap: 6px; padding: 9px 18px; border-radius: 6px; font-weight: 700; background: #2563eb; color: #ffffff; box-shadow: 0 1px 3px rgba(37,99,235,0.2);">
                          📞 Call Landlord Now
                        </a>
                      ` : ''}
                      ${prop.landlordEmail ? html`
                        <a href="mailto:${prop.landlordEmail}?subject=Rental inquiry for ${encodeURIComponent(prop.title)}&body=Hello ${prop.landlordName || 'Landlord'},%0D%0A%0D%0AI am interested in ${encodeURIComponent(prop.address)} and would like to inquire regarding availability and leasing terms.%0D%0A%0D%0AThank you!" class="action-btn secondary" style="text-decoration: none; display: inline-flex; justify-content: center; align-items: center; gap: 6px; padding: 9px 18px; border-radius: 6px; font-weight: 700; background: #ffffff; color: #1e293b; border: 1.5px solid #cbd5e1;">
                          ✉️ Compose Direct Email
                        </a>
                      ` : ''}
                    </div>
                  </div>
                </div>

                <!-- Listing Agent / Manager Reference -->
                <div class="section-title" style="font-size: 14px; margin-bottom: 8px;">Listing Representative & Management</div>
                <div class="agent-card" style="margin-bottom: 20px;">
                  <img src=${prop.agent?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'} alt=${prop.agent?.name} class="agent-avatar" />
                  <div class="agent-details">
                    <div class="agent-name">${prop.agent?.name || 'Property Representative'} (Listing Agent)</div>
                    <div class="agent-company">${prop.agent?.company || 'Nova Havens Management'}</div>
                    <div class="agent-contact-line">📞 ${prop.agent?.phone || '(555) 123-4567'}</div>
                    <div class="agent-contact-line">✉️ ${prop.agent?.email || 'contact@novahavens.com'}</div>
                  </div>
                </div>

                ${this.inquirySent ? html`
                  <div class="inquiry-success-box">
                    ✅ Thank you! Your message for <strong>${prop.title}</strong> has been transmitted directly to ${prop.landlordName || 'the landlord'} and the property management team.
                  </div>
                ` : html`
                  <form class="inquiry-form" @submit=${this.handleInquirySubmit}>
                    <div class="section-title" style="margin-top: 8px;">Send Instant Inquiry Message</div>
                    <div class="form-row">
                      <input type="text" placeholder="Your Full Name" required .value=${this.inquiryName} @input=${(e: any) => this.inquiryName = e.target.value} />
                      <input type="email" placeholder="Your Email Address" required .value=${this.inquiryEmail} @input=${(e: any) => this.inquiryEmail = e.target.value} />
                    </div>
                    <textarea rows="3" placeholder="Hello ${prop.landlordName || 'Landlord'}, I am interested in scheduling a private tour or receiving application information for ${prop.address}." required .value=${this.inquiryMessage} @input=${(e: any) => this.inquiryMessage = e.target.value}></textarea>
                    <button type="submit" class="submit-inquiry-btn" style="font-weight: 700; padding: 10px 20px;">👤 Send Message to Landlord</button>
                  </form>
                `}
              </div>
            ` : ''}

          </div>

        </div>
      </div>
    `;
  }
}
