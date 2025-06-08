# Markdown to Canvas Converter - Obsidian Plugin
This plugin for Obsidian converts your structured Markdown notes into visual mind maps using the native Canvas feature. It intelligently parses headings and nested bullet-point lists to generate a clear, connected, and easy-to-navigate canvas, helping you visualize your ideas and the structure of your notes.

## Features (Version 1.0)
One-Click Conversion: Initiate the conversion process easily from two places:

File Explorer Context Menu: Right-click any .md file and select "Convert to Canvas".

Command Palette: With a Markdown note open, use Ctrl/Cmd+P and run the "Convert note to Canvas" command.

Customizable Conversion: A pop-up modal gives you full control over the output:

File Name: Set a custom name for your new .canvas file, pre-filled with a sensible default.

Layout Direction: Choose between a Horizontal (Left-to-Right) or Vertical (Top-to-Down) flow for your mind map.

Depth Limiter: Control the complexity of the output by specifying how many nested levels of your list to convert. This is crucial for maintaining clarity and performance with large notes.

Intelligent Structure Parsing:

Hierarchy: Nested bullet points in your Markdown are converted into parent-child relationships on the canvas.

Card Creation: Each list item becomes an individual card.

Connection Creation: Edges (lines) are automatically drawn to connect parent cards to their children.

Image Support: Embedded images (![[image.png]]) are rendered as image cards, maintaining their position within the hierarchy.

Seamless Workflow: Once the conversion is complete, the new canvas is automatically opened in a new tab, ready for you to review and edit.

## How to Install
Go to the Latest Release page (you will need to update this link once you have a GitHub repository).

Download the main.js, styles.css (if you add one later), and manifest.json files from the release assets.

In your Obsidian vault, navigate to the plugins folder: YourVault/.obsidian/plugins/.

Create a new folder inside plugins named markdown-to-canvas-converter.

Copy the downloaded files (main.js, manifest.json) into the new markdown-to-canvas-converter folder.

Restart Obsidian or reload the plugins list.

Go to Settings -> Community Plugins, find "Markdown to Canvas Converter", and enable it.
  
## Future Development (V2.0+)
Heading-based Grouping: Convert Markdown headings (#, ##, etc.) into labeled groups on the canvas.

Dynamic Card Sizing: Automatically adjust card dimensions to fit their text content.

Note Conversion: An option to convert list items into new, separate .md notes instead of just text cards.

Configuration Defaults: A dedicated settings tab to set your preferred default conversion options.

Link Handling: Control whether Markdown links are treated as plain text or become active, clickable URLs.

## For Developers (Building from Source)
If you want to build the plugin from the source code, follow these steps:

Clone the Repository:

git clone https://github.com/your-username/your-repo-name.git
cd obsidian-markdown-to-canvas

(You will need to update this URL with your actual repository link.)

Install Dependencies:
Make sure you have Node.js and npm installed.

npm install

Build the Plugin:

For development (this will watch for file changes and automatically re-build):

npm run dev

For a one-time production build:

npm run build

Install in Obsidian:
After building, copy the generated main.js and manifest.json files into your Obsidian vault's plugin folder (YourVault/.obsidian/plugins/markdown-to-canvas-converter/).