# Outside search

Use when our database is short. Order: Furnished Finder, Zillow rentals, Airbnb and VRBO (monthly stays), then Facebook Marketplace if nothing else.

For each site:
- Search the claim's city and zip, the requested bedrooms or more, dates covering move-in to move-out, pets if the claim has pets.
- Prefer a connector or a structured search (Zillow tool, Firecrawl search) over a browser. Use a browser only to read a page a fetch can't.
- Never message a host from this skill. Outreach is a separate step that a person approves.
- Record: listing_url, title, host name if shown, monthly price (or nightly × 30), bedrooms, bathrooms, distance from the claim's zip, pets allowed (true/false/unknown), availability as shown.
- Skip listings whose title or host reads like a management company (config `sourcing.avoid_keywords`).

Mark every outside home `source` = the site name and `availability` = "unverified" until the landlord confirms.
