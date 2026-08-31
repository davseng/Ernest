# Architecture

## Status

This document describes the intended architecture, not the current implementation. Today the repository is a stateless Next.js application shell with no authentication, database, object storage, AI, retrieval, or local-agent integration.

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
| Relational data | PostgreSQL hosted on Neon | Repository interface and standard SQL migrations |
| Private documents | Cloudflare R2 | Object-storage interface using opaque object keys |
| AI inference | Hosted AI API | Application-owned model gateway with provider-neutral requests and responses |
| Retrieval | To be selected later | Retrieval interface; metadata filters always enforce asset scope |
| Local agent | OpenClaw-based agent, later | Versioned, authenticated API rather than direct storage access |

The named vendors are deployment choices, not domain concepts. Domain and use-case code should not import vendor SDK types or persist provider-specific identifiers unless isolated in an adapter.

## Data model direction

PostgreSQL is the source of truth for structured records and relationships. The model will evolve through migrations, but the principal hierarchy is:

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

Every asset-owned record must carry an enforceable ownership path. Authorization and retrieval filters will scope every operation to an owner and asset once authentication is introduced.

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

1. **Domain:** asset, system, component, and document concepts and invariants.
2. **Application:** use cases and provider-neutral ports for repositories, object storage, retrieval, and AI inference.
3. **Infrastructure:** Neon/PostgreSQL, R2, hosted AI, and future retrieval adapters.
4. **Delivery:** Next.js routes, server actions, and UI that invoke application use cases.

Next.js is the delivery/runtime framework, not the location for provider-specific business logic. Server-only integrations must never be imported into client components.

## Security and operations direction

- Treat database credentials, object-storage credentials, and AI keys as server-only secrets.
- Keep R2 buckets private and authorize every upload and download.
- Validate file type and size; add malware scanning before making uploads generally available.
- Encrypt transport, rely on managed encryption at rest, and define backup and deletion policies.
- Log access and processing events without logging document contents or secrets.
- Apply tenant/asset authorization before storage lookup, retrieval, or AI context assembly.
- Minimize document content sent to an AI provider and establish retention/privacy settings before launch.

## Evolution sequence

1. Establish the deployable Next.js/TypeScript shell (current phase).
2. Define domain types and persistence migrations, then add PostgreSQL through a repository adapter.
3. Add authenticated ownership and authorization before exposing private records.
4. Add R2 through a storage adapter and implement secure document metadata/upload workflows.
5. Add text extraction and source-addressable document processing.
6. Evaluate retrieval approaches, then add vector search/RAG behind the retrieval interface.
7. Add a hosted model adapter and grounded, cited asset Q&A.
8. Integrate an OpenClaw-based local agent through a narrowly scoped, authenticated API only after its trust and sync model is defined.
