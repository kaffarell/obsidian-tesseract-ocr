import { App, Editor, FileSystemAdapter, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, Vault } from 'obsidian';
import { exec as execCb } from 'child_process';
import {promisify} from 'util';
const exec = promisify(execCb);


// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	imagePath: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	imagePath: 'Meta/Attachments'
}

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
				Vault.recurseChildren(app.vault.getRoot(), (file: TAbstractFile) => {
					if(this.isMarkdown(file.name)) {
						//console.log(file.name);
						let linkRegex = /!\[\[.*\]\]/g
						this.app.vault.adapter.read(file.path).then(content => {
							// Search for ![[]] links in content
							let matches = [...content.matchAll(linkRegex)];
							matches.forEach(match => {
								// Now check if the link content exists as a image file
								let imageFile = allImages.find(e => {
									return match[0].contains(e.name);
								});
								if (imageFile !== undefined) {
									// We found a link with a file, now we need to check if the details alread exist
									if(!content.contains(match[0] + '<details>')) {
										// details don't exist yet, run tesseract
										console.log('details dont exist on file: ' + file.name + ' link: ' + match[0]);
										this.getTextFromImage(imageFile.path).then(text => {
											//console.log(text);
										});

									}else {
										console.log('details already added on file: ' + file.name + ' link: ' + match[0]);
									}
								}
							})
						});
					}
				});
				console.log(allImages.length);
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
		// TODO : get console output
		let fullPath = (this.app.vault.adapter as FileSystemAdapter).getFullPath(filePath);
		console.log('command to be run: ' + 'tesseract ' + fullPath);
		try {
			const { stdout, stderr } = await exec('tesseract ' + fullPath);
			console.log('stderr:', stderr);
			return stdout;
		} catch (e) {
			console.error(e);
			return e;
		}
	}
}