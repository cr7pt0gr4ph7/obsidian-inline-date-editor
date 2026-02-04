import { App, Component, TFile, editorInfoField, editorLivePreviewField } from "obsidian";
import { EditorState, RangeSet, RangeSetBuilder, RangeValue, StateEffect, StateField } from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    PluginValue,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { InlineDateEditorSettings } from "settings";
import { extractInlineDates, InlineDate } from "parser";

class InlineDateValue extends RangeValue {
    constructor(public date: InlineDate) {
        super();
    }

    eq(other: InlineDateValue): boolean {
        return this.date.value == other.date.value;
    }
}

function buildInlineDates(state: EditorState): RangeSet<InlineDateValue> {
    const builder = new RangeSetBuilder<InlineDateValue>();
    const tree = syntaxTree(state);

    for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
        const line = state.doc.line(lineNumber);
        let isInsideCodeBlock = false;
        tree.iterate({
            from: line.from,
            to: line.to,
            enter: node => {
                // ignore code blocks
                if (node.name.startsWith("HyperMD-codeblock")) {
                    isInsideCodeBlock = true;
                }
                return node.name == "Document";
            },
        });
        if (!isInsideCodeBlock) {
            const inlineDates = extractInlineDates(line.text);
            for (const date of inlineDates) {
                builder.add(line.from + date.start, line.from + date.end, new InlineDateValue(date));
            }
        }
    }
    return builder.finish();
}

/** A state field that stores the inline dates and their positions as a range set. */
export const inlineDatesField = StateField.define<RangeSet<InlineDateValue>>({
    create: buildInlineDates,
    update(oldDates, tr) {
        return buildInlineDates(tr.state);
    },
});

/** Create a view plugin that renders inline dates in live preview. */
export const replaceInlineDatesInLivePreview = (app: App, settings: InlineDateEditorSettings) =>
    ViewPlugin.fromClass(
        class implements PluginValue {
            decorations: DecorationSet;
            component: Component;

            constructor(view: EditorView) {
                this.component = new Component();
                this.component.load();
                this.decorations = this.buildDecorations(view);
            }

            destroy() {
                this.component.unload();
            }

            buildDecorations(view: EditorView): DecorationSet {
                // Only activate in live preview and not in source mode
                if (!view.state.field(editorLivePreviewField)) return Decoration.none;

                const file = view.state.field(editorInfoField).file;
                if (!file) return Decoration.none;

                const info = view.state.field(inlineDatesField);
                const builder = new RangeSetBuilder<Decoration>();

                for (const { from, to } of view.visibleRanges) {
                    info.between(from, to, (start, end, { date: _date }) => {
                        builder.add(
                            start,
                            end,
                            Decoration.mark({ class: "inline-date-decoration" })
                        );
                    });
                }
                let result = builder.finish();

                const editorAt = view.state.field(inlineDateEditorAtField);
                if (editorAt !== null) {
                    result = result.update({
                        add: [
                            {
                                from: editorAt,
                                to: editorAt,
                                value: Decoration.widget({
                                    widget: new InlineDateEditorWidget(
                                        view.state.selection.main.from,
                                        view.state.selection.main.to,
                                        {
                                            value: "",
                                            start: editorAt,
                                            end: editorAt,
                                        }, view),
                                }),
                            },
                        ],
                    });
                }
                return result;
            }

            update(update: ViewUpdate) {
                // Only activate in live preview and not in source mode
                if (!update.state.field(editorLivePreviewField)) {
                    this.decorations = Decoration.none;
                    return;
                }

                const layoutChanged = update.transactions.some(transaction =>
                    transaction.effects.some(effect => effect.is(workspaceLayoutChangeEffect))
                );

                if (update.docChanged) {
                    this.decorations = this.decorations.map(update.changes);
                    this.updateDecorations(update.view);
                } else if (update.selectionSet || update.viewportChanged || layoutChanged) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }

            updateDecorations(view: EditorView) {
                const file = view.state.field(editorInfoField).file;
                if (!file) {
                    this.decorations = Decoration.none;
                    return;
                }

                const inlineDates = view.state.field(inlineDatesField);

                for (const { from, to } of view.visibleRanges) {
                    inlineDates.between(from, to, (start, end, { date }) => {
                        this.addDecorationAt(start, end, date, file, view);
                    });
                }

                const editorAt = view.state.field(inlineDateEditorAtField);
                if (editorAt !== null) {
                    this.decorations = this.decorations.update({
                        add: [
                            {
                                from: editorAt,
                                to: editorAt,
                                value: Decoration.widget({
                                    widget: new InlineDateEditorWidget(
                                        view.state.selection.main.from,
                                        view.state.selection.main.to,
                                        {
                                            value: "",
                                            start: editorAt,
                                            end: editorAt,
                                        }, view),
                                }),
                            },
                        ],
                    });
                }
            }

            addDecorationAt(start: number, end: number, date: InlineDate, file: TFile, view: EditorView) {
                let exists = false;
                this.decorations.between(start, end, () => { exists = true; });
                if (!exists) {
                    console.log(`Adding decoration for date ${date.value} at ${start}-${end} in file ${file.path}`);
                    this.decorations = this.decorations.update({
                        add: [
                            {
                                from: start,
                                to: end,
                                value: Decoration.mark({ class: "inline-date-decoration" }),
                            },
                        ],
                    });
                }
            }

            // addInlineDateEditorDecorationAt(start: number, end: number, date: InlineDate, view: EditorView) {
            //     throw new Error("Method not implemented.");
            // }
        },
        {
            decorations: instance => instance.decorations,
        }
    );

