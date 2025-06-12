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

interface CanvasNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: 'text' | 'file';
    text?: string;
    file?: string;
}

interface CanvasEdge {
    id:string;
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
const TAB_REPLACEMENT = '  '; // Define that a tab will be treated as 2 spaces

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
    
    private parseMarkdown(content: string, maxDepth: number): ParsedNode[] {
        const rootNodes: ParsedNode[] = [];
        const parentStack: ParsedNode[] = [];
        const imageRegex = /!\[\[([^\]]+)\]\]/;
        let indentUnit: number | null = null;

        const lines = content.split(/\r?\n/);

        for (const line of lines) {
            // Skip empty lines or lines that aren't list items
            if (line.trim() === '' || !line.trim().startsWith('-')) {
                continue;
            }

            const indentMatch = line.match(/^\s*/);
            const rawIndent = indentMatch ? indentMatch[0] : '';
            
            const normalizedIndent = rawIndent.replace(/\t/g, TAB_REPLACEMENT);
            const indentation = normalizedIndent.length;

            if (indentUnit === null && indentation > 0) {
                indentUnit = indentation;
            }
            
            const level = indentUnit ? Math.round(indentation / indentUnit) : 0;
            
            if (level >= maxDepth) continue;
            
            const text = line.trim().substring(1).trim();
            const imageMatch = text.match(imageRegex);

            const node: ParsedNode = {
                id: crypto.randomUUID(),
                text: imageMatch ? imageMatch[1] : text,
                isImage: !!imageMatch,
                level: level,
                children: [],
            };

            while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
                parentStack.pop();
            }

            const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : undefined;

            if (parent) {
                node.parent = parent;
                parent.children.push(node);
            } else {
                rootNodes.push(node);
            }

            parentStack.push(node);
        }
        return rootNodes;
    }

    private calculateLayout(rootNodes: ParsedNode[], layout: 'horizontal' | 'vertical'): { nodes: CanvasNode[], edges: CanvasEdge[] } {
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];
        let cursorX = 0;
        let cursorY = 0;

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
            let childX = layout === 'horizontal' ? x + nodeWidth + H_SPACING : x;
            let childY = layout === 'horizontal' ? y : y + nodeHeight + V_SPACING;

            for (const child of node.children) {
                const childDimensions = placeNodes(child, childX, childY);
                if (layout === 'horizontal') {
                    childY += childDimensions.height + V_SPACING;
                    childrenWidth = Math.max(childrenWidth, childDimensions.width);
                    childrenHeight += childDimensions.height + V_SPACING;
                } else { // vertical
                    childX += childDimensions.width + H_SPACING;
                    childrenHeight = Math.max(childrenHeight, childDimensions.height);
                    childrenWidth += childDimensions.width + H_SPACING;
                }
            }
            
            if (node.children.length > 0) {
                 if (layout === 'horizontal') {
                    childrenHeight -= V_SPACING;
                } else {
                    childrenWidth -= H_SPACING;
                }
            }

            const totalWidth = layout === 'horizontal' ? nodeWidth + H_SPACING + childrenWidth : Math.max(nodeWidth, childrenWidth);
            const totalHeight = layout === 'horizontal' ? Math.max(nodeHeight, childrenHeight) : nodeHeight + V_SPACING + childrenHeight;
            
            return { width: totalWidth, height: totalHeight };
        };

        for (const root of rootNodes) {
            if (layout === 'horizontal') {
                const dimensions = placeNodes(root, cursorX, cursorY);
                cursorY += dimensions.height + V_SPACING * 2;
            } else { // vertical
                const dimensions = placeNodes(root, cursorX, cursorY);
                cursorX += dimensions.width + H_SPACING * 2;
            }
        }
        return { nodes, edges };
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
            const parsedRootNodes = this.parseMarkdown(content, depth);

            if (parsedRootNodes.length === 0) {
                new Notice("No list items found in the note to convert.");
                return;
            }

            const { nodes, edges } = this.calculateLayout(parsedRootNodes, layout);
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
