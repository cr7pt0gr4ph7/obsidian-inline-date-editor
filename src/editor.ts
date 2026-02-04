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
import { selectionAndRangeOverlap } from "utils";

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
                // Disable in the source mode
                if (!view.state.field(editorLivePreviewField)) return Decoration.none;

                const file = view.state.field(editorInfoField).file;
                if (!file) return Decoration.none;

                const info = view.state.field(inlineDatesField);
                const builder = new RangeSetBuilder<Decoration>();
                const selection = view.state.selection;

                for (const { from, to } of view.visibleRanges) {
                    info.between(from, to, (start, end, { date }) => {
                        // If the inline field is not overlapping with the cursor, we replace it with a widget.
                        if (!selectionAndRangeOverlap(selection, start, end)) {
                            builder.add(
                                start,
                                end,
                                Decoration.replace({
                                    widget: new InlineDateWidget(
                                        app,
                                        date,
                                        file.path,
                                        this.component,
                                        settings,
                                        view
                                    ),
                                })
                            );
                        }
                    });
                }
                return builder.finish();
            }

            update(update: ViewUpdate) {
                // only activate in LP and not source mode
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

                const inlineFields = view.state.field(inlineDatesField);
                const selection = view.state.selection;

                for (const { from, to } of view.visibleRanges) {
                    inlineFields.between(from, to, (start, end, { date }) => {
                        const overlap = selectionAndRangeOverlap(selection, start, end);
                        if (overlap) {
                            this.removeDecorationAt(start, end);
                            return;
                        } else {
                            this.addDecorationAt(start, end, date, file, view);
                        }
                    });
                }
            }

            removeDecorationAt(start: number, end: number) {
                this.decorations.between(start, end, (from, to) => {
                    this.decorations = this.decorations.update({
                        filterFrom: from,
                        filterTo: to,
                        filter: () => false,
                    });
                });
            }

            addDecorationAt(start: number, end: number, date: InlineDate, file: TFile, view: EditorView) {
                let exists = false;
                this.decorations.between(start, end, () => {
                    exists = true;
                });
                if (!exists) {
                    this.decorations = this.decorations.update({
                        add: [
                            {
                                from: start,
                                to: end,
                                value: Decoration.replace({
                                    widget: new InlineDateWidget(
                                        app,
                                        date,
                                        file.path,
                                        this.component,
                                        settings,
                                        view
                                    ),
                                }),
                            },
                        ],
                    });
                }
            }
        },
        {
            decorations: instance => instance.decorations,
        }
    );

/** A widget which inline fields are replaced with. */
class InlineDateWidget extends WidgetType {
    constructor(
        public app: App,
        public date: InlineDate,
        public sourcePath: string,
        public component: Component,
        public settings: InlineDateEditorSettings,
        public view: EditorView
    ) {
        super();
    }

    eq(other: InlineDateWidget): boolean {
        return this.date.value == other.date.value;
    }

    toDOM() {
        // A large part of this method was taken from replaceInlineFields() in src/ui/views/inline-field.tsx.
        // It will be better to extract the common part as a function...

        // eslint-disable-next-line no-undef
        const container = createSpan({
            cls: ["dataview", "inline-date-editor"],
        });
        container.appendText(this.date.value);

        container.addEventListener("click", event => {
            // eslint-disable-next-line no-console
            console.log("Inline date clicked");
            if (event instanceof MouseEvent) {
                // const rect = value.getBoundingClientRect();
                // const relativePos = (event.x - rect.x) / rect.width;
                // const startPos = this.view.posAtCoords(renderContainer.getBoundingClientRect(), false);
                // const clickedPos = startPos;
                // // const clickedPos = Math.round(
                // //     startPos +
                // //         (this.field.startValue - this.field.start) +
                // //         (this.field.end - this.field.startValue) * relativePos
                // // );
                // this.view.dispatch({ selection: { anchor: clickedPos } });
            }
        });

        return container;
    }
}

/**
 * A state effect that represents the workspace's layout change.
 * Mainly intended to detect when the user switches between live preview and source mode.
 */
export const workspaceLayoutChangeEffect = StateEffect.define<null>();
