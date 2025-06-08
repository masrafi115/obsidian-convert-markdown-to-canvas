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
} from 'obsidian';

// Interface for our plugin settings (for future use)
interface MarkdownToCanvasSettings {
	defaultLayout: 'horizontal' | 'vertical';
	defaultDepth: number;
}

const DEFAULT_SETTINGS: MarkdownToCanvasSettings = {
	defaultLayout: 'horizontal',
	defaultDepth: 3,
};

// Main Plugin Class
export default class MarkdownToCanvasPlugin extends Plugin {
	settings: MarkdownToCanvasSettings;

	async onload() {
		await this.loadSettings();
		console.log('Markdown to Canvas Plugin loaded.');

		// 1. Add the command palette command
		this.addCommand({
			id: 'convert-note-to-canvas',
			name: 'Convert note to Canvas',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (view.file) {
					new ConversionModal(this.app, view.file, (result) => {
						this.createCanvas(result.fileName, view.file, result.layout, result.depth);
					}).open();
				} else {
					new Notice('Please save the note before converting to a canvas.');
				}
			},
		});

		// 2. Add the context menu item for the file explorer
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle('Convert to Canvas')
							.setIcon('git-fork') // A fitting icon
							.onClick(async () => {
								new ConversionModal(this.app, file, (result) => {
									this.createCanvas(result.fileName, file, result.layout, result.depth);
								}).open();
							});
					});
				}
			})
		);
		
		// This adds a settings tab so the user can configure default values.
		// We'll stub this out for now and can implement it fully later.
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
	 * The core function to create the canvas file.
	 * This is a placeholder for the actual conversion logic.
	 * @param newFileName - The name for the new .canvas file
	 * @param sourceFile - The source .md file to convert
	 * @param layout - The layout direction ('horizontal' or 'vertical')
	 * @param depth - The maximum depth of nodes to create
	 */
	async createCanvas(newFileName: string, sourceFile: TFile, layout: string, depth: number) {
		const newFilePath = `${sourceFile.parent.path}/${newFileName}.canvas`;
		
		// Check if file already exists
        const fileExists = await this.app.vault.adapter.exists(newFilePath);
        if (fileExists) {
            new Notice(`Error: File "${newFileName}.canvas" already exists.`);
            return;
        }

		// --- PARSING AND CANVAS JSON GENERATION WILL GO HERE ---
		// For now, we'll create a dummy canvas file.
		const canvasData = {
			nodes: [
				{ id: 'node1', x: 0, y: 0, width: 250, height: 60, type: 'text', text: `Canvas for ${sourceFile.basename}`},
				{ id: 'node2', x: 0, y: 160, width: 250, height: 60, type: 'text', text: `Layout: ${layout}, Depth: ${depth}`},
			],
			edges: [
				{ id: 'edge1', fromNode: 'node1', fromSide: 'bottom', toNode: 'node2', toSide: 'top' }
			]
		};

		try {
			const newFile = await this.app.vault.create(newFilePath, JSON.stringify(canvasData, null, 2));
			new Notice(`Canvas "${newFileName}.canvas" created successfully!`);

			// Open the new canvas in a new tab
			await this.app.workspace.getLeaf(true).openFile(newFile);

		} catch (error) {
			console.error("Error creating canvas file:", error);
			new Notice("Failed to create canvas. See console for details.");
		}
	}
}

// Interface for the data returned by the modal
interface ConversionModalResult {
	fileName: string;
	layout: 'horizontal' | 'vertical';
	depth: number;
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

		// 1. File Name Setting
		new Setting(contentEl)
			.setName('New canvas name')
			.setDesc('The name of the .canvas file to be created.')
			.addText(text =>
				text
					.setPlaceholder('Enter file name')
					.setValue(this.result.fileName)
					.onChange(async (value) => {
						this.result.fileName = value;
					})
			);
			
		// 2. Layout Direction Setting
		new Setting(contentEl)
			.setName('Layout direction')
			.setDesc('The primary flow direction for the mind map nodes.')
			.addDropdown(dropdown => {
				dropdown
					.addOption('horizontal', 'Horizontal (Left-to-Right)')
					.addOption('vertical', 'Vertical (Top-to-Down)')
					.setValue(this.result.layout)
					.onChange(async (value: 'horizontal' | 'vertical') => {
						this.result.layout = value;
					});
			});

		// 3. Depth Limiter Setting
		// Note: The dynamic node count is a V1 requirement but requires parsing the file
		// content, which we will add in the next step. For now, it's a simple input.
		new Setting(contentEl)
			.setName('Depth limit')
			.setDesc('Limit the conversion to a specific number of nested levels (e.g., 3).')
			.addText(text => { // Using text for now, can be a slider later.
				text
					.setValue(this.result.depth.toString())
					.onChange(async (value) => {
						const depth = parseInt(value);
						if (!isNaN(depth) && depth > 0) {
							this.result.depth = depth;
						}
					});
			});


		// 4. Submit Button
		new Setting(contentEl)
			.addButton(btn =>
				btn
					.setButtonText('Convert')
					.setCta() // Makes the button more prominent
					.onClick(() => {
						this.close();
						this.onSubmit(this.result);
					})
			);
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}

// --- Settings Tab --- (Placeholder for future implementation)
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
			.setDesc('Set the default layout direction for new conversions.')
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
