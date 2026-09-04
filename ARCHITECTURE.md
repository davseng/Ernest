# Architecture

## Status

Ernest is a Next.js application backed by PostgreSQL. Auth.js authenticates users through magic links sent by Nodemailer over Brevo SMTP and stores users, sessions, and verification tokens in PostgreSQL. Server-rendered routes create and manage the asset → system → component hierarchy through an application-owned repository interface and PostgreSQL adapter. There is no object storage, AI, retrieval, or local-agent integration.

## Goals

- Deploy the web application cleanly on Vercel.
- Model boats, RVs, their systems, and components as durable structured data.
- Store private source documents separately from their metadata and derived content.
- Make document retrieval traceable to an asset and an original source.
- Keep infrastructure and AI providers replaceable behind application-owned interfaces.
- Add retrieval and local-agent capabilities later without making them prerequisites for the core product.

## Planned system context

| Concern | Initial planned choice | Architectural boundary |
| --- | --- | --- |
| Web application | Next.js on Vercel | UI, server-side orchestration, and application use cases |
| Relational data | PostgreSQL hosted on Neon | Implemented repository interface, `postgres` adapter, and standard SQL migrations |
| Authentication | Auth.js, Nodemailer, and Brevo SMTP | Auth.js PostgreSQL adapter, passwordless email, and server-side session checks |
| Private documents | Cloudflare R2 | Object-storage interface using opaque object keys |
| AI inference | Hosted AI API | Application-owned model gateway with provider-neutral requests and responses |
| Retrieval | To be selected later | Retrieval interface; metadata filters always enforce asset scope |
| Local agent | OpenClaw-based agent, later | Versioned, authenticated API rather than direct storage access |

The named vendors are deployment choices, not domain concepts. Domain and use-case code should not import vendor SDK types or persist provider-specific identifiers unless isolated in an adapter.

## Data model direction

PostgreSQL is the source of truth for structured records and relationships. The initial `assets`, `systems`, and `components` tables enforce their hierarchy with foreign keys and cascading deletes. Stable text IDs preserve the existing URL and domain identities, while ordering columns provide deterministic presentation. The model will evolve through migrations, but the principal hierarchy is:

```text
Owner
└── Asset (boat or RV)
    ├── System
    │   └── Component
    └── Document
        ├── optional System association
        └── optional Component association
```

Assets, systems, and components should use internal stable IDs. Manufacturer, model, serial number, dates, and owner-entered attributes remain queryable fields rather than being embedded only in prose. Flexible metadata may complement this schema, but should not replace identity, tenancy, or relationship columns.

The asset → system → component hierarchy describes **what equipment exists**. Operating history describes **what happened to an asset over time** and is intentionally separate from that inventory. `log_entries` is the first general operating-history record: it captures the asset, authenticated author, event and creation times, a type, prose, provenance, and optional coordinates. Entries are ordered by when the event occurred rather than only when it was entered.

`entry_type` and `source` are text columns rather than database enums or subtype tables. The application initially recognizes note, maintenance, passage, observation, and incident types, and manual, system, and imported sources. This keeps the foundation lightweight and permits later values without a schema migration, while application boundaries validate values they accept. Future maintenance or passage workflows can reference or enrich these records; telemetry and AI processes can add entries with new provenance values. Specialized tables should be introduced only when those features have structured data and invariants that a general log entry cannot represent.

Log entries cascade when their asset is deliberately deleted because history without its asset authorization boundary has no useful home. User deletion sets a surviving entry's `author_user_id` to null rather than independently erasing history. In the current schema, deleting an owner also cascades to that user's assets, so those assets and their logs are consequently removed. Both log reads and inserts constrain the operation through `assets.owner_id`; an arbitrary asset ID can neither reveal nor receive log data for a non-owner.

Every asset carries a non-null `owner_id` referencing its Auth.js user. Dashboard and detail routes require a server-side session, and repository operations require the session's user ID so their SQL filters by owner. A request for another user's asset therefore returns the same not-found result as an unknown asset ID.

## Document lifecycle and retrieval

Cloudflare R2 will hold private original files. PostgreSQL will hold document metadata, ownership, object keys, associations, processing state, checksums, and source provenance. Object keys—not public URLs—should be persisted; short-lived authorized URLs can be generated at the boundary when required.

A future ingestion pipeline may extract and normalize text into source-addressable segments. Each segment must retain its document ID and location metadata (such as page or section). Retrieval should combine asset scope, structured metadata, and later semantic or lexical search. Answers must preserve citations back to segments and original documents.

Vector search and retrieval-augmented generation (RAG) are deliberately deferred. Their future interface should accept an owner/asset scope and query, and return ranked, attributable source passages. This allows the vector store or search technique to change without changing the product's domain model.

## AI provider boundary

Application use cases will call an internal AI gateway rather than a hosted provider SDK directly. A provider adapter will translate neutral messages, context, model capabilities, and responses at the infrastructure edge.

The gateway should make these concerns explicit:

- selected asset and authorized context;
- retrieved source passages and stable citations;
- model capability and output constraints, rather than vendor model names in domain code;
- timeouts, retries, rate limits, and usage telemetry;
- clear separation between model output and verified structured facts.

Prompts, model selection, and response parsing belong in versioned application/infrastructure code. Provider response IDs may be logged for operations, but must not become primary domain identifiers. This design permits replacing or combining hosted AI providers without rewriting asset or document workflows.

## Suggested application boundaries

As functionality arrives, keep dependencies pointing inward:

1. **Domain:** asset, system, component, log entry, and document concepts and invariants.
2. **Application:** use cases and provider-neutral ports for repositories, object storage, retrieval, and AI inference.
3. **Infrastructure:** Neon/PostgreSQL, R2, hosted AI, and future retrieval adapters.
4. **Delivery:** Next.js routes, server actions, and UI that invoke application use cases.

Next.js is the delivery/runtime framework, not the location for provider-specific business logic. Server-only integrations must never be imported into client components.

The current implementation reflects this split: `src/domain` owns TypeScript entities, `src/data/asset-repository.ts` defines the port, and `src/data/postgres-asset-repository.ts` maps relational rows into the nested domain model. Both data-access modules are marked `server-only`; the adapter reads only `process.env.DATABASE_URL`. UI routes call repository-backed functions and contain neither SQL nor Neon-specific logic. Migrations and seed commands are explicit operational tooling and never run at server startup or build time.

## Security and operations direction

- Treat database credentials, object-storage credentials, and AI keys as server-only secrets.
- Keep R2 buckets private and authorize every upload and download.
- Validate file type and size; add malware scanning before making uploads generally available.
- Encrypt transport, rely on managed encryption at rest, and define backup and deletion policies.
- Log access and processing events without logging document contents or secrets.
- Apply tenant/asset authorization before storage lookup, retrieval, or AI context assembly.
- Minimize document content sent to an AI provider and establish retention/privacy settings before launch.

## Evolution sequence

1. Establish the deployable Next.js/TypeScript shell (complete).
2. Define domain types and persistence migrations, then add PostgreSQL through a repository adapter (complete).
3. Add authenticated ownership and authorization before exposing private records (complete).
4. Add self-service asset, system, and component management (complete).
5. Add R2 through a storage adapter and implement secure document metadata/upload workflows.
6. Add text extraction and source-addressable document processing.
7. Evaluate retrieval approaches, then add vector search/RAG behind the retrieval interface.
8. Add a hosted model adapter and grounded, cited asset Q&A.
9. Integrate an OpenClaw-based local agent through a narrowly scoped, authenticated API only after its trust and sync model is defined.
