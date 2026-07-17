# SmartDM

> A free, local-first download manager for Windows and Linux built with Java 21 LTS and JavaFX.

SmartDM is a powerful, privacy-first download manager that provides reliable high-speed segmented downloads, browser capture integration, media extraction, and local natural-language search. It operates completely locally with no proprietary backend, telemetry, or premium feature gates.

## Key Features

- **Reliable Transfers:** High-speed segmented downloading with pause, resume, retry, queues, and scheduling.
- **Browser Integration:** Native capture integration for Google Chrome and Mozilla Firefox.
- **Media Extraction:** Built-in YouTube and media selection powered by locally executed `yt-dlp` and `FFmpeg`.
- **Privacy & Security:** Local encryption for all managed secrets, history, catalogs, and settings. No accounts, cloud sync, or license servers.
- **Local File Intelligence:** Intelligent local file indexing, duplicate discovery, and smart destination-folder suggestions.
- **Natural Language Search:** Find downloaded files using natural language search directly on your device.
- **Optional AI Fallback:** Optional Gemini assistance using your own free API key behind an explicit consent gate.

## Technology Stack

- **Platform:** Java 21 LTS
- **Build System:** Gradle (Kotlin DSL)
- **UI Framework:** JavaFX with FXML/CSS
- **Database:** SQLite with FTS5, encrypted via SQLCipher
- **Media Tools:** yt-dlp and FFmpeg

## License

This project is open-source. (License to be finalized as per Phase 0 guidelines).
