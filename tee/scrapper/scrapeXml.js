const fs = require('fs').promises;
const xml2js = require('xml2js');
const path = require('path');

const NAMESPACE = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ADVANCED_XML';

// Scrape Ethereum addresses from local OFAC XML file
async function scrapeFromXML() {
  try {
    const xmlPath = path.join(__dirname, 'sdn_advanced.xml');
    console.log(`Reading XML file: ${xmlPath}`);
    
    // Read the XML file
    const xmlData = await fs.readFile(xmlPath, 'utf8');
    console.log(`XML file loaded. Size: ${xmlData.length} characters`);
    
    // Parse XML with namespace handling
    const parser = new xml2js.Parser({ 
      explicitArray: false,
      tagNameProcessors: [xml2js.processors.stripPrefix] // Remove namespace prefixes
    });
    const result = await parser.parseStringPromise(xmlData);
    
    console.log('XML parsed successfully');
    
    // Step 1: Find the FeatureType ID for Ethereum (ETH)
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
        console.log(`Found ETH FeatureType ID: ${ethFeatureTypeId}`);
      }
    });
    
    if (!ethFeatureTypeId) {
      console.log('ETH FeatureType not found. Available feature types:');
      featureTypes.forEach(ft => {
        if (ft._ && ft._.includes('Digital Currency')) {
          console.log(`  - ${ft._} (ID: ${ft.$.ID})`);
        }
      });
      throw new Error('ETH FeatureType ID not found');
    }
    
    // Step 2: Find all addresses with this FeatureTypeID
    const addresses = [];
    const distinctParties = result?.Sanctions?.DistinctParties?.DistinctParty;
    
    if (!distinctParties) {
      throw new Error('Could not find DistinctParties in XML');
    }
    
    const parties = Array.isArray(distinctParties) ? distinctParties : [distinctParties];
    console.log(`Searching through ${parties.length} distinct parties...`);
    
    let partiesWithFeatures = 0;
    let featuresChecked = 0;
    let matchingFeatureTypeCount = 0;
    
    parties.forEach((party, partyIndex) => {
      // Get party name from Identity.Alias where Primary="true"
      let entityName = 'Unknown Entity';
      try {
        const identity = party.Profile?.Identity;
        if (identity?.Alias) {
          const aliases = Array.isArray(identity.Alias) ? identity.Alias : [identity.Alias];
          
          // Find the primary alias
          const primaryAlias = aliases.find(alias => {
            const attrs = alias.$ || {};
            return attrs.Primary === 'true' || attrs.Primary === true;
          }) || aliases[0]; // Fallback to first alias if no primary found
          
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
      // Features are directly under Profile, not under Identity
      const profileFeatures = party.Profile?.Feature || party.Profile?.Features?.Feature;
      
      if (profileFeatures) {
        partiesWithFeatures++;
        
        const features = Array.isArray(profileFeatures) ? profileFeatures : [profileFeatures];
        
        features.forEach(feature => {
          featuresChecked++;
          
          // Debug: Show first few features
          if (featuresChecked <= 5) {
            console.log(`\n[DEBUG] Feature ${featuresChecked}:`);
            console.log(`  Entity: ${entityName}`);
            console.log(`  Feature structure:`, JSON.stringify(feature, null, 2).substring(0, 500));
          }
          
          // Check if this feature matches our ETH FeatureTypeID
          // FeatureTypeID is an attribute on the Feature element
          const featureTypeID = feature.$ ? feature.$.FeatureTypeID : feature.FeatureTypeID;
          
          // Convert to string for comparison (ethFeatureTypeId might be string or number)
          if (String(featureTypeID) === String(ethFeatureTypeId)) {
            matchingFeatureTypeCount++;
            console.log(`\n[MATCH] Found matching FeatureTypeID for ${entityName}`);
            console.log(`  Full feature:`, JSON.stringify(feature, null, 2));
            
            // Extract the address from FeatureVersion.VersionDetail
            const featureVersion = feature.FeatureVersion;
            if (featureVersion) {
              // Handle both single and array of FeatureVersions
              const versions = Array.isArray(featureVersion) ? featureVersion : [featureVersion];
              
              versions.forEach(version => {
                // VersionDetail can be a string, object, or array
                const versionDetails = version.VersionDetail 
                  ? (Array.isArray(version.VersionDetail) ? version.VersionDetail : [version.VersionDetail])
                  : [];
                
                versionDetails.forEach(detail => {
                  // Extract address from VersionDetail
                  let address = null;
                  if (typeof detail === 'string') {
                    address = detail.trim();
                  } else if (detail && detail._) {
                    address = detail._.trim();
                  } else if (detail) {
                    // Sometimes it's just the text content
                    address = String(detail).trim();
                  }
                  
                  if (address) {
                    console.log(`  VersionDetail: ${address}`);
                    
                    // Verify it's a valid Ethereum address
                    if (address.match(/^0x[a-fA-F0-9]{40}$/i)) {
                      console.log(`  ✓ Valid ETH address found!`);
                      addresses.push({
                        address: address,
                        entity: entityName,
                        source: 'OFAC XML'
                      });
                    } else {
                      console.log(`  ✗ Not a valid ETH address format`);
                    }
                  }
                });
                
                if (versionDetails.length === 0) {
                  console.log(`  ✗ No VersionDetail found in FeatureVersion`);
                }
              });
            } else {
              console.log(`  ✗ No FeatureVersion found`);
            }
          }
        });
      }
    });
    
    console.log(`\nStatistics:`);
    console.log(`  Parties with features: ${partiesWithFeatures}`);
    console.log(`  Total features checked: ${featuresChecked}`);
    console.log(`  Features matching ETH FeatureTypeID (${ethFeatureTypeId}): ${matchingFeatureTypeCount}`);
    
    // Deduplicate addresses
    const uniqueAddresses = [];
    const seen = new Set();
    
    addresses.forEach(addr => {
      const key = addr.address.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueAddresses.push(addr);
      }
    });
    
    console.log(`\n========================================`);
    console.log(`Total Ethereum addresses found: ${uniqueAddresses.length}`);
    console.log(`Duplicates removed: ${addresses.length - uniqueAddresses.length}`);
    console.log(`========================================\n`);
    
    if (uniqueAddresses.length > 0) {
      // Save to JSON file
      const outputPath = path.join(__dirname, 'ofac_eth_addresses.json');
      await fs.writeFile(outputPath, JSON.stringify(uniqueAddresses, null, 2));
      console.log(`Addresses saved to: ${outputPath}`);
      
      // Also save just the addresses as text file (like the Python script)
      const txtPath = path.join(__dirname, 'sanctioned_addresses_ETH.txt');
      const addressList = uniqueAddresses.map(a => a.address).sort().join('\n');
      await fs.writeFile(txtPath, addressList + '\n');
      console.log(`Address list saved to: ${txtPath}`);
      
      // Print summary by entity
      const byEntity = {};
      uniqueAddresses.forEach(addr => {
        byEntity[addr.entity] = (byEntity[addr.entity] || 0) + 1;
      });
      
      console.log('\nAddresses by entity:');
      Object.entries(byEntity)
        .sort((a, b) => b[1] - a[1])
        .forEach(([entity, count]) => {
          console.log(`  ${entity}: ${count}`);
        });
    } else {
      console.log('No Ethereum addresses found in the XML file.');
    }
    
    return uniqueAddresses;
    
  } catch (error) {
    console.error('Error scraping XML:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Run the scraper
if (require.main === module) {
  console.log('Starting OFAC XML Scraper for Ethereum addresses...\n');
  scrapeFromXML()
    .then(addresses => {
      console.log('\nScraping completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nScraping failed!');
      process.exit(1);
    });
}

module.exports = { scrapeFromXML };