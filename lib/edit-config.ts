import "server-only";

/**
 * Listing edits from the map are ON only when MAP_EDIT_SECRET is set (it must equal sync_config 'MAP_EDIT_KEY',
 * which gates the edit RPCs) and MAP_EDITING is not "off". Without the secret the database would refuse every
 * edit anyway, so this also covers code deployed before the migration and its key.
 */
export function editSecret(): string | null {
  const s = process.env.MAP_EDIT_SECRET?.trim();
  return s ? s : null;
}

export function editingEnabled(): boolean {
  return editSecret() !== null && process.env.MAP_EDITING !== "off";
}
