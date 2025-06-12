// --- JEST MOCK ---
// We must mock the 'obsidian' module because it's not available in the test environment.
// This fake version prevents the 'Cannot find module' error.
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

// Helper function to remove the circular parent reference for test comparisons
const stripParent = (nodes: any[]) => {
    return JSON.parse(JSON.stringify(nodes, (key, value) => {
        if (key === 'parent') {
            return undefined;
        }
        return value;
    }));
};


describe('MarkdownToCanvasPlugin: parseMarkdown', () => {
    let plugin: MarkdownToCanvasPlugin;
    let mockIdCounter: number;

    // Helper to generate predictable UUIDs for testing
    const getMockId = (index: number) => `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`;

    // Mocking crypto.randomUUID for predictable test outcomes
    beforeAll(() => {
        global.crypto = {
            ...global.crypto,
            randomUUID: () => getMockId(mockIdCounter++),
        };
    });

    // Reset mocks and plugin instance before each test
    beforeEach(() => {
        plugin = new MarkdownToCanvasPlugin({} as any, {} as any); 
        mockIdCounter = 0;
    });

    test('Test 1: Should return an empty array for empty or whitespace input', () => {
        const markdown = `
        
        `;
        const result = (plugin as any).parseMarkdown(markdown, 10);
        expect(result).toEqual([]);
    });

    test('Test 2: Should handle a single root node', () => {
        const markdown = '- First item';
        const expected = [{ id: getMockId(0), text: 'First item', isImage: false, level: 0, children: [] }];
        const result = (plugin as any).parseMarkdown(markdown, 10);
        expect(stripParent(result)).toEqual(expected);
    });

    test('Test 3: Should handle two separate root nodes', () => {
        const markdown = '- First item\n- Second item';
        const expected = [
            { id: getMockId(0), text: 'First item', isImage: false, level: 0, children: [] },
            { id: getMockId(1), text: 'Second item', isImage: false, level: 0, children: [] }
        ];
        const result = (plugin as any).parseMarkdown(markdown, 10);
        expect(stripParent(result)).toEqual(expected);
    });

    test('Test 4: Should handle a simple parent-child relationship', () => {
        const markdown = '- Parent\n  - Child';
        const expected = [
            {
                id: getMockId(0), text: 'Parent', isImage: false, level: 0, children: [
                    { id: getMockId(1), text: 'Child', isImage: false, level: 1, children: [] }
                ]
            }
        ];
        const result = (plugin as any).parseMarkdown(markdown, 10);
        expect(stripParent(result)).toEqual(expected);
    });

    test('Test 5: Should handle a hierarchy with multiple children and siblings', () => {
        const markdown = '- Parent 1\n  - Child 1.1\n  - Child 1.2\n- Parent 2';
        const expected = [
            {
                id: getMockId(0), text: 'Parent 1', isImage: false, level: 0, children: [
                    { id: getMockId(1), text: 'Child 1.1', isImage: false, level: 1, children: [] },
                    { id: getMockId(2), text: 'Child 1.2', isImage: false, level: 1, children: [] }
                ]
            },
            { id: getMockId(3), text: 'Parent 2', isImage: false, level: 0, children: [] }
        ];
        const result = (plugin as any).parseMarkdown(markdown, 10);
        expect(stripParent(result)).toEqual(expected);
    });
    
    test('Test 6: Should handle mixed tab and space indentation', () => {
        const markdown = '- Root\n\t- Child (tab)\n  - Sibling (spaces)';
        const expected = [
            {
                id: getMockId(0), text: 'Root', isImage: false, level: 0, children: [
                    { id: getMockId(1), text: 'Child (tab)', isImage: false, level: 1, children: [] },
                    { id: getMockId(2), text: 'Sibling (spaces)', isImage: false, level: 1, children: [] }
                ]
            }
        ];
        const result = (plugin as any).parseMarkdown(markdown, 10);
        expect(stripParent(result)).toEqual(expected);
    });

    test('Test 7: Should correctly parse an embedded image', () => {
        const markdown = '- An item\n  - ![[my-image.png]]';
        const expected = [
            {
                id: getMockId(0), text: 'An item', isImage: false, level: 0, children: [
                    { id: getMockId(1), text: 'my-image.png', isImage: true, level: 1, children: [] }
                ]
            }
        ];
        const result = (plugin as any).parseMarkdown(markdown, 10);
        expect(stripParent(result)).toEqual(expected);
    });

    test('Test 8: Should ignore nodes beyond the maxDepth limit', () => {
        const markdown = '- Level 0\n  - Level 1\n    - Level 2';
        const expected = [
            {
                id: getMockId(0), text: 'Level 0', isImage: false, level: 0, children: [
                    { id: getMockId(1), text: 'Level 1', isImage: false, level: 1, children: [] }
                ]
            }
        ];
        const result = (plugin as any).parseMarkdown(markdown, 2); // maxDepth = 2
        expect(stripParent(result)).toEqual(expected);
    });

    test('Test 9: Should handle siblings with large indentation', () => {
        const markdown = `- Root\n    - Motivation for the Discussion\n    - Notable Acquisitions`;
        // FIX: The expected level is now 1, because the dynamic logic sees 4 spaces as the base indent unit.
        const expectedCorrectStructure = [
            {
                id: getMockId(0), text: 'Root', isImage: false, level: 0, children: [
                    { id: getMockId(1), text: 'Motivation for the Discussion', isImage: false, level: 1, children: [] },
                    { id: getMockId(2), text: 'Notable Acquisitions', isImage: false, level: 1, children: [] }
                ]
            }
        ];
        const result = (plugin as any).parseMarkdown(markdown, 10);
        expect(stripParent(result)).toEqual(expectedCorrectStructure);
    });

    test('Test 10: Should correctly handle complex sibling structures from user file', () => {
        // This test uses 4-space indents, which the dynamic logic will treat as level 1, 2, etc.
        const markdown = `
- Notable Acquisitions
    - Databricks:
        - Redash
        - MosaicML:
    - Snowflake:
        - Streamlit:
        `;
        
        const expected = [
            {
                id: getMockId(0),
                text: 'Notable Acquisitions',
                isImage: false,
                level: 0,
                children: [
                    {
                        id: getMockId(1),
                        text: 'Databricks:',
                        isImage: false,
                        level: 1, // 4 spaces = level 1
                        children: [
                            { id: getMockId(2), text: 'Redash', isImage: false, level: 2, children: [] }, // 8 spaces = level 2
                            { id: getMockId(3), text: 'MosaicML:', isImage: false, level: 2, children: [] }
                        ]
                    },
                    {
                        id: getMockId(4),
                        text: 'Snowflake:',
                        isImage: false,
                        level: 1, // 4 spaces = level 1
                        children: [
                             { id: getMockId(5), text: 'Streamlit:', isImage: false, level: 2, children: [] } // 8 spaces = level 2
                        ]
                    }
                ]
            }
        ];

        const result = (plugin as any).parseMarkdown(markdown, 10);
        expect(stripParent(result)).toEqual(expected);
    });
});
