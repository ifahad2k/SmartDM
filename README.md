# SmartDM

> A free, local-first download manager for Windows and Linux built with Java 21 LTS and JavaFX.

SmartDM is a powerful, privacy-first download manager that provides reliable high-speed segmented downloads. It operates completely locally with no proprietary backend, telemetry, or premium feature gates.

## Key Features (Available Now)

- **Reliable Transfers:** High-speed segmented downloading with dynamic pause, resume, and multi-threaded segmentation.
- **Crash Recovery:** Built-in SQLite persistence ensures download progress survives unexpected process termination.
- **Privacy & Security:** Local encryption for all managed secrets, history, and settings using AES/GCM and SQLCipher. No accounts, cloud sync, or license servers.

## In Development (Planned)

- **Browser Integration:** Native capture integration for Google Chrome and Mozilla Firefox.
- **Media Extraction:** Built-in video media selection powered by locally executed `yt-dlp` and `FFmpeg`.
- **Advanced Queues:** Multiple named queues and hierarchical bandwidth limiters.
- **Local File Intelligence:** Intelligent local file indexing and duplicate discovery.
- **Optional AI Fallback:** Optional Gemini assistance using your own free API key behind an explicit consent gate.

## Technology Stack

- **Platform:** Java 21 LTS
- **Build System:** Gradle (Kotlin DSL)
- **UI Framework:** JavaFX with FXML/CSS
- **Database:** SQLite with FTS5, encrypted via SQLCipher
- **Media Tools:** yt-dlp and FFmpeg (user-installed with guided setup)

## Building

```bash
# Linux
./gradlew clean check

# Windows
gradlew.bat clean check
```

## License

This project is licensed under the [GNU General Public License v3.0 or later](LICENSE) (GPL-3.0-or-later).

See [THIRD_PARTY_LICENSES.md](docs/architecture/THIRD_PARTY_LICENSES.md) for third-party dependency licenses.
