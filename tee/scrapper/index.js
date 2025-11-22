const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;
const POLL_INTERVAL = 300000; // 5 minutes (300000ms)
const DATA_FILE = path.join(__dirname, 'addresses.json');

app.use(express.json());

// In-memory address database (Map for O(1) lookups)
let addressDatabase = new Map(); // Key: lowercase address, Value: {address, entity, source, addedAt}

// Normalize address to lowercase for deduplication
function normalizeAddress(address) {
  return address.toLowerCase();
}

// Add address to database (avoiding duplicates)
function addAddress(address, entity, source) {
  const normalizedAddr = normalizeAddress(address);
  
  if (!addressDatabase.has(normalizedAddr)) {
    addressDatabase.set(normalizedAddr, {
      address: address,
      entity: entity,
      source: source,
      addedAt: new Date().toISOString()
    });
    return true; // New address added
  }
  return false; // Duplicate, not added
}

// Load data from JSON file on startup
async function loadDataFromFile() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const jsonData = JSON.parse(data);
    
    // Reconstruct Map from JSON
    addressDatabase = new Map(Object.entries(jsonData));
    console.log(`[${new Date().toISOString()}] Loaded ${addressDatabase.size} addresses from file.`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`[${new Date().toISOString()}] No existing data file found. Starting fresh.`);
    } else {
      console.error(`[${new Date().toISOString()}] Error loading data:`, error.message);
    }
  }
}

