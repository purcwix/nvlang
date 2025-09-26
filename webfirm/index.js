// index.js
const fs = require('fs');
const path = require('path');
const Webfirm = require('./webfirm'); // Import the Webfirm class

// Define input DSL file path
const dslFilePath = path.join(__dirname, 'webfirm.dsl');

console.log(`--- Webfirm DSL Processing ---`);
console.log(`Reading DSL from: ${dslFilePath}`);

// Read the DSL file asynchronously
fs.readFile(dslFilePath, 'utf8', (err, dslString) => {
    if (err) {
        console.error(`Error reading DSL file: ${err.message}`);
        return;
    }

    console.log('\nDSL file read successfully. Parsing...');

    try {
        // 1. Parse the DSL string using the static parse method
        const parsedData = Webfirm.parse(dslString);
        console.log('\nDSL parsed successfully. Raw Parsed Data:');
        console.log(JSON.stringify(parsedData, null, 2));

        // 2. Create a new Webfirm instance with the parsed data
        const myWeb = new Webfirm(parsedData);
        console.log('\nWebfirm instance created.');

        // 3. Access data using the enhanced 'access' method
        console.log('\n--- Accessing Data ---');

        // Example: access('google', 'descriptions')
        let result1 = myWeb.access('google', 'descriptions');
        console.log(`myWeb.access('google', 'descriptions'):`);
        console.log(result1 ? result1 : 'Not found'); // Directly print the string description

        // Example: access('youtube', 'titles')
        let result2 = myWeb.access('youtube', 'titles');
        console.log(`\nmyWeb.access('youtube', 'titles'):`);
        console.log(result2 ? result2 : 'Not found');

        // Example: access('Online Encyclopedia') - returns the full object
        let result3 = myWeb.access('Online Encyclopedia');
        console.log(`\nmyWeb.access('Online Encyclopedia'):`);
        console.log(result3 ? JSON.stringify(result3, null, 2) : 'Not found');

        // Example: access('Watch videos', 'sites')
        let result4 = myWeb.access('Watch videos', 'sites');
        console.log(`\nmyWeb.access('Watch videos', 'sites'):`);
        console.log(result4 ? result4 : 'Not found');

        // Example: Accessing a nonexistent value
        let result5 = myWeb.access('nonexistent');
        console.log(`\nmyWeb.access('nonexistent'):`);
        console.log(result5 ? JSON.stringify(result5, null, 2) : 'Not found');

        // Example: Accessing a valid value but requesting a nonexistent key
        let result6 = myWeb.access('google', 'nonExistentKey');
        console.log(`\nmyWeb.access('google', 'nonExistentKey'):`);
        console.log(result6 ? result6 : 'Not found');


        // You can also access the raw parsed data directly if needed
        console.log('\n--- Raw Parsed Data from instance ---');
        console.log(JSON.stringify(myWeb.getParsedData(), null, 2));

    } catch (error) {
        console.error(`\nAn error occurred during Webfirm processing: ${error.message}`);
    }
});