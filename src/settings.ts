import {App, PluginSettingTab, Setting} from "obsidian";
import InlineDateEditorPlugin from "./main";

export interface InlineDateEditorSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: InlineDateEditorSettings = {
	mySetting: 'default'
}

export class InlineDateEditorSettingTab extends PluginSettingTab {
	plugin: InlineDateEditorPlugin;

	constructor(app: App, plugin: InlineDateEditorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
