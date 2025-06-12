const fs = require('fs');
const path = require('path');

// The name of the markdown file to analyze.
// Make sure this file is in the same directory as the script.
const FILENAME = 'Literature - Youtube - Snowflake vs Databricks - Mindmap.md';

function analyzeIndentation(filePath) {
    console.log(`--- Analyzing Indentation for: ${filePath} ---\n`);

    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found at '${filePath}'.`);
        console.error('Please make sure the markdown file is in the same directory as this script.');
        return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue; // Skip empty lines

        const indentMatch = line.match(/^\s*/);
        const indentation = indentMatch ? indentMatch[0] : '';
        const text = line.trim();

        let analysis = `Line ${String(i + 1).padStart(2)}: `;
        analysis += `Spaces=${(indentation.match(/ /g) || []).length}, `;
        analysis += `Tabs=${(indentation.match(/\t/g) || []).length}, `;
        
        // This simulates the logic from your main.ts file
        const normalizedIndentation = indentation.replace(/\t/g, '  '); // Tab becomes 2 spaces
        const calculatedLevel = Math.floor(normalizedIndentation.length / 2);
        
        analysis += `Total Indent Chars=${indentation.length}, `;
        analysis += `Calculated Level=${calculatedLevel}`;

        console.log(analysis);
        console.log(`  > Text: ${text}`);
        console.log('---------------------------------------------------');
    }
}

const fullPath = path.join(__dirname, FILENAME);
analyzeIndentation(fullPath);
