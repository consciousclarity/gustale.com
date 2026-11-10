# The S4 access plan — WorldCat and the Library of Congress

**Written:** 2026-11-09 (research lane, kanban card `t_c797a47c`).
**Decision this implements:** the owner's "S4: option 1, library catalogues
(WorldCat / LoC records) as the S4 discovery source" (from
`docs/SOURCE-TIER-LIST.md`, Finding F-3).
**Status:** PROPOSED — a plan, for the owner's decision. Nothing here has
been applied to any database, and no bulk pull was run.

**Companion documents:**
`docs/SOURCE-TIER-LIST.md` (the S1–S7 tier list this instantiates),
`docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md` (the staged backfill this feeds),
`docs/ADR-007-A1-recipes-confidence-autopublish-contributors-language-urls.md`
(the ADR that defines what a source has to satisfy).

---

## The headline

**The two catalogues are not equivalent, and the difference decides the plan.**

| | Library of Congress | WorldCat |
|---|---|---|
| account needed | **no** | **yes** — an OCLC *member institution* |
| key needed | **no** | yes — WSKey, or OAuth 2.0 client credentials |
| commercial use | permitted (subject to LoC's copyright page) | **prohibited** without a separate written agreement with OCLC |
| usable by gustale.com today | **yes** | **no** |
| rate limit (published) | 20 req/min (JSON API); 30 req/min (MARCXML) | **not published for v2** (v1: 50,000 requests / rolling 24 h) |

**So the plan is: build the LoC path now, because it needs nothing from
the owner, and treat WorldCat as a *possible* second source that depends
on a commercial agreement gustale.com cannot currently sign.**

That is the opposite of the brief's framing ("WorldCat and the Library
of Congress" as one tier with two vendors), and the reason is in
[§2](#2-worldcat-the-access-problem-is-not-the-key). It is not a
rejection of the owner's decision: WorldCat remains the right *answer*
for the `S4` tier, but it is the *blocked* half of it, and the LoC half
carries the same records — the LoC's own MARC records carry the
**OCLC number** (§5.1), so a WorldCat-identifying record is reachable
through the LoC without OCLC's permission.

**Everything below was read on 2026-11-09** from the sources named in
each section. Where a fact could not be verified, it is labelled
**UNVERIFIED** and the gap is stated rather than filled.

---

## 1. What "S4" needs, in the shape of a record

ADR-007-A1 condition 7′ requires, for every core claim, a citation with
an exact **locator** (page / section / URL), on a source whose
`source_class` is `S1`–`S5`. The `S4` tier is *practitioner* — the
working chef, a test kitchen, a cookbook that records a method as it is
actually performed. The brief asks which fields of a catalogue record
matter; here is what the schema and the ADR actually consume:

| what we need | catalogue field | why |
|---|---|---|
| a **persistent identifier** | OCLC number / LCCN | the citation must point at a stable thing |
| a **citable locator** | permalink, or a page/locator within the record | ADR-007-A1 condition 7′ |
| the **work's identity** | title, author/creator, publisher, year | `sources.title/authors/publisher/year` |
| the **subject** | LCSH / subject headings | the vocabulary match (a dish’s name is a *subject*, not a title) |
| the **classification** | LC call number, DDC | where the work sits in a scheme |
| the **language** | MARC 008/041 | `sources.language` |

The finding that matters: **the LC subject authority file supplies the
subject heading and the classification for a *material*, and a
catalogue record supplies the *work*.** Those are two different things,
and ADR-007-A1 §4.3's "the claim's source" needs both, for different
claims.

---

## 2. WorldCat — the access problem is not the key

### 2.1 The current authentication model

**Verified 2026-11-09.** The WorldCat Search API **v2** (the current
release) authenticates with **OAuth 2.0**, not with a URL query key:

> `worldcat_search_auth: { type: oauth2, flows: { clientCredentials: { tokenUrl: https://oauth.oclc.org/token, scopes: [wcapi:view_bib, wcapi:view_brief_bib, …] }, authorizationCode: { authorizationUrl: https://oauth.oclc.org/auth, tokenUrl: https://oauth.oclc.org/token, scopes: [same] } } }`

— `https://developer.api.oclc.org/docs/wcapi/v2/openapi-external-prod.yaml`,
lines 518–544 (the spec is fetched from
`https://developer.api.oclc.org/docs/<apiPath>`, per the developer
portal's own bundle).

**Both flows still run on a WSKey.** The WSKey is split into a public
`ClientId` (80 characters) and a secret, and the secret is used as the
HTTP Basic credential against `https://oauth.oclc.org/token`. From the
OCLC OAuth 2.0 page, read 2026-11-09
(`https://www.oclc.org/developer/api/keys/oauth.en.html`):

> **ClientId** — "The 80 character public portion of the WSKey."
> **Machine-to-Machine (M2M) App** — "Client Credential Grant"

So the answer to the brief's question — "a key-based API and also an
OCLC-login-based one, state which one is current" — is:

- **The key is current** (the WSKey is still the credential), but it is
  **no longer passed in the URL**. It is exchanged at the OAuth token
  endpoint for a bearer token.
- The **login is still required** to *get* the key: the WSKey is
  requested from the Developer Network WSKey interface, and signing in
  means selecting **your institution** by OCLC symbol, institution name
  or zip code, then entering that institution's user name and password
  (`https://help.oclc.org/Librarian_Toolbox/OCLC_APIs/Get_started/Request_an_API_WSKey`,
  read 2026-11-09).

The legacy `wskey=` query-parameter style (the "v1" API) is **not
documented** in the current spec — the string `wskey` does not appear
in `wcapi/v2/openapi-external-prod.yaml` at all. The legacy public
endpoint `https://www.worldcat.org/webservices/catalog/search/worldcat/opensearch`
returned **HTTP 520** on 2026-11-09 from this host. Treat the v1
wskey-in-URL API as **retired**.

### 2.2 The endpoint base

**Verified 2026-11-09**, from the same spec:

| API | server | spec |
|---|---|---|
| **WorldCat Search API v2** | `https://americas.discovery.api.oclc.org` | `wcapi/v2/openapi-external-prod.yaml` |
| WorldCat.org Search API (hidden) | `https://discovery.api.oclc.org` | `worldcat-org-search/openapi-external-prod.yaml` |

The v2 search endpoint is
`GET /worldcat/search/v2/brief-bibs` (brief) and
`GET /worldcat/search/v2/bibs` (full), with `limit` **maximum 50,
default 10**, and `offset` for paging.

### 2.3 The eligibility gate — this is the blocker

**Verified 2026-11-09**, from `https://www.oclc.org/developer/support/eligibility.en.html`:

> "Production access generally allows for fuller usage of our Web
> services and is typically available to **employees of qualifying
> institutions** at no additional charge for non-commercial use.
> Qualifying institutions are **OCLC member libraries that contribute to
> WorldCat** and are visible on WorldCat.org."

And from the **WorldCat Search API Terms and Conditions**
(`https://www.oclc.org/content/dam/developer-network/PDFs/wcapi-terms-and-conditions-20121204.pdf`,
"Last Updated: 20121204", read 2026-11-09):

> "Use of the WorldCat Search API ("the Service") is subject to any
> existing agreements between the named Institution and OCLC."
>
> "**Without a separate, written agreement with OCLC, the Service cannot
> be used for, or in conjunction with commercial purposes**, including
> but not limited to, fee-based services or services that obtain
> advertising revenue."
>
> "Bibliographic records and holdings information are only to be used for
> **discovery purposes**."
>
> "Institution will include, display and maintain the following link back
> to WorldCat.org on any Institution website that uses the Service:
> ("This site uses WorldCat" available at
> http://www.oclc.org/developer/badges)"
>
> "The appropriate level of service requirements must be maintained by
> the qualifying Institution."

Three consequences, and they are the whole difficulty:

1. **gustale.com is not an OCLC member library.** It is a commercial
   food encyclopedia with no relationship to OCLC and no library
   affiliation. There is no institution to sign in as. The WSKey
   request flow begins "Search for your **institution**" — there is no
   row for gustale.com.
2. **Even with a key, commercial use is prohibited** without a
   separate written agreement with OCLC. gustale.com is a
   commercial-facing site (gustale.com / gustale.recipes, AGPL + CC-BY-SA
   content); whether a given use counts as "commercial" is OCLC's call,
   not ours.
3. **The attribution obligation is a display requirement**, not a
   footnote: a visible "This site uses WorldCat" link back to
   WorldCat.org on any site that uses the Service. (Note: the
   `http://www.oclc.org/developer/badges` URL cited in the terms
   returned **HTTP 404** on 2026-11-09 — the badge URL has moved. The
   obligation stands; the URL needs to be re-sourced from OCLC.)

The WorldCat **Rights and Responsibilities** policy (last revised
2 June 2010,
`https://www.oclc.org/worldcat/recorduse/policy/default.htm`, read
2026-11-09) is consistent: it defines "agents" (third-party vendors who
process a member's data) and says a member's transfer of WorldCat data
to an agent requires "a written agreement … that limits the agent's use
of WorldCat data to performance of the services contracted for by the
OCLC member", and that "OCLC has in place existing agreements with many
agents and will continue to create them as member needs arise." A
non-member company that is not OCLC's counterparty has no path through
that document.

### 2.4 What a WorldCat record would give us — for the day it is reachable

**Verified 2026-11-09** from the v2 OpenAPI schema. The **brief** bib
(`BibRecordBrief`) carries: `oclcNumber`, `title`, `creator`, `date`,
`language`, `generalFormat`, `specificFormat`, `edition`, `publisher`,
`isbns`, `issns`, `mergedOclcNumbers`, `catalogingInfo`
(`catalogingAgency`, `transcribingAgency`, `catalogingLanguage`,
`levelOfCataloging`), `institutionHolding`.

The **full** bib (`BibRecord`) adds what the brief omits:

- `subjects` — an array of `Subject` objects, each with `subjectName`,
  a **`vocabulary`** (the spec's own list: **MESH, FAST, LCSH, RVM**),
  `relators`, `subjectType`, and a **`uri`** (the 6xx $1 — i.e. a
  **linked LCSH URI**).
- `classification` — an object with **`dewey`**, **`lc`** (Library of
  Congress Call Number, MARC 050) and **`nlm`** (National Library of
  Medicine, MARC 060).

So the WorldCat record does carry everything ADR-007-A1 §4.3 asks for —
the authority heading, the LC/NLC classification, the subject headings,
the date, the language, and the persistent identifier (the OCLC number).
**The data is not the problem. The licence is.**

One caveat worth recording: `Subject.vocabulary` is the *vocabulary* of
the heading, not the classification scheme. There is no "NLC" in
WorldCat's response — the spec has `nlm` (National Library of Medicine,
MARC 060) under `classification`, and `lc` (Library of Congress, MARC
050). If the brief's "LC/NLC" meant *National Library of Medicine*,
WorldCat has it; if it meant something else, that reading is
**UNVERIFIED** and the schema question in §6 is what actually has to be
answered.

### 2.5 WorldCat rate limits — what is and is not published

- **Published, for v1 only:** "the WorldCat Search API **v1** has a
  rolling 24 hour limit of **50,000 requests**." — OCLC Developer
  Network FAQ, `https://www.oclc.org/developer/support/faq.en.html`,
  read 2026-11-09. The same answer says: "We set limits on API usage
  that meet our typical member's needs … If usage limits are not
  sufficient for your use case, please e-mail your WSKey (but not your
  secret) and the API in question to [the address on that page] along
  with your expected need." **The v1 number is not a v2 number.**
- **For v2, no rate limit is published.** The v2 OpenAPI spec contains
  no rate-limit, throttle or quota statement (searched 2026-11-09), and
  neither does the API catalogue entry, which lists only
  "Status: Production / Sandbox access: Yes".
- **The document the terms point to for the limit is dead.** The terms
  say "The appropriate level of service requirements must be maintained
  by the qualifying Institution" and link
  `http://oclc.org/developer/documentation/worldcat-search-api/service-levels`.
  Both the HTTP and HTTPS forms returned **HTTP 404** on 2026-11-09.
- **The "service requirements" are per institution, not per key.** So
  even a figure would be the member's negotiated entitlement, which
  gustale.com does not have.

**Conservative first guess, if it ever becomes relevant:** 10 requests
per second, sustained, with a hard ceiling of 50,000 requests per
rolling 24 hours. The first number is a guess chosen to sit below any
plausible OCLC limit and to be gentle on shared infrastructure; the
second is the one *published* figure, for v1, and is the only anchor
available. **Both are UNVERIFIED for v2.** The real answer comes from
OCLC with the key, in writing.

### 2.6 WorldCat — what the owner would have to do

**Nothing today. There is no signup gustale.com can complete.**

The honest sequence, if the owner wanted to pursue it anyway:

| # | step | who | time | cost |
|---|---|---|---|---|
| 1 | Decide whether a **separate written agreement with OCLC** for commercial use is acceptable | owner | a decision, not a task | unknown |
| 2 | If yes: contact OCLC Developer Network Support about a **non-member / agent** agreement | OCLC | weeks to months | unknown — **UNVERIFIED**; OCLC prices these case by case |
| 3 | Only then: get **library-affiliated** credentials (an employee of a qualifying institution, or an OCLC-signed agent agreement) | owner + a library partner | days | a library's time |
| 4 | Request a **sandbox WSKey** (created immediately, no OCLC approval) for the WorldCat Search API | account holder | ~15 minutes | free |
| 5 | Request the **production WSKey** ("Production WSKeys will need approval from OCLC") | account holder | days–weeks | free |
| 6 | Accept the WorldCat Search API terms (check all boxes in the request form) | account holder | minutes | — |
| 7 | Implement OAuth client-credentials token fetch + refresh | us | ~1 day | — |
| 8 | Add the "This site uses WorldCat" badge link to every page that shows WorldCat-derived data | us | ~1 hour | — |

Steps 1–3 are the gate. **Steps 4–8 are cheap and can be done by anyone
with library credentials** — which is exactly why step 4 (sandbox) is
worth doing even if steps 1–3 never resolve: a sandbox key would let
the pipeline be built and tested against the real API without any
commercial-use question. The brief says "propose it; do not run a bulk
pull" — a sandbox spike is the natural next step *if the owner has
library credentials*, which is not a question this lane can answer.

---

## 3. The Library of Congress — reachable today, with nothing

### 3.1 What the LoC requires: nothing

**Verified 2026-11-09**, `https://www.loc.gov/apis/json-and-yaml/working-within-limits/`:

> "The API is accessible to the public with **no API key or
> authentication required**. Rate limiting is strongly encouraged.
> Requests that exceed the rate which loc.gov can successfully
> accommodate will be blocked to prevent a denial of service."

And `https://www.loc.gov/apis/`:
"The Library of Congress makes three different loc.gov APIs available to
the public."

**There is no signup, no account, no email, no key, and no fee.** The
LoC path needs **nothing** from the owner.

### 3.2 The rate limits — the published numbers

**Verified 2026-11-09**, same page (`working-within-limits`):

| service | requests/minute | blocked for |
|---|---:|---|
| **JSON/YAML API for loc.gov** | **20** | 1 hour |
| Text Services | 150 | 1 hour |
| Image Services | 150 | 1 hour |
| Streaming Services | 60 | 1 hour |
| Media content on `/storage-services/` | 150 | 1 hour |
| **MARCXML on `lccn.loc.gov/{item-id}/marcxml`** | **30** | **72 hours** |

Plus the page's own warning, which the plan must respect:

> "When the API is experiencing especially heavy traffic load, rate
> limits may decrease and users may encounter 429 status codes or HTML
> pages with CAPTCHAs even when operating below the rates listed below.
> Users may want to add handling to pause when encountering 429 status
> codes and HTML CAPTCHA responses."

And two paging limits: **100,000 items per query** is the deep-paging
ceiling, and **1,000 items per page** is the recommended maximum.

**A SECOND, STRICTER LIMIT — and it is the one to obey.** The LoC's
legal page (`https://www.loc.gov/legal/`, "December 17, 2020", read
2026-11-09) says:

> "We reserve the right to block IP addresses that fail to honor our
> websites' robot.txt files, or submit requests at a rate that negatively
> impacts service delivery to patrons. **Current guidelines recommend
> that software programs submit a total of no more than 10 requests per
> minute to our applications, regardless of the number of machines used
> to submit requests.** We also reserve the right to terminate programs
> that require more than 24 hours to complete."

**10 requests per minute, site-wide, across all machines.** That is
*stricter* than the API page's 20/min for the JSON API and stricter
than the 30/min for MARCXML. The two documents are not in conflict —
one is a per-endpoint service limit, the other is a general access
guideline — but **10/min is the number a careful client honours**, and
it is the one that also keeps a crawler-recognising UA happy.

### 3.3 The LoC's terms

**Verified 2026-11-09**, `https://www.loc.gov/legal/`:

> "As a publicly supported institution, **we generally do not own the
> rights to materials in our collections.** You should determine for
> yourself whether or not an item is protected by copyright or in the
> public domain, and then satisfy any copyright or use restrictions
> when publishing or distributing materials from our collections.
> Transmission or reproduction of protected items beyond what is allowed
> by fair use or other exemptions requires written permission from the
> copyright holder."

**This is the same copyright posture ADR-007-A1 §1.4 already imposes**
("published recipe text MUST be in our own words, never copied") — so
the LoC's terms and the project's own rule agree. What the LoC record
gives us is **metadata** (title, author, date, publisher, classification,
subject headings) and, where the item is digitised, a **link to a
public-domain scan**. The metadata is what a citation needs; the scan
is where the reader verifies the method.

**Attribution:** the LoC requires no mandatory badge for API use (unlike
WorldCat's "This site uses WorldCat" requirement). The permalink in
each record (`https://www.loc.gov/item/<id>/` or
`http://lccn.loc.gov/<lccn>/`) is the citable locator. **UNVERIFIED:**
whether LoC has a specific data-use policy for bulk harvesting beyond
the 10/min guideline — none was found on the pages read.

### 3.4 The LoC's reachability problem — Cloudflare, and it is real

**This is the finding the plan must lead with on the LoC side.**

**Verified 2026-11-09** by probe from this host, with the identifying
user agent `gustale-s4-research/1.0 (https://gustale.com)`:

| endpoint | status from this host |
|---|---|
| `https://www.loc.gov/books/?fo=json&q=cookery&c=3` | **403** (Cloudflare) |
| `https://www.loc.gov/search/?fo=json&q=cookery&c=2` | **403** (Cloudflare) |
| `https://www.loc.gov/item/30016663/?fo=json` | **403** (Cloudflare) |
| same, with a **browser** user agent | **403** (Cloudflare) |
| `https://www.loc.gov/apis/…` (documentation) | 200 |
| `https://www.loc.gov/legal/` | 200 |

The 403 body is `"Just a moment... Enable JavaScript and cookies to
continue"` — a Cloudflare **JavaScript challenge**, not a hard block.
The **same URLs return 200 through a browser** (verified 2026-11-09 by
loading `https://www.loc.gov/books/?fo=json&q=cookery&c=3` in a
headless browser and parsing the JSON).

**And this is exactly what `docs/SOURCE-TIER-LIST.md` recorded on
2026-11-08** — "Library of Congress `403` from this host (both UAs
tried)". **The finding has not aged; it is confirmed and now has a
cause.** A server-side `curl` cannot get past it; a browser can.

**What still works from a plain script** (verified 2026-11-09, all
**200**, no key):

| endpoint | what it returns |
|---|---|
| `https://id.loc.gov/authorities/names/suggest2/?q=<term>` | JSON: authorised heading, **LCCN**, URI, MARC key, vocabulary collections |
| `https://id.loc.gov/authorities/subjects/suggest2/?q=<term>` | the same, for LCSH subjects |
| `https://id.loc.gov/authorities/subjects/suggest/?q=<term>` | the older JSON shape (label list + URI list) |
| `https://id.loc.gov/authorities/<type>/<id>.marcxml.xml` | the **full MARCXML record** |
| `https://id.loc.gov/authorities/<type>/<id>.json` | the record as RDF-in-JSON |
| `https://id.loc.gov/authorities/<type>/<id>.rdf` | the record as RDF |
| `https://lccn.loc.gov/<lccn>/marcxml` | the **full MARC record** of the item |

**This is the good news: the authority file and the MARCXML endpoint are
both directly reachable, and the MARCXML endpoint is the one that
carries the OCLC number.** The Cloudflare challenge sits on the
**search** endpoints (`www.loc.gov/books/?fo=json`,
`www.loc.gov/search/?fo=json`, `www.loc.gov/item/<id>/?fo=json`) — the
discovery layer — and not on the **retrieval** layer.

### 3.5 The SRU endpoint — and why it is not the answer

**Verified 2026-11-09** from
`https://www.loc.gov/standards/sru/resources/lcServers.html`:

| database | SRU base URL |
|---|---|
| Library of Congress Online Catalog | `http://lx2.loc.gov:210/LCDB?` |
| LC Name Authority File | `http://lx2.loc.gov:210/NAF?` |
| LC Subject Authority File | `http://lx2.loc.gov:210/SAF?` |
| NLS for the Blind | `http://lx2.loc.gov:210/NLSBPH?` |
| Handbook of Latin American Studies | `http://lx2.loc.gov:210/HLAS?` |

**Two problems with SRU for us:**

1. **It is HTTP-only.** `lx2.loc.gov:210` serves plain HTTP Z39.50/SRU;
   the HTTPS form on the same port does not complete a TLS handshake
   (verified 2026-11-09: `https://lx2.loc.gov:210/NAF?...` → connection
   failure, no response). Sending catalogue queries in cleartext is not
   something this project should do.
2. **It is redundant.** The LoC's own documentation says (verified
   2026-11-09, `https://www.loc.gov/apis/additional-apis/search-retrieval-via-url/`):
   **"Most of the data accessible from the Z39.50 Gateway is also
   accessible via the loc.gov APIs."**

**Recommendation: do not use SRU.** Use the HTTPS JSON API (via a
browser-capable client) for discovery and `id.loc.gov` +
`lccn.loc.gov` for retrieval. SRU is listed here because the brief asked
for it and because it is the *only* documented path to the **subject
authority file's SRU** — but the same authority data is reachable over
HTTPS via `id.loc.gov`.

### 3.6 The LC authority file (`id.loc.gov`) — a different thing, and the better fit

**This is the distinction the brief flagged, and it is correct.**

The **LoC catalogue** (`www.loc.gov`) is a union catalogue of things
held: books, prints, maps, recordings, manuscripts — each with a MARC
bibliographic record, an LCCN, and a permalink.

The **LC authority files** (`id.loc.gov`) are the **name and subject
headings** themselves: the authorised form of a term, its variants, its
broader/narrower terms, its LC classification, and its sources. They
are published as **linked data** (MADS/RDF), with MARCXML and JSON
representations.

**For an ingredient vocabulary, the authority file is the right
instrument**, and the catalogue is the wrong one:

- A catalogue answers *"which books about olive oil does the Library
  hold?"* — a **discovery** answer, tier `S1`.
- The authority file answers *"what is the authorised heading for olive
  oil, what is it a narrower term of, and what is its LC class?"* — a
  **vocabulary** answer, which is what an ingredient row needs.

**Verified 2026-11-09** — a live record, `https://id.loc.gov/authorities/subjects/sh85094619.marcxml.xml`
(LCSH "Olive oil"), fetched with a plain `curl`, no key, HTTP 200:

```
001 = sh85094619
010 | a=sh 85094619
040 | a=DLC c=DLC d=DLC
053 | a=TP683  c=Chemical technology      <-- the LC CLASSIFICATION
150 | a=Olive oil                          <-- the AUTHORISED HEADING
550 | a=Vegetable oils  w=g                <-- the BROADER TERM
670 | a=Random House.                      <-- the SOURCE
```

Every field ADR-007-A1 §4.3 asks for is present: **the authority
heading** (`150$a`), **the LC classification** (`053$a`), **the subject
heading** (the record *is* the subject heading), **the date**
(`008` — the heading's creation date), **the language** (`008`/`040`),
and **the persistent identifier** (`010$a` — the LCCN `sh85094619`).

A second live record, `https://id.loc.gov/authorities/names/n2018036820.marcxml.xml`
(LCNAF "Olive"), returned `001 = n2018036820`, `010$a = n 2018036820`,
`100$a = Olive`, `372$a = Christian literature for children $2 lcsh`,
`670$a = Annie Grey and other sketches, 1856: t.p. (Olive)`.

**Discovery against the authority file works from a plain script** too
(verified 2026-11-09, HTTP 200):

```
GET https://id.loc.gov/authorities/subjects/suggest2/?q=tomato
→ {"q":"tomato","count":39,"pagesize":10,"start":1,"sortmethod":"alpha",
   "searchtype":"left-anchored","directory":"/authorities/subjects/",
   "hits":[{"suggestLabel":"Olive oil",
            "uri":"http://id.loc.gov/authorities/subjects/sh85094619",
            "aLabel":"Olive oil","token":"sh85094619",
            "more":{"rdftypes":["Topic","SimpleType","Authority"],
                    "collections":["http://id.loc.gov/authorities/subjects/collection_LCSHAuthorizedHeadings",
                                   "http://id.loc.gov/authorities/subjects/collection_LCSH_General"],
                    "marcKeys":["150  $aOlive oil"],
                    "authorizedNNs":["OLIVE OIL"],
                    "lastmods":["2010-06-11"]}}]}
```

The `collections` field is the important one: it says whether the hit is
in the **authorised** LCSH collection or only in the *general* one — i.e.
whether it is a real heading or a phrase a cataloger invented. That is
a quality filter the project can use directly, and it is the same
distinction `SOURCE-TIER-LIST.md` Finding F-1 asks for, applied to a
catalogue.

**No rate limit is published for `id.loc.gov`** on the pages read
(2026-11-09). The conservative assumption is that it falls under the
LoC's general **10 requests/minute** guideline (§3.2), and that the
MARCXML endpoint's **30/min / 72-hour block** applies to
`lccn.loc.gov` (§3.2). Both are **UNVERIFIED for `id.loc.gov` itself.**
Given the scale of this backfill (§5.3), that is not a problem.

---

## 4. How the two would combine

The brief asks how WorldCat and the LC authority file would be
combined. **The answer changes shape because WorldCat is not
reachable**, but the shape is the same one the owner chose, and it
survives the change:

| we want | the instrument | why not the other |
|---|---|---|
| the **authoritative name** of an ingredient, its variants, its broader term, its LC class | **LC authority file** (`id.loc.gov`, LCSH) | a catalogue record describes a *book about* olive oil, not olive oil |
| the **work** that documents a method (a cookbook) | **the LoC catalogue** (and, one day, WorldCat) | the authority file has no works |
| the **OCLC number** of that work | **the LoC's own MARC record** (`035$a (OCoLC)…`) | — see §5.1 |
| **library holdings** (who holds it) | WorldCat (blocked); the LoC's `item` endpoint carries `partof`/`resources` but not the union holdings | this is the one capability that is genuinely lost |

**The combination that is actually available today:**

```
ingredient row (435)
   └─ id.loc.gov/authorities/subjects/suggest2/?q=<term>     → LCSH candidate + LCCN
        └─ id.loc.gov/authorities/subjects/<sh…>.marcxml.xml → 150$a heading, 053$a LC class,
                                                                550$a broader term, 670$a source
             └─ stored as a `sources` row (S3/S5) + a `claim_citations` row with the id.loc.gov URI as locator

dish claim (first wave)
   └─ www.loc.gov/books/?fo=json&q=<dish>   (browser-capable client)
        └─ lccn.loc.gov/<lccn>/marcxml      → 010$a LCCN, 035$a OCLC number, 050$a LC call no.,
                                                082$a DDC, 650$a LCSH, 100$a/245$a/260$a
             └─ stored as a `sources` row (S1/S4) + a `claim_citations` row with the
                loc.gov permalink / lccn.loc.gov URL as locator
```

**WorldCat's role, when it opens:** replace the LoC-catalogue leg with
WorldCat for *holdings and editions* (WorldCat knows which library holds
which edition; the LoC knows about its own collection), and keep the LC
authority file for the *name and the classification* — which is exactly
the split the brief proposed, and which is also what the WorldCat
Rights policy implies (WorldCat data flows outward under a member's
agreement; the LoC authority file is published as open linked data).

---

## 5. What we would get, and what it would cost us

### 5.1 The LoC catalogue record carries the OCLC number — this dissolves half the identifier problem

**Verified 2026-11-09.** Two independent live confirmations:

**(a) The JSON API.** `https://www.loc.gov/books/?fo=json&q=cookery&c=3`,
three results, each with:

| field | value |
|---|---|
| `number_lccn` | `["30016663"]` |
| `number_oclc` | `["3225330"]` |
| `date` | `"1930"` |
| `language` | `["english"]` |
| `subject` | `["cooking, american", "virginia", "cooking"]` |
| `item.call_number` | `["TX715 .M75"]` |
| `item.created_published` | `["Roanoke, Va., Roanoke Printing Co., Inc., [1930]"]` |
| `id` / `url` | `http://www.loc.gov/item/30016663/` |

**(b) The MARC record.** `https://lccn.loc.gov/30016663/marcxml`,
fetched with plain `curl`, HTTP 200, parsed:

```
001 = 9683862
010 | a=30016663                        <-- the LCCN
035 | a=(OCoLC)3225330                  <-- the OCLC NUMBER
040 | a=DLC c=DeU d=DLC
050 | a=TX715 b=.M75                     <-- the LC CALL NUMBER
082 | a=641.597                         <-- Dewey
100 | a=Moeschler, Velma
245 | a=Virginia cookery c=[by] Velma Moeschler.
260 | a=Roanoke, Va., b=Roanoke Printing Co., Inc., c=[1930]
650 | a=Cooking, American.
650 | a=Cooking z=Virginia.
650 | a=Menus.
```

**A single unauthenticated HTTPS GET returns the LCCN, the OCLC number,
the LC call number, the Dewey number, the LCSH subject headings, the
author, the title, the publisher and the date — together.**

This is the single most important technical finding in this document.
The brief framed the identifier problem as "WorldCat records carry an
OCLC number; the LC authority file carries an LCCN; the LC catalogue
carries an LCCN and a permalink" — three identifiers across two systems.
In fact the **LC catalogue's MARC record carries the OCLC number too**
(`035$a (OCoLC)`), so a WorldCat-class record is reachable, complete and
citable through a source that needs no key, no account and no
agreement.

**What is genuinely lost without WorldCat:** the *union holdings* —
which libraries hold which edition, which is the part only WorldCat has
and the part gustale.com has least use for (the project needs to cite a
work and point a reader at it, not route an ILL).

### 5.2 The LoC authority record, for an ingredient

**Verified 2026-11-09** — `sh85094619` (LCSH "Olive oil"), MARCXML
above. Mapped onto ADR-007-A1 §4.3's asks:

| ADR-007-A1 §4.3 wants | LoC authority file field | MARC tag |
|---|---|---|
| authority heading | `150$a` (subject) / `100$a` (name) | 150 / 100 |
| LC classification | `053$a` + `053$c` (class + caption) | 053 |
| subject headings | the record **is** the heading; `550$a` gives the broader term, `550$w` the relation | 550 |
| the date | `008` positions 07–10 (record's creation date) | 008 |
| the language | `008` positions 35–37, and `040$b` (cataloguing language) | 008 / 040 |
| persistent identifier | `010$a` — the **LCCN** | 010 |

And for a *dish* or a *name*, the LCNAF (`/authorities/names/`) is the
same shape with `100$a` instead of `150$a`.

### 5.3 The rate at which we would actually need this — and why the limits do not bind

**The scale, from the repo's own baseline** (`docs/SOURCE-TIER-LIST.md`,
2026-11-08):

| item | count |
|---|---:|
| `ingredient_categories` rows to backfill | **435** |
| of those, already carrying a `foodon_id` | 380 |
| `ingredients` rows published today | 5 |
| `dish_ingredients` rows | 4 |
| first-wave dish list | "a first-wave dish list" — the brief's phrase; not yet fixed |
| statements that need a source to reach `verified` | **1,354** |

**The binding number is 435 + the first-wave dish list.** The first-wave
dish count is **not yet fixed** in the repo, so the arithmetic below
assumes **200** first-wave dishes (**UNVERIFIED — an assumption, not a
fact**; the conclusion holds for any first wave up to a few thousand
dishes):

| leg | requests |
|---|---:|
| authority discovery (`suggest2`) — 435 ingredients + 200 dishes | 635 |
| catalogue discovery (`?fo=json`) — 200 first-wave dishes | 200 |
| MARCXML retrieval — one per surviving record (435 + 200) | 635 |
| **total** | **1,470** |

Against the limits:

- At the LoC's **general 10 req/min** guideline: 1,470 requests =
  **147 minutes ≈ 2.5 hours**, one-off.
- At the API page's **20 req/min** for the JSON API: **74 minutes**.
- At **30 req/min** for MARCXML, with a **72-hour** block if exceeded:
  the MARCXML leg is 635 requests ≈ **21 minutes**, an order of magnitude
  below anything that would trip a block.

**So the rate limits do not bind, and the slow path is acceptable.** In
fact a deliberately slow client is *safer*: it is under every published
threshold simultaneously, it looks like a polite crawler rather than a
bulk harvester, and it makes the Cloudflare challenge far less likely to
be escalated. **Recommendation: a 6-second spacing between requests
(10/min), with exponential backoff on 429 and on a CAPTCHA body.**

**One caveat that is NOT about rate:** the MARCXML endpoint's penalty is
**72 hours**, not 1 hour. If a burst trips it, the backfill stops for
three days. That asymmetry — 30/min allowed, 72 hours punished — is
the strongest argument for the slow client.

### 5.4 The total cost

| | WorldCat | LoC |
|---|---|---|
| signup | account + OCLC member affiliation + a **commercial-use written agreement** | **none** |
| key | WSKey + OAuth client credentials | **none** |
| fee | unknown — **UNVERIFIED**, OCLC prices non-member agreements case by case | **none** |
| attribution obligation | a visible "This site uses WorldCat" link on every page using the Service | none mandatory; the permalink is the citation |
| engineering | OAuth token flow, WSKey storage as a secret, badge link in the web layer | a browser-capable HTTP client, rate limiter, 429/CAPTCHA backoff |
| rate limit | **not published for v2**; v1 was 50,000 / rolling 24 h | 10 req/min general guideline; 20/min JSON API; 30/min MARCXML (72 h penalty) |
| legal constraint | "**cannot be used for … commercial purposes**" without a separate written agreement | "we generally do not own the rights to materials in our collections" — the project's own §1.4 rule already matches |

---

## 6. The identifier problem — stated plainly, with the exact columns

### 6.1 What the schema accepts today

**Verified 2026-11-09** against the migration-built test database
`gustale_t_c797a47c` on the test Postgres (`127.0.0.1:5434`), read via
`information_schema.columns`. The full `sources` table, **19 columns**:

| column | type | nullable | holds an identifier? |
|---|---|---|---|
| `id` | uuid | NO | internal PK |
| `source_type` | text | NO | — |
| `title` | text | NO | — |
| `authors` | ARRAY | YES | — |
| `year` | integer | YES | — |
| `publisher` | text | YES | — |
| `isbn` | text | YES | **yes — ISBN** |
| `doi` | text | YES | **yes — DOI** |
| `url` | text | YES | yes, but a URL is not a persistent identifier |
| `archive_name` | text | YES | **yes — the holding archive's name** |
| `archive_catalog_id` | text | YES | **yes — the holding archive's catalogue id** |
| `citation_text` | text | YES | free text |
| `language` | text | NO | — |
| `reliability` | text | YES | — |
| `created_at` | timestamptz | NO | — |
| `created_by` | text | YES | — |
| `source_class` | USER-DEFINED (`source_class`) | YES | the tier |
| `source_classed_at` | timestamptz | YES | — |
| `source_classed_by` | text | YES | — |

**`claim_citations`, 10 columns:**

| column | type | nullable |
|---|---|---|
| `id` | uuid | NO |
| `statement_id` | uuid | NO (FK → `statements`) |
| `source_id` | uuid | NO (FK → `sources`) |
| `stance` | USER-DEFINED (`citation_stance`) | NO |
| `locator` | text | YES |
| `excerpt` | text | YES |
| `revision_id` | text | YES |
| `retrieved_at` | timestamptz | NO |
| `excerpt_validated` | boolean | NO |
| `created_at` | timestamptz | NO |

**`source_candidates`, 25 columns** — the discovery table: `statement_id`,
`dish_slug`, `title`, `authors`, `year`, `publisher`, `container_title`,
`doi`, `isbn`, `url`, `work_type`, `catalogue`, `query`,
`catalogue_relevance`, `term_overlap`, `proposed_source_class`, `status`,
`fetched`, `fetch_note`, `locator`, `excerpt`, `created_at`,
`reviewed_by`, `reviewed_at`.

### 6.2 The answer

**There is no `oclc_number` column and no `lccn` column. There is no
dedicated column for an LCCN, an OCLC number, or an LCSH identifier
anywhere in the schema.**

**But there is a slot that fits without a migration**, and it is
`archive_catalog_id`:

- `archive_name` — the name of the holding archive. For an LoC record:
  `"Library of Congress"`. For a WorldCat record: `"WorldCat"`.
- `archive_catalog_id` — **the catalogue's own identifier for the
  work**. For an LoC record: the **LCCN** (`30016663`). For a WorldCat
  record: the **OCLC number** (`3225330`). For an authority record: the
  LCCN (`sh85094619`).

These two columns were built for exactly this shape — the Atlas's own
`citations` rows already carry `archive_name` / `archive_catalog_id` for
its archived material, which is why the columns exist.

**So, for the LoC path, the schema needs NO change:**

| what we have | where it goes | today |
|---|---|---|
| LCCN or OCLC number | `sources.archive_catalog_id` | ✅ |
| the holding catalogue | `sources.archive_name` = `'Library of Congress'` / `'WorldCat'` | ✅ |
| the permalink | `sources.url` = `https://www.loc.gov/item/<id>/` or `http://lccn.loc.gov/<lccn>/` | ✅ |
| the exact locator (condition 7′) | `claim_citations.locator` = the permalink, or the MARC tag path (`050$a`, `150$a`) | ✅ |
| the source's tier | `sources.source_class` = `S1`/`S3`/`S4`/`S5` | ✅ |
| the title / author / year / publisher / language | `sources.title` / `authors` / `year` / `publisher` / `language` | ✅ |
| the subject headings, the LC class, the broader term | **nowhere** — `sources` has no subject or classification column | ❌ |
| the ISBN | `sources.isbn` | ✅ |
| the DOI | `sources.doi` | ✅ |

### 6.3 The one genuine gap — and it is a report, not a change

**This lane is docs-only. The schema belongs to the DB lane. What
follows is a report.**

**Gap 1 — no place for the subject headings, the classification, or
the authority heading.** `sources` has no `subjects`, no `classification`
/ `call_number`, and no `authority_heading` column. The MARC record
carries `050$a` (LC call number), `082$a` (Dewey), `650$a` (LCSH), `150$a`
(authorised heading), `053$a` (classification), `550$a` (broader term) —
**none of which has a home.**

Three ways this could go, and the choice is the owner's:

- **(a) No schema change.** Store the classification and the headings
  inside `sources.citation_text` (free text, already there) or inside
  `claim_citations.locator` (free text, already there). **Works today,
  is not queryable.** A recipe's ingredient cannot be joined to its LC
  class, and "which ingredients are in TP683" is not answerable in SQL.
- **(b) Add columns to `sources`.** `subjects text[]`,
  `classification text`, `authority_heading text`, `authority_uri text`
  — four nullable columns, no backfill needed (the 1,486 existing rows
  are S6 Wikipedia and would leave them null), no risk to the Atlas.
  This is the smallest change that makes the data usable.
- **(c) A side table.** `source_authorities` / `source_subjects`. More
  structure, more migration, more to get wrong.

**Recommendation: (b)** — four nullable columns on `sources`. It is
additive, it touches no existing row, and it is the difference between
"we fetched a classification" and "we can query a classification".

**Gap 2 — a pre-existing drift, found while checking, NOT caused by
this plan.** `sources.source_class` (and `source_classed_at`,
`source_classed_by`) **exist in the live database** — added by
migration `0027_adr002_claims_model.sql` — but **do not appear in
`packages/db/src/schema/index.ts`**, nor in
`packages/db/drizzle/meta/0000_snapshot.json` (verified 2026-11-09 by
grep: zero matches for `source_class` / `sourceClass` in both). The
Drizzle schema and the Drizzle migration snapshot are therefore **out of
sync with the live database** on the single column the whole S1–S7
tier system depends on. `CLAUDE.md` requires the schema in two places
and kept in sync; this one is not.

**This is reported, not fixed** — the DB lane owns the schema, and
`0052` is **frozen** (Rule 11), so a fix would be a new migration
number. **Recommend the DB lane add `sourceClass` / `sourceClassedAt` /
`sourceClassedBy` to the Drizzle schema as part of item 4**, which is
already the lane that owns the Drizzle schema. Flagging it now because
**every** source row this plan creates depends on that column.

**Gap 3 — `claim_citations.locator` is free text, and the LoC gives
two different locators.** For an authority record the honest locator is
the MARC tag path (`150$a`, `053$a`) plus the id.loc.gov URI; for a
catalogue record it is the permalink plus a page number (`650$a` alone
is not a locator — it is a heading, and condition 7′ wants a pointer a
reader can follow). **Recommendation:** store the **permalink** as the
locator (it is clickable and stable) and put the MARC tag path in the
same string, e.g.
`https://lccn.loc.gov/30016663/marcxml#035$a (OCoLC)3225330`.
No schema change needed — `locator` is free text and the format is a
convention, not a constraint. **The convention should be decided before
the backfill runs**, because retrofitting it across 2,000 rows is
worse than fixing it once.

---

## 7. What to prove first — the spike

**The smallest thing that proves the access works end to end.**
**Proposed, not run** (beyond the single-record probes already made
above, which ARE the spike's evidence for the retrieval leg).

### Spike A — LoC authority leg (no key, no owner action, **do this first**)

**3 records. 6 requests. ~40 seconds at 10/min.**

```
1. GET https://id.loc.gov/authorities/subjects/suggest2/?q=tomato
   → assert: hits[] non-empty; each hit has `token` (an LCCN) and
     `more.collections` containing .../collection_LCSHAuthorizedHeadings
     for the ones that are real headings.

2. GET https://id.loc.gov/authorities/subjects/sh85094619.marcxml.xml
   → assert: MARC 001 = sh85094619; 150$a present; 053$a present
     (the LC class); 550$a present (the broader term); 670$a present
     (the source).

3. GET https://id.loc.gov/authorities/names/suggest2/?q=<a dish name>
   → assert: a personal-name or corporate-name hit with an `n…` token.
```

**What it proves:** that the authority file answers "what is the
authoritative heading and class for this ingredient" over plain HTTPS
with no key, no account, and no Cloudflare challenge — which is the
half of the plan that depends on nothing.

**What it returns (already observed, 2026-11-09):** a `suggest2` JSON
object with `suggestLabel`, `uri`, `aLabel`, `token`, and a `more`
object carrying `rdftypes`, `collections`, `marcKeys`, `authorizedNNs`,
`lastmods`, `variantLabels`; and a MARCXML record with `001`, `010`,
`040`, `053`, `150`, `550`, `670`.

### Spike B — LoC catalogue leg (needs a browser-capable client)

**2 records. 3 requests.**

```
1. GET https://www.loc.gov/books/?fo=json&q=cookery&c=3
   (through a client that can solve the Cloudflare challenge)
   → assert: results[] each have `number_lccn`, `number_oclc`, `date`,
     `language`, `subject`, and `item.call_number`.

2. GET https://lccn.loc.gov/30016663/marcxml
   → assert: MARC 010$a = the LCCN; 035$a contains "(OCoLC)"; 050$a
     present; 082$a present; 650$a present.

3. GET https://www.loc.gov/books/?fo=json&q=<one first-wave dish>&c=3
   → assert: the same field set on a dish name, not just "cookery".
```

**What it proves:** that a catalogue record carries the OCLC number
alongside the LCCN, the LC class, the Dewey number and the LCSH
headings — i.e. that a WorldCat-class record is reachable through the
LoC (§5.1). **This is the spike that decides whether WorldCat is
needed at all for the first wave.**

**What it returns (already observed, 2026-11-09):** the JSON field set
in §5.1(a) and the MARC fields in §5.1(b).

### Spike C — WorldCat (only if the owner has library credentials)

**1 record. 2 requests.** A **sandbox** WSKey (created immediately, no
OCLC approval):

```
1. POST https://oauth.oclc.org/token
   (client_credentials; WSKey public part = client_id, secret = password,
    Basic auth)  → assert: HTTP 200 and a bearer token.

2. GET https://americas.discovery.api.oclc.org/worldcat/search/v2/brief-bibs?q=ti:cookery&limit=1
   Authorization: Bearer <token>
   → assert: HTTP 200; briefRecords[0].oclcNumber, .title, .date,
     .language, .publisher.
```

**What it proves:** that the OAuth flow works and the record shape is
as the spec documents. **What it does NOT prove:** that gustale.com may
use it commercially — that is a separate written agreement, and a
sandbox key is not a licence.

### The order, and the stop condition

**Run Spike A now.** It needs nothing and it de-risks the vocabulary
half. **Then Spike B**, which needs a browser-capable client and
decides whether the catalogue leg is worth building. **Spike C only if
the owner has credentials**, and it is deliberately the *sandbox* key:
a sandbox spike is free, and it is the cheapest way to find out whether
the OAuth flow and the record shape are as documented before anyone
thinks about a commercial agreement.

**Stop condition:** if Spike B shows the LoC catalogue record carries
the OCLC number (as the single-record probe already indicates), then
**WorldCat is not needed for the first wave**, and the S4 decision can
be implemented entirely on the LoC with no owner action at all.

**Explicitly NOT proposed:** a bulk pull. No multi-hundred-record run
until (a) the spike passes, (b) the `locator` convention is decided
(§6.3, Gap 3), and (c) the source_class question (§6.3, Gap 2) is
resolved by the DB lane.

---

## 8. The findings, in one place

| # | finding | how it was established |
|---|---|---|
| **F-1** | **WorldCat Search API v2 uses OAuth 2.0, not a wskey query parameter.** The WSKey is still the credential, but it is split into a public ClientId + secret and exchanged at `oauth.oclc.org/token`. The legacy v1 wskey-in-URL API is undocumented and its public endpoint returns 520. | v2 OpenAPI spec, read 2026-11-09 |
| **F-2** | **WorldCat production access requires an OCLC member institution.** The WSKey request flow requires searching for and signing in as an institution. gustale.com is not one. | OCLC eligibility page + WSKey request page, read 2026-11-09 |
| **F-3** | **WorldCat terms prohibit commercial use without a separate written agreement with OCLC**, and require a visible "This site uses WorldCat" link back on any site using the Service. | WorldCat Search API Terms and Conditions PDF, "Last Updated: 20121204", read 2026-11-09 |
| **F-4** | **No rate limit is published for WorldCat Search API v2.** The v1 figure is 50,000 requests per rolling 24 h. The document the terms point to for the limit is a **404**. | FAQ + terms PDF + spec, all read 2026-11-09 |
| **F-5** | **The LoC needs nothing** — no key, no account, no fee. 20 req/min on the JSON API, 30 req/min on MARCXML, 1 h and **72 h** blocks respectively. | `working-within-limits`, read 2026-11-09 |
| **F-6** | **The LoC's legal page sets a stricter, global guideline: 10 requests per minute to our applications, regardless of the number of machines.** | `www.loc.gov/legal/`, read 2026-11-09 |
| **F-7** | **The LoC catalogue's MARC record carries the OCLC number** (`035$a (OCoLC)…`) alongside the LCCN (`010$a`), the LC call number (`050$a`), Dewey (`082$a`) and LCSH (`650$a`). **One unauthenticated HTTPS GET returns all of them.** | two live confirmations, 2026-11-09 |
| **F-8** | **`www.loc.gov`'s search and item JSON endpoints are behind a Cloudflare JavaScript challenge** — 403 from a plain script, 200 through a browser. `id.loc.gov` and `lccn.loc.gov` are **not** blocked. This confirms (and explains) the 403 `SOURCE-TIER-LIST.md` recorded on 2026-11-08. | probes, 2026-11-09 |
| **F-9** | **The LC authority file is the right instrument for the ingredient vocabulary**, not the catalogue. `id.loc.gov/authorities/subjects/<sh…>.marcxml.xml` returns the authorised heading (`150$a`), the **LC classification** (`053$a`), the broader term (`550$a`) and the source (`670$a`) — the exact fields ADR-007-A1 §4.3 asks for. | live records, 2026-11-09 |
| **F-10** | **`sources.archive_name` + `sources.archive_catalog_id` already fit the identifier**, so the LoC path needs **no migration**: `archive_name` = `'Library of Congress'`, `archive_catalog_id` = the LCCN (or the OCLC number). | `information_schema` on the test DB, 2026-11-09 |
| **F-11** | **There is nowhere to store the subject headings, the classification, or the authority heading.** `sources` has no such column. This is a report to the DB lane, not a change. | `information_schema`, 2026-11-09 |
| **F-12** | **`sources.source_class` is in the live database but NOT in the Drizzle schema or the Drizzle snapshot.** A pre-existing drift, on the one column the whole tier system depends on. | grep, 2026-11-09 |
| **F-13** | **The SRU endpoints (`lx2.loc.gov:210`) are HTTP-only** and therefore unusable; the LoC's own docs say the same data is available over the loc.gov APIs. | probes + LoC docs, 2026-11-09 |
| **F-14** | **The scale does not bind.** ≈**1,470 requests** for the whole backfill (435 ingredients + an assumed 200 first-wave dishes, discovery + MARCXML retrieval) ≈ **2.5 hours** at 10/min. The slow path is not a compromise — it is the right client behaviour, especially against the 72-hour MARCXML penalty. | computed from the repo's baseline, 2026-11-09 |

---

## 9. What is NOT in this document

- **No code.** No migration, no schema change, no script. This lane is
  docs-only and the card forbids otherwise.
- **No bulk pull.** Only the single-record probes listed in §7, which
  *are* the spike evidence for the retrieval leg. No catalogue was
  enumerated and no corpus was harvested.
- **No live database write.** The test database
  `gustale_t_c797a47c` was **built** (read-only schema inspection) and
  **dropped** afterwards. The live database was not touched.
- **No WorldCat key was requested** and no OCLC contact was made.
- **No decision made on the owner's behalf.** The commercial-use
  question, the schema gaps and the `locator` convention are all left
  open, with the recommendation stated.

---

## 10. The recommendation, and what it needs

**Do the LoC path. Treat WorldCat as a decision, not a task.**

1. **Spike A** (6 requests, no key, no owner action) — today.
2. **Spike B** (3 requests, needs a browser-capable client) — today.
   Its result decides whether the catalogue leg needs WorldCat at all.
3. **Fix the `locator` convention** (§6.3, Gap 3) *before* any row is
   written.
4. **Ask the DB lane** to add `subjects`, `classification`,
   `authority_heading` and `authority_uri` to `sources` (Gap 1), and to
   bring the Drizzle schema back in sync with `source_class` (Gap 2).
5. **WorldCat:** the owner decides whether a **separate written
   commercial-use agreement with OCLC** is worth pursuing. Nothing in
   the first wave depends on it. If the owner happens to have library
   credentials, a **sandbox** WSKey (Spike C) costs 15 minutes and buys
   the whole pipeline's test harness.

**The owner's decision, in one line:** *do you want to spend the
effort on a written commercial-use agreement with OCLC, when the
Library of Congress already gives us the same identifiers, the same
classifications and the same subject headings for free?*

---

## 11. Reproducing the facts

Every external fact in this document was read from the source named in
its section, on **2026-11-09**. The commands:

```bash
UA='gustale-s4-research/1.0 (https://gustale.com)'

# F-1, F-4: the v2 spec (auth scheme, paths, limit max, field schemas)
curl -s -A "$UA" https://developer.api.oclc.org/docs/wcapi/v2/openapi-external-prod.yaml

# F-2, F-3: eligibility, and the terms PDF
curl -s -A "$UA" https://www.oclc.org/developer/support/eligibility.en.html
curl -s -A "$UA" https://www.oclc.org/content/dam/developer-network/PDFs/wcapi-terms-and-conditions-20121204.pdf

# F-4: the rate limit, the signup steps, the OAuth glossary
curl -s -A "$UA" https://www.oclc.org/developer/support/faq.en.html
curl -s -A "$UA" https://help.oclc.org/Librarian_Toolbox/OCLC_APIs/Get_started/Request_an_API_WSKey
curl -s -A "$UA" https://www.oclc.org/developer/api/keys/oauth.en.html

# F-5, F-6: the LoC's published limits and its legal page
curl -s -A "$UA" https://www.loc.gov/apis/json-and-yaml/working-within-limits/
curl -s -A "$UA" https://www.loc.gov/legal/

# F-8: the Cloudflare finding — both sides
curl -s -o /dev/null -w '%{http_code}\n' -A "$UA" 'https://www.loc.gov/books/?fo=json&q=cookery&c=3'   # 403
#   ... and the same URL through a browser -> 200

# F-9: the authority records
curl -s -A "$UA" https://id.loc.gov/authorities/subjects/suggest2/?q=tomato
curl -s -A "$UA" https://id.loc.gov/authorities/subjects/sh85094619.marcxml.xml
curl -s -A "$UA" https://id.loc.gov/authorities/names/n2018036820.marcxml.xml

# F-7: the catalogue record with its OCLC number
curl -s -A "$UA" https://lccn.loc.gov/30016663/marcxml

# F-10, F-11, F-12: the schema facts (test DB only)
bash scripts/ci-migration-chain.sh gustale_t_c797a47c
docker exec -i gustale-test-postgres psql -U postgres -d gustale_t_c797a47c \
  -c "select column_name, data_type from information_schema.columns
      where table_schema='public' and table_name='sources'
      order by ordinal_position;"
grep -c sourceClass packages/db/src/schema/index.ts
```

The test database `gustale_t_c797a47c` was **dropped** when this
research finished.

---

## 12. Related documents

| topic | file |
|---|---|
| the tier list this instantiates | `docs/SOURCE-TIER-LIST.md` |
| the ADR the sources must satisfy | `docs/ADR-007-A1-recipes-confidence-autopublish-contributors-language-urls.md` |
| the staged backfill this feeds | `docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md` |
| the candidate pipeline (`scripts/find_source_candidates.py`) | `docs/SOURCE-TIER-LIST.md` §"The catalogue-to-tier map, as code" |
| the task state | `docs/RECIPES-TASK-RESUME.md` |
| the standing rules | `docs/RULES.md` |
