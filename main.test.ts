// --- JEST MOCK ---
// We must mock the 'obsidian' module because it's not available in the test environment.
jest.mock('obsidian', () => {
    return {
        Plugin: class {},
        Modal: class {
            constructor(app: any) {}
            open() {}
            close() {}
        },
        Notice: jest.fn(),
        Setting: class {
            setName() { return this; }
            setDesc() { return this; }
            addText() { return this; }
            addDropdown() { return this; }
            addButton() { return this; }
        },
        PluginSettingTab: class {},
        TFile: class {},
        TFolder: class {},
    };
}, { virtual: true });


import MarkdownToCanvasPlugin from './main'; // Adjust the import path as needed

// Helper function to remove properties that are irrelevant for comparison
const stripParentAndIds = (nodes: any[]) => {
    return JSON.parse(JSON.stringify(nodes, (key, value) => {
        if (key === 'parent' || key === 'id' || key === 'isImage') {
            return undefined;
        }
        return value;
    }));
};

// Universal test runner for the new section-based parsing
const runParseTest = (testName: string, markdown: string, expected: any) => {
    test(testName, () => {
        const plugin = new MarkdownToCanvasPlugin({} as any, {} as any);
        const result = (plugin as any).parseMarkdown(markdown, 10);
        
        const comparableResult = result.map((section: any) => ({
            heading: section.heading,
            nodes: stripParentAndIds(section.nodes)
        }));

        expect(comparableResult).toEqual(expected);
    });
};


describe('MarkdownToCanvasPlugin: Parsing Logic', () => {
    
    beforeEach(() => {
        let mockIdCounter = 0;
        global.crypto = {
            ...global.crypto,
            randomUUID: () => `mock-id-${mockIdCounter++}`,
        };
    });

    // --- ALL TESTS UNIFIED ---
    
    runParseTest(
        'Test 1: Should return an empty array for empty or whitespace input',
        `   `,
        []
    );

    runParseTest(
        'Test 2: Should handle a single root node',
        `- First item`,
        [{ heading: null, nodes: [{ text: 'First item', level: 0, children: [] }] }]
    );

    runParseTest(
        'Test 3: Should handle two separate root nodes',
        `- First item\n- Second item`,
        [{ heading: null, nodes: [
            { text: 'First item', level: 0, children: [] },
            { text: 'Second item', level: 0, children: [] }
        ]}]
    );
    
    runParseTest(
        'Test 4: Should handle a simple parent-child relationship',
        `- Parent\n  - Child`,
        [{ heading: null, nodes: [
            { text: 'Parent', level: 0, children: [{ text: 'Child', level: 1, children: [] }] }
        ]}]
    );
    
    runParseTest(
        'Test 5: Should handle a hierarchy with multiple children and siblings',
        '- Parent 1\n  - Child 1.1\n  - Child 1.2\n- Parent 2',
        [{ heading: null, nodes: [
            { text: 'Parent 1', level: 0, children: [
                { text: 'Child 1.1', level: 1, children: [] },
                { text: 'Child 1.2', level: 1, children: [] }
            ]},
            { text: 'Parent 2', level: 0, children: [] }
        ]}]
    );

    runParseTest(
        'Test 6: Should handle mixed tab and space indentation',
        '- Root\n\t- Child (tab)\n  - Sibling (spaces)',
        [{ heading: null, nodes: [
            { text: 'Root', level: 0, children: [
                { text: 'Child (tab)', level: 1, children: [] },
                { text: 'Sibling (spaces)', level: 1, children: [] }
            ]}
        ]}]
    );

    test('Test 7: Should correctly parse an embedded image', () => {
        const plugin = new MarkdownToCanvasPlugin({} as any, {} as any);
        const result = (plugin as any).parseMarkdown('- An item\n  - ![[my-image.png]]', 10);
        expect(result[0].nodes[0].children[0].isImage).toBe(true);
        expect(result[0].nodes[0].children[0].text).toBe('my-image.png');
    });

    test('Test 8: Should ignore nodes beyond a specified depth', () => {
        const plugin = new MarkdownToCanvasPlugin({} as any, {} as any);
        const result = (plugin as any).parseMarkdown('- Level 0\n  - Level 1\n    - Level 2', 2);
        expect(result[0].nodes[0].children[0].children).toHaveLength(0);
    });
    
    runParseTest(
        'Test 9: Should handle siblings with large indentation',
        `- Root\n    - Motivation\n    - Acquisitions`,
        [{ heading: null, nodes: [
            { text: 'Root', level: 0, children: [
                { text: 'Motivation', level: 1, children: [] },
                { text: 'Acquisitions', level: 1, children: [] }
            ]}
        ]}]
    );

    runParseTest(
        'Test 10: Should correctly handle complex sibling structures',
        `- Notable Acquisitions\n    - Databricks:\n        - Redash\n    - Snowflake:`,
        [{ heading: null, nodes: [
            { text: 'Notable Acquisitions', level: 0, children: [
                { text: 'Databricks:', level: 1, children: [
                    { text: 'Redash', level: 2, children: [] }
                ]},
                { text: 'Snowflake:', level: 1, children: [] }
            ]}
        ]}]
    );

    runParseTest(
        'Test 11: Should handle a list with no heading',
        `- A\n  - B`,
        [{ heading: null, nodes: [{ text: 'A', level: 0, children: [{ text: 'B', level: 1, children: [] }] }] }]
    );

    runParseTest(
        'Test 12: Should handle a list that starts with a heading',
        `# My Heading\n- A\n- B`,
        [{
            heading: { text: 'My Heading', level: 1 },
            nodes: [
                { text: 'A', level: 0, children: [] },
                { text: 'B', level: 0, children: [] }
            ]
        }]
    );
    
    runParseTest(
        'Test 13: Should handle multiple headings of the same level',
        `# Heading 1\n- A\n\n# Heading 2\n- B`,
        [
            { heading: { text: 'Heading 1', level: 1 }, nodes: [{ text: 'A', level: 0, children: [] }] },
            { heading: { text: 'Heading 2', level: 1 }, nodes: [{ text: 'B', level: 0, children: [] }] }
        ]
    );

    runParseTest(
        'Test 14: Should handle nested headings (H1 -> H2)',
        `# L1\n- A\n\n## L2\n- B`,
        [
            { heading: { text: 'L1', level: 1 }, nodes: [{ text: 'A', level: 0, children: [] }] },
            { heading: { text: 'L2', level: 2 }, nodes: [{ text: 'B', level: 0, children: [] }] }
        ]
    );

    runParseTest(
        "Test 15: Should handle the user's complex example",
        `- list before heading\n\n# h1\n\n- list under h1\n\n## h2\n\n- list under h2`,
        [
            { heading: null, nodes: [{ text: 'list before heading', level: 0, children: [] }] },
            { heading: { text: 'h1', level: 1 }, nodes: [{ text: 'list under h1', level: 0, children: [] }] },
            { heading: { text: 'h2', level: 2 }, nodes: [{ text: 'list under h2', level: 0, children: [] }] }
        ]
    );
});
