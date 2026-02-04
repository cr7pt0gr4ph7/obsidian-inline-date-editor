import moment from 'moment';
import { Editor, MarkdownView, Plugin } from 'obsidian';
import { inlineDatesField, replaceInlineDatesInLivePreview, workspaceLayoutChangeEffect } from './editor';
import { DEFAULT_SETTINGS, InlineDateEditorSettings, InlineDateEditorSettingTab } from "./settings";
import { Extension } from '@codemirror/state';

// Remember to rename these classes and interfaces!

export default class InlineDateEditorPlugin extends Plugin {
	settings: InlineDateEditorSettings;

	/** CodeMirror 6 extensions that this plugin installs. Tracked via array to allow for dynamic updates. */
	private cmExtension: Extension[];

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

		// Editor extensions
		this.cmExtension = [];
		this.registerEditorExtension(this.cmExtension);
		this.updateEditorExtensions();


		// Mainly intended to detect when the user switches between live preview and source mode.
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.app.workspace.iterateAllLeaves(leaf => {
					if (leaf.view instanceof MarkdownView && (leaf.view.editor as any).cm) {
						(leaf.view.editor as any).cm.dispatch({
							effects: workspaceLayoutChangeEffect.of(null),
						});
					}
				});
			})
		);
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

	public updateEditorExtensions() {
		// Don't create a new array, keep the same reference
		this.cmExtension.length = 0;
		// Editor extension for rendering inline dates in live preview
		this.cmExtension.push(inlineDatesField, replaceInlineDatesInLivePreview(this.app, this.settings));
		this.app.workspace.updateOptions();
	}
}
