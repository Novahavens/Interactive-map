// monday.com GraphQL transport for the edge functions.
const MONDAY_API = "https://api.monday.com/v2";

export async function monday<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = Deno.env.get("MONDAY_API_TOKEN");
  if (!token) throw new Error("MONDAY_API_TOKEN secret is not set on this function.");

  const response = await fetch(MONDAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  // monday returns 200 with an errors array. Never trust the status alone.
  if (!response.ok || (Array.isArray(body?.errors) && body.errors.length)) {
    throw new Error(body?.errors?.[0]?.message ?? `monday.com returned ${response.status}`);
  }
  return body.data as T;
}
