# SmartDM — Release Process & Binary Packaging Standards

## 1. Versioning & Tag Standards
- Release tags follow Semantic Versioning: `vMAJOR.MINOR.PATCH` (e.g. `v1.0.0`).
- Every tagged release MUST contain binary assets attached directly to the GitHub Release object.

## 2. Release Asset Naming Conventions
- **Windows Setup**: `SmartDM-Setup-v1.0.0.exe`
- **Linux AppImage**: `SmartDM-1.0.0-x86_64.AppImage`
- **Linux DEB Package**: `smartdm_1.0.0_amd64.deb`
- **Checksum Manifest**: `SHA256SUMS.txt`

## 3. Checksum Verification Procedure
Every release release pipeline automatically computes SHA-256 hashes for output binaries:
```bash
# Generating checksum manifest
sha256sum SmartDM-Setup-v1.0.0.exe SmartDM-1.0.0-x86_64.AppImage smartdm_1.0.0_amd64.deb > SHA256SUMS.txt
```
Users verify files on Windows using `Get-FileHash -Algorithm SHA256 <filename>` and on Linux using `sha256sum <filename>`.
