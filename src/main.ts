import { App, FileSystemAdapter, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, Vault } from 'obsidian';
import { spawn } from 'child_process';
import { Console } from 'console';



interface PluginSettings {
	imagePath: string;
	tesseractLanguage: string;
	tesseractPath: string;
	debug: boolean;
};

const DEFAULT_SETTINGS: PluginSettings = {
	imagePath: 'Meta/Attachments',
	tesseractLanguage: 'eng',
	tesseractPath: '',
	debug: false
}

interface ImageLink {
	match: string;
	path: string;
};

export default class TesseractOcrPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SettingsTab(this.app, this));


		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'run',
			name: 'Run',
			callback: async () => {
				let startNotice = new Notice('Searching for image links...');
				// Show status text in statusbar
				const statusBarItemEl = this.addStatusBarItem();
				statusBarItemEl.setText('Inserting details...');

				let insertionCounter = 0;
				let checkedFilesCounter = 0;

				let allImages: TAbstractFile[] = [];
				Vault.recurseChildren(app.vault.getRoot(), (file: TAbstractFile) => {
					if(file.path.contains(this.settings.imagePath) && this.isImage(file)) {
						allImages.push(file);
					}
				});
				console.log(allImages.length + ' Images found!');
				let files = this.getAllFiles();

				for(const file of files) {
					if(this.isMarkdown(file.name)) {
						checkedFilesCounter++;

						let linkRegex = /!\[\[.*\]\](?!<details>)/g
						let content = await this.app.vault.cachedRead(file);
						let newContent = content;
						// Search for ![[]] links in content that don't have details
						let matches = this.getImageMatches(newContent.match(linkRegex), allImages);

						if(matches.length !== 0) console.log('found ' + matches.length + ' images without details in file ' + file.name + ' processing...');
						let errorCounter = 0;

						for(let i = 0; i < matches.length; i++) {
							// details don't exist yet, run tesseract
							if (this.settings.debug == true) console.log('details dont exist on file: ' + file.name + ' link: ' + matches[i].match);

							let index = (newContent.indexOf(matches[i].match) + matches[i].match.length);
							try {
								let text = await this.getTextFromImage(matches[i].path);
								text = this.formatTesseractOutput(text);

								let detailsToAdd = '<details>' + text + '</details>\n';
								newContent = newContent.slice(0,index) + detailsToAdd + newContent.slice(index);
							}catch(e) {
								console.error(e);
								errorCounter++;
								let detailsToAdd = '<details></details>\n';
								newContent = newContent.slice(0,index) + detailsToAdd + newContent.slice(index);
							}
							insertionCounter++;
						}
						if(content !== newContent) {
							if (this.settings.debug == true) console.log('writing to note!');
							this.app.vault.adapter.write(file.path, newContent);
						}
						if(errorCounter > 0) console.log(errorCounter + ' errors encountered in this file: ' + file.name);
					}
				};
				statusBarItemEl.remove();
				startNotice.hide();
				let finishNotice = new Notice(`Done. Checked ${checkedFilesCounter} files and inserted ${insertionCounter} image descriptions.`);
	 		}
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private getAllFiles(): TFile[] {
		let files = this.app.vault.getAllLoadedFiles();
		let onlyFiles: TFile[] = [];
		for(const f of files) {
			if(f instanceof TFile) {
				onlyFiles.push(f);
			}
		}
		return onlyFiles;
	}

	private getImageMatches(list: RegExpMatchArray|null, allImages: TAbstractFile[]): ImageLink[] {
		if(list === null) {
			return [];
		}
		let newList = [];
		for(let j = 0; j < list.length; j++) {
			for(let i = 0; i < allImages.length; i++) {
				if(list[j].contains(allImages[i].name)) {
					newList.push({match: list[j], path: allImages[i].path});
				}
			}
		};
		return newList;
	}

	private isImage(file: TAbstractFile): boolean {
		return file instanceof TFile && ['jpg', 'png', 'jpeg'].includes(file.extension);
	}
	private isMarkdown(fileName: string): boolean {
		if(['md'].includes(fileName.split('.')[fileName.split('.').length-1])) {
			return true;
		}else {
			return false;
		}
	}

	private async getTextFromImage(filePath: string): Promise<string> {
		let fullPath = (this.app.vault.adapter as FileSystemAdapter).getFullPath(filePath);
		let command = this.settings.tesseractPath + 'tesseract';
		let commandArgs = [fullPath, '-', '-l', this.settings.tesseractLanguage];

		if (this.settings.debug == true) console.log('command to be run: ' + command + ' ' + commandArgs.join(' '));

		return new Promise<string>((resolve, reject) => {
			let execution = spawn(command, commandArgs);

			const error: string[] = [];
			const stdout: string[] = [];

			execution.stderr.on('data', data => {
				error.push(data.toString());
			});
			execution.stdout.on('data', data => {
				stdout.push(data.toString());
			});
			execution.on('error', (e) => {
				error.push(e.toString());	
			});

			execution.on('close', () => {
                if (this.settings.debug == true) console.log('tesseract output: ' + stdout.join(''));
                if (this.settings.debug == true) console.log('tesseract output: ' + error.join(''));
				if (error.length) reject(error.join(''));
				else resolve(stdout.join(''));
			});

		});
	}

	private formatTesseractOutput(text: string): string {
		let returnString = '';
		let lines = text.split('\n');
		lines.forEach(element => {
			element = element.trim();
			// Remove space on numbered lists
			// Otherwise obsidian sees the list and it exits the details tag
			for(let i = 0; i < 10; i++) {
				// f.e. replace '1. ' with '1.'
				element = element.replace(i + '. ', i + '.');
				// f.e. replace '1) ' with '1)'
				element = element.replace(i + ') ', i + ')');
			}

			// Replace < (this opens a html tag)
			const ltReg = new RegExp("<", "g");
			element = element.replace(ltReg, '&lt;');

			// Replace > (this creates a quote and exits the details tag)
			const gtReg = new RegExp(">", "g");
			element = element.replace(gtReg, '&gt;');

			// Remove * (this creates a listed item)
			const starReg = new RegExp("\\* ", "g");
			element = element.replace(starReg, '');

			// Remove - (this creates a listed item)
			const hyphenReg = new RegExp("- ", "g");
			element = element.replace(hyphenReg, '');

			// Remove empty lines
			if(element != '') {
				returnString += element + '\n';
			}
		});
		return returnString;
	}
}

