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
        // We can now instantiate the plugin because 'obsidian' is mocked.
        // We pass 'as any' to satisfy the constructor's type requirements.
        plugin = new MarkdownToCanvasPlugin({} as any, {} as any); 
        mockIdCounter = 0;
    });

    test('Test 1: Should return an empty array for empty or whitespace input', () => {
        const markdown = `
        
        `;
        // We cast to 'any' to access the private method for unit testing
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

    describe('Bug Replication Tests', () => {
        test('Test 9 (BUG): Should FAIL to handle siblings with large indentation', () => {
            // This markdown uses 4-space indentation, which the current logic handles incorrectly.
            // It makes "Notable Acquisitions" a child of "Motivation", instead of a sibling.
            const buggyMarkdown = `- Root\n    - Motivation for the Discussion\n    - Notable Acquisitions`;

            // This is the CORRECT structure we expect. The test against the buggy code should fail.
            const expectedCorrectStructure = [
                {
                    id: getMockId(0), text: 'Root', isImage: false, level: 0, children: [
                        { id: getMockId(1), text: 'Motivation for the Discussion', isImage: false, level: 2, children: [] },
                        { id: getMockId(2), text: 'Notable Acquisitions', isImage: false, level: 2, children: [] }
                    ]
                }
            ];

            const result = (plugin as any).parseMarkdown(buggyMarkdown, 10);

            // This assertion is expected to FAIL with the current buggy code.
            expect(stripParent(result)).toEqual(expectedCorrectStructure);
        });
    });
});
