# ADR-006: Encrypted Persistence

| Field    | Value                |
|----------|----------------------|
| **Status**   | Accepted             |
| **Date**     | 2026-07-17           |
| **Authors**  | SmartDM Contributors |

## Context
SmartDM persists sensitive data such as download history, local file catalog metadata, application settings, temporary credentials, and diagnostic logs. To ensure privacy and security, especially on shared machines or in the event of device theft, this data must be protected at rest. However, actual downloaded files must remain accessible to other applications.

## Decision
1. **Scope of Encryption**: SmartDM will encrypt its own database, secrets, catalog, history, settings, temporary credentials, and production diagnostics.
2. **Exclusion of User Files**: Finished user downloads will remain in their normal original formats. There will be no silent re-encryption of downloaded files.
3. **Technology**: We will use SQLCipher (an SQLite extension) for encrypted database storage.
4. **Key Management**:
   - The database data-encryption key is generated randomly on first run.
   - On Windows, the key is protected using the Data Protection API (DPAPI).
   - On Linux, the key is protected using the Secret Service API.
   - If Secret Service is unavailable on Linux, SmartDM will fall back to a user-provided master password.
5. **Key Derivation**: Any password-based key wrapping will use a memory-hard Key Derivation Function (KDF), specifically Argon2id, with reviewed parameters.

## Consequences
- **Positive**: Strong protection of user metadata and credentials. Transparent to the user (unless Linux fallback is triggered). Downloads remain accessible to other apps.
- **Negative**: Increased complexity in database setup and key management. Performance overhead of SQLCipher compared to plaintext SQLite.

## References
- SQLCipher Documentation
- Argon2id Specifications
