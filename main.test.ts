// --- JEST MOCK ---
// We must mock the 'obsidian' module because it's not available in the test environment.
jest.mock('obsidian', () => {
    return {
        Plugin: class { },
        Modal: class {
            constructor(app: any) { }
            open() { }
            close() { }
        },
        Notice: jest.fn(),
        Setting: class {
            setName() { return this; }
            setDesc() { return this; }
            addText() { return this; }
            addDropdown() { return this; }
            addButton() { return this; }
        },
        PluginSettingTab: class { },
        TFile: class { },
        TFolder: class { },
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
        [{
            heading: null, nodes: [
                { text: 'First item', level: 0, children: [] },
                { text: 'Second item', level: 0, children: [] }
            ]
        }]
    );

    runParseTest(
        'Test 4: Should handle a simple parent-child relationship',
        `- Parent\n  - Child`,
        [{
            heading: null, nodes: [
                { text: 'Parent', level: 0, children: [{ text: 'Child', level: 1, children: [] }] }
            ]
        }]
    );

    runParseTest(
        'Test 5: Should handle a hierarchy with multiple children and siblings',
        '- Parent 1\n  - Child 1.1\n  - Child 1.2\n- Parent 2',
        [{
            heading: null, nodes: [
                {
                    text: 'Parent 1', level: 0, children: [
                        { text: 'Child 1.1', level: 1, children: [] },
                        { text: 'Child 1.2', level: 1, children: [] }
                    ]
                },
                { text: 'Parent 2', level: 0, children: [] }
            ]
        }]
    );

    runParseTest(
        'Test 6: Should handle mixed tab and space indentation',
        '- Root\n\t- Child (tab)\n  - Sibling (spaces)',
        [{
            heading: null, nodes: [
                {
                    text: 'Root', level: 0, children: [
                        { text: 'Child (tab)', level: 1, children: [] },
                        { text: 'Sibling (spaces)', level: 1, children: [] }
                    ]
                }
            ]
        }]
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
        [{
            heading: null, nodes: [
                {
                    text: 'Root', level: 0, children: [
                        { text: 'Motivation', level: 1, children: [] },
                        { text: 'Acquisitions', level: 1, children: [] }
                    ]
                }
            ]
        }]
    );

    runParseTest(
        'Test 10: Should correctly handle complex sibling structures',
        `- Notable Acquisitions\n    - Databricks:\n        - Redash\n    - Snowflake:`,
        [{
            heading: null, nodes: [
                {
                    text: 'Notable Acquisitions', level: 0, children: [
                        {
                            text: 'Databricks:', level: 1, children: [
                                { text: 'Redash', level: 2, children: [] }
                            ]
                        },
                        { text: 'Snowflake:', level: 1, children: [] }
                    ]
                }
            ]
        }]
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

describe('Test for Asterisk-Based Lists', () => {

    beforeEach(() => {
        let mockIdCounter = 0;
        global.crypto = {
            ...global.crypto,
            randomUUID: () => `mock-id-${mockIdCounter++}`,
        };
    });

//     runParseTest(
//         "Test 16: Should correctly parse a complex list using asterisks, ignoring code blocks",
//         ` * **JPA Specifications**
//  * **Core Concept**
//      * **What it is**: An interface for building **dynamic**, **reusable**, and **type-safe** queries.
//      * **Library**: A key feature of **Spring Data JPA**.
//      * **Purpose**: To programmatically define a piece of a \`WHERE\` clause for a database query.
//  * **The \`Specification<T>\` Interface**
//      * A functional interface with a single method: \`toPredicate(...)\`.
//      * **\`Predicate toPredicate(Root<T> root, CriteriaQuery<?> query, CriteriaBuilder cb)\`**
//          * **\`Root<T> root\`**: Represents the root entity of the query (e.g., \`Product\`). Used to access entity attributes.
//          * **\`CriteriaQuery<?> query\`**: Represents the overall query itself. Can be used for subqueries or ordering.
//          * **\`CriteriaBuilder cb\`**: A factory object used to construct query elements like predicates (\`equal\`, \`like\`, \`greaterThan\`, etc.).
//  * **How to Use: A 3-Step Workflow**
//      * **1. Define a Specification**
//          * Create a class to hold your specification definitions.
//          * Use static methods that return a \`Specification<T>\`.
//          * Often implemented using a concise lambda expression.
//          * **Example**:
//            \`\`\`java
//            public class ProductSpecification {
//                public static Specification<Product> hasCategory(String category) {
//                    return (root, query, builder) -> 
//                        builder.equal(root.get("category"), category);
//                }
//            }
//            \`\`\`
//      * **2. Extend \`JpaSpecificationExecutor<T>\`**
//          * Your Spring Data repository interface must extend this executor interface.
//          * This provides new methods to your repository, such as \`findAll(Specification<T> spec)\`.
//          * **Example**:
//            \`\`\`java
//            public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {
//            }
//            \`\`\`
//      * **3. Execute the Specification**
//          * Inject the repository into your service layer.
//          * Build your specification (or combine multiple).
//          * Pass the specification to the repository's \`findAll()\` method (or \`findOne()\`, \`count()\`, etc.).
//          * **Example**:
//            \`\`\`java
//            public List<Product> findProducts(String category) {
//                Specification<Product> spec = ProductSpecification.hasCategory(category);
//                return productRepository.findAll(spec);
//            }
//            \`\`\`
//  * **Combining Specifications**
//      * Chain individual specifications together to create complex business logic.
//      * **\`Specification.where(spec1)\`**: The starting point of a chain.
//      * **\`.and(spec2)\`**: Combines the current specification with another using a logical **AND**.
//      * **\`.or(spec3)\`**: Combines the current specification with another using a logical **OR**.
//      * **Handling Optional Filters**: Start a chain with \`Specification.where(null)\` if the first criterion is optional. This acts as a neutral starting point.
//      * **Example**:
//        \`\`\`java
//        // Find products in 'Electronics' category with price > 1000
//        Specification<Product> spec = Specification
//            .where(ProductSpecification.hasCategory("Electronics"))
//            .and(ProductSpecification.hasPriceGreaterThan(1000.0));
//        List<Product> results = productRepository.findAll(spec);
//        \`\`\`
//  * **Key Advantages**
//      * **Type-Safety**: Using the JPA Metamodel with specifications can catch errors in attribute names at compile time.
//      * **Reusability**: A single specification (e.g., \`hasCategory()\`) can be reused in many different queries.
//      * **Dynamic Queries**: Provides an elegant solution for building queries where the \`WHERE\` clause changes based on user input or other conditions. Avoids messy string concatenation.
//      * **Readability**: Well-named specification methods (\`hasActiveSubscription()\`, \`isOverdue()\`) make the business logic within the code much clearer.`,
//         [{
//             heading: null,
//             nodes: [{
//                 text: '**JPA Specifications**',
//                 level: 0,
//                 children: [{
//                     text: '**Core Concept**',
//                     level: 1,
//                     children: [{
//                         text: '**What it is**: An interface for building **dynamic**, **reusable**, and **type-safe** queries.',
//                         level: 2,
//                         children: []
//                     }, {
//                         text: '**Library**: A key feature of **Spring Data JPA**.',
//                         level: 2,
//                         children: []
//                     }, {
//                         text: '**Purpose**: To programmatically define a piece of a `WHERE` clause for a database query.',
//                         level: 2,
//                         children: []
//                     },]
//                 }, {
//                     text: '**The `Specification<T>` Interface**',
//                     level: 1,
//                     children: [{
//                         text: 'A functional interface with a single method: `toPredicate(...)`.',
//                         level: 2,
//                         children: []
//                     }, {
//                         text: '**`Predicate toPredicate(Root<T> root, CriteriaQuery<?> query, CriteriaBuilder cb)`**',
//                         level: 2,
//                         children: [{
//                             text: '**`Root<T> root`**: Represents the root entity of the query (e.g., `Product`). Used to access entity attributes.',
//                             level: 3,
//                             children: []
//                         }, {
//                             text: '**`CriteriaQuery<?> query`**: Represents the overall query itself. Can be used for subqueries or ordering.',
//                             level: 3,
//                             children: []
//                         }, {
//                             text: '**`CriteriaBuilder cb`**: A factory object used to construct query elements like predicates (`equal`, `like`, `greaterThan`, etc.).',
//                             level: 3,
//                             children: []
//                         },]
//                     },]
//                 }, {
//                     text: '**How to Use: A 3-Step Workflow**',
//                     level: 1,
//                     children: [{
//                         text: '**1. Define a Specification**',
//                         level: 2,
//                         children: [
//                             { text: 'Create a class to hold your specification definitions.', level: 3, children: [] },
//                             { text: 'Use static methods that return a `Specification<T>`.', level: 3, children: [] },
//                             { text: 'Often implemented using a concise lambda expression.', level: 3, children: [] },
//                             { text: '**Example**:', level: 3, children: [] },
//                         ]
//                     }, {
//                         text: '**2. Extend `JpaSpecificationExecutor<T>`**',
//                         level: 2,
//                         children: [
//                             { text: 'Your Spring Data repository interface must extend this executor interface.', level: 3, children: [] },
//                             { text: 'This provides new methods to your repository, such as `findAll(Specification<T> spec)`.', level: 3, children: [] },
//                             { text: '**Example**:', level: 3, children: [] },
//                         ]
//                     }, {
//                         text: '**3. Execute the Specification**',
//                         level: 2,
//                         children: [
//                             { text: 'Inject the repository into your service layer.', level: 3, children: [] },
//                             { text: 'Build your specification (or combine multiple).', level: 3, children: [] },
//                             { text: 'Pass the specification to the repository\'s `findAll()` method (or `findOne()`, `count()`, etc.).', level: 3, children: [] },
//                             { text: '**Example**:', level: 3, children: [] },
//                         ]
//                     },]
//                 }, {
//                     text: '**Combining Specifications**',
//                     level: 1,
//                     children: [
//                         { text: 'Chain individual specifications together to create complex business logic.', level: 2, children: [] },
//                         { text: '**`Specification.where(spec1)`**: The starting point of a chain.', level: 2, children: [] },
//                         { text: '**.and(spec2)`**: Combines the current specification with another using a logical **AND**.', level: 2, children: [] },
//                         { text: '**.or(spec3)`**: Combines the current specification with another using a logical **OR**.', level: 2, children: [] },
//                         { text: '**Handling Optional Filters**: Start a chain with `Specification.where(null)` if the first criterion is optional. This acts as a neutral starting point.', level: 2, children: [] },
//                         { text: '**Example**:', level: 2, children: [] },
//                     ]
//                 }, {
//                     text: '**Key Advantages**',
//                     level: 1,
//                     children: [
//                         { text: '**Type-Safety**: Using the JPA Metamodel with specifications can catch errors in attribute names at compile time.', level: 2, children: [] },
//                         { text: '**Reusability**: A single specification (e.g., `hasCategory()`) can be reused in many different queries.', level: 2, children: [] },
//                         { text: '**Dynamic Queries**: Provides an elegant solution for building queries where the `WHERE` clause changes based on user input or other conditions. Avoids messy string concatenation.', level: 2, children: [] },
//                         { text: '**Readability**: Well-named specification methods (`hasActiveSubscription()`, `isOverdue()`) make the business logic within the code much clearer.', level: 2, children: [] },
//                     ]
//                 }]
//             }]
//         }]
//     );

    // --- NEW DIAGNOSTIC TESTS ---

    // Test 17: Checks if the parser can handle the most basic case: a single list item that is indented.
    // This validates the `baseIndentation` logic.
    runParseTest(
        'Test 17: Should handle a single, indented root node',
        '  * Root', // 2 spaces of indentation
        [{
            heading: null,
            nodes: [{
                text: 'Root',
                level: 0,
                children: []
            }]
        }]
    );

    // Test 18: Checks if the parser can correctly calculate levels for a child of an indented root.
    // This validates the `indentUnit` calculation when `baseIndentation` is not 0.
    runParseTest(
        'Test 18: Should handle an indented root with a child',
        '  * Parent\n    * Child', // Parent has 2 spaces, Child has 4
        [{
            heading: null,
            nodes: [{
                text: 'Parent',
                level: 0,
                children: [{
                    text: 'Child',
                    level: 1,
                    children: []
                }]
            }]
        }]
    );

    // Test 19: Checks if the parser can handle inconsistent but proportional indentation, similar to your complex case.
    // This validates the `Math.round(relativeIndentation / indentUnit)` logic.
    runParseTest(
        'Test 19: Should handle irregular but proportional indentation',
        ' * Level 0\n     * Level 1\n         * Level 2', // Indentations are 1, 5, and 9 spaces
        [{
            heading: null,
            nodes: [{
                text: 'Level 0',
                level: 0,
                children: [{
                    text: 'Level 1',
                    level: 1,
                    children: [{
                        text: 'Level 2',
                        level: 2,
                        children: []
                    }]
                }]
            }]
        }]
    );

    // --- NEW INTERMEDIATE TESTS ---

    // Test 20: A simple check for creating siblings under an indented root.
    // This confirms basic child-rearing at level 1.
    runParseTest(
        'Test 20: Should handle simple indented siblings',
        '  * Parent\n    * Child 1\n    * Child 2',
        [{
            heading: null,
            nodes: [{
                text: 'Parent',
                level: 0,
                children: [
                    { text: 'Child 1', level: 1, children: [] },
                    { text: 'Child 2', level: 1, children: [] }
                ]
            }]
        }]
    );

    // Test 21: The most critical test.
    // Does the parser correctly pop a grandchild AND a child from the stack to find the correct parent for a new sibling branch?
    runParseTest(
        'Test 21: Should handle a sibling after a nested branch',
        ' * Root\n   * Branch A\n     * Leaf A\n   * Branch B',
        [{
            heading: null,
            nodes: [{
                text: 'Root',
                level: 0,
                children: [
                    {
                        text: 'Branch A',
                        level: 1,
                        children: [{ text: 'Leaf A', level: 2, children: [] }]
                    },
                    {
                        text: 'Branch B',
                        level: 1,
                        children: []
                    }
                ]
            }]
        }]
    );

    // Test 22: A final check to ensure the parser can pop all the way back to the root.
    // This validates that the parser can end one hierarchy and start a new one correctly.
    runParseTest(
        'Test 22: Should handle a new root node after a nested branch',
        ' * Root A\n   * Child A\n * Root B',
        [{
            heading: null,
            nodes: [
                {
                    text: 'Root A',
                    level: 0,
                    children: [{ text: 'Child A', level: 1, children: [] }]
                },
                {
                    text: 'Root B',
                    level: 0,
                    children: []
                }
            ]
        }]
    );
});