# Product

## Vision

Ernest gives boat and RV owners one trustworthy place to understand and care for a complex asset. It combines structured equipment records with the manuals, invoices, diagrams, and notes that owners otherwise keep across binders, inboxes, and folders.

The long-term experience is an asset-aware assistant: an owner asks a question about *their* boat or RV and receives an answer grounded in the components installed on that asset and the documentation attached to it.

## MVP user

The initial user is an individual owner who maintains one or more boats or RVs and needs to quickly find accurate, asset-specific information. Multi-user organizations, fleets, service providers, and marketplaces are outside the MVP.

## MVP workflow

1. **Create an asset.** Record whether it is a boat or RV, along with a name and core identifying details such as make, model, year, and serial or registration information.
2. **Inventory systems and components.** Organize installed equipment into systems (for example electrical, propulsion, plumbing, HVAC, or navigation) and capture manufacturer, model, serial number, installation notes, and other useful structured facts.
3. **Upload documentation.** Attach manuals, receipts, service records, diagrams, and owner notes to the relevant asset, system, or component. Files remain private.
4. **Review the asset record.** Browse the hierarchy and retrieve the source documentation without needing AI.
5. **Ask asset-specific questions.** In a later MVP increment, ask questions in natural language and receive answers based on the selected asset's structured data and documents, with links back to sources.

## MVP outcomes

- Owners can build a coherent digital record of a boat or RV.
- Equipment and documentation are associated with the correct asset and component.
- Original documents remain retrievable and useful independently of AI.
- Future answers are scoped to the selected asset and grounded in attributable sources.
- The product clearly communicates uncertainty when the owner's records do not support an answer.

## Product principles

- **Asset-specific by default:** Never silently mix records between assets.
- **Sources over confidence:** Show where an answer came from and make the original document easy to inspect.
- **Structured where it matters:** Preserve component identity and relationships instead of treating every record as undifferentiated text.
- **Private by design:** Asset records and uploaded documents are private unless an owner deliberately shares them.
- **Useful without AI:** Inventory and document retrieval must stand on their own.
- **Owner control:** Owners can correct structured facts, replace documents, and remove their data.

## Not in the initial build

- Authentication or account management
- Database persistence
- File uploads or object storage integration
- AI question answering, embeddings, vector search, or RAG
- OpenClaw or any other local agent
- Automated maintenance diagnosis or safety-critical decision-making
- Fleet, technician, billing, or collaboration workflows

These capabilities should be introduced incrementally after the application foundation and data model are validated.
