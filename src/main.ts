import { Editor, MarkdownView, Plugin } from 'obsidian';
import { inlineDateEditorAtField, inlineDatesField, openInlineDateEditorAtEffect, replaceInlineDatesInLivePreview, workspaceLayoutChangeEffect } from './editor';
import { DEFAULT_SETTINGS, InlineDateEditorSettings, InlineDateEditorSettingTab } from "./settings";
import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

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
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
				const cm = (view.editor as any).cm as EditorView;
				if (cm) {
					cm.dispatch({
						effects: openInlineDateEditorAtEffect.of(cm.state.selection.main.from),
					});
				}
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
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					if (leaf.view instanceof MarkdownView && (leaf.view.editor as any).cm) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
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
		this.cmExtension.push(inlineDatesField, inlineDateEditorAtField, replaceInlineDatesInLivePreview(this.app, this.settings));
		this.app.workspace.updateOptions();
	}
}
