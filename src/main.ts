import { App, Editor, FileSystemAdapter, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, Vault } from 'obsidian';
import { exec, spawn } from 'child_process';


// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	imagePath: string;
};

const DEFAULT_SETTINGS: MyPluginSettings = {
	imagePath: 'Meta/Attachments'
}

interface ImageLink {
	match: string;
	path: string;
};

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'run-on-all-images',
			name: 'Run tesseract on all images',
			callback: () => {
				let allImages: TAbstractFile[] = [];
				Vault.recurseChildren(app.vault.getRoot(), (file: TAbstractFile) => {
					if(file.path.contains(this.settings.imagePath) && this.isImage(file.name)) {
						allImages.push(file);
					}
				});
				console.log(allImages.length + ' Images found!');
				Vault.recurseChildren(app.vault.getRoot(), (file: TAbstractFile) => {
					if(this.isMarkdown(file.name) && file.name == 'Gatter.md') {
						let linkRegex = /!\[\[.*\]\](?!<details>)/g
						this.app.vault.adapter.read(file.path).then(async content => {
							let newContent = content;
							// Search for ![[]] links in content that don't have details
							let matches = this.getImageMatches(newContent.match(linkRegex), allImages);

							if(matches.length !== 0) console.log('found ' + matches.length + ' images without details in file ' + file.name + ' processing...');
							let errorCounter = 0;

							for(let i = 0; i < matches.length; i++) {
								// details don't exist yet, run tesseract
								console.log('details dont exist on file: ' + file.name + ' link: ' + matches[i].match);
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
							}
							if(content !== newContent) {
								console.log('writing page!');
								this.app.vault.adapter.write(file.path, newContent);
							}
							if(errorCounter > 0) console.log(errorCounter + ' errors encountered in this file: ' + file.name);
						});
					}
				});
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

	private isImage(fileName: string): boolean {
		if(['jpg','png','jpeg'].includes(fileName.split('.')[1])) {
			return true;
		}else {
			return false;
		}
	}
	private isMarkdown(fileName: string): boolean {
		if(['md'].includes(fileName.split('.')[1])) {
			return true;
		}else {
			return false;
		}
	}

	private async getTextFromImage(filePath: string): Promise<string> {
		let fullPath = (this.app.vault.adapter as FileSystemAdapter).getFullPath(filePath);
		let command = `tesseract ${fullPath} - -l eng+deu`;
		console.log('command to be run: ' + command);

		return new Promise<string>((resolve, reject) => {
			let execution = spawn('tesseract', [fullPath, '-', '-l', 'eng+deu']);

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
			}
			// Remove > (this creates a quote and exits the details tag)
			element = element.replace('>', '');
			// Remove empty lines
			if(element != '') {
				returnString += element + '\n';
			}
		});
		return returnString;
	}
}