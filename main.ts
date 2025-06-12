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

// Represents the raw parsed data for a single item (line) from the markdown
interface ParsedNode {
	id: string;
	text: string;
	isImage: boolean;
	level: number;
	children: ParsedNode[];
	parent?: ParsedNode;
}

// Represents a node ready for the canvas, with layout properties
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

// Represents a connection between two nodes on the canvas
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
	defaultDepth: 3,
};

// --- CONSTANTS for layout ---
const CARD_WIDTH = 300;
const CARD_HEIGHT = 80;
const IMG_WIDTH = 300;
const IMG_HEIGHT = 300;
const H_SPACING = 100; // Horizontal spacing between parent and child
const V_SPACING = 50;  // Vertical spacing between sibling nodes

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
					new ConversionModal(this.app, sourceFile, (result) => {
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
								new ConversionModal(this.app, file, (result) => {
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

	/**
	 * Parses the markdown content into a tree of nodes.
	 * @param content - The markdown string to parse.
	 * @param maxDepth - The maximum depth to parse.
	 */
	private parseMarkdown(content: string, maxDepth: number): ParsedNode[] {
		const rootNodes: ParsedNode[] = [];
		const parentStack: ParsedNode[] = [];
		const imageRegex = /!\[\[([^\]]+)\]\]/; // Extracts the image name

		const lines = content.split(/\r?\n/);

		console.log("--- MD to Canvas: Begin Parsing ---");

		for (const line of lines) {
			const cleanedLine = line.replace(/\u00A0/g, ' ');

			if (cleanedLine.trim() === '') continue;

			const normalizedLine = cleanedLine.replace(/\t/g, '  ');

			const indentMatch = normalizedLine.match(/^\s*/);
			const indentation = indentMatch ? indentMatch[0].length : 0;
			const level = Math.floor(indentation / 2);

			console.log(`Line: "${line}"`);
			console.log(`Indentation: ${indentation}, Level: ${level}, Parent Stack Size: ${parentStack.length}`);

			if (level >= maxDepth) {
				console.log("-> Skipping due to max depth.");
				continue;
			}

			const text = normalizedLine.trim().replace(/^-\s*/, '');
			const imageMatch = text.match(imageRegex);

			const node: ParsedNode = {
				id: crypto.randomUUID(),
				text: imageMatch ? imageMatch[1] : text,
				isImage: !!imageMatch,
				level: level,
				children: [],
			};

			// --- BUG FIX ---
			// The original logic `while (parentStack.length > level)` was unreliable.
			// This new logic correctly finds the parent by comparing the current node's level
			// to the level of the node at the top of the stack.
			while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
				parentStack.pop();
			}

			const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : undefined;

			if (parent) {
				console.log(`-> Found parent: "${parent.text}". Adding child: "${text}"`);
				node.parent = parent;
				parent.children.push(node);
			} else {
				console.log(`-> No parent found. Adding as root node: "${text}"`);
				rootNodes.push(node);
			}

			parentStack.push(node);
		}

		console.log("--- MD to Canvas: Parsing Finished ---");
		return rootNodes;
	}


	/**
	 * Calculates the positions of each node and generates the final canvas nodes and edges.
	 * @param rootNodes - The root nodes of the parsed markdown tree.
	 * @param layout - The layout direction.
	 */
	private calculateLayout(rootNodes: ParsedNode[], layout: string): { nodes: CanvasNode[], edges: CanvasEdge[] } {
		const finalNodes: CanvasNode[] = [];
		const finalEdges: CanvasEdge[] = [];
		let currentY = 0;

		const processNode = (node: ParsedNode, x: number, y: number): { width: number, height: number } => {
			const isImage = node.isImage;
			const nodeWidth = isImage ? IMG_WIDTH : CARD_WIDTH;
			const nodeHeight = isImage ? IMG_HEIGHT : CARD_HEIGHT;

			finalNodes.push({
				id: node.id,
				x: x,
				y: y,
				width: nodeWidth,
				height: nodeHeight,
				type: isImage ? 'file' : 'text',
				[isImage ? 'file' : 'text']: node.text
			});

			if (node.parent) {
				finalEdges.push({
					id: crypto.randomUUID(),
					fromNode: node.parent.id,
					fromSide: layout === 'horizontal' ? 'right' : 'bottom',
					toNode: node.id,
					toSide: layout === 'horizontal' ? 'left' : 'top',
				});
			}

			if (node.children.length === 0) {
				return { width: nodeWidth, height: nodeHeight };
			}

			let subtreeWidth = 0;
			let subtreeHeight = 0;
			let childY = y;
			let childX = x;

			if (layout === 'horizontal') {
				childX = x + nodeWidth + H_SPACING;
			} else { // vertical
				childY = y + nodeHeight + V_SPACING;
			}

			for (const child of node.children) {
				const childSize = processNode(child, childX, childY);
				if (layout === 'horizontal') {
					childY += childSize.height + V_SPACING;
					subtreeHeight += childSize.height + V_SPACING;
					subtreeWidth = Math.max(subtreeWidth, childSize.width);
				} else { // vertical
					childX += childSize.width + H_SPACING;
					subtreeWidth += childSize.width + H_SPACING;
					subtreeHeight = Math.max(subtreeHeight, childSize.height);
				}
			}

			if (layout === 'horizontal') {
				subtreeHeight -= V_SPACING; // Remove last spacing
				return { width: nodeWidth + H_SPACING + subtreeWidth, height: Math.max(nodeHeight, subtreeHeight) };
			} else {
				subtreeWidth -= H_SPACING; // Remove last spacing
				return { width: Math.max(nodeWidth, subtreeWidth), height: nodeHeight + V_SPACING + subtreeHeight };
			}
		};

		for (const root of rootNodes) {
			const treeSize = processNode(root, 0, currentY);
			currentY += treeSize.height + V_SPACING * 2;
		}

		return { nodes: finalNodes, edges: finalEdges };
	}

	async createCanvas(newFileName: string, sourceFile: TFile, layout: string, depth: number) {
		if (!sourceFile.parent) {
			new Notice(`Error: Cannot determine the parent folder for "${sourceFile.name}".`);
			return;
		}

		const parentPath = sourceFile.parent instanceof TFolder && sourceFile.parent.path === '/' ? '' : sourceFile.parent.path;
		const newFilePath = `${parentPath}/${newFileName}.canvas`;

		const fileExists = await this.app.vault.adapter.exists(newFilePath);
		if (fileExists) {
			new Notice(`Error: File "${newFileName}.canvas" already exists.`);
			return;
		}

		// --- CORE LOGIC ---
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

// --- The Conversion Modal ---
class ConversionModal extends Modal {
	result: ConversionModalResult;
	onSubmit: (result: ConversionModalResult) => void;
	sourceFile: TFile;

	constructor(app: App, sourceFile: TFile, onSubmit: (result: ConversionModalResult) => void) {
		super(app);
		this.sourceFile = sourceFile;
		this.onSubmit = onSubmit;
		this.result = {
			fileName: `Canvas - ${sourceFile.basename}`,
			layout: 'horizontal',
			depth: 3
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
					.addOption('horizontal', 'Horizontal (Left-to-Right)')
					.addOption('vertical', 'Vertical (Top-to-Down)')
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

// Interface for the data returned by the modal
interface ConversionModalResult {
	fileName: string;
	layout: 'horizontal' | 'vertical';
	depth: number;
}

// --- Settings Tab ---
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
	}
}
