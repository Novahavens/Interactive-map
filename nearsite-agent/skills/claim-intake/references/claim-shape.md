# Claim shape

| Field | Notes |
|---|---|
| source | nearsite, website or email |
| nearsite_claim_id | Nearsite request number |
| company | e.g. Example Insurance Services, CRS |
| claim_ref | adjuster's claim number (email claims). Never shown to a landlord. |
| adjuster_email, adjuster_first_name | email claims only |
| title | listing title |
| beds, baths | requested |
| budget_monthly | Nearsite per-day × 30 |
| max_rate | budget × 0.84 (what we may quote after fees) |
| frv | email claims: fair rental value per month |
| city, state, zip | of the damaged home; the street address stays private |
| move_in, move_out | ISO dates |
| adults / guests | number of adults (application fee is per adult) |
| children | |
| pets, pet_details | count, breed, weight |
| notes | the original free text, kept whole |
| platform_fee_pct, referral_fee_rate, referral_fee_type | Nearsite fees (6% and usually 10%) |
| expires_at | Nearsite closes the request |