// Save data to JSON file
async function saveDataToFile() {
  try {
    // Convert Map to object for JSON serialization
    const dataObject = Object.fromEntries(addressDatabase);
    await fs.writeFile(DATA_FILE, JSON.stringify(dataObject, null, 2));
    console.log(`[${new Date().toISOString()}] Saved ${addressDatabase.size} addresses to file.`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error saving data:`, error.message);
  }
}

// Scrape GitHub README
async function scrapeGitHub() {
  try {
    const url = 'https://github.com/ultrasoundmoney/ofac-ethereum-addresses';
    console.log(`[${new Date().toISOString()}] Polling GitHub: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    let newCount = 0;
    let totalCount = 0;

    $('article[itemprop="text"] code').each((i, el) => {
      const text = $(el).text().trim();
      
      if (/^0x[a-fA-F0-9]{40}$/.test(text)) {
        totalCount++;
        const parent = $(el).parent();
        const fullText = parent.text();
        const parts = fullText.split('—');
        const entity = parts.length > 1 ? parts[1].trim() : 'Unknown';
        
        if (addAddress(text, entity, 'GitHub')) {
          newCount++;
        }
      }
    });

    console.log(`[${new Date().toISOString()}] GitHub: Found ${totalCount} addresses, ${newCount} new.`);
    
    return {
      success: true,
      source: 'GitHub',
      totalScraped: totalCount,
      newAddresses: newCount,
      duplicates: totalCount - newCount
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] GitHub scraping error:`, error.message);
    return {
      success: false,
      source: 'GitHub',
      error: error.message
    };
  }
}

// Poll OFAC XML
async function pollOFACXML() {
  try {
    const xmlUrl = 'https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml';
    console.log(`[${new Date().toISOString()}] Polling OFAC XML: ${xmlUrl}`);
    
    const response = await axios.get(xmlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 60000 // 60 second timeout for large XML
    });

    const parser = new xml2js.Parser({ 
      explicitArray: false,
      tagNameProcessors: [xml2js.processors.stripPrefix] // Remove namespace prefixes
    });
    const result = await parser.parseStringPromise(response.data);
    
    // Find the FeatureType ID for Ethereum (ETH)
    const featureTypeValues = result?.Sanctions?.ReferenceValueSets?.FeatureTypeValues?.FeatureType;
    
    if (!featureTypeValues) {
      throw new Error('Could not find FeatureTypeValues in XML');
    }
    
    const featureTypes = Array.isArray(featureTypeValues) ? featureTypeValues : [featureTypeValues];
    
    // Find ETH feature type ID
    let ethFeatureTypeId = null;
    featureTypes.forEach(ft => {
      if (ft._ && ft._.includes('Digital Currency Address - ETH')) {
        ethFeatureTypeId = ft.$.ID;
        console.log(`[${new Date().toISOString()}] Found ETH FeatureType ID: ${ethFeatureTypeId}`);
      }
    });
    
    if (!ethFeatureTypeId) {
      throw new Error('ETH FeatureType ID not found');
    }
    
    // Find all addresses with this FeatureTypeID
    let newCount = 0;
    let totalCount = 0;
    
    const distinctParties = result?.Sanctions?.DistinctParties?.DistinctParty;
    
    if (!distinctParties) {
      throw new Error('Could not find DistinctParties in XML');
    }
    
    const parties = Array.isArray(distinctParties) ? distinctParties : [distinctParties];
    
    parties.forEach((party) => {
      // Get party name from Identity.Alias where Primary="true"
      let entityName = 'Unknown Entity';
      try {
        const identity = party.Profile?.Identity;
        if (identity?.Alias) {
          const aliases = Array.isArray(identity.Alias) ? identity.Alias : [identity.Alias];
          
          const primaryAlias = aliases.find(alias => {
            const attrs = alias.$ || {};
            return attrs.Primary === 'true' || attrs.Primary === true;
          }) || aliases[0];
          
          if (primaryAlias?.DocumentedName?.DocumentedNamePart?.NamePartValue) {
            const nameParts = Array.isArray(primaryAlias.DocumentedName.DocumentedNamePart.NamePartValue)
              ? primaryAlias.DocumentedName.DocumentedNamePart.NamePartValue
              : [primaryAlias.DocumentedName.DocumentedNamePart.NamePartValue];
            
            entityName = nameParts.map(part => {
              if (typeof part === 'string') return part;
              if (part._) return part._;
              return '';
            }).filter(Boolean).join(' ');
          }
        }
      } catch (e) {
        // Ignore name extraction errors
      }
      
      // Search for features with matching FeatureTypeID
      const profileFeatures = party.Profile?.Feature || party.Profile?.Features?.Feature;
      
      if (profileFeatures) {
        const features = Array.isArray(profileFeatures) ? profileFeatures : [profileFeatures];
        
        features.forEach(feature => {
          const featureTypeID = feature.$ ? feature.$.FeatureTypeID : feature.FeatureTypeID;
          
          if (String(featureTypeID) === String(ethFeatureTypeId)) {
            const featureVersion = feature.FeatureVersion;
            if (featureVersion) {
              const versions = Array.isArray(featureVersion) ? featureVersion : [featureVersion];
              
              versions.forEach(version => {
                const versionDetails = version.VersionDetail 
                  ? (Array.isArray(version.VersionDetail) ? version.VersionDetail : [version.VersionDetail])
                  : [];
                
                versionDetails.forEach(detail => {
                  let address = null;
                  if (typeof detail === 'string') {
                    address = detail.trim();
                  } else if (detail && detail._) {
                    address = detail._.trim();
                  } else if (detail) {
                    address = String(detail).trim();
                  }
                  
                  if (address && address.match(/^0x[a-fA-F0-9]{40}$/i)) {
                    totalCount++;
                    if (addAddress(address, entityName, 'OFAC XML')) {
                      newCount++;
                    }
                  }
                });
              });
            }
          }
        });
      }
    });

    console.log(`[${new Date().toISOString()}] OFAC XML: Found ${totalCount} addresses, ${newCount} new.`);
    
    return {
      success: true,
      source: 'OFAC XML',
      totalScraped: totalCount,
      newAddresses: newCount,
      duplicates: totalCount - newCount
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] OFAC XML polling error:`, error.message);
    return {
      success: false,
      source: 'OFAC XML',
      error: error.message
    };
  }
}

// Main polling function
async function pollAndSave() {
  console.log(`\n[${new Date().toISOString()}] ========== Starting Poll Cycle ==========`);
  
  const results = await Promise.all([
    scrapeGitHub(),
    pollOFACXML()
  ]);

  const totalNew = results.reduce((sum, r) => sum + (r.newAddresses || 0), 0);
  
  // Save to file after each poll
  await saveDataToFile();
  
  console.log(`[${new Date().toISOString()}] Poll cycle complete. Total addresses: ${addressDatabase.size}, New: ${totalNew}`);
  console.log(`[${new Date().toISOString()}] ========================================\n`);
  
  return results;
}

