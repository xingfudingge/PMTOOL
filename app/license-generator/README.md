# PMTool License Generator

A standalone Tauri desktop application for generating PMTool licenses using Ed25519 cryptographic signing.

## Features

- **Secure Key Generation**: Uses Ed25519 (ed25519-dalek v2.0) for cryptographic signing
- **User-Specific Keys**: Private keys stored in `~/.pmtool/license_generator_private.pem`
- **Simple UI**: Clean HTML/CSS form for license generation
- **Flexible License Types**: TRIAL, YEAR, PERPETUAL
- **Edition Support**: STANDARD, PROFESSIONAL, ENTERPRISE
- **Custom Features**: Optional feature flags for different license tiers

## License Format

```
PMT1-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
```

The license contains:
- Base64-encoded JSON payload
- Ed25519 signature for verification
- UUID-based license ID
- ISO8601 timestamps

## Installation & Running

### Prerequisites

- Rust (1.70+)
- Node.js (18+)
- macOS: Xcode Command Line Tools
- Linux: libwebkit2gtk-4.0-dev, libssl-dev, libsoup2.4-dev, libjavascriptcoregtk-4.0-dev

### Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
# or
npm run tauri:dev
```

### Production Build

```bash
npm run tauri:build
```

## Key Storage

- **Private Key**: `~/.pmtool/license_generator_private.pem`
- **Public Key**: `~/.pmtool/license_generator_public.pem`

Keys are auto-generated on first run if they don't exist.

## License Payload Structure

```json
{
  "product": "PMTool",
  "license_id": "{uuid}",
  "device_id": "{input}",
  "license_type": "{TRIAL|YEAR|PERPETUAL}",
  "start_time": "{ISO8601}",
  "expire_time": "{ISO8601}",
  "edition": "{STANDARD|PROFESSIONAL|ENTERPRISE}",
  "features": ["feature1", "feature2"],
  "customer_name": "{input}"
}
```

## Project Structure

```
license-generator/
├── src/
│   └── main.rs -> src-tauri/src/main.rs  # Tauri commands and business logic
├── src-tauri/
│   ├── src/
│   │   └── main.rs                       # Tauri commands and business logic
│   ├── Cargo.toml                        # Rust dependencies
│   ├── tauri.conf.json                   # Tauri configuration
│   ├── build.rs                          # Build script
│   └── icons/                            # App icons
├── index.html                            # Frontend UI
├── package.json                          # NPM scripts
└── Cargo.toml                            # Root Cargo config
```

## License Verification

To verify a license:
1. Extract the signature and payload from the license string
2. Base64 decode both parts
3. Verify signature using public key from `~/.pmtool/license_generator_public.pem`
4. Decode and validate JSON payload

## Security Notes

- Private key never leaves the local machine
- License verification should be done on the client side with embedded public key
- For production, consider using secure enclave/HSM for key storage