class SettingsTab extends PluginSettingTab {
	plugin: TesseractOcrPlugin;

	constructor(app: App, plugin: TesseractOcrPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for image-ocr!'});

		new Setting(containerEl)
			.setName('Image Path')
			.setDesc('Path to were all the images are stored (I recommend using the "Local Images Plus" plugin.')
			.addText(text => text
				.setPlaceholder('Enter relative path')
				.setValue(this.plugin.settings.imagePath)
				.onChange(async (value) => {
					this.plugin.settings.imagePath = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Tesseract Path')
			.setDesc('Tesseract executable path. Leave empty if tesseract is in the environment PATH variable.')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.tesseractPath)
				.onChange(async (value) => {
					this.plugin.settings.tesseractPath = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Tesseract Language')
			.setDesc('Language codes that improve tesseracts ocr. Make sure you have the language pack installed.')
			.addText(text => text
				.setPlaceholder('eng')
				.setValue(this.plugin.settings.tesseractLanguage)
				.onChange(async (value) => {
					this.plugin.settings.tesseractLanguage = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Debug')
			.setDesc('Shows debug output in console.')
			.addToggle(text => text
				.setValue(this.plugin.settings.debug)
				.onChange(async (value) => {
					this.plugin.settings.debug = value;
					await this.plugin.saveSettings();
				}));
	}
}
