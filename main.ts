import {
    App,
    Editor,
    MarkdownView,
    Modal,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    TFolder
} from 'obsidian';

// --- INTERFACES ---

interface ParsedNode {
    id: string;
    text: string;
    isImage: boolean;
    level: number;
    children: ParsedNode[];
    parent?: ParsedNode;
}

interface CanvasSection {
    heading: { text: string; level: number } | null;
    nodes: ParsedNode[];
}

interface CanvasNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: 'text' | 'file' | 'group';
    text?: string;
    file?: string;
    label?: string; // For groups
}

interface CanvasEdge {
    id: string;
    fromNode: string;
    fromSide: 'left' | 'right' | 'top' | 'bottom';
    toNode: string;
    toSide: 'left' | 'right' | 'top' | 'bottom';
}

interface MarkdownToCanvasSettings {
    defaultLayout: 'horizontal' | 'vertical';
    defaultDepth: number;
}

const DEFAULT_SETTINGS: MarkdownToCanvasSettings = {
    defaultLayout: 'horizontal',
    defaultDepth: 10,
};

// --- CONSTANTS for layout ---
const CARD_WIDTH = 300;
const CARD_HEIGHT = 80;
const IMG_WIDTH = 300;
const IMG_HEIGHT = 300;
const H_SPACING = 100;
const V_SPACING = 50;
const GROUP_PADDING = 100;
const GROUP_HEADER_HEIGHT = 50;
const SECTION_SPACING = 100;
const TAB_REPLACEMENT = '  ';

export default class MarkdownToCanvasPlugin extends Plugin {
    settings: MarkdownToCanvasSettings;

