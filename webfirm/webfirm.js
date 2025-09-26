/**
 * The Webfirm class provides methods to parse Webfirm DSL and access structured data.
 */
class Webfirm {
    /**
     * @private
     * @type {Object} Stores the interpreted relationships and data.
     * Example:
     * {
     * webfirmOriginal: { "contact listing": [{ sites: "google", titles: "Search Engine", ... }] },
     * neuralNetwork: {
     * nodes: { ... },
     * layers: { ... },
     * connections: { ... }, // Auto-generated
     * // adjacencyList: { ... } // Could be added for graph traversal
     * }
     * }
     */
    parsedData;

    /**
     * Creates an instance of Webfirm.
     * @param {Object} parsedData - The structured data object obtained from Webfirm.parse().
     */
    constructor(parsedData) {
        if (typeof parsedData !== 'object' || parsedData === null) {
            throw new Error("Webfirm constructor expects a parsed data object.");
        }
        this.parsedData = parsedData;
    }

    /**
     * Helper to parse a JSON-like object string.
     * Assumes the content inside curly braces is valid JSON.
     * @param {string} objString - The string representing the object (e.g., "{ key: 'value', num: 1.0 }")
     * @returns {Object|null} Parsed object or null if invalid.
     * @private
     */
    static _parseJsonLikeObject(objString) {
        if (!objString || !objString.startsWith('{') || !objString.endsWith('}')) {
            // This is an internal error in how objString is formed, or the DSL is not JSON-like.
            // The original error was `[-0.1, 0.1}` which was missing `]}`
            // This method *expects* the string it receives to start with { and end with }
            console.error("Invalid object string format passed to _parseJsonLikeObject (missing outer curly braces):", objString);
            return null;
        }
        try {
            // A quick and dirty way to parse JSON-like objects with unquoted keys.
            // This regex also handles strings with single quotes by changing them to double quotes.
            const jsonString = objString
                .replace(/(\w+)\s*:/g, '"$1":') // Quote unquoted keys
                .replace(/'([^']+)'/g, '"$1"'); // Change single quotes to double quotes

            return JSON.parse(jsonString);
        } catch (e) {
            console.error("Failed to parse JSON-like object (JSON.parse error):", objString, e);
            return null;
        }
    }

    /**
     * Parses a Webfirm DSL string into a structured JavaScript object.
     * This is a static method, meaning you call it directly on the class: `Webfirm.parse(dslString)`.
     * @param {string} dslString - The Webfirm DSL input string.
     * @returns {Object} An object containing interpreted relationships and data.
     */
    static parse(dslString) {
        // Clean the input string: remove extra newlines, tabs, and trim whitespace
        const cleanedString = dslString.replace(/[\t]/g, '').trim(); // Keep newlines for section parsing if needed by regex

        // Extract content within the outermost curly braces
        const contentMatch = cleanedString.match(/\{(.*)\}/s); // `s` flag for single line mode to match across newlines
        if (!contentMatch || contentMatch.length < 2) {
            console.error("Invalid DSL format: Missing outer curly braces.");
            return {};
        }
        const content = contentMatch[1].trim(); // This 'content' is everything *inside* the outer {}

        // Initialize containers for all sections
        let webfirmOriginalData = {}; // For data:: section
        let webfirmOriginalRelationships = {}; // For priority:: section

        let nnNodes = {}; // For nodes:: section
        let nnLayers = { layer_order: [] }; // For layers:: section
        let nnConnectivityRules = []; // For connectivity_rules:: section

        // Regex to find all sections and their content.
        const sectionTypes = ['data::', 'priority::', 'nodes::', 'layers::', 'connectivity_rules::'];
        const sectionRegex = new RegExp(
            `section\\s*(${sectionTypes.join('|')})\\s*([\\s\\S]*?)(?=(?:section\\s*(?:${sectionTypes.join('|')}))|$)`, 'g'
        );
        let match;

        // Iterate through all matches found by the regex
        while ((match = sectionRegex.exec(content)) !== null) {
            const headerType = match[1].trim();
            const sectionContent = match[2].trim();

            switch (headerType) {
                case 'data::':
                    const dataLines = sectionContent.split(';').filter(line => line.trim() !== '');
                    dataLines.forEach(line => {
                        const parts = line.split(':').map(p => p.trim());
                        if (parts.length >= 2) {
                            const key = parts[0];
                            let valueString = parts.slice(1).join(':').trim();

                            if (valueString.startsWith('[') && valueString.endsWith(']')) {
                                valueString = valueString.substring(1, valueString.length - 1);
                                const arrayElements = valueString.split(',').map(el =>
                                    el.trim().replace(/^['"]|['"]$/g, '')
                                );
                                webfirmOriginalData[key] = arrayElements;
                            } else {
                                webfirmOriginalData[key] = valueString.replace(/^['"]|['"]$/g, '');
                            }
                        }
                    });
                    break;

                case 'priority::':
                    const relationshipLines = sectionContent.split(';').filter(line => line.trim() !== '');
                    relationshipLines.forEach(line => {
                        const parts = line.split(':').map(p => p.trim());
                        if (parts.length >= 2 && parts[1].startsWith('set [')) {
                            const relationshipName = parts[0];
                            const setContent = parts[1].substring('set ['.length, parts[1].length - 1).trim();

                            const arrowIndex = setContent.indexOf('=>');
                            if (arrowIndex !== -1) {
                                const primaryKey = setContent.substring(0, arrowIndex).trim();
                                const relatedKeysString = setContent.substring(arrowIndex + 2).trim();
                                const relatedKeys = relatedKeysString.split(',').map(k => k.trim());
                                webfirmOriginalRelationships[relationshipName] = {
                                    primary: primaryKey,
                                    related: relatedKeys
                                };
                            } else {
                                console.warn(`Malformed 'set' rule in priority section: ${line}`);
                            }
                        } else {
                            console.warn(`Malformed line in priority section: ${line}`);
                        }
                    });
                    break;

                case 'nodes::':
                    const nodeLines = sectionContent.split(';').filter(line => line.trim() !== '');
                    nodeLines.forEach(line => {
                        const firstColonIndex = line.indexOf(':');
                        if (firstColonIndex > -1) {
                            const nodeId = line.substring(0, firstColonIndex).trim();
                            const objString = line.substring(firstColonIndex + 1).trim();
                            const nodeProps = Webfirm._parseJsonLikeObject(objString);
                            if (nodeProps) {
                                nnNodes[nodeId] = nodeProps;
                            }
                        }
                    });
                    break;

                case 'layers::':
                    const layerLines = sectionContent.split(';').filter(line => line.trim() !== '');
                    layerLines.forEach(line => {
                        const firstColonIndex = line.indexOf(':');
                        if (firstColonIndex > -1) {
                            const key = line.substring(0, firstColonIndex).trim();
                            const valueString = line.substring(firstColonIndex + 1).trim();

                            if (key === 'layer_order') {
                                if (valueString.startsWith('[') && valueString.endsWith(']')) {
                                    const orderArrayString = valueString.substring(1, valueString.length - 1);
                                    nnLayers.layer_order = orderArrayString.split(',').map(el =>
                                        el.trim().replace(/^['"]|['"]$/g, '')
                                    );
                                } else {
                                    console.warn(`Malformed layer_order in layers section: ${line}`);
                                }
                            } else {
                                const layerProps = Webfirm._parseJsonLikeObject(valueString);
                                if (layerProps) {
                                    nnLayers[key] = layerProps;
                                }
                            }
                        }
                    });
                    break;

                case 'connectivity_rules::':
                    const ruleLines = sectionContent.split(';').filter(line => line.trim() !== '');
                    ruleLines.forEach(line => {
                        const arrowIndex = line.indexOf('->');
                        // For connectivity rules, properties are enclosed in SQUARE brackets,
                        // but the content *inside* is a JSON-like object.
                        const openBracketIndex = line.indexOf('[', arrowIndex); // Find '[' after '->'
                        const closeBracketIndex = line.lastIndexOf(']'); // Find ']' from the end of the line

                        if (arrowIndex > -1 && openBracketIndex > -1 && closeBracketIndex > -1 && closeBracketIndex > openBracketIndex) {
                            const sourceLayer = line.substring(0, arrowIndex).trim();
                            const targetLayer = line.substring(arrowIndex + 2, openBracketIndex).trim();
                            // Extract content *inside* the square brackets
                            const rulePropsContent = line.substring(openBracketIndex + 1, closeBracketIndex).trim();

                            // Wrap this content in curly braces to form a proper JSON-like object string
                            const rulePropsStringForParsing = `{${rulePropsContent}}`;

                            const ruleProps = Webfirm._parseJsonLikeObject(rulePropsStringForParsing);

                            if (ruleProps) {
                                nnConnectivityRules.push({
                                    sourceLayer,
                                    targetLayer,
                                    ...ruleProps
                                });
                            }
                        } else {
                            console.warn(`Malformed connectivity rule: ${line}`);
                        }
                    });
                    break;
                default:
                    console.warn(`Unrecognized section type: ${headerType}`);
            }
        }

        // --- INTERPRETATION PHASE: Original Webfirm Relationships ---
        const interpretedWebfirmOriginal = {};
        for (const relName in webfirmOriginalRelationships) {
            const rel = webfirmOriginalRelationships[relName];
            const primaryArray = webfirmOriginalData[rel.primary];

            if (!primaryArray || !Array.isArray(primaryArray)) {
                console.error(`Error: Primary key '${rel.primary}' not found or is not an array in the 'data' section for relationship '${relName}'.`);
                interpretedWebfirmOriginal[relName] = [];
                continue;
            }

            const resultList = [];
            for (let i = 0; i < primaryArray.length; i++) {
                const item = { [rel.primary]: primaryArray[i] };
                let isValidEntry = true;

                for (const rKey of rel.related) {
                    const relatedArray = webfirmOriginalData[rKey];
                    if (relatedArray && Array.isArray(relatedArray) && i < relatedArray.length) {
                        item[rKey] = relatedArray[i];
                    } else {
                        console.warn(`Warning: Related key '${rKey}' not found or index ${i} out of bounds for '${rel.primary}'. This entry might be incomplete.`);
                        isValidEntry = false;
                        break;
                    }
                }
                if (isValidEntry) {
                    resultList.push(item);
                }
            }
            interpretedWebfirmOriginal[relName] = resultList;
        }

        // --- INTERPRETATION PHASE: Neural Network Auto-Connections ---
        const generatedNNConnections = {};
        const layersToNodesMap = {};
        for (const nodeId in nnNodes) {
            const layerName = nnNodes[nodeId].layer;
            if (layerName) {
                if (!layersToNodesMap[layerName]) {
                    layersToNodesMap[layerName] = [];
                }
                layersToNodesMap[layerName].push(nodeId);
            } else {
                console.warn(`Node '${nodeId}' has no 'layer' property, skipping for auto-connection.`);
            }
        }

        for (let i = 0; i < nnLayers.layer_order.length - 1; i++) {
            const currentLayerName = nnLayers.layer_order[i];
            const nextLayerName = nnLayers.layer_order[i + 1];

            const currentLayerNodes = layersToNodesMap[currentLayerName];
            const nextLayerNodes = layersToNodesMap[nextLayerName];

            if (!currentLayerNodes || !nextLayerNodes) {
                console.warn(`Missing nodes for layer '${currentLayerName}' or '${nextLayerName}'. Cannot auto-connect.`);
                continue;
            }

            // Find a rule where the sourceLayer and targetLayer match current and next layers
            const rule = nnConnectivityRules.find(r =>
                r.sourceLayer === currentLayerName && r.targetLayer === nextLayerName
            );

            if (!rule) {
                console.warn(`No connectivity rule found for ${currentLayerName} -> ${nextLayerName}. Skipping auto-connection.`);
                continue;
            }

            if (rule.type === 'fully_connected' || rule.type === 'dense') {
                for (const sourceNodeId of currentLayerNodes) {
                    for (const targetNodeId of nextLayerNodes) {
                        const connectionId = `conn_${sourceNodeId}_${targetNodeId}`;
                        let initialWeight = 0; // Default weight

                        if (typeof rule.initial_weight === 'number') {
                            initialWeight = rule.initial_weight;
                        } else if (Array.isArray(rule.initial_weight_range) && rule.initial_weight_range.length === 2) {
                            const [min, max] = rule.initial_weight_range;
                            initialWeight = Math.random() * (max - min) + min;
                        }

                        generatedNNConnections[connectionId] = {
                            source: sourceNodeId,
                            target: targetNodeId,
                            weight: initialWeight, // Or random from range
                            type: rule.type
                        };
                    }
                }
            } else {
                console.warn(`Unsupported connectivity rule type: ${rule.type}.`);
            }
        }

        return {
            webfirmOriginal: {
                data: webfirmOriginalData, // Keeping raw data here for completeness
                relationships: interpretedWebfirmOriginal
            },
            neuralNetwork: {
                nodes: nnNodes,
                layers: nnLayers,
                connections: generatedNNConnections,
                // Optional: Adjacency list for easy graph traversal (could be built here)
                // adjacencyList: {}
            }
        };
    }

    /**
     * Queries the parsed data based on criteria and returns projected fields.
     * This method now primarily queries the 'webfirmOriginal' relationships.
     * For neural network data, consider using dedicated methods or direct access.
     *
     * @param {Object} [criteria={}] - An object where keys are property names and values are the desired match.
     * If empty, it matches all items.
     * Example: `{ sites: 'google', titles: 'Search Engine' }`
     * @param {Array<string>|null} [projection=null] - An array of strings representing the keys to include
     * in the returned objects. If null, the entire matching object is returned.
     * Example: `['sites', 'descriptions']`
     * @returns {Array<Object>} An array of objects that match the criteria, with only the projected fields.
     * Returns an empty array if no matches are found or if input is invalid.
     */
    query(criteria = {}, projection = null) {
        if (typeof criteria !== 'object' || criteria === null) {
            console.warn("Webfirm.query() 'criteria' argument must be an object.");
            return [];
        }
        if (projection !== null && !Array.isArray(projection)) {
            console.warn("Webfirm.query() 'projection' argument must be an array of strings or null.");
            return [];
        }

        const results = [];
        const relationshipsData = this.parsedData.webfirmOriginal?.relationships;

        if (!relationshipsData) {
            console.warn("No 'webfirmOriginal.relationships' found in parsed data to query.");
            return [];
        }

        // Iterate through all original relationships (e.g., "contact listing")
        for (const relName in relationshipsData) {
            const relationshipItems = relationshipsData[relName]; // This is an array of objects

            // Iterate through each item within the current relationship
            for (const item of relationshipItems) {
                let matchesCriteria = true;

                // Check if the item matches all criteria
                for (const criteriaKey in criteria) {
                    if (!item.hasOwnProperty(criteriaKey) || item[criteriaKey] !== criteria[criteriaKey]) {
                        matchesCriteria = false;
                        break;
                    }
                }

                if (matchesCriteria) {
                    if (projection) {
                        const projectedItem = {};
                        for (const projKey of projection) {
                            if (item.hasOwnProperty(projKey)) {
                                projectedItem[projKey] = item[projKey];
                            }
                        }
                        if (Object.keys(projectedItem).length > 0) {
                             results.push(projectedItem);
                        }
                    } else {
                        results.push(item);
                    }
                }
            }
        }

        if (results.length === 0) {
            console.log(`No data found for the given query criteria: ${JSON.stringify(criteria)}`);
        }

        return results;
    }

    /**
     * Returns the raw parsed data.
     * @returns {Object} The internal parsed data object.
     */
    getParsedData() {
        return this.parsedData;
    }

    /**
     * Retrieves nodes from the neural network definition based on criteria.
     * @param {Object} [criteria={}] - Node properties to match.
     * @returns {Array<Object>} Array of matching node objects.
     */
    getNNNodes(criteria = {}) {
        const nodes = this.parsedData.neuralNetwork?.nodes;
        if (!nodes) return [];
        return Object.values(nodes).filter(node =>
            Object.keys(criteria).every(key => node[key] === criteria[key])
        );
    }

    /**
     * Retrieves connections from the neural network definition based on criteria.
     * @param {Object} [criteria={}] - Connection properties to match (source, target, type, etc.).
     * @returns {Array<Object>} Array of matching connection objects.
     */
    getNNConnections(criteria = {}) {
        const connections = this.parsedData.neuralNetwork?.connections;
        if (!connections) return [];
        return Object.values(connections).filter(conn =>
            Object.keys(criteria).every(key => conn[key] === criteria[key])
        );
    }
}

// Export the Webfirm class
module.exports = Webfirm;