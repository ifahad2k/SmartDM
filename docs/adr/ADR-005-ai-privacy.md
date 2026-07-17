# ADR-005: AI Privacy

| Field    | Value                |
|----------|----------------------|
| **Status**   | Accepted             |
| **Date**     | 2026-07-17           |
| **Authors**  | SmartDM Contributors |

## Context
SmartDM includes an optional Gemini fallback for local natural language search and file organization. The Gemini API (free tier) terms of service stipulate that Google may use free-tier content to improve its products and that human reviewers may process inputs and outputs. Therefore, we must establish strict data boundaries and user consent mechanisms to ensure no sensitive or unauthorized data is transmitted to Gemini.

## Decision
1. **Disabled by Default**: The Gemini feature is off by default.
2. **User-Provided API Key**: The user must supply their own Gemini API key. SmartDM does not provide a shared key or backend.
3. **Consent Levels**:
   - `OFF`: (Default) No data is ever sent to Gemini.
   - `ASK_EVERY_TIME`: The user must explicitly approve every single payload before it is sent.
   - `ALLOW_SELECTED_SANITIZED_FIELDS`: The user pre-approves certain types of non-sensitive sanitized data (e.g., file extensions, sizes) to be sent automatically.
4. **Strict Payload Preview**: Before any request is sent under `ASK_EVERY_TIME` or during the initial configuration of `ALLOW_SELECTED_SANITIZED_FIELDS`, SmartDM must display the exact payload, the destination, the reason for the request, and a warning about the free-tier data terms.
5. **Prohibited Data**: SmartDM will *never* send:
   - File bytes or contents
   - Complete directory trees
   - File hashes
   - Browser cookies or authorization headers
   - Arbitrary system metadata
6. **Data Sanitization**: Paths and filenames are removed or obfuscated by default. The user may explicitly choose to include a filename or query only when they understand and accept the disclosure.
7. **Local Fallback**: Declining a Gemini request must immediately invoke the local search/fallback mechanism without breaking core functionality.

## Consequences
- **Positive**: Complete transparency and control for the user over their data. No accidental leakage of sensitive information to third-party AI models.
- **Negative**: Increased friction for users who want to use AI features, as they must provide their own key and navigate consent dialogues.

## References
- Gemini API Pricing & Terms
- Data Inventory Document