    async onload() {
        await this.loadSettings();
        console.log('Markdown to Canvas Plugin loaded.');

        this.addCommand({
            id: 'convert-note-to-canvas',
            name: 'Convert note to Canvas',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const sourceFile = view.file;
                if (sourceFile) {
                    new ConversionModal(this.app, sourceFile, this.settings, (result) => {
                        this.createCanvas(result.fileName, sourceFile, result.layout, result.depth);
                    }).open();
                } else {
                    new Notice('Please save the note before converting to a canvas.');
                }
            },
        });

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem((item) => {
                        item
                            .setTitle('Convert to Canvas')
                            .setIcon('git-fork')
                            .onClick(async () => {
                                new ConversionModal(this.app, file, this.settings, (result) => {
                                    this.createCanvas(result.fileName, file, result.layout, result.depth);
                                }).open();
                            });
                    });
                }
            })
        );

        this.addSettingTab(new MarkdownToCanvasSettingTab(this.app, this));
    }

    onunload() {
        console.log('Markdown to Canvas Plugin unloaded.');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // Main parsing function, made public for testing.
    public parseMarkdown(content: string, maxDepth: number): CanvasSection[] {
        const sections: CanvasSection[] = [{ heading: null, nodes: [] }];
        let listContentForCurrentSection = '';

        const lines = content.split(/\r?\n/);
        const headingRegex = /^(#+)\s+(.*)/;

        const processListContent = () => {
            if (listContentForCurrentSection.trim() !== '') {
                sections[sections.length - 1].nodes = this._parseListContent(listContentForCurrentSection, maxDepth);
            }
            listContentForCurrentSection = '';
        };

        for (const line of lines) {
            const headingMatch = line.trim().match(headingRegex);
            if (headingMatch) {
                processListContent();
                sections.push({
                    heading: { text: headingMatch[2].trim(), level: headingMatch[1].length },
                    nodes: []
                });
            } else {
                listContentForCurrentSection += line + '\n';
            }
        }
        processListContent();

        return sections.filter(s => s.heading !== null || s.nodes.length > 0);
    }

    private _parseListContent(content: string, maxDepth: number): ParsedNode[] {
        const rootNodes: ParsedNode[] = [];
        const parentStack: ParsedNode[] = [];
        const imageRegex = /!\[\[([^\]]+)\]\]/;
        const listItemRegex = /^\s*([-*+])\s+(.*)/;

        let baseIndentation: number | null = null;
        let indentUnit: number | null = null;

        const lines = content.split(/\r?\n/);

        for (const line of lines) {
            const listItemMatch = line.match(listItemRegex);
            if (!listItemMatch) continue;

            const indentMatch = line.match(/^\s*/);
            const rawIndent = indentMatch ? indentMatch[0] : '';
            const normalizedIndent = rawIndent.replace(/\t/g, TAB_REPLACEMENT);
            const indentation = normalizedIndent.length;

            if (baseIndentation === null) {
                baseIndentation = indentation;
            }

            const relativeIndentation = indentation - baseIndentation;
            if (indentUnit === null && relativeIndentation > 0) {
                indentUnit = relativeIndentation;
            }

            const level = indentUnit ? Math.floor(relativeIndentation / indentUnit) : 0;

            if (level >= maxDepth) continue;

            const text = listItemMatch[2].trim();
            const imageMatch = text.match(imageRegex);

            const node: ParsedNode = {
                id: crypto.randomUUID(),
                text: imageMatch ? imageMatch[1] : text,
                isImage: !!imageMatch,
                level: level,
                children: [],
            };

            // --- THE FIX: More explicit parent-finding logic ---
            // Pop items from the stack until we find the correct parent for the current node's level.
            while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
                parentStack.pop();
            }

            // The last item remaining on the stack is the parent.
            const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : undefined;

            if (parent) {
                node.parent = parent;
                parent.children.push(node);
            } else {
                rootNodes.push(node);
            }

            // Add the current node to the stack for the next iteration.
            parentStack.push(node);
        }
        return rootNodes;
    }

    private calculateLayout(sections: CanvasSection[], layout: 'horizontal' | 'vertical'): { nodes: CanvasNode[], edges: CanvasEdge[] } {
        const finalNodes: CanvasNode[] = [];
        const finalEdges: CanvasEdge[] = [];
        let cursorX = 0;
        let cursorY = 0;

        for (const section of sections) {
            if (section.nodes.length === 0) continue;

            const groupX = cursorX;
            const groupY = cursorY;

            const { nodes: sectionNodes, edges: sectionEdges, width, height } = this._calculateSectionLayout(section.nodes, layout, groupX, groupY);

            if (section.heading) {
                const groupWidth = width + GROUP_PADDING;
                const groupHeight = height + GROUP_PADDING + GROUP_HEADER_HEIGHT;

                finalNodes.push({
                    id: crypto.randomUUID(),
                    type: 'group',
                    x: groupX - (GROUP_PADDING / 2),
                    y: groupY - (GROUP_PADDING / 2),
                    width: groupWidth,
                    height: groupHeight,
                    label: section.heading.text
                });

                sectionNodes.forEach(n => {
                    n.y += (GROUP_PADDING / 2);
                    n.x += (GROUP_PADDING / 2);
                });

                finalNodes.push(...sectionNodes);
                cursorY += groupHeight + SECTION_SPACING;

            } else {
                finalNodes.push(...sectionNodes);
                cursorY += height + SECTION_SPACING;
            }

            finalEdges.push(...sectionEdges);
        }

        return { nodes: finalNodes, edges: finalEdges };
    }

    private _calculateSectionLayout(rootNodes: ParsedNode[], layout: 'horizontal' | 'vertical', startX: number, startY: number): { nodes: CanvasNode[], edges: CanvasEdge[], width: number, height: number } {
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];
        let totalWidth = 0;
        let totalHeight = 0;
        let currentY = startY;

        const placeNodes = (node: ParsedNode, x: number, y: number): { width: number; height: number } => {
            const isImage = node.isImage;
            const nodeWidth = isImage ? IMG_WIDTH : CARD_WIDTH;
            const nodeHeight = isImage ? IMG_HEIGHT : CARD_HEIGHT;

            nodes.push({
                id: node.id, x, y, width: nodeWidth, height: nodeHeight,
                type: isImage ? 'file' : 'text',
                [isImage ? 'file' : 'text']: node.text
            });

            if (node.parent) {
                edges.push({
                    id: crypto.randomUUID(),
                    fromNode: node.parent.id,
                    fromSide: layout === 'horizontal' ? 'right' : 'bottom',
                    toNode: node.id,
                    toSide: layout === 'horizontal' ? 'left' : 'top',
                });
            }

            let childrenWidth = 0;
            let childrenHeight = 0;
            let childX = x + nodeWidth + H_SPACING;
            let childY = y;

            for (const child of node.children) {
                const childDimensions = placeNodes(child, childX, childY);
                childY += childDimensions.height + V_SPACING;
                childrenWidth = Math.max(childrenWidth, childDimensions.width);
                childrenHeight += childDimensions.height + V_SPACING;
            }

            if (node.children.length > 0) {
                childrenHeight -= V_SPACING;
            }

            const selfWidth = nodeWidth + (childrenWidth > 0 ? H_SPACING + childrenWidth : 0);
            const selfHeight = Math.max(nodeHeight, childrenHeight);

            return { width: selfWidth, height: selfHeight };
        };

        for (const root of rootNodes) {
            const dimensions = placeNodes(root, startX, currentY);
            currentY += dimensions.height + V_SPACING;
            totalWidth = Math.max(totalWidth, dimensions.width);
        }

        totalHeight = currentY - startY;
        if (rootNodes.length > 0) {
            totalHeight -= V_SPACING;
        }

        return { nodes, edges, width: totalWidth, height: totalHeight };
    }

    async createCanvas(newFileName: string, sourceFile: TFile, layout: 'horizontal' | 'vertical', depth: number) {
        if (!sourceFile.parent) {
            new Notice(`Error: Cannot determine the parent folder for "${sourceFile.name}".`);
            return;
        }
        const parentPath = sourceFile.parent.path === '/' ? '' : sourceFile.parent.path;
        const newFilePath = `${parentPath ? parentPath + '/' : ''}${newFileName}.canvas`;

        const fileExists = await this.app.vault.adapter.exists(newFilePath);
        if (fileExists) {
            new Notice(`Error: File "${newFileName}.canvas" already exists.`);
            return;
        }

        try {
            const content = await this.app.vault.cachedRead(sourceFile);
            const sections = this.parseMarkdown(content, depth);

            if (sections.length === 0 || sections.every(s => s.nodes.length === 0)) {
                new Notice("No list items or headings found to convert.");
                return;
            }

            const { nodes, edges } = this.calculateLayout(sections, layout);
            const canvasData = { nodes, edges };
            const newFile = await this.app.vault.create(newFilePath, JSON.stringify(canvasData, null, 2));

            new Notice(`Canvas "${newFileName}.canvas" created successfully!`);
            await this.app.workspace.getLeaf(true).openFile(newFile);
        } catch (error) {
            console.error("Error creating canvas file:", error);
            new Notice("Failed to create canvas. See console for details.");
        }
    }
}