// Start polling
let pollInterval;
async function startPolling() {
  // Load existing data first
  await loadDataFromFile();
  
  // Perform initial poll
  await pollAndSave();
  
  // Set up interval
  pollInterval = setInterval(pollAndSave, POLL_INTERVAL);
  console.log(`Polling started. Will poll every ${POLL_INTERVAL / 1000} seconds (${POLL_INTERVAL / 60000} minutes).`);
}

// API Endpoints

// Check if a specific address exists
app.get('/check-address/:address', (req, res) => {
  const { address } = req.params;
  const normalizedAddr = normalizeAddress(address);
  
  if (addressDatabase.has(normalizedAddr)) {
    const data = addressDatabase.get(normalizedAddr);
    res.json({
      exists: true,
      sanctioned: true,
      data: data
    });
  } else {
    res.json({
      exists: false,
      sanctioned: false,
      message: 'Address not found in sanctions database'
    });
  }
});

// Get all addresses with filtering
app.get('/addresses', (req, res) => {
  const { entity, source, limit } = req.query;
  
  let addresses = Array.from(addressDatabase.values());
  
  // Filter by entity
  if (entity) {
    addresses = addresses.filter(a => 
      a.entity.toLowerCase().includes(entity.toLowerCase())
    );
  }
  
  // Filter by source
  if (source) {
    addresses = addresses.filter(a => 
      a.source.toLowerCase() === source.toLowerCase()
    );
  }
  
  // Apply limit
  const limitNum = parseInt(limit) || addresses.length;
  
  res.json({
    success: true,
    total: addresses.length,
    showing: Math.min(limitNum, addresses.length),
    addresses: addresses.slice(0, limitNum)
  });
});

// Get statistics
app.get('/stats', (req, res) => {
  const addresses = Array.from(addressDatabase.values());
  
  // Group by source
  const bySource = {};
  addresses.forEach(addr => {
    bySource[addr.source] = (bySource[addr.source] || 0) + 1;
  });
  
  // Group by entity
  const byEntity = {};
  addresses.forEach(addr => {
    byEntity[addr.entity] = (byEntity[addr.entity] || 0) + 1;
  });
  
  res.json({
    success: true,
    totalAddresses: addressDatabase.size,
    bySource: bySource,
    topEntities: Object.entries(byEntity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([entity, count]) => ({ entity, count }))
  });
});

// Manual trigger for polling
app.post('/poll-now', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Manual poll triggered via API`);
  const results = await pollAndSave();
  
  res.json({
    success: true,
    message: 'Polling completed',
    results: results,
    database: {
      totalAddresses: addressDatabase.size
    }
  });
});

// Get raw data (entire database)
app.get('/data', (req, res) => {
  const addresses = Array.from(addressDatabase.values());
  res.json({
    success: true,
    totalAddresses: addressDatabase.size,
    lastUpdated: addresses.length > 0 ? 
      addresses.reduce((latest, addr) => 
        addr.addedAt > latest ? addr.addedAt : latest, addresses[0].addedAt
      ) : null,
    addresses: addresses
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'OFAC Ethereum Address Scraper & Checker',
    endpoints: {
      'GET /check-address/:address': 'Check if a specific address is sanctioned',
      'GET /addresses': 'Get all addresses (supports ?entity=, ?source=, ?limit=)',
      'GET /stats': 'Get database statistics',
      'GET /data': 'Get all stored data',
      'POST /poll-now': 'Manually trigger a poll cycle'
    },
    polling: {
      status: pollInterval ? 'active' : 'inactive',
      interval: `${POLL_INTERVAL / 1000} seconds (${POLL_INTERVAL / 60000} minutes)`,
      sources: ['GitHub', 'OFAC XML']
    },
    database: {
      totalAddresses: addressDatabase.size,
      file: DATA_FILE
    }
  });
});

app.listen(PORT, async () => {
  console.log(`OFAC Address Scraper running on http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  http://localhost:${PORT}/check-address/<address>`);
  console.log(`  GET  http://localhost:${PORT}/addresses`);
  console.log(`  GET  http://localhost:${PORT}/stats`);
  console.log(`  GET  http://localhost:${PORT}/data`);
  console.log(`  POST http://localhost:${PORT}/poll-now`);
  console.log(`\nData will be stored in: ${DATA_FILE}`);
  
  // Start polling when server starts
  await startPolling();
});