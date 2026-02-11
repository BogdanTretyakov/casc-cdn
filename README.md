# casc-cdn

A modern TypeScript library for downloading and extracting files from Blizzard's CASC (Content Addressable Storage Container) archives via CDN.

## Features

- 🚀 **High-level API** - Simple, intuitive interface for downloading game files
- 📦 **CDN-based** - Downloads directly from Blizzard's CDN servers (no game installation required)
- 💾 **Built-in caching** - Automatic file caching to minimize network requests
- 🔍 **File search** - Search files by path with case-insensitive matching
- ⚡ **Batch downloads** - Optimized multi-file downloads grouped by archive
- 📝 **Full TypeScript** - Complete type definitions included

## Compatibility

✅ **Tested with Warcraft III: Reforged**
⚠️ **May work with other Blizzard games** (World of Warcraft, Diablo, etc.) but untested

## Limitations

- ❌ No support for patch files
- ❌ No support for encrypted files
- ❌ Archive-only (requires files to be in archives, not loose CDN files)

## Installation

```bash
npm install casc-cdn
```

## Quick Start

```typescript
import { CascClient, TactProduct } from 'casc-cdn';

// Initialize client for Warcraft III (EU region)
const client = await CascClient.init(TactProduct.WarcraftIII, 'eu');

// Search for a file by path
const entries = client.getEntryByPath('itemfunc.txt');

if (entries.length > 0) {
  // Download the file
  const fileBuffer = await client.getFile(entries[0].contentKey);
  console.log(fileBuffer.toString('utf8'));
}
```

## API Reference

### Initialization

```typescript
import { CascClient, TactProduct, CascCache } from 'casc-cdn';

// Use default cache (node_modules/.cache/casc-cdn)
const client = await CascClient.init(TactProduct.WarcraftIII, 'eu');

// Use custom cache directory
const customCache = new CascCache('./my-cache');
const client = await CascClient.init(
  TactProduct.WarcraftIII,
  'us',
  customCache,
);
```

**Available Regions:** `'us'` | `'eu'` | `'kr'` | `'cn'`

**Available Products:**

- `TactProduct.WarcraftIII` - Warcraft III: Reforged
- Other products may work but are untested

### Searching Files

```typescript
// Case-insensitive partial match
const entries = client.getEntryByPath('units.slk');

// Search returns an array of matching entries
entries.forEach((entry) => {
  console.log(entry.contentKey); // File's content key (hash)
  console.log(entry.localeFlags); // Locale information
});
```

### Downloading Files

#### Single File

```typescript
// Download by content key
const fileBuffer = await client.getFile(contentKey);

if (fileBuffer) {
  // File successfully downloaded
  console.log(fileBuffer.toString('utf8'));
} else {
  // File not found
  console.log('File not available');
}
```

#### Multiple Files (Batch)

```typescript
// Promise-based: Returns all files at once
const files = await client.getFiles([cKey1, cKey2, cKey3]);
console.log(files[cKey1].toString('utf8'));

// Callback-based: Process files as they download
client.getFiles([cKey1, cKey2, cKey3], (cKey, data) => {
  console.log(`Downloaded ${cKey}: ${data.length} bytes`);
});
```

## Examples

### Example 1: Extract All Unit Data Files

```typescript
import { CascClient, TactProduct } from 'casc-cdn';
import fs from 'fs/promises';

const client = await CascClient.init(TactProduct.WarcraftIII, 'eu');

// Find all .slk files (unit data)
const slkFiles = client.getEntryByPath('.slk');

console.log(`Found ${slkFiles.length} SLK files`);

// Download all SLK files
const cKeys = slkFiles.map((entry) => entry.contentKey);
const files = await client.getFiles(cKeys);

// Save to disk
for (const [cKey, data] of Object.entries(files)) {
  const entry = slkFiles.find((e) => e.contentKey === cKey);
  const filename = entry?._normalizedPath?.split('/').pop() || cKey;
  await fs.writeFile(`./output/${filename}`, data);
}

console.log('All SLK files extracted!');
```

### Example 2: Search and Download Locale File

```typescript
import { CascClient, TactProduct } from 'casc-cdn';

const client = await CascClient.init(TactProduct.WarcraftIII, 'eu');

// Search for item functions file
const entries = client.getEntryByPath('a01garithos01.flac');

const soundEntry = entries.find((e) => e.localeFlags.ruRU);

if (soundEntry) {
  const fileData = await client.getFile(soundEntry.contentKey);

  if (fileData) {
    // Parse the file content
    const content = fileData.toString('utf8');
    const lines = content.split('\n');

    console.log(`File has ${lines.length} lines`);
    console.log('First 10 lines:');
    console.log(lines.slice(0, 10).join('\n'));
  }
}
```

### Example 3: Custom Cache Location

```typescript
import { CascClient, TactProduct, CascCache } from 'casc-cdn';

// Store cache in project directory
const cache = new CascCache('./casc-cache');
const client = await CascClient.init(TactProduct.WarcraftIII, 'eu', cache);

// Subsequent runs will use cached data
const entries = client.getEntryByPath('units.slk');
const fileData = await client.getFile(entries[0].contentKey);
```

## How It Works

1. **Initialization**: Fetches CDN configuration, version info, and builds internal indices
2. **File Search**: Searches the root file for path-to-content-key mappings
3. **File Lookup**: Resolves content keys to encoded keys via encoding table
4. **Location Finding**: Locates files in archive indices
5. **Download**: Downloads archive chunks from CDN
6. **Decompression**: Decodes BLTE-compressed data
7. **Caching**: Stores downloaded data for future use

## Architecture

```
CascClient
├── BlizzardAPI      - HTTP client for CDN requests
├── CascCache        - File-based caching layer
├── EncodingTable    - Maps content keys to encoded keys
├── IndexTable       - Maps encoded keys to archive locations
└── RootFile         - Maps file paths to content keys
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Acknowledgments

- Based on the [TACT protocol](https://wowdev.wiki/TACT) used by Blizzard Entertainment
- Inspired by various CASC implementations in the community