class ConversionModal extends Modal {
    result: ConversionModalResult;
    onSubmit: (result: ConversionModalResult) => void;

    constructor(app: App, sourceFile: TFile, settings: MarkdownToCanvasSettings, onSubmit: (result: ConversionModalResult) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.result = {
            fileName: `Canvas - ${sourceFile.basename}`,
            layout: settings.defaultLayout,
            depth: settings.defaultDepth
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Convert Note to Canvas' });

        new Setting(contentEl)
            .setName('New canvas name')
            .addText(text =>
                text
                    .setPlaceholder('Enter file name')
                    .setValue(this.result.fileName)
                    .onChange((value) => this.result.fileName = value)
            );

        new Setting(contentEl)
            .setName('Layout direction')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('horizontal', 'Horizontal (L-to-R)')
                    .addOption('vertical', 'Vertical (T-to-D)')
                    .setValue(this.result.layout)
                    .onChange((value: 'horizontal' | 'vertical') => this.result.layout = value);
            });

        new Setting(contentEl)
            .setName('Depth limit')
            .setDesc('Limit the conversion to a specific number of nested levels.')
            .addText(text => {
                text
                    .setValue(this.result.depth.toString())
                    .onChange((value) => {
                        const depth = parseInt(value, 10);
                        if (!isNaN(depth) && depth > 0) {
                            this.result.depth = depth;
                        }
                    });
            });

        new Setting(contentEl)
            .addButton(btn =>
                btn
                    .setButtonText('Convert')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onSubmit(this.result);
                    })
            );
    }

    onClose() {
        this.contentEl.empty();
    }
}

interface ConversionModalResult {
    fileName: string;
    layout: 'horizontal' | 'vertical';
    depth: number;
}

class MarkdownToCanvasSettingTab extends PluginSettingTab {
    plugin: MarkdownToCanvasPlugin;

    constructor(app: App, plugin: MarkdownToCanvasPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Settings for Markdown to Canvas' });

        new Setting(containerEl)
            .setName('Default Layout')
            .setDesc('Set the default mind map direction.')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('horizontal', 'Horizontal')
                    .addOption('vertical', 'Vertical')
                    .setValue(this.plugin.settings.defaultLayout)
                    .onChange(async (value: 'horizontal' | 'vertical') => {
                        this.plugin.settings.defaultLayout = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Default Depth')
            .setDesc('Set the default number of nested levels to convert.')
            .addText(text => {
                text
                    .setValue(this.plugin.settings.defaultDepth.toString())
                    .onChange(async (value) => {
                        const depth = parseInt(value, 10);
                        if (!isNaN(depth) && depth > 0) {
                            this.plugin.settings.defaultDepth = depth;
                            await this.plugin.saveSettings();
                        }
                    })
            })
    }
}
