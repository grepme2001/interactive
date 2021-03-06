// Copyright (c) .NET Foundation and contributors. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import * as vscode from 'vscode';
import { ClientMapper } from './../clientMapper';
import { NotebookFile, parseNotebook, serializeNotebook, notebookCellLanguages, getSimpleLanguage, getNotebookSpecificLanguage, languageToCellKind } from '../interactiveNotebook';
import { RawNotebookCell } from '../interfaces';
import { trimTrailingCarriageReturn } from '../utilities';
import { ReportChannel } from '../interfaces/vscode';

export class DotNetInteractiveNotebookContentProvider implements vscode.NotebookContentProvider, vscode.NotebookKernel {
    private readonly onDidChangeNotebookEventEmitter = new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>();

    kernel: vscode.NotebookKernel;
    label: string;

    constructor(readonly clientMapper: ClientMapper, private readonly globalChannel : ReportChannel) {
        this.kernel = this;
        this.label = ".NET Interactive";
    }
    
    preloads?: vscode.Uri[] | undefined;
    executeAllCells(document: vscode.NotebookDocument, token: vscode.CancellationToken): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async openNotebook(uri: vscode.Uri): Promise<vscode.NotebookData> {
        let contents = '';
        try {
            contents = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
        } catch {
        }

        let notebook = parseNotebook(contents);
        await this.clientMapper.getOrAddClient(uri);

        let notebookData: vscode.NotebookData = {
            languages: notebookCellLanguages,
            metadata: {
                cellHasExecutionOrder: false
            },
            cells: notebook.cells.map(toNotebookCellData)
        };

        return notebookData;
    }

    saveNotebook(document: vscode.NotebookDocument, _cancellation: vscode.CancellationToken): Promise<void> {
        return this.save(document, document.uri);
    }

    saveNotebookAs(targetResource: vscode.Uri, document: vscode.NotebookDocument, _cancellation: vscode.CancellationToken): Promise<void> {
        return this.save(document, targetResource);
    }

    onDidChangeNotebook: vscode.Event<vscode.NotebookDocumentEditEvent> = this.onDidChangeNotebookEventEmitter.event;

    async executeCell(document: vscode.NotebookDocument, cell: vscode.NotebookCell | undefined, token: vscode.CancellationToken): Promise<void> {
        if (!cell) {
            // TODO: run everything
            return;
        }

        cell.outputs = [];
        let client = await this.clientMapper.getOrAddClient(document.uri);
        let source = cell.source.toString();
        return client.execute(source, getSimpleLanguage(cell.language), outputs => {
            // to properly trigger the UI update, `cell.outputs` needs to be uniquely assigned; simply setting it to the local variable has no effect
            cell.outputs = [];
            cell.outputs = outputs;
        });
    }

    private async save(document: vscode.NotebookDocument, targetResource: vscode.Uri): Promise<void> {
        let notebook: NotebookFile = {
            cells: [],
        };
        for (let cell of document.cells) {
            notebook.cells.push({
                language: getSimpleLanguage(cell.language),
                contents: cell.document.getText().split('\n').map(trimTrailingCarriageReturn),
            });
        }

        let buffer = Buffer.from(serializeNotebook(notebook));
        await vscode.workspace.fs.writeFile(targetResource, buffer);
    }
}

function toNotebookCellData(cell: RawNotebookCell): vscode.NotebookCellData {
    return {
        cellKind: languageToCellKind(cell.language),
        source: cell.contents.join('\n'),
        language: getNotebookSpecificLanguage(cell.language),
        outputs: [],
        metadata: {}
    };
}
