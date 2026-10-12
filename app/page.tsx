import MapApp from "@/components/MapApp";

export const dynamic = "force-dynamic";

/**
 * The single page. Monday embeds it as /?claimId=<item id>.
 * Without a claimId the map still works (search box), but "+" is disabled
 * because there is nothing to attach to.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.claimId ?? sp.claim_id ?? sp.itemId;
  const claimId = typeof raw === "string" && /^\d+$/.test(raw) ? raw : null;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

  return <MapApp claimId={claimId} apiKey={apiKey} mapId={mapId} />;
}