/**
 * A state effect that represents the workspace's layout change.
 * Mainly intended to detect when the user switches between live preview and source mode.
 */
export const workspaceLayoutChangeEffect = StateEffect.define<null>();

export const openInlineDateEditorAtEffect = StateEffect.define<number>();
export const hideInlineDateEditorEffect = StateEffect.define<null>();

export const inlineDateEditorAtField = StateField.define<number | null>({
    create() { return null; },
    update(oldState, transaction) {
        let newState = oldState;
        for (let effect of transaction.effects) {
            if (effect.is(openInlineDateEditorAtEffect)) {
                newState = effect.value;
            } else if (effect.is(hideInlineDateEditorEffect)) {
                newState = null;
            }
        }
        return newState;
    },
});

class InlineDateEditorWidget extends WidgetType {
    picker?: HTMLInputElement;

    constructor(
        public from: number,
        public to: number,
        public date: InlineDate,
        public view: EditorView,
    ) {
        super();
        this.picker = undefined;
    }

    eq(other: InlineDateEditorWidget): boolean {
        return this.date.value == other.date.value;
    }

    toDOM(): HTMLElement {
        // const span = document.createElement("span");
        // span.classList.add("inline-date-widget");
        // span.textContent = this.date.value;
        // return span;
        const picker = document.createElement("input");
        picker.type = "date";
        picker.classList.add("inline-date-editor--stub-input");
        picker.value = this.date.value;
        picker.addEventListener("change", () => {
            this.view.dispatch({
                changes: { from: this.from, to: this.to, insert: picker.value },
                effects: hideInlineDateEditorEffect.of(null),
            });
        });

        // HACK: Show the picker after it has been added to the DOM.
        //       CodeMirror does not seem to provide a callback to detect
        //       when the element has been inserted into the DOM, so
        //       we resort to the hacky solution below.
        const tryShowPicker = (i: number) => {
            if (picker.parentNode) {
                picker.showPicker();
            } else if (i < 10) {
                setTimeout(() => tryShowPicker(i + 1), 0);
            }
        };
        this.picker = picker;
        tryShowPicker(0);
        return picker;
    }

    showPicker() {
        this.picker?.showPicker();
    }

    destroy(dom: HTMLElement): void {
        this.picker = undefined;
    }
}
