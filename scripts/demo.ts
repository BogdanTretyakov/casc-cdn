import { CascClient } from '../src/casc';
import { TactProduct } from '../src/types/tact';

async function main() {
  try {
    console.log('=== CASC Client Demo ===\n');

    // 1. Initialize CASC client (optional custom cache)
    console.log('[1/4] Initializing CASC client for Warcraft III (EU)...');

    // Example: Custom cache directory
    // const customCache = new CascCache('./my-custom-cache');
    // const client = await CascClient.init(TactProduct.WarcraftIII, 'eu', customCache);

    // Default cache
    const client = await CascClient.init(TactProduct.WarcraftIII, 'eu');

    console.log('✓ Client initialized!\n');

    // 2. Display basic info
    console.log('[2/4] Client Information:');
    console.log(`  Product: ${client.product}`);
    console.log(`  Region: ${client.region}`);

    // 3. Search files by path
    console.log('[3/4] Searching files by path...');

    // Example 1: Search for a specific file
    const customKeysPath = 'itemfunc.txt'; // Note: paths are lowercase in Root
    console.log(`\n  Searching for: ${customKeysPath}`);
    const customKeysEntries = client.getEntryByPath(customKeysPath);

    if (customKeysEntries && customKeysEntries.length > 0) {
      const entry = customKeysEntries[0];
      console.log(`  ✓ Found! CKey: ${entry?.contentKey}`);

      console.log(`  Downloading itemfunc.txt...`);
      const fileBuffer = await client.getFile(entry!.contentKey);

      if (fileBuffer) {
        console.log(`  ✓ Downloaded! Size: ${fileBuffer.length} bytes`);
        console.log(
          `  First 64 bytes (hex): ${fileBuffer.subarray(0, 64).toString('hex')}`,
        );
        console.log(
          `  First 64 bytes (text): ${fileBuffer
            .subarray(0, 64)
            .toString('utf8')
            .replace(/[^\x20-\x7E]/g, '.')}`,
        );
      } else {
        console.log(`  ✗ Failed to download`);
      }
    } else {
      console.log(`  ✗ Not found`);
    }

    console.log('\n=== Demo Complete ===');
  } catch (e) {
    console.error('\n✗ Error:', e);
  }
}

main();
