import { App, Editor, EditorSuggest, MarkdownView, Modal, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, InlineDateEditorSettings as InlineDateEditorSettings, InlineDateEditorSettingTab } from "./settings";
import moment from 'moment';

// Remember to rename these classes and interfaces!

export default class InlineDateEditorPlugin extends Plugin {
	settings: InlineDateEditorSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new InlineDateEditorSettingTab(this.app, this));

		this.addCommand({
			id: 'edit-date',
			name: 'Edit or insert date',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const maybeADate = editor.getSelection();
				let parsedDate: string | null = null;
				try {
					if (maybeADate) {
						parsedDate = moment(maybeADate, "YYYY-MM-DD", true).format("YYYY-MM-DD");
					}
				} catch {
					// Ignored
				}

				const picker = document.createElement("input");
				picker.type = "date";
				picker.classList.add("inline-date-editor--stub-input");
				picker.value = parsedDate ?? "";
				picker.addEventListener("change", () => {
					editor.replaceSelection(picker.value);
					picker.remove();
				});
				document.body.appendChild(picker);
				picker.showPicker();
			},
		});
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData() as Partial<InlineDateEditorSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
